"""
Тесты живого опроса уровнемеров «Сервер-186»: кадры и CRC, разбор ответа, клиент, запись замеров и API
"""
import json
import socket
import struct
import threading
from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from app.models import Provider, ProviderTemplate, Tank, TankReading, TopazSyncState
from app.services import topaz_live_service as live
from app.services.topaz_live_service import (
    LIVE_ROW_OFFSET, S186Client, TopazLiveError, TopazLiveService, build_frame, crc16_ccitt_false,
    parse_tanks_state, split_frames,
)


def tanks_xml(device, measured="2026-09-17T09:59:47", tanks=None, error=""):
    tanks = tanks if tanks is not None else [
        (1, "АИ-92", "16377.9297", "12530.0293", "765.0452"),
        (2, "ДТ", "12533.4473", "10437.7441", "832.7789"),
    ]
    rows = "".join(
        f'<tank num="{num}" active="1"><data ID="-1169">{fuel}</data><data ID="627" text="готов">0</data>'
        f'<data ID="622">{volume}</data><data ID="626">-1056139.91</data><data ID="620">0.0012</data>'
        f'<data ID="621">14.4922</data><data ID="623">{mass}</data><data ID="625">0</data>'
        f'<data ID="676">{density}</data></tank>'
        for num, fuel, volume, mass, density in tanks
    )
    return (
        '<?xml version="1.0" encoding="Windows-1251"?>\r\n<DATA>\r\n'
        f'\t<CMD DevID="{device}" id="0" Code="8" Name="Состояние емкостей" ClientID="1" UseClientID="False" '
        f'Desc="" Error="{error}" AllowInOffline="False" RefCount="15"><External><TITLES>'
        '<title ID="622">Общий объем топлива в емкости, л</title></TITLES>'
        f'<TANKS lastUpdate="{measured}">{rows}</TANKS></External></CMD>\r\n</DATA>'
    )


DEVICE_MAP_XML = (
    '<?xml version="1.0" encoding="Windows-1251"?>\r\n<DATA>\r\n\t<CMD id="0" Code="4" Name="Карта устройств" '
    'ClientID="-1"><External><DEVICES/></External></CMD>\r\n</DATA>'
)


@pytest.fixture(autouse=True)
def clear_live_cache(monkeypatch):
    live._recent.clear()
    monkeypatch.setenv("TOPAZ_LIVE_MIN_INTERVAL_SECONDS", "10")
    yield
    live._recent.clear()


class TestFrames:
    def test_crc_matches_reference_and_captured_frame(self):
        assert crc16_ccitt_false(b"123456789") == 0x29B1
        frame = build_frame(DEVICE_MAP_XML)
        payload = DEVICE_MAP_XML.encode("cp1251")
        assert frame[0] == 0x02
        assert struct.unpack("<I", frame[1:5])[0] == len(payload)
        assert frame[5:-2] == payload
        assert struct.unpack("<H", frame[-2:])[0] == crc16_ccitt_false(frame[1:-2])

    def test_split_keeps_partial_tail_and_drops_bad_crc(self):
        good = build_frame(tanks_xml("1016201"))
        broken = bytearray(build_frame(DEVICE_MAP_XML))
        broken[-1] ^= 0xFF
        stream = bytes(broken) + good + good[:10]
        messages, rest = split_frames(stream)
        assert len(messages) == 1 and "Состояние емкостей" in messages[0]
        assert rest == good[:10]
        messages, rest = split_frames(rest + good[10:])
        assert len(messages) == 1 and rest == b""


class TestParse:
    def test_parses_tanks_of_requested_device_only(self):
        state = parse_tanks_state(tanks_xml("1016201"), "1016201")
        assert state.measured_at == datetime(2026, 9, 17, 9, 59, 47)
        diesel = state.tanks[1]
        assert (diesel.number, diesel.fuel, diesel.volume, diesel.density) == (2, "ДТ", Decimal("12533.4473"), Decimal("832.7789"))
        assert diesel.mass == Decimal("10437.7441") and diesel.water == Decimal("0")
        assert parse_tanks_state(tanks_xml("807211"), "1016201") is None
        assert parse_tanks_state(DEVICE_MAP_XML, "1016201") is None

    def test_server_error_is_raised(self):
        with pytest.raises(TopazLiveError, match="нет связи"):
            parse_tanks_state(tanks_xml("1016201", error="нет связи с устройством"), "1016201")


class FakeServer:
    """Сервер-186 на локальном порту: проверяет CRC запроса и рассылает ответы как настоящий."""

    def __init__(self, responses):
        self.responses = responses
        self.requests = []
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.bind(("127.0.0.1", 0))
        self.sock.listen(1)
        self.port = self.sock.getsockname()[1]
        self.thread = threading.Thread(target=self._serve, daemon=True)
        self.thread.start()

    def _serve(self):
        conn, _ = self.sock.accept()
        conn.sendall(build_frame(DEVICE_MAP_XML))
        buffer = b""
        with conn:
            while True:
                chunk = conn.recv(65536)
                if not chunk:
                    return
                messages, buffer = split_frames(buffer + chunk)
                for message in messages:
                    self.requests.append(message)
                    device = message.split('DevID="')[1].split('"')[0]
                    reply = self.responses.get(device)
                    if reply:
                        # Ответ приходит по частям и после постороннего сообщения
                        data = build_frame(DEVICE_MAP_XML) + build_frame(reply)
                        conn.sendall(data[:30])
                        conn.sendall(data[30:])

    def close(self):
        self.sock.close()


class TestClient:
    def test_reads_tanks_through_socket(self):
        server = FakeServer({"1016201": tanks_xml("1016201")})
        try:
            with S186Client("127.0.0.1", server.port, timeout=5) as client:
                state = client.read_tanks("1016201")
            assert [t.volume for t in state.tanks] == [Decimal("16377.9297"), Decimal("12533.4473")]
            assert 'Code="8"' in server.requests[0] and 'DevID="1016201"' in server.requests[0]
        finally:
            server.close()

    def test_silent_device_times_out(self):
        server = FakeServer({})
        try:
            with S186Client("127.0.0.1", server.port, timeout=2) as client:
                with pytest.raises(TopazLiveError, match="не ответил"):
                    client.read_tanks("807211")
        finally:
            server.close()

    def test_unreachable_server(self):
        probe = socket.socket()
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
        probe.close()
        with pytest.raises(TopazLiveError, match="Нет связи"):
            with S186Client("127.0.0.1", port, timeout=2):
                pass


@pytest.fixture
def mazs_live(test_db):
    provider = Provider(name="МАЗС", code="MAZS")
    kazs = Provider(name="КАЗС", code="KAZS")
    test_db.add_all([provider, kazs])
    test_db.flush()
    template = ProviderTemplate(provider_id=provider.id, name="MAZS", connection_type="firebird", field_mapping="{}",
                                connection_settings=json.dumps({"host": "10.30.1.8", "database": "db.fdb"}),
                                fuel_type_mapping="{}")
    kazs_template = ProviderTemplate(provider_id=kazs.id, name="KAZS", connection_type="firebird", field_mapping="{}",
                                     connection_settings=json.dumps({"host": "10.30.0.15"}), fuel_type_mapping="{}")
    test_db.add_all([template, kazs_template])
    test_db.flush()
    now = datetime.now()
    test_db.add_all([
        TopazSyncState(template_id=template.id, source_kind="snapshots", last_run_at=now, source_clock=now, last_status="success"),
        TopazSyncState(template_id=kazs_template.id, source_kind="sessions", last_run_at=now, source_clock=now, last_status="success"),
    ])
    old = datetime(2026, 9, 16, 21, 51, 14)

    def tank(azs, key, num, fuel, volume, density, **extra):
        item = Tank(provider_id=provider.id, template_id=template.id, azs_code=azs, source_key=key, tank_number=num,
                    source_name=f"Емкость {num} - {azs}", source_fuel=fuel, capacity_liters=Decimal("30000"),
                    last_volume=Decimal(volume), last_density=Decimal(density), last_measured_at=old, **extra)
        test_db.add(item)
        return item

    petrol = tank("1016201", "snap:1", 1, "АИ-92", "16615.72", "764.98")
    mirror = tank("1016201", "snap:3", 2, "ДТ", "3322.63", "827.79", is_active=False)
    diesel = tank("807211", "snap:2", 1, "ДТ", "16615.72", "764.91", fuel_type_override="ДТ")
    kazs_tank = Tank(provider_id=kazs.id, template_id=kazs_template.id, azs_code="505221", source_key="ses:505221:1",
                     tank_number=1, source_fuel="ДТ1", last_volume=Decimal("7842"), last_measured_at=old)
    test_db.add(kazs_tank)
    test_db.commit()
    return {"provider": provider, "kazs": kazs, "template": template, "petrol": petrol, "mirror": mirror,
            "diesel": diesel}


class FakeClient:
    calls = []

    def __init__(self, replies):
        self.replies = replies

    def __call__(self, host, port, timeout):
        FakeClient.calls.append((host, port))
        return self

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read_tanks(self, code):
        reply = self.replies[code]
        if isinstance(reply, Exception):
            raise reply
        return parse_tanks_state(reply, code)


class TestLiveService:
    def test_updates_tanks_and_history_of_all_controllers(self, test_db, mazs_live):
        FakeClient.calls = []
        client = FakeClient({
            "1016201": tanks_xml("1016201"),
            "807211": tanks_xml("807211", measured="2026-09-17T09:59:48", tanks=[(1, "ДТ", "12533.4473", "10437.7441", "832.7789")]),
        })
        devices = TopazLiveService(test_db, client_factory=client).read_codes(mazs_live["provider"].id, ["1016201", "807211"])

        assert {d["azs_code"]: (d["status"], d["tanks_updated"]) for d in devices} == {"1016201": ("success", 2), "807211": ("success", 1)}
        assert FakeClient.calls == [("10.30.1.8", 4477)]
        test_db.refresh(mazs_live["diesel"])
        assert mazs_live["diesel"].last_volume == Decimal("12533.45")
        assert mazs_live["diesel"].last_density == Decimal("832.78")
        assert mazs_live["diesel"].last_measured_at == datetime(2026, 9, 17, 9, 59, 48)
        reading = test_db.query(TankReading).filter(TankReading.tank_id == mazs_live["diesel"].id).one()
        assert reading.source_row_id == LIVE_ROW_OFFSET + int(datetime(2026, 9, 17, 9, 59, 48).timestamp())

    def test_repeat_within_interval_uses_last_reading(self, test_db, mazs_live):
        FakeClient.calls = []
        client = FakeClient({"807211": tanks_xml("807211", tanks=[(1, "ДТ", "12533.4473", "10437.7441", "832.7789")])})
        service = TopazLiveService(test_db, client_factory=client)
        service.read_codes(mazs_live["provider"].id, ["807211"])
        service.read_codes(mazs_live["provider"].id, ["807211"])
        assert len(FakeClient.calls) == 1
        assert test_db.query(TankReading).filter(TankReading.tank_id == mazs_live["diesel"].id).count() == 1

    def test_failed_controller_does_not_block_others(self, test_db, mazs_live):
        client = FakeClient({
            "1016201": tanks_xml("1016201"),
            "807211": TopazLiveError("Контроллер 807211 не ответил за 20 с — возможно, нет связи с АЗС"),
        })
        devices = TopazLiveService(test_db, client_factory=client).read_codes(mazs_live["provider"].id, ["1016201", "807211"])
        statuses = {d["azs_code"]: d for d in devices}
        assert statuses["1016201"]["status"] == "success"
        assert statuses["807211"]["status"] == "failed" and "не ответил" in statuses["807211"]["error"]
        test_db.refresh(mazs_live["diesel"])
        assert mazs_live["diesel"].last_volume == Decimal("16615.72")

    def test_station_without_server_186_is_rejected(self, test_db, mazs_live):
        with pytest.raises(TopazLiveError, match="не поддерживается"):
            TopazLiveService(test_db, client_factory=FakeClient({})).read_codes(mazs_live["kazs"].id, ["505221"])


class TestLiveApi:
    def test_live_read_returns_refreshed_station(self, client, auth_headers, test_db, mazs_live, monkeypatch):
        from app.models import GasStation
        station = GasStation(provider_id=mazs_live["provider"].id, original_name="1016201", name="1016201", azs_number="1016201")
        test_db.add(station)
        test_db.flush()
        for key in ("petrol", "mirror", "diesel"):
            mazs_live[key].gas_station_id = station.id
        test_db.commit()
        fake = FakeClient({
            "1016201": tanks_xml("1016201"),
            "807211": tanks_xml("807211", tanks=[(1, "ДТ", "12533.4473", "10437.7441", "832.7789")]),
        })
        monkeypatch.setattr(live, "S186Client", fake)
        monkeypatch.setattr(live.TopazLiveService.__init__, "__defaults__", (fake,))

        overview = client.get("/api/v1/tanks", headers=auth_headers).json()
        assert {s["azs_code"]: s["live_available"] for s in overview["stations"]} == {"1016201": True, "505221": False}

        response = client.post("/api/v1/tanks/live", params={"provider_id": mazs_live["provider"].id, "azs_code": "807211"},
                               headers=auth_headers)
        assert response.status_code == 200
        body = response.json()
        assert {d["azs_code"] for d in body["devices"]} == {"1016201", "807211"}
        assert body["station"]["azs_codes"] == ["1016201", "807211"]
        fuels = {f["fuel_type"]: f for f in body["station"]["fuels"]}
        assert fuels["ДТ"]["volume"] == 12533.45
        assert fuels["АИ-92"]["volume"] == 16377.93

    def test_live_read_for_unsupported_station(self, client, auth_headers, mazs_live):
        response = client.post("/api/v1/tanks/live", params={"provider_id": mazs_live["kazs"].id, "azs_code": "505221"},
                               headers=auth_headers)
        assert response.status_code == 400
        assert "не поддерживается" in response.json()["detail"]
