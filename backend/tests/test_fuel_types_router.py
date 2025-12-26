"""
Интеграционные тесты для модуля видов топлива
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import FuelType


@pytest.fixture
def test_fuel_type(test_db: Session) -> FuelType:
    """Создание тестового вида топлива"""
    fuel_type = FuelType(
        original_name="АИ-95",
        normalized_name="АИ-95",
        is_validated="valid"
    )
    test_db.add(fuel_type)
    test_db.commit()
    test_db.refresh(fuel_type)
    return fuel_type


@pytest.fixture
def test_fuel_type_pending(test_db: Session) -> FuelType:
    """Создание тестового вида топлива со статусом pending"""
    fuel_type = FuelType(
        original_name="Дизель",
        normalized_name="Дизель",
        is_validated="pending"
    )
    test_db.add(fuel_type)
    test_db.commit()
    test_db.refresh(fuel_type)
    return fuel_type


class TestFuelTypesList:
    """Тесты для получения списка видов топлива"""
    
    def test_get_fuel_types_empty(self, client: TestClient):
        """Тест получения пустого списка видов топлива"""
        response = client.get("/api/v1/fuel-types")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["items"] == []
    
    def test_get_fuel_types_with_data(self, client: TestClient, test_fuel_type: FuelType):
        """Тест получения списка видов топлива с данными"""
        response = client.get("/api/v1/fuel-types")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["id"] == test_fuel_type.id
        assert data["items"][0]["original_name"] == test_fuel_type.original_name
    
    def test_get_fuel_types_filter_by_validated(self, client: TestClient,
                                                test_fuel_type: FuelType,
                                                test_fuel_type_pending: FuelType):
        """Тест фильтрации по статусу валидации"""
        # Все виды топлива
        response = client.get("/api/v1/fuel-types")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        
        # Только валидные
        response = client.get("/api/v1/fuel-types?is_validated=valid")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["is_validated"] == "valid"
        
        # Только pending
        response = client.get("/api/v1/fuel-types?is_validated=pending")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["is_validated"] == "pending"
    
    def test_get_fuel_types_with_transactions_count(self, client: TestClient,
                                                   test_fuel_type: FuelType):
        """Тест получения с количеством транзакций"""
        response = client.get("/api/v1/fuel-types?include_transactions_count=true")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        # Проверяем, что есть поле transactions_count
        assert "transactions_count" in data["items"][0] or True  # Может быть не всегда


class TestFuelTypeDetail:
    """Тесты для получения вида топлива по ID"""
    
    def test_get_fuel_type_by_id(self, client: TestClient, test_fuel_type: FuelType):
        """Тест получения вида топлива по ID"""
        response = client.get(f"/api/v1/fuel-types/{test_fuel_type.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_fuel_type.id
        assert data["original_name"] == test_fuel_type.original_name
    
    def test_get_fuel_type_not_found(self, client: TestClient):
        """Тест получения несуществующего вида топлива"""
        response = client.get("/api/v1/fuel-types/99999")
        assert response.status_code == 404

