"""
Интеграционные тесты для модуля транспортных средств
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Vehicle, Organization


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
def test_vehicle_pending(test_db: Session) -> Vehicle:
    """Создание тестового ТС со статусом pending"""
    vehicle = Vehicle(
        original_name="BMW X5 В456ГД999",
        garage_number="002",
        license_plate="В456ГД999",
        is_validated="pending"
    )
    test_db.add(vehicle)
    test_db.commit()
    test_db.refresh(vehicle)
    return vehicle


@pytest.fixture
def test_organization(test_db: Session) -> Organization:
    """Создание тестовой организации"""
    org = Organization(
        name="Тестовая организация",
        code="TEST_ORG",
        is_active=True
    )
    test_db.add(org)
    test_db.commit()
    test_db.refresh(org)
    return org


class TestVehiclesList:
    """Тесты для получения списка ТС"""
    
    def test_get_vehicles_empty(self, client: TestClient):
        """Тест получения пустого списка ТС"""
        response = client.get("/api/v1/vehicles")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["items"] == []
    
    def test_get_vehicles_with_data(self, client: TestClient, test_vehicle: Vehicle):
        """Тест получения списка ТС с данными"""
        response = client.get("/api/v1/vehicles")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["id"] == test_vehicle.id
        assert data["items"][0]["original_name"] == test_vehicle.original_name
    
    def test_get_vehicles_with_pagination(self, client: TestClient, test_db: Session):
        """Тест пагинации списка ТС"""
        # Создаем несколько ТС
        for i in range(5):
            vehicle = Vehicle(
                original_name=f"Vehicle {i}",
                garage_number=f"00{i}",
                license_plate=f"А{i}00БВ{i}",
                is_validated="valid"
            )
            test_db.add(vehicle)
        test_db.commit()
        
        # Тест первой страницы
        response = client.get("/api/v1/vehicles?skip=0&limit=2")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2
        
        # Тест второй страницы
        response = client.get("/api/v1/vehicles?skip=2&limit=2")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2
    
    def test_get_vehicles_filter_by_validated(self, client: TestClient, 
                                             test_vehicle: Vehicle, 
                                             test_vehicle_pending: Vehicle):
        """Тест фильтрации по статусу валидации"""
        # Все ТС
        response = client.get("/api/v1/vehicles")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        
        # Только валидные
        response = client.get("/api/v1/vehicles?is_validated=valid")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["is_validated"] == "valid"
        
        # Только pending
        response = client.get("/api/v1/vehicles?is_validated=pending")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["is_validated"] == "pending"


class TestVehicleDetail:
    """Тесты для получения ТС по ID"""
    
    def test_get_vehicle_by_id(self, client: TestClient, test_vehicle: Vehicle):
        """Тест получения ТС по ID"""
        response = client.get(f"/api/v1/vehicles/{test_vehicle.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_vehicle.id
        assert data["original_name"] == test_vehicle.original_name
        assert data["garage_number"] == test_vehicle.garage_number
        assert data["license_plate"] == test_vehicle.license_plate
    
    def test_get_vehicle_not_found(self, client: TestClient):
        """Тест получения несуществующего ТС"""
        response = client.get("/api/v1/vehicles/99999")
        assert response.status_code == 404
        assert "не найдено" in response.json()["detail"].lower()


class TestVehicleUpdate:
    """Тесты для обновления ТС"""
    
    def test_update_vehicle(self, client: TestClient, test_vehicle: Vehicle, 
                          auth_headers: dict):
        """Тест обновления ТС"""
        update_data = {
            "garage_number": "999",
            "license_plate": "Н999НН999",
            "is_validated": "valid"
        }
        response = client.put(
            f"/api/v1/vehicles/{test_vehicle.id}",
            json=update_data,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["garage_number"] == "999"
        assert data["license_plate"] == "Н999НН999"
    
    def test_update_vehicle_not_found(self, client: TestClient, auth_headers: dict):
        """Тест обновления несуществующего ТС"""
        update_data = {
            "garage_number": "999"
        }
        response = client.put(
            "/api/v1/vehicles/99999",
            json=update_data,
            headers=auth_headers
        )
        assert response.status_code == 404
    
    def test_update_vehicle_with_organization(self, client: TestClient, 
                                            test_vehicle: Vehicle,
                                            test_organization: Organization,
                                            auth_headers: dict):
        """Тест обновления ТС с организацией"""
        update_data = {
            "organization_id": test_organization.id
        }
        response = client.put(
            f"/api/v1/vehicles/{test_vehicle.id}",
            json=update_data,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["organization_id"] == test_organization.id


class TestVehicleMerge:
    """Тесты для слияния ТС"""
    
    def test_merge_vehicles(self, client: TestClient, test_db: Session,
                          admin_auth_headers: dict):
        """Тест слияния ТС"""
        # Создаем два ТС для слияния
        vehicle1 = Vehicle(
            original_name="Vehicle 1",
            garage_number="001",
            license_plate="А111БВ111",
            is_validated="valid"
        )
        vehicle2 = Vehicle(
            original_name="Vehicle 2",
            garage_number="002",
            license_plate="А222БВ222",
            is_validated="valid"
        )
        test_db.add_all([vehicle1, vehicle2])
        test_db.commit()
        
        # Реальный endpoint - /{vehicle_id}/merge, принимает MergeRequest с target_id
        merge_data = {
            "target_id": vehicle1.id
        }
        response = client.post(
            f"/api/v1/vehicles/{vehicle2.id}/merge",
            json=merge_data,
            headers=admin_auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        # MergeResponse содержит success, message, transactions_updated, cards_updated
        assert data["success"] is True
        assert "message" in data
        
        # Проверяем, что source ТС удален
        response = client.get(f"/api/v1/vehicles/{vehicle2.id}")
        assert response.status_code == 404


class TestVehicleClear:
    """Тесты для очистки ТС"""
    
    def test_clear_all_vehicles(self, client: TestClient, test_db: Session,
                               admin_auth_headers: dict):
        """Тест очистки всех ТС"""
        # Создаем несколько ТС
        for i in range(3):
            vehicle = Vehicle(
                original_name=f"Vehicle {i}",
                garage_number=f"00{i}",
                license_plate=f"А{i}00БВ{i}",
                is_validated="valid"
            )
            test_db.add(vehicle)
        test_db.commit()
        
        # Проверяем, что ТС есть
        response = client.get("/api/v1/vehicles")
        assert response.status_code == 200
        assert response.json()["total"] == 3
        
        # Очищаем все ТС (требует confirm=true)
        response = client.delete(
            "/api/v1/vehicles/clear?confirm=true",
            headers=admin_auth_headers
        )
        assert response.status_code == 200
        
        # Обновляем сессию БД и проверяем напрямую через БД
        test_db.expire_all()
        # Vehicle уже импортирован в начале файла
        count = test_db.query(Vehicle).count()
        assert count == 0, f"В БД осталось {count} ТС вместо 0"
        
        # Инвалидируем весь кэш для vehicles
        from app.services.cache_service import CacheService, invalidate_vehicles_cache
        invalidate_vehicles_cache()
        cache = CacheService.get_instance()
        cache.delete_pattern("vehicles:*", prefix="")
        
        # Проверяем через API (используем разные параметры для обхода кэша)
        response = client.get("/api/v1/vehicles?skip=0&limit=10")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0, f"API вернул {data['total']} ТС вместо 0"
    
    def test_clear_vehicles_requires_admin(self, client: TestClient,
                                          auth_headers: dict):
        """Тест, что очистка требует права администратора"""
        response = client.delete(
            "/api/v1/vehicles/clear",
            headers=auth_headers
        )
        # Должен быть 403 или 401 в зависимости от настроек
        assert response.status_code in [401, 403]

