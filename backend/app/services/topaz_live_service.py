"""
Живые показания уровнемеров из «Сервер-186» (Топаз-Автономный налив).

В базу Топаза уровень попадает только в момент налива или закрытия смены, поэтому для
текущего остатка GSM спрашивает сервер напрямую — так же, как окно «Показания
уровнемеров» и «Монитор емкостей». Сервер опрашивает контроллер и отвечает всем
клиентам командой «Состояние емкостей».

Протокол клиентского порта не документирован, восстановлен по логам сервера:
кадр — 0x02 | длина XML (uint32 LE) | XML в Windows-1251 | CRC-16/CCITT-FALSE
по «длина + XML» (uint16 LE). Без верной CRC сервер молча игнорирует запрос.
"""
import os
import re
import socket
import struct
import threading
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Callable, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.logger import logger
from app.models import ProviderTemplate, Tank, TopazSyncState
from app.utils.json_utils import parse_template_json

ENCODING = "cp1251"
FRAME_START = 0x02
CMD_TANKS_STATE = 8

DEFAULT_PORT = 4477
# Замеры из живого опроса лежат рядом со снимками и событиями: свой диапазон id
LIVE_ROW_OFFSET = 2 * 10 ** 12

# Коды параметров в ответе «Состояние емкостей»
PARAM_FUEL = "-1169"
PARAM_LEVEL = "620"
PARAM_TEMPERATURE = "621"
PARAM_VOLUME = "622"
PARAM_MASS = "623"
PARAM_WATER = "625"
PARAM_DENSITY = "676"


class TopazLiveError(Exception):
    """Живой опрос недоступен или сервер не ответил."""


def live_enabled() -> bool:
    return os.getenv("TOPAZ_LIVE_ENABLED", "true").lower() == "true"


def _timeout_seconds() -> float:
    return float(os.getenv("TOPAZ_LIVE_TIMEOUT_SECONDS", "20"))


def _min_interval_seconds() -> float:
    return float(os.getenv("TOPAZ_LIVE_MIN_INTERVAL_SECONDS", "10"))


def crc16_ccitt_false(data: bytes) -> int:
    crc = 0xFFFF
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def build_frame(xml_text: str) -> bytes:
    payload = xml_text.encode(ENCODING)
    body = struct.pack("<I", len(payload)) + payload
    return bytes([FRAME_START]) + body + struct.pack("<H", crc16_ccitt_false(body))


def split_frames(buffer: bytes) -> Tuple[List[str], bytes]:
    """Выделить из буфера целые кадры; вернуть их XML и необработанный остаток."""
    messages: List[str] = []
    while len(buffer) >= 5:
        if buffer[0] != FRAME_START:
            # Потеряли границу кадра — ищем следующий старт
            next_start = buffer.find(bytes([FRAME_START]), 1)
            buffer = buffer[next_start:] if next_start > 0 else b""
            continue
        size = struct.unpack("<I", buffer[1:5])[0]
        if len(buffer) < 5 + size + 2:
            break
        body = buffer[1:5 + size]
        crc = struct.unpack("<H", buffer[5 + size:7 + size])[0]
        if crc == crc16_ccitt_false(body):
            messages.append(buffer[5:5 + size].decode(ENCODING, "replace"))
        buffer = buffer[7 + size:]
    return messages, buffer


def tanks_state_request(device_code: str) -> str:
    return (
        '<?xml version="1.0" encoding="Windows-1251"?>\r\n<DATA>\r\n'
        f'\t<CMD DevID="{_xml_attr(device_code)}" id="0" Code="{CMD_TANKS_STATE}" Name="Состояние емкостей" '
        'ClientID="-1" UseClientID="False" Desc="" Error="" AllowInOffline="False" RefCount="8"/>\r\n</DATA>'
    )


def _xml_attr(value: str) -> str:
    return (value.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;"))


def _decimal(value: Optional[str]) -> Optional[Decimal]:
    if value is None or value.strip() == "":
        return None
    try:
        return Decimal(value.strip().replace(",", "."))
    except InvalidOperation:
        return None


@dataclass
class LiveTank:
    number: int
    active: bool
    fuel: Optional[str]
    volume: Optional[Decimal]
    mass: Optional[Decimal]
    density: Optional[Decimal]
    temperature: Optional[Decimal]
    level: Optional[Decimal]
    water: Optional[Decimal]


@dataclass
class LiveTanksState:
    device_code: str
    measured_at: datetime
    tanks: List[LiveTank] = field(default_factory=list)


def parse_tanks_state(xml_text: str, device_code: str) -> Optional[LiveTanksState]:
    """Разобрать ответ «Состояние емкостей» для устройства; None — это другое сообщение."""
    if f'Code="{CMD_TANKS_STATE}"' not in xml_text or "<TANKS" not in xml_text:
        return None
    root = ET.fromstring(re.sub(r"^\s*<\?xml[^>]*\?>", "", xml_text))
    for cmd in root.iter("CMD"):
        if cmd.get("Code") != str(CMD_TANKS_STATE) or cmd.get("DevID") != device_code:
            continue
        tanks_node = cmd.find(".//TANKS")
        if tanks_node is None:
            continue
        error = (cmd.get("Error") or "").strip()
        if error:
            raise TopazLiveError(f"Сервер-186: {error}")
        last_update = tanks_node.get("lastUpdate")
        measured_at = datetime.fromisoformat(last_update) if last_update else datetime.now()
        tanks = []
        for node in tanks_node.iter("tank"):
            values = {item.get("ID"): item.text for item in node.iter("data")}
            tanks.append(LiveTank(
                number=int(node.get("num")),
                active=node.get("active") == "1",
                fuel=(values.get(PARAM_FUEL) or "").strip() or None,
                volume=_decimal(values.get(PARAM_VOLUME)),
                mass=_decimal(values.get(PARAM_MASS)),
                density=_decimal(values.get(PARAM_DENSITY)),
                temperature=_decimal(values.get(PARAM_TEMPERATURE)),
                level=_decimal(values.get(PARAM_LEVEL)),
                water=_decimal(values.get(PARAM_WATER)),
            ))
        return LiveTanksState(device_code=device_code, measured_at=measured_at.replace(microsecond=0), tanks=tanks)
    return None


class S186Client:
    """Одно подключение к клиентскому порту «Сервер-186»."""

    def __init__(self, host: str, port: int, timeout: float):
        self.host = host
        self.port = port
        self.timeout = timeout
        self._sock: Optional[socket.socket] = None
        self._buffer = b""

    def __enter__(self):
        try:
            self._sock = socket.create_connection((self.host, self.port), timeout=min(self.timeout, 10))
        except OSError as exc:
            raise TopazLiveError(f"Нет связи с Сервером-186 {self.host}:{self.port}: {exc}") from exc
        self._sock.settimeout(1)
        return self

    def __exit__(self, *exc_info):
        if self._sock is not None:
            try:
                self._sock.close()
            except OSError:
                pass
        self._sock = None

    def read_tanks(self, device_code: str) -> LiveTanksState:
        self._sock.sendall(build_frame(tanks_state_request(device_code)))
        deadline = time.monotonic() + self.timeout
        while time.monotonic() < deadline:
            try:
                chunk = self._sock.recv(65536)
            except socket.timeout:
                continue
            except OSError as exc:
                raise TopazLiveError(f"Обрыв связи с Сервером-186: {exc}") from exc
            if not chunk:
                raise TopazLiveError("Сервер-186 закрыл соединение")
            messages, self._buffer = split_frames(self._buffer + chunk)
            for message in messages:
                state = parse_tanks_state(message, device_code)
                if state is not None:
                    return state
        raise TopazLiveError(
            f"Контроллер {device_code} не ответил за {int(self.timeout)} с — возможно, нет связи с АЗС"
        )


_template_locks: Dict[int, threading.Lock] = {}
_locks_guard = threading.Lock()
_recent: Dict[Tuple[int, str], Tuple[float, LiveTanksState]] = {}


def _template_lock(template_id: int) -> threading.Lock:
    with _locks_guard:
        return _template_locks.setdefault(template_id, threading.Lock())


def live_templates(db: Session) -> set:
    """Шаблоны, у которых есть «Сервер-186»: источник — снимки Топаз-Офиса (МАЗС)."""
    if not live_enabled():
        return set()
    return {
        template_id for (template_id,) in db.query(TopazSyncState.template_id)
        .filter(TopazSyncState.source_kind == "snapshots")
    }


class TopazLiveService:
    """Прочитать уровнемеры АЗС прямо сейчас и записать замер в историю ёмкостей."""

    def __init__(self, db: Session, client_factory: Callable[[str, int, float], S186Client] = S186Client):
        self.db = db
        self.client_factory = client_factory

    def read_codes(self, provider_id: int, azs_codes: List[str]) -> List[dict]:
        tanks = self.db.query(Tank).filter(Tank.provider_id == provider_id, Tank.azs_code.in_(azs_codes)).all()
        supported = live_templates(self.db)
        by_template: Dict[int, List[Tank]] = {}
        for tank in tanks:
            by_template.setdefault(tank.template_id, []).append(tank)
        if not any(template_id in supported for template_id in by_template):
            raise TopazLiveError("Для этой АЗС живой опрос уровнемеров не поддерживается")

        devices: List[dict] = []
        for template_id, template_tanks in by_template.items():
            codes = sorted({tank.azs_code for tank in template_tanks})
            if template_id not in supported:
                devices.extend({"azs_code": code, "status": "unsupported", "error": None, "measured_at": None,
                                "tanks_updated": 0} for code in codes)
                continue
            template = self.db.query(ProviderTemplate).filter(ProviderTemplate.id == template_id).first()
            devices.extend(self._read_template(template, template_tanks, codes))
        self.db.commit()
        return devices

    def _read_template(self, template: ProviderTemplate, tanks: List[Tank], codes: List[str]) -> List[dict]:
        settings = parse_template_json(template.connection_settings) or {}
        host = settings.get("live_host") or settings.get("host")
        port = int(settings.get("live_port") or os.getenv("TOPAZ_LIVE_PORT", DEFAULT_PORT))
        results: List[dict] = []
        # Один опрос на шаблон за раз: несколько сотрудников не должны дёргать контроллер параллельно
        with _template_lock(template.id):
            states: Dict[str, LiveTanksState] = {}
            to_read = []
            for code in codes:
                cached = _recent.get((template.id, code))
                if cached and time.monotonic() - cached[0] < _min_interval_seconds():
                    states[code] = cached[1]
                else:
                    to_read.append(code)
            errors: Dict[str, str] = {}
            if to_read:
                if not host:
                    errors = {code: "В шаблоне не указан адрес сервера" for code in to_read}
                else:
                    try:
                        with self.client_factory(host, port, _timeout_seconds()) as client:
                            for code in to_read:
                                try:
                                    states[code] = client.read_tanks(code)
                                    _recent[(template.id, code)] = (time.monotonic(), states[code])
                                except TopazLiveError as exc:
                                    errors[code] = str(exc)
                    except TopazLiveError as exc:
                        errors.update({code: str(exc) for code in to_read if code not in states})

        from app.services.topaz_sync_service import TopazSyncService
        writer = TopazSyncService(self.db, firebird_service_class=object)
        for code in codes:
            if code in errors:
                logger.warning("Живой опрос уровнемера не удался", extra={
                    "template_id": template.id, "azs_code": code, "error": errors[code], "event_type": "topaz_live",
                })
                results.append({"azs_code": code, "status": "failed", "error": errors[code], "measured_at": None,
                                "tanks_updated": 0})
                continue
            state = states[code]
            by_number = {tank.tank_number: tank for tank in tanks if tank.azs_code == code}
            rows = []
            for live in state.tanks:
                tank = by_number.get(live.number)
                if tank is None or live.volume is None:
                    continue
                if live.fuel:
                    tank.source_fuel = live.fuel
                rows.append((tank, {
                    "measured_at": state.measured_at,
                    "volume": live.volume,
                    "mass": live.mass,
                    "density": live.density,
                    "temperature": live.temperature,
                    "water": live.water,
                    "source_row_id": LIVE_ROW_OFFSET + int(state.measured_at.timestamp()),
                }))
            writer._insert_readings(rows)
            results.append({"azs_code": code, "status": "success", "error": None,
                            "measured_at": state.measured_at, "tanks_updated": len(rows)})
        return results
