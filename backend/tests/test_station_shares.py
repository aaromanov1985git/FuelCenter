"""
Тесты ссылок на просмотр АЗС без входа: создание, отзыв, срок и границы видимости
"""
import json
from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from app.models import CardLimit, Provider, ProviderTemplate, StationShare, Tank, TankReading, TopazSyncState, Transaction


@pytest.fixture
def topaz(test_db):
    """Два провайдера Топаза: у МАЗС две АЗС, у КАЗС одна."""
    data = {}
    for code, name in (("MAZS", "МАЗС"), ("KAZS", "КАЗС")):
        provider = Provider(name=name, code=code)
        test_db.add(provider)
        test_db.flush()
        template = ProviderTemplate(provider_id=provider.id, name=code, connection_type="firebird", field_mapping="{}",
                                    connection_settings="{}", fuel_type_mapping=json.dumps({"Бензин": "АИ-92"}))
        test_db.add(template)
        test_db.flush()
        run_at = datetime.now()
        test_db.add(TopazSyncState(template_id=template.id, source_kind="snapshots", last_tank_row_id=0,
                                   last_run_at=run_at, source_clock=run_at, last_status="success"))
        data[code] = (provider, template)

    mazs, mazs_tpl = data["MAZS"]
    kazs, kazs_tpl = data["KAZS"]

    def tank(provider, template, azs, key, fuel, volume, active=True):
        item = Tank(provider_id=provider.id, template_id=template.id, azs_code=azs, source_key=key, tank_number=1,
                    source_name=f"Емкость {key}", source_fuel=fuel, last_volume=Decimal(str(volume)),
                    last_density=Decimal("765"), last_measured_at=datetime.now() - timedelta(minutes=5), is_active=active)
        test_db.add(item)
        test_db.flush()
        return item

    shared_tank = tank(mazs, mazs_tpl, "1016201", "snap:1", "АИ-92", 5388)
    hidden_tank = tank(mazs, mazs_tpl, "1016201", "snap:9", "ДТ", 100, active=False)
    other_tank = tank(mazs, mazs_tpl, "807211", "snap:2", "ДТ", 5390)
    tank(kazs, kazs_tpl, "505221", "ses:505221:1", "ДТ1", 7842)
    test_db.add(TankReading(tank_id=shared_tank.id, measured_at=datetime.now() - timedelta(hours=1), volume=Decimal("5400"), source_row_id=1))
    test_db.add(TankReading(tank_id=other_tank.id, measured_at=datetime.now() - timedelta(hours=1), volume=Decimal("5500"), source_row_id=2))

    today = datetime.now().replace(hour=9, minute=0, second=0, microsecond=0)
    for provider, azs, card, qty in (
        (mazs, "1016201", "УТ201", "30"),
        (mazs, "807211", "УТ226", "200"),
        (kazs, "505221", "К068", "120"),
    ):
        test_db.add(Transaction(provider_id=provider.id, azs_number=azs, card_number=card, product="АИ-92",
                                transaction_date=today, quantity=Decimal(qty)))
    for provider, template, card in ((mazs, mazs_tpl, "УТ201"), (kazs, kazs_tpl, "К068")):
        test_db.add(CardLimit(provider_id=provider.id, template_id=template.id, source_card_id=1, source_fuel_id=3,
                              card_code=card, card_name=card, card_enabled=True, fuel_type="АИ-92", limit_type_id=7,
                              limit_liters=Decimal("30"), used_liters=Decimal("30")))
    test_db.commit()
    return {"mazs": mazs, "kazs": kazs, "shared_tank": shared_tank, "hidden_tank": hidden_tank, "other_tank": other_tank}


def create_share(client, headers, provider_id, **overrides):
    body = {"provider_id": provider_id, "azs_code": "1016201", "show_tanks": True, "expires_in_days": 7, **overrides}
    return client.post("/api/v1/station-shares", json=body, headers=headers)


class TestShareManagement:
    def test_admin_creates_lists_and_revokes(self, client, admin_auth_headers, topaz):
        response = create_share(client, admin_auth_headers, topaz["mazs"].id, show_fills=True, note="Подрядчик Север")
        assert response.status_code == 201
        share = response.json()
        assert share["status"] == "active"
        assert share["url_path"] == f"/share/{share['token']}"
        assert len(share["token"]) >= 40
        assert share["created_by_name"] == "admin"
        expires = datetime.fromisoformat(share["expires_at"].replace("Z", "+00:00"))
        assert timedelta(days=6, hours=23) < expires.replace(tzinfo=None) - datetime.utcnow() <= timedelta(days=7)

        listed = client.get("/api/v1/station-shares", params={"azs_code": "1016201"}, headers=admin_auth_headers).json()
        assert [item["note"] for item in listed] == ["Подрядчик Север"]

        revoked = client.delete(f"/api/v1/station-shares/{share['id']}", headers=admin_auth_headers).json()
        assert revoked["status"] == "revoked"
        assert client.get(f"/api/v1/public/shares/{share['token']}").status_code == 404

    def test_regular_user_cannot_create(self, client, auth_headers, topaz):
        assert create_share(client, auth_headers, topaz["mazs"].id).status_code == 403

    def test_requires_section_and_known_station(self, client, admin_auth_headers, topaz):
        assert create_share(client, admin_auth_headers, topaz["mazs"].id, show_tanks=False).status_code == 422
        assert create_share(client, admin_auth_headers, topaz["mazs"].id, azs_code="999999").status_code == 404
        assert create_share(client, admin_auth_headers, topaz["mazs"].id, expires_in_days=None,
                            expires_at="2020-01-01T00:00:00Z").status_code == 400


class TestPublicAccess:
    def test_info_counts_opens_without_login(self, client, admin_auth_headers, topaz, test_db):
        token = create_share(client, admin_auth_headers, topaz["mazs"].id).json()["token"]
        for _ in range(2):
            info = client.get(f"/api/v1/public/shares/{token}")
            assert info.status_code == 200
        body = info.json()
        assert body["azs_code"] == "1016201"
        assert body["provider_name"] == "МАЗС"
        assert (body["show_tanks"], body["show_fills"], body["show_limits"]) == (True, False, False)
        assert "note" not in body
        assert test_db.query(StationShare).filter_by(token=token).one().open_count == 2

    def test_tanks_only_of_shared_station_without_hidden(self, client, admin_auth_headers, topaz):
        token = create_share(client, admin_auth_headers, topaz["mazs"].id).json()["token"]
        body = client.get(f"/api/v1/public/shares/{token}/tanks").json()
        assert [s["azs_code"] for s in body["stations"]] == ["1016201"]
        assert [t["source_key"] for t in body["stations"][0]["tanks"]] == ["snap:1"]
        assert body["sync"] == []

        own = client.get(f"/api/v1/public/shares/{token}/tanks/{topaz['shared_tank'].id}/readings")
        assert own.status_code == 200 and own.json()["total"] == 1
        assert client.get(f"/api/v1/public/shares/{token}/tanks/{topaz['other_tank'].id}/readings").status_code == 404
        assert client.get(f"/api/v1/public/shares/{token}/tanks/{topaz['hidden_tank'].id}/readings").status_code == 404

    def test_closed_sections_are_forbidden(self, client, admin_auth_headers, topaz):
        token = create_share(client, admin_auth_headers, topaz["mazs"].id).json()["token"]
        assert client.get(f"/api/v1/public/shares/{token}/fills-by-card").status_code == 403
        assert client.get(f"/api/v1/public/shares/{token}/fills").status_code == 403
        assert client.get(f"/api/v1/public/shares/{token}/fills-by-card/export").status_code == 403
        assert client.get(f"/api/v1/public/shares/{token}/card-limits").status_code == 403

    def test_fills_and_limits_stay_inside_share(self, client, admin_auth_headers, topaz):
        token = create_share(client, admin_auth_headers, topaz["mazs"].id, show_tanks=False, show_fills=True,
                             show_limits=True).json()["token"]
        # Попытка расширить выборку параметром провайдера ничего не даёт
        summary = client.get(f"/api/v1/public/shares/{token}/fills-by-card", params={"provider_id": topaz["kazs"].id}).json()
        assert [item["card_number"] for item in summary["items"]] == ["УТ201"]
        assert [p["name"] for p in summary["providers"]] == ["МАЗС"]

        detail = client.get(f"/api/v1/public/shares/{token}/fills").json()
        assert {item["azs_number"] for item in detail["items"]} == {"1016201"}

        export = client.get(f"/api/v1/public/shares/{token}/fills-by-card/export")
        assert export.status_code == 200 and "spreadsheetml" in export.headers["content-type"]

        limits = client.get(f"/api/v1/public/shares/{token}/card-limits").json()
        assert [item["card_name"] for item in limits["items"]] == ["УТ201"]
        assert [p["name"] for p in limits["providers"]] == ["МАЗС"]

        assert client.get(f"/api/v1/public/shares/{token}/tanks").status_code == 403

    def test_share_covers_all_controllers_of_one_station(self, client, admin_auth_headers, topaz, test_db):
        from app.models import GasStation
        station = GasStation(provider_id=topaz["mazs"].id, original_name="1016201", name="1016201", azs_number="1016201")
        test_db.add(station)
        test_db.flush()
        for tank in (topaz["shared_tank"], topaz["hidden_tank"], topaz["other_tank"]):
            tank.gas_station_id = station.id
        test_db.commit()

        token = create_share(client, admin_auth_headers, topaz["mazs"].id, show_fills=True).json()["token"]
        info = client.get(f"/api/v1/public/shares/{token}").json()
        assert info["azs_codes"] == ["1016201", "807211"]

        body = client.get(f"/api/v1/public/shares/{token}/tanks").json()
        assert len(body["stations"]) == 1
        assert {t["source_key"] for t in body["stations"][0]["tanks"]} == {"snap:1", "snap:2"}
        assert client.get(f"/api/v1/public/shares/{token}/tanks/{topaz['other_tank'].id}/readings").status_code == 200
        assert client.get(f"/api/v1/public/shares/{token}/tanks/{topaz['hidden_tank'].id}/readings").status_code == 404

        detail = client.get(f"/api/v1/public/shares/{token}/fills").json()
        assert {item["azs_number"] for item in detail["items"]} == {"1016201", "807211"}

        # Ссылка, выданная на второй код, видна в окне «Поделиться» основного кода
        create_share(client, admin_auth_headers, topaz["mazs"].id, azs_code="807211")
        listed = client.get("/api/v1/station-shares", params={"provider_id": topaz["mazs"].id, "azs_code": "1016201"},
                            headers=admin_auth_headers).json()
        assert sorted(item["azs_code"] for item in listed) == ["1016201", "807211"]

    def test_expired_and_unknown_links(self, client, admin_auth_headers, topaz, test_db):
        token = create_share(client, admin_auth_headers, topaz["mazs"].id).json()["token"]
        share = test_db.query(StationShare).filter_by(token=token).one()
        share.expires_at = datetime.utcnow() - timedelta(minutes=1)
        test_db.commit()
        assert client.get(f"/api/v1/public/shares/{token}").status_code == 410
        assert client.get(f"/api/v1/public/shares/{token}/tanks").status_code == 410
        assert client.get("/api/v1/public/shares/not-a-real-token").status_code == 404
