"""
Интеграционные тесты для модуля топливных карт
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import FuelCard, Vehicle, Provider


@pytest.fixture
def test_provider(test_db: Session) -> Provider:
    """Создание тестового провайдера"""
    provider = Provider(
        name="Тестовый провайдер",
        code="TEST",
        is_active=True
    )
    test_db.add(provider)
    test_db.commit()
    test_db.refresh(provider)
    return provider


@pytest.fixture
def test_vehicle(test_db: Session) -> Vehicle:
    """Создание тестового ТС"""
    vehicle = Vehicle(
        original_name="Toyota Camry А123БВ777",
        garage_number="001",
        license_plate="А123БВ777",
        is_validated="valid"
    )
    test_db.add(vehicle)
    test_db.commit()
    test_db.refresh(vehicle)
    return vehicle


@pytest.fixture
def test_fuel_card(test_db: Session, test_provider: Provider) -> FuelCard:
    """Создание тестовой топливной карты"""
    card = FuelCard(
        card_number="1234567890123456",
        provider_id=test_provider.id,
        is_blocked=False
    )
    test_db.add(card)
    test_db.commit()
    test_db.refresh(card)
    return card


class TestFuelCardsList:
    """Тесты для получения списка топливных карт"""
    
    def test_get_fuel_cards_empty(self, client: TestClient):
        """Тест получения пустого списка карт"""
        response = client.get("/api/v1/fuel-cards")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["items"] == []
    
    def test_get_fuel_cards_with_data(self, client: TestClient, test_fuel_card: FuelCard):
        """Тест получения списка карт с данными"""
        response = client.get("/api/v1/fuel-cards")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["id"] == test_fuel_card.id
        assert data["items"][0]["card_number"] == test_fuel_card.card_number
    
    def test_get_fuel_cards_filter_by_vehicle(self, client: TestClient,
                                              test_db: Session,
                                              test_provider: Provider,
                                              test_vehicle: Vehicle):
        """Тест фильтрации по ТС"""
        # Создаем карту с ТС
        card_with_vehicle = FuelCard(
            card_number="1111111111111111",
            provider_id=test_provider.id,
            vehicle_id=test_vehicle.id,
            is_blocked=False
        )
        # Создаем карту без ТС
        card_without_vehicle = FuelCard(
            card_number="2222222222222222",
            provider_id=test_provider.id,
            is_blocked=False
        )
        test_db.add_all([card_with_vehicle, card_without_vehicle])
        test_db.commit()
        
        # Фильтр по ТС
        response = client.get(f"/api/v1/fuel-cards?vehicle_id={test_vehicle.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["vehicle_id"] == test_vehicle.id
    
    def test_get_fuel_cards_filter_by_provider(self, client: TestClient,
                                               test_db: Session,
                                               test_provider: Provider):
        """Тест фильтрации по провайдеру"""
        # Создаем второго провайдера
        provider2 = Provider(
            name="Провайдер 2",
            code="TEST2",
            is_active=True
        )
        test_db.add(provider2)
        test_db.commit()
        
        # Создаем карты для разных провайдеров
        card1 = FuelCard(
            card_number="1111111111111111",
            provider_id=test_provider.id,
            is_blocked=False
        )
        card2 = FuelCard(
            card_number="2222222222222222",
            provider_id=provider2.id,
            is_blocked=False
        )
        test_db.add_all([card1, card2])
        test_db.commit()
        
        # Фильтр по провайдеру
        response = client.get(f"/api/v1/fuel-cards?provider_id={test_provider.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["provider_id"] == test_provider.id
    
    def test_get_fuel_cards_filter_by_blocked(self, client: TestClient,
                                             test_db: Session,
                                             test_provider: Provider):
        """Тест фильтрации по статусу блокировки"""
        # Создаем заблокированную и незаблокированную карты
        blocked_card = FuelCard(
            card_number="1111111111111111",
            provider_id=test_provider.id,
            is_blocked=True
        )
        unblocked_card = FuelCard(
            card_number="2222222222222222",
            provider_id=test_provider.id,
            is_blocked=False
        )
        test_db.add_all([blocked_card, unblocked_card])
        test_db.commit()
        
        # Фильтр по заблокированным
        response = client.get("/api/v1/fuel-cards?is_blocked=true")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["is_blocked"] is True
        
        # Фильтр по незаблокированным
        response = client.get("/api/v1/fuel-cards?is_blocked=false")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["is_blocked"] is False


class TestFuelCardDetail:
    """Тесты для получения карты по ID"""
    
    def test_get_fuel_card_by_id(self, client: TestClient, test_fuel_card: FuelCard):
        """Тест получения карты по ID"""
        response = client.get(f"/api/v1/fuel-cards/{test_fuel_card.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_fuel_card.id
        assert data["card_number"] == test_fuel_card.card_number
    
    def test_get_fuel_card_not_found(self, client: TestClient):
        """Тест получения несуществующей карты"""
        response = client.get("/api/v1/fuel-cards/99999")
        assert response.status_code == 404


class TestFuelCardUpdate:
    """Тесты для обновления карты"""
    
    def test_update_fuel_card(self, client: TestClient, test_fuel_card: FuelCard,
                             auth_headers: dict):
        """Тест обновления карты"""
        update_data = {
            "is_blocked": True
        }
        response = client.put(
            f"/api/v1/fuel-cards/{test_fuel_card.id}",
            json=update_data,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_blocked"] is True
    
    def test_update_fuel_card_not_found(self, client: TestClient, auth_headers: dict):
        """Тест обновления несуществующей карты"""
        update_data = {
            "is_blocked": True
        }
        response = client.put(
            "/api/v1/fuel-cards/99999",
            json=update_data,
            headers=auth_headers
        )
        assert response.status_code == 404


class TestFuelCardAssign:
    """Тесты для назначения карты ТС"""
    
    def test_assign_card_to_vehicle(self, client: TestClient,
                                   test_fuel_card: FuelCard,
                                   test_vehicle: Vehicle,
                                   auth_headers: dict):
        """Тест назначения карты ТС"""
        assign_data = {
            "vehicle_id": test_vehicle.id
        }
        # Реальный endpoint - /assign (POST), принимает CardAssignmentRequest
        from datetime import date
        response = client.post(
            "/api/v1/fuel-cards/assign",
            json={
                "card_id": test_fuel_card.id,
                "vehicle_id": test_vehicle.id,
                "start_date": str(date.today()),
                "check_overlap": False
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        
        # Проверяем, что карта действительно назначена
        response = client.get(f"/api/v1/fuel-cards/{test_fuel_card.id}")
        assert response.status_code == 200
        assert response.json()["vehicle_id"] == test_vehicle.id


class TestFuelCardClear:
    """Тесты для очистки карт"""
    
    def test_clear_all_fuel_cards(self, client: TestClient, test_db: Session,
                                 test_provider: Provider,
                                 admin_auth_headers: dict):
        """Тест очистки всех карт"""
        # Создаем несколько карт
        for i in range(3):
            card = FuelCard(
                card_number=f"123456789012345{i}",
                provider_id=test_provider.id,
                is_blocked=False
            )
            test_db.add(card)
        test_db.commit()
        
        # Проверяем, что карты есть
        response = client.get("/api/v1/fuel-cards")
        assert response.status_code == 200
        assert response.json()["total"] == 3
        
        # Очищаем все карты (требует confirm=true)
        response = client.delete(
            "/api/v1/fuel-cards/clear?confirm=true",
            headers=admin_auth_headers
        )
        assert response.status_code == 200
        
        # Обновляем сессию БД и проверяем напрямую через БД
        test_db.expire_all()
        # FuelCard уже импортирован в начале файла
        count = test_db.query(FuelCard).count()
        assert count == 0, f"В БД осталось {count} карт вместо 0"
        
        # Инвалидируем весь кэш для fuel_cards
        from app.services.cache_service import CacheService, invalidate_fuel_cards_cache
        invalidate_fuel_cards_cache()
        cache = CacheService.get_instance()
        cache.delete_pattern("fuel_cards:*", prefix="")
        
        # Проверяем через API (используем разные параметры для обхода кэша)
        response = client.get("/api/v1/fuel-cards?skip=0&limit=10")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0, f"API вернул {data['total']} карт вместо 0"

