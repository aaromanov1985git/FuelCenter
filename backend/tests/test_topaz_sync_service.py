"""
Тесты загрузки резервуаров и лимитов карт из Топаза.
Firebird подменяется фейковым курсором, который отвечает по фрагментам SQL.
"""
import json
from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from app.models import CardLimit, Provider, ProviderTemplate, Tank, TankReading, TopazSyncState
from app.services import topaz_sync_service as sync_module
from app.services.topaz_sync_service import TopazSyncService, limit_period_start, resolve_fuel_type

NOW = datetime(2026, 9, 14, 14, 0, 0)


class FakeCursor:
    def __init__(self, data):
        self.data = data
        self._rows = []

    def execute(self, sql, params=()):
        d = self.data
        if "RDB$RELATIONS" in sql:
            self._rows = [(name,) for name in d["tables"]]
        elif "CURRENT_TIMESTAMP" in sql:
            self._rows = [(d["now"],)]
        elif '"dcTanks" t JOIN' in sql:
            self._rows = list(d.get("tanks", []))
        elif '"dcSnapshotsTanks" s' in sql:
            last_id, since = params
            size = int(sql.split("FIRST ")[1].split()[0])
            rows = [r for r in d.get("snapshots", []) if r[0] > last_id and r[2] >= since]
            self._rows = sorted(rows, key=lambda r: r[0])[:size]
        elif 'MAX("SessionID")' in sql:
            self._rows = [(max((s["session_id"] for s in d.get("sessions", [])), default=0),)]
        elif '"flSesTanks" t' in sql:
            since, last_id, min_session = params
            self._rows = [
                (s["row_id"], s["azs"], s["tank"], s["fuel"], s["start"], s["volume"], s["mass"], s["density"], s["temp"])
                for s in d.get("sessions", [])
                if s["start"] >= since and (s["row_id"] > last_id or s["session_id"] >= min_session)
            ]
        elif '"dcLimitRestrictions" l' in sql:
            self._rows = list(d.get("limits", []))
        elif '"rgAmountRests" r' in sql:
            _, since = params
            self._rows = [r for r in d.get("fills", []) if r[2] >= since]
        else:
            raise AssertionError(f"Неожиданный запрос: {sql}")

    def fetchall(self):
        return list(self._rows)

    def fetchone(self):
        return self._rows[0] if self._rows else None


class FakeConnection:
    def __init__(self, data):
        self.data = data
        self.closed = False

    def cursor(self):
        return FakeCursor(self.data)

    def close(self):
        self.closed = True


def make_firebird_class(data, connections=None):
    class FakeFirebirdService:
        def __init__(self, db):
            self.db = db

        def connect(self, settings):
            if data.get("fail"):
                raise RuntimeError("Firebird недоступен")
            conn = FakeConnection(data)
            if connections is not None:
                connections.append(conn)
            return conn

    return FakeFirebirdService


@pytest.fixture
def template(test_db):
    provider = Provider(name="МАЗС", code="MAZS")
    test_db.add(provider)
    test_db.flush()
    tpl = ProviderTemplate(
        provider_id=provider.id,
        name="MAZS",
        connection_type="firebird",
        is_active=True,
        field_mapping="{}",
        connection_settings=json.dumps({"host": "10.30.1.8", "database": "db.fdb", "user": "SYSDBA"}),
        fuel_type_mapping=json.dumps({"ДТ3": "ДТ", "ДТ2": "ДТ", "Бензин": "АИ-92"}),
    )
    test_db.add(tpl)
    test_db.commit()
    return tpl


def snapshot(row_id, tank_id, when, fuel, volume, density, mass=None, temp=20.0):
    return (row_id, tank_id, when, fuel, volume, mass, density, temp, 0)


def snapshots_data():
    return {
        "tables": ["dcTanks", "dcPointsOfSales", "dcSnapshotsTanks", "flSesTanks", "flSessions", "dcLimitRestrictions"],
        "now": NOW,
        "tanks": [
            (1, 1, "Емкость 1 - 1016201", "1016201"),
            (3, 2, "Емкость 2 - 1016201", "1016201"),
        ],
        "snapshots": [
            snapshot(5, 1, NOW - timedelta(days=100), "АИ-92", 9000, 765),
            snapshot(10, 1, NOW - timedelta(hours=2), "АИ-92", 5500, 765.05),
            snapshot(11, 3, NOW - timedelta(hours=1), "ДТ", 4230.71, 826.81, mass=3498.05),
            snapshot(12, 1, NOW - timedelta(minutes=10), "АИ-92", 5409.18, 765.06, mass=4138.31),
        ],
        "limits": [],
    }


class TestHelpers:
    def test_resolve_fuel_type_uses_mapping_and_strips_grade_number(self):
        mapping = {"ДТ3": "ДТ", "ДТ2": "ДТ", "Бензин": "АИ-92"}
        assert resolve_fuel_type("ДТ3", mapping) == "ДТ"
        assert resolve_fuel_type("ДТ1", mapping) == "ДТ"
        assert resolve_fuel_type("Бензин", mapping) == "АИ-92"
        assert resolve_fuel_type("АИ-95", mapping) == "АИ-95"
        assert resolve_fuel_type("", mapping) is None

    def test_limit_period_start(self):
        now = datetime(2026, 9, 16, 10, 30)  # среда
        assert limit_period_start(7, 1, now) == datetime(2026, 9, 16)
        assert limit_period_start(2, 1, now) == datetime(2026, 9, 14)
        assert limit_period_start(3, 6, now) == datetime(2026, 9, 1)
        assert limit_period_start(1, 3, now) == datetime(2026, 9, 14)
        assert limit_period_start(5, 1, now) is None


class TestSnapshots:
    def test_first_sync_creates_tanks_and_skips_old_history(self, test_db, template):
        data = snapshots_data()
        connections = []
        result = TopazSyncService(test_db, make_firebird_class(data, connections)).sync_template(template)

        assert result["status"] == "success"
        assert result["source_kind"] == "snapshots"
        assert result["tanks_count"] == 2
        assert result["readings_added"] == 3
        assert all(conn.closed for conn in connections)

        petrol = test_db.query(Tank).filter_by(source_key="snap:1").one()
        diesel = test_db.query(Tank).filter_by(source_key="snap:3").one()
        assert petrol.azs_code == "1016201"
        assert float(petrol.last_volume) == 5409.18
        assert petrol.last_measured_at == NOW - timedelta(minutes=10)
        assert diesel.source_fuel == "ДТ"
        assert float(diesel.last_density) == 826.81

        state = test_db.query(TopazSyncState).filter_by(template_id=template.id).one()
        assert state.last_tank_row_id == 12
        assert state.source_clock == NOW
        assert state.last_status == "success"

    def test_repeated_sync_adds_only_new_rows(self, test_db, template, monkeypatch):
        monkeypatch.setattr(sync_module, "SNAPSHOT_BATCH_SIZE", 2)
        data = snapshots_data()
        service = TopazSyncService(test_db, make_firebird_class(data))
        assert service.sync_template(template)["readings_added"] == 3

        assert service.sync_template(template)["readings_added"] == 0

        data["snapshots"].append(snapshot(13, 3, NOW - timedelta(minutes=1), "ДТ", 4200.0, 826.8))
        assert service.sync_template(template)["readings_added"] == 1
        assert test_db.query(TankReading).count() == 4
        diesel = test_db.query(Tank).filter_by(source_key="snap:3").one()
        assert float(diesel.last_volume) == 4200.0

    def test_manual_settings_survive_sync(self, test_db, template):
        data = snapshots_data()
        service = TopazSyncService(test_db, make_firebird_class(data))
        service.sync_template(template)
        tank = test_db.query(Tank).filter_by(source_key="snap:1").one()
        tank.capacity_liters = Decimal("30000")
        tank.is_active = False
        test_db.commit()

        service.sync_template(template)
        tank = test_db.query(Tank).filter_by(source_key="snap:1").one()
        assert float(tank.capacity_liters) == 30000
        assert tank.is_active is False

    def test_failure_is_recorded_not_raised(self, test_db, template):
        result = TopazSyncService(test_db, make_firebird_class({"fail": True})).sync_template(template)
        assert result["status"] == "failed"
        assert "недоступен" in result["error"]
        state = test_db.query(TopazSyncState).filter_by(template_id=template.id).one()
        assert state.last_status == "failed"
        assert "недоступен" in state.last_error


class TestSessions:
    def test_reads_opening_readings_per_tank(self, test_db, template):
        day = NOW.replace(hour=0, minute=0, second=0, microsecond=0)
        data = {
            "tables": ["flSesTanks", "flSessions", "dcAmounts"],
            "now": NOW,
            "sessions": [
                {"row_id": 101, "session_id": 50, "azs": "505221", "tank": 1, "fuel": "ДТ1", "start": day - timedelta(days=1),
                 "volume": 8000.0, "mass": 6700.0, "density": 834.0, "temp": 10.0},
                {"row_id": 102, "session_id": 50, "azs": "505221", "tank": 4, "fuel": "Бензин", "start": day - timedelta(days=1),
                 "volume": 9100.0, "mass": 6850.0, "density": 754.0, "temp": 10.0},
                {"row_id": 103, "session_id": 51, "azs": "505221", "tank": 1, "fuel": "ДТ1", "start": day,
                 "volume": 7842.16, "mass": 6536.5, "density": 833.51, "temp": 16.7},
                {"row_id": 104, "session_id": 51, "azs": "505221", "tank": 4, "fuel": "Бензин", "start": day,
                 "volume": None, "mass": None, "density": None, "temp": None},
            ],
        }
        service = TopazSyncService(test_db, make_firebird_class(data))
        result = service.sync_template(template)

        assert result["source_kind"] == "sessions"
        assert result["tanks_count"] == 2
        assert result["readings_added"] == 3
        tank1 = test_db.query(Tank).filter_by(source_key="ses:505221:1").one()
        assert float(tank1.last_volume) == 7842.16
        assert tank1.last_measured_at == day

        # Открытая смена дописала замер — перечитываем последние смены и добираем его
        data["sessions"][3].update({"volume": 9080.57, "mass": 6843.26, "density": 753.62, "temp": 16.8})
        assert service.sync_template(template)["readings_added"] == 1


class TestLimits:
    def test_limits_usage_and_cleanup(self, test_db, template):
        data = snapshots_data()
        data["tanks"] = []
        data["snapshots"] = []
        data["limits"] = [
            # CardID, AmountID, Code, Name, Enabled, Fuel, LimitTypeID, TypeName, Limit, Period
            (21, 6, "0087D287", "К068", 1, "ДТ3", 7, "Календарный день", 150, 1),
            (30, 3, "57B05D5BE1", "УТ206 ИП Фролкова", 1, "Бензин", 3, "Календарный месяц", 1500, 6),
            (31, 3, "B7832E362C", "УТДежДт", 1, "Бензин", 4, "Запрещен", 0, 1),
        ]
        data["fills"] = [
            (21, 6, NOW - timedelta(hours=2), Decimal("-120.05")),
            (21, 6, NOW - timedelta(days=1), Decimal("-150")),  # вчера — в суточный лимит не входит
            (30, 3, NOW - timedelta(days=5), Decimal("-40")),
            (30, 3, NOW - timedelta(hours=1), Decimal("-35.5")),
        ]
        service = TopazSyncService(test_db, make_firebird_class(data))
        result = service.sync_template(template)
        assert result["limits_count"] == 3

        daily = test_db.query(CardLimit).filter_by(source_card_id=21).one()
        assert daily.fuel_type == "ДТ"
        assert float(daily.used_liters) == 120.05
        assert daily.period_start == NOW.replace(hour=0, minute=0, second=0, microsecond=0)

        monthly = test_db.query(CardLimit).filter_by(source_card_id=30).one()
        assert monthly.fuel_type == "АИ-92"
        assert float(monthly.used_liters) == 75.5

        forbidden = test_db.query(CardLimit).filter_by(source_card_id=31).one()
        assert forbidden.used_liters is None

        data["limits"] = data["limits"][:1]
        service.sync_template(template)
        assert test_db.query(CardLimit).count() == 1
