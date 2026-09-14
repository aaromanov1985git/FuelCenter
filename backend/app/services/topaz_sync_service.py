"""
Загрузка остатков в резервуарах и лимитов карт из баз Топаза (Firebird).

Источник определяется по таблицам базы:
- dcSnapshotsTanks — снимки уровнемера, которые Топаз-Офис пишет при отпуске топлива (МАЗС);
- flSesTanks — замеры резервуаров на открытии смены (OnlineTerminal, КАЗС), плюс замер
  ёмкости на конец каждого отпуска из журнала sysEvents: в течение дня OnlineTerminal
  больше нигде уровень не сохраняет.
Лимиты карт читаются из dcLimitRestrictions целиком, расход в текущем периоде
считается по заправкам rgAmountRests (DocTypeID = 3).
"""
import re
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.logger import logger
from app.models import CardLimit, GasStation, ProviderTemplate, Tank, TankReading, TopazSyncState
from app.services.normalization_service import normalize_fuel
from app.utils.fuel_mapping import match_fuel_type
from app.utils.json_utils import parse_template_json

SOURCE_SNAPSHOTS = "snapshots"
SOURCE_SESSIONS = "sessions"

# Сколько дней истории забирать при первой загрузке шаблона
INITIAL_HISTORY_DAYS = 45
# Размер пачки снимков за один запрос и предел пачек за запуск
SNAPSHOT_BATCH_SIZE = 5000
SNAPSHOT_MAX_BATCHES = 20
# Сколько последних смен перечитывать: замеры открытой смены могут дописываться
SESSIONS_REREAD = 3

DOC_TYPE_TERMINAL_DEBIT = 3

# Событие «ПО Автоналив. Информация»: «Отпуск топлива из емкости N завершен … На конец: V=…»
EVENT_CATEGORY_DISPENSE = 138
# Замеры из событий лежат в том же журнале, что и замеры смен: сдвигаем id, чтобы не пересекались
EVENT_ROW_OFFSET = 10 ** 12

LIMIT_TYPE_DAYS = 1
LIMIT_TYPE_WEEK = 2
LIMIT_TYPE_MONTH = 3
LIMIT_TYPE_FORBIDDEN = 4
LIMIT_TYPE_DAY = 7

_TRAILING_NUMBER = re.compile(r"[\s\-]*\d+$")
_DISPENSE_TANK = re.compile(r"Отпуск топлива из [её]мкости\s+(\d+)", re.IGNORECASE)
_DISPENSE_END = re.compile(
    r"На конец:\s*V=(-?[\d\s.,]+?)\s*л,\s*p=(-?[\d\s.,]+?)\s*кг/м3,\s*T\S*?=(-?[\d\s.,]+?)\s*C",
    re.IGNORECASE,
)


def _event_number(value: str) -> Decimal:
    return Decimal(value.replace(" ", "").replace(" ", "").replace(",", "."))


def parse_dispense_event(text: Optional[str]) -> Optional[Tuple[int, Decimal, Decimal, Decimal]]:
    """
    Разобрать событие OnlineTerminal об отпуске топлива.

    Возвращает (номер ёмкости, объём, плотность, температура) на конец отпуска
    или None, если это событие другого вида.
    """
    if not text:
        return None
    tank = _DISPENSE_TANK.search(text)
    end = _DISPENSE_END.search(text)
    if not tank or not end:
        return None
    try:
        return int(tank.group(1)), _event_number(end.group(1)), _event_number(end.group(2)), _event_number(end.group(3))
    except (ArithmeticError, ValueError):
        return None


def resolve_fuel_type(raw: Optional[str], mapping: Optional[Dict[str, str]]) -> Optional[str]:
    """
    Привести вид топлива Топаза к названию, под которым он лежит в транзакциях GSM.

    Сначала сопоставление шаблона, затем то же сопоставление без номера сорта
    («ДТ1» → «ДТ»): в Топазе один дизель заводят под несколькими кодами.
    """
    if not raw or not str(raw).strip():
        return None
    value = str(raw).strip()
    if mapping:
        mapped = match_fuel_type(value, mapping)
        if mapped:
            return mapped
        base = _TRAILING_NUMBER.sub("", value)
        if base and base != value:
            mapped = match_fuel_type(base, mapping)
            if mapped:
                return mapped
    return normalize_fuel(value) or value


def limit_period_start(limit_type_id: Optional[int], period: Optional[int], now: datetime) -> Optional[datetime]:
    """Начало текущего периода лимита или None, если расход по типу не считается."""
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if limit_type_id == LIMIT_TYPE_DAY:
        return today
    if limit_type_id == LIMIT_TYPE_WEEK:
        return today - timedelta(days=today.weekday())
    if limit_type_id == LIMIT_TYPE_MONTH:
        return today.replace(day=1)
    if limit_type_id == LIMIT_TYPE_DAYS:
        days = max(1, min(int(period or 1), 31))
        return today - timedelta(days=days - 1)
    return None


def _dec(value: Any) -> Optional[Decimal]:
    if value is None:
        return None
    return Decimal(str(value))


def _text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


class TopazSyncService:
    """Синхронизация резервуаров и лимитов карт из баз Топаза."""

    def __init__(self, db: Session, firebird_service_class=None):
        self.db = db
        if firebird_service_class is None:
            from app.services.firebird_service import FirebirdService
            firebird_service_class = FirebirdService
        self.firebird_service_class = firebird_service_class

    # ------------------------------------------------------------------ public

    def sync_all(self) -> List[Dict[str, Any]]:
        """Синхронизировать все активные шаблоны с подключением к Firebird."""
        templates = self.db.query(ProviderTemplate).filter(
            ProviderTemplate.connection_type == "firebird",
            ProviderTemplate.is_active == True,  # noqa: E712
        ).order_by(ProviderTemplate.id).all()
        return [self.sync_template(template) for template in templates]

    def sync_template(self, template: ProviderTemplate) -> Dict[str, Any]:
        """Синхронизировать один шаблон. Ошибка не пробрасывается, а пишется в состояние."""
        state = self._get_state(template.id)
        state.last_run_at = datetime.now()
        result: Dict[str, Any] = {
            "template_id": template.id,
            "template_name": template.name,
            "provider_id": template.provider_id,
            "status": "success",
            "source_kind": None,
            "tanks_count": 0,
            "readings_added": 0,
            "limits_count": 0,
            "error": None,
        }

        conn = None
        try:
            settings = parse_template_json(template.connection_settings) or {}
            mapping = parse_template_json(template.fuel_type_mapping) or {}
            if not isinstance(mapping, dict):
                mapping = {}

            conn = self.firebird_service_class(self.db).connect(settings)
            cursor = conn.cursor()
            tables = self._existing_tables(cursor)
            source_now = self._source_now(cursor)
            state.last_run_at = datetime.now()
            state.source_clock = source_now

            if "dcSnapshotsTanks" in tables and "dcTanks" in tables:
                result["source_kind"] = SOURCE_SNAPSHOTS
                tanks, added = self._sync_snapshots(cursor, template, state, mapping, source_now)
            elif "flSesTanks" in tables and "flSessions" in tables:
                result["source_kind"] = SOURCE_SESSIONS
                tanks, added = self._sync_sessions(cursor, template, state, mapping, source_now)
                if "sysEvents" in tables:
                    added += self._sync_dispense_events(cursor, template, source_now)
            else:
                tanks, added = 0, 0
            result["tanks_count"] = tanks
            result["readings_added"] = added

            if "dcLimitRestrictions" in tables:
                result["limits_count"] = self._sync_limits(cursor, template, mapping, source_now)

            state.source_kind = result["source_kind"]
            state.last_status = "success"
            state.last_success_at = datetime.now()
            state.last_error = None
            state.tanks_count = result["tanks_count"]
            state.readings_added = result["readings_added"]
            state.limits_count = result["limits_count"]
            self.db.commit()
        except Exception as exc:  # источник недоступен, схема другая и т.п.
            self.db.rollback()
            result["status"] = "failed"
            result["error"] = str(exc)
            state = self._get_state(template.id)
            state.last_run_at = datetime.now()
            state.last_status = "failed"
            state.last_error = str(exc)[:2000]
            self.db.commit()
            logger.error("Ошибка загрузки резервуаров и лимитов из Топаза", extra={
                "template_id": template.id,
                "template_name": template.name,
                "error": str(exc),
                "event_type": "topaz_sync",
            }, exc_info=True)
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass

        logger.info("Загрузка из Топаза завершена", extra={**result, "event_type": "topaz_sync"})
        return result

    # --------------------------------------------------------------- helpers

    def _get_state(self, template_id: int) -> TopazSyncState:
        state = self.db.query(TopazSyncState).filter(TopazSyncState.template_id == template_id).first()
        if state is None:
            state = TopazSyncState(template_id=template_id, last_tank_row_id=0)
            self.db.add(state)
            self.db.flush()
        return state

    @staticmethod
    def _existing_tables(cursor) -> set:
        cursor.execute(
            "SELECT TRIM(RDB$RELATION_NAME) FROM RDB$RELATIONS "
            "WHERE COALESCE(RDB$SYSTEM_FLAG, 0) = 0"
        )
        return {row[0] for row in cursor.fetchall()}

    @staticmethod
    def _source_now(cursor) -> datetime:
        """Текущее время по часам сервера Топаза: периоды лимитов считаются по нему."""
        cursor.execute("SELECT CURRENT_TIMESTAMP FROM RDB$DATABASE")
        row = cursor.fetchone()
        return row[0] if row and row[0] else datetime.now()

    def _gas_station_id(self, provider_id: int, azs_code: str) -> Optional[int]:
        station = self.db.query(GasStation.id).filter(
            GasStation.provider_id == provider_id,
            (GasStation.azs_number == azs_code) | (GasStation.original_name == azs_code),
        ).first()
        return station[0] if station else None

    def _upsert_tank(self, template: ProviderTemplate, source_key: str, azs_code: str,
                     tank_number: Optional[int], source_name: Optional[str]) -> Tank:
        tank = self.db.query(Tank).filter(
            Tank.template_id == template.id, Tank.source_key == source_key
        ).first()
        if tank is None:
            tank = Tank(
                provider_id=template.provider_id,
                template_id=template.id,
                source_key=source_key,
                azs_code=azs_code,
                is_active=True,
            )
            self.db.add(tank)
        tank.azs_code = azs_code
        tank.tank_number = tank_number
        if source_name:
            tank.source_name = source_name
        if tank.gas_station_id is None:
            tank.gas_station_id = self._gas_station_id(template.provider_id, azs_code)
        self.db.flush()
        return tank

    def _insert_readings(self, rows: Iterable[Tuple[Tank, Dict[str, Any]]]) -> int:
        """Добавить замеры, пропуская уже загруженные (tank_id, source_row_id)."""
        rows = list(rows)
        if not rows:
            return 0
        by_tank: Dict[int, List[int]] = {}
        for tank, reading in rows:
            by_tank.setdefault(tank.id, []).append(reading["source_row_id"])
        existing = set()
        for tank_id, ids in by_tank.items():
            for chunk_start in range(0, len(ids), 900):
                chunk = ids[chunk_start:chunk_start + 900]
                existing.update(
                    (tank_id, row_id) for (row_id,) in self.db.query(TankReading.source_row_id).filter(
                        TankReading.tank_id == tank_id, TankReading.source_row_id.in_(chunk)
                    )
                )

        added = 0
        for tank, reading in rows:
            key = (tank.id, reading["source_row_id"])
            if key in existing:
                continue
            existing.add(key)
            self.db.add(TankReading(tank_id=tank.id, **reading))
            added += 1
            if tank.last_measured_at is None or reading["measured_at"] >= tank.last_measured_at:
                tank.last_measured_at = reading["measured_at"]
                tank.last_volume = reading["volume"]
                tank.last_mass = reading["mass"]
                tank.last_density = reading["density"]
                tank.last_temperature = reading["temperature"]
                tank.last_water = reading.get("water")
        self.db.flush()
        return added

    # ------------------------------------------------------------- snapshots

    def _sync_snapshots(self, cursor, template, state, mapping, source_now) -> Tuple[int, int]:
        cursor.execute(
            'SELECT t."TankID", t."TankNum", t."TankName", p."PosName" '
            'FROM "dcTanks" t JOIN "dcPointsOfSales" p ON p."PointOfSalesID" = t."PointOfSalesID" '
            'WHERE t."Deleted" = 0'
        )
        tanks: Dict[int, Tank] = {}
        for tank_id, tank_num, tank_name, pos_name in cursor.fetchall():
            azs_code = _text(pos_name) or str(tank_id)
            tanks[tank_id] = self._upsert_tank(template, f"snap:{tank_id}", azs_code, tank_num, _text(tank_name))

        since = source_now - timedelta(days=INITIAL_HISTORY_DAYS)
        last_id = int(state.last_tank_row_id or 0)
        added = 0
        for _ in range(SNAPSHOT_MAX_BATCHES):
            cursor.execute(
                f'SELECT FIRST {SNAPSHOT_BATCH_SIZE} s."SnapshotTankID", s."TankID", s."SnapshotDate", s."FuelName", '
                's."Volume", s."Mass", s."Density", s."Temperature", s."Water" '
                'FROM "dcSnapshotsTanks" s WHERE s."SnapshotTankID" > ? AND s."SnapshotDate" >= ? '
                'ORDER BY s."SnapshotTankID"',
                (last_id, since),
            )
            batch = cursor.fetchall()
            if not batch:
                break
            readings = []
            for row_id, tank_id, snap_date, fuel_name, volume, mass, density, temperature, water in batch:
                last_id = max(last_id, int(row_id))
                tank = tanks.get(tank_id)
                if tank is None or snap_date is None or volume is None:
                    continue
                if fuel_name:
                    tank.source_fuel = _text(fuel_name)
                readings.append((tank, {
                    "measured_at": snap_date,
                    "volume": _dec(volume),
                    "mass": _dec(mass),
                    "density": _dec(density),
                    "temperature": _dec(temperature),
                    "water": _dec(water),
                    "source_row_id": int(row_id),
                }))
            added += self._insert_readings(readings)
            state.last_tank_row_id = last_id
            self.db.flush()
            if len(batch) < SNAPSHOT_BATCH_SIZE:
                break
        return len(tanks), added

    # -------------------------------------------------------------- sessions

    def _sync_sessions(self, cursor, template, state, mapping, source_now) -> Tuple[int, int]:
        cursor.execute('SELECT MAX("SessionID") FROM "flSessions"')
        max_session = (cursor.fetchone() or [0])[0] or 0
        since = source_now - timedelta(days=INITIAL_HISTORY_DAYS)
        last_id = int(state.last_tank_row_id or 0)

        cursor.execute(
            'SELECT t."SesTankID", s."AzsCode", t."TankNum", a."Name", s."StartDateTime", '
            't."StartVolume", t."StartMass", t."StartDensity", t."StartTemperature" '
            'FROM "flSesTanks" t '
            'JOIN "flSessions" s ON s."SessionID" = t."SessionID" '
            'LEFT JOIN "dcAmounts" a ON a."AmountID" = t."AmountID" '
            'WHERE s."AzsCode" <> \'<не выбрана>\' AND s."StartDateTime" >= ? '
            'AND (t."SesTankID" > ? OR s."SessionID" >= ?) '
            'ORDER BY t."SesTankID"',
            (since, last_id, max_session - SESSIONS_REREAD),
        )
        tanks: Dict[str, Tank] = {}
        readings = []
        for row_id, azs_code, tank_num, fuel_name, start_dt, volume, mass, density, temperature in cursor.fetchall():
            azs = _text(azs_code)
            if not azs:
                continue
            last_id = max(last_id, int(row_id))
            key = f"ses:{azs}:{tank_num}"
            tank = tanks.get(key)
            if tank is None:
                tank = self._upsert_tank(template, key, azs, tank_num, f"Резервуар {tank_num}")
                tanks[key] = tank
            if fuel_name:
                tank.source_fuel = _text(fuel_name)
            # Замер на открытии смены совпадает с замером на закрытии предыдущей, поэтому берём только его
            if start_dt is None or volume is None:
                continue
            readings.append((tank, {
                "measured_at": start_dt,
                "volume": _dec(volume),
                "mass": _dec(mass),
                "density": _dec(density),
                "temperature": _dec(temperature),
                "water": None,
                "source_row_id": int(row_id),
            }))
        added = self._insert_readings(readings)
        state.last_tank_row_id = last_id
        tanks_total = self.db.query(Tank).filter(Tank.template_id == template.id).count()
        return tanks_total, added

    def _sync_dispense_events(self, cursor, template, source_now) -> int:
        """Замеры ёмкости на конец каждого отпуска из журнала событий OnlineTerminal."""
        since = source_now - timedelta(days=INITIAL_HISTORY_DAYS)
        cursor.execute(
            'SELECT e."EventID", e."DateTime", e."ComputerName", e."EventString" FROM "sysEvents" e '
            'WHERE e."EventCategoryID" = ? AND e."DateTime" >= ? AND e."EventString" CONTAINING ?',
            (EVENT_CATEGORY_DISPENSE, since, "Отпуск топлива из"),
        )
        tanks: Dict[str, Tank] = {}
        readings = []
        for event_id, event_dt, computer, text in cursor.fetchall():
            azs = _text(computer)
            parsed = parse_dispense_event(text if isinstance(text, str) else None)
            if not azs or event_dt is None or parsed is None:
                continue
            tank_num, volume, density, temperature = parsed
            key = f"ses:{azs}:{tank_num}"
            tank = tanks.get(key)
            if tank is None:
                tank = self.db.query(Tank).filter(Tank.template_id == template.id, Tank.source_key == key).first()
                if tank is None:
                    tank = self._upsert_tank(template, key, azs, tank_num, f"Резервуар {tank_num}")
                tanks[key] = tank
            readings.append((tank, {
                "measured_at": event_dt,
                "volume": volume,
                "mass": (volume * density / Decimal(1000)).quantize(Decimal("0.01")),
                "density": density,
                "temperature": temperature,
                "water": None,
                "source_row_id": EVENT_ROW_OFFSET + int(event_id),
            }))
        return self._insert_readings(readings)

    # ---------------------------------------------------------------- limits

    def _sync_limits(self, cursor, template, mapping, source_now) -> int:
        cursor.execute(
            'SELECT l."CardID", l."AmountID", c."Code", c."Name", c."Enabled", a."Name", '
            'l."LimitTypeID", lt."Name", l."Limit", l."Period" '
            'FROM "dcLimitRestrictions" l '
            'JOIN "dcCards" c ON c."CardID" = l."CardID" '
            'JOIN "dcAmounts" a ON a."AmountID" = l."AmountID" '
            'LEFT JOIN "sysLimitTypes" lt ON lt."LimitTypeID" = l."LimitTypeID" '
            'WHERE l."AmountID" <> 0 AND COALESCE(c."Code", \'\') <> \'\' '
            'AND (l."Limit" > 0 OR l."LimitTypeID" = ?)',
            (LIMIT_TYPE_FORBIDDEN,),
        )
        limit_rows = cursor.fetchall()

        starts = [limit_period_start(row[6], row[9], source_now) for row in limit_rows]
        known_starts = [start for start in starts if start is not None]
        usage: Dict[Tuple[int, int], List[Tuple[datetime, Decimal]]] = {}
        if known_starts:
            cursor.execute(
                'SELECT r."CardID", r."AmountID", r."Date", r."Quantity" FROM "rgAmountRests" r '
                'WHERE r."DocTypeID" = ? AND r."Date" >= ?',
                (DOC_TYPE_TERMINAL_DEBIT, min(known_starts)),
            )
            for card_id, amount_id, fill_date, quantity in cursor.fetchall():
                if fill_date is None or quantity is None:
                    continue
                usage.setdefault((card_id, amount_id), []).append((fill_date, -Decimal(str(quantity))))

        existing = {
            (limit.source_card_id, limit.source_fuel_id): limit
            for limit in self.db.query(CardLimit).filter(CardLimit.template_id == template.id)
        }
        seen = set()
        synced_at = datetime.now()
        for row, period_start in zip(limit_rows, starts):
            card_id, amount_id, code, name, enabled, fuel_name, type_id, type_name, limit_value, period = row
            key = (card_id, amount_id)
            seen.add(key)
            limit = existing.get(key)
            if limit is None:
                limit = CardLimit(
                    provider_id=template.provider_id,
                    template_id=template.id,
                    source_card_id=card_id,
                    source_fuel_id=amount_id,
                )
                self.db.add(limit)
            limit.card_code = _text(code)
            limit.card_name = _text(name)
            limit.card_enabled = bool(enabled)
            limit.source_fuel = _text(fuel_name)
            limit.fuel_type = resolve_fuel_type(fuel_name, mapping)
            limit.limit_type_id = type_id
            limit.limit_type_name = _text(type_name)
            limit.limit_liters = _dec(limit_value)
            limit.period = period
            limit.period_start = period_start
            if period_start is None:
                limit.used_liters = None
            else:
                limit.used_liters = sum(
                    (qty for fill_date, qty in usage.get(key, []) if fill_date >= period_start),
                    Decimal("0"),
                )
            limit.synced_at = synced_at

        for key, limit in existing.items():
            if key not in seen:
                self.db.delete(limit)
        self.db.flush()
        return len(limit_rows)
