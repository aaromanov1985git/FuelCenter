"""
Интеграционные тесты для модуля автозаправочных станций
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import GasStation, Provider


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
def test_gas_station(test_db: Session, test_provider: Provider) -> GasStation:
    """Создание тестовой АЗС"""
    station = GasStation(
        original_name="АЗС №1",
        name="АЗС №1",
        azs_number="001",
        location="Москва, ул. Ленина, 1",
        region="Московская область",
        settlement="Москва",
        provider_id=test_provider.id,
        is_validated="valid"
    )
    test_db.add(station)
    test_db.commit()
    test_db.refresh(station)
    return station


class TestGasStationsList:
    """Тесты для получения списка АЗС"""
    
    def test_get_gas_stations_empty(self, client: TestClient):
        """Тест получения пустого списка АЗС"""
        response = client.get("/api/v1/gas-stations")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["items"] == []
    
    def test_get_gas_stations_with_data(self, client: TestClient, test_gas_station: GasStation):
        """Тест получения списка АЗС с данными"""
        response = client.get("/api/v1/gas-stations")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["id"] == test_gas_station.id
        assert data["items"][0]["original_name"] == test_gas_station.original_name
    
    def test_get_gas_stations_filter_by_validated(self, client: TestClient, test_db: Session,
                                                   test_provider: Provider):
        """Тест фильтрации по статусу валидации"""
        # Создаем АЗС с разными статусами
        valid_station = GasStation(
            original_name="Валидная АЗС",
            name="Валидная АЗС",
            provider_id=test_provider.id,
            is_validated="valid"
        )
        pending_station = GasStation(
            original_name="Pending АЗС",
            name="Pending АЗС",
            provider_id=test_provider.id,
            is_validated="pending"
        )
        test_db.add_all([valid_station, pending_station])
        test_db.commit()
        
        # Фильтр по валидным
        response = client.get("/api/v1/gas-stations?is_validated=valid")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["is_validated"] == "valid"
    
    def test_get_gas_stations_filter_by_provider(self, client: TestClient, test_db: Session,
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
        
        # Создаем АЗС для разных провайдеров
        station1 = GasStation(
            original_name="АЗС 1",
            name="АЗС 1",
            provider_id=test_provider.id,
            is_validated="valid"
        )
        station2 = GasStation(
            original_name="АЗС 2",
            name="АЗС 2",
            provider_id=provider2.id,
            is_validated="valid"
        )
        test_db.add_all([station1, station2])
        test_db.commit()
        
        # Фильтр по провайдеру
        response = client.get(f"/api/v1/gas-stations?provider_id={test_provider.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["provider_id"] == test_provider.id
    
    def test_get_gas_stations_search(self, client: TestClient, test_db: Session,
                                     test_provider: Provider):
        """Тест поиска по названию"""
        station1 = GasStation(
            original_name="АЗС Москва",
            name="АЗС Москва",
            location="Москва",
            provider_id=test_provider.id,
            is_validated="valid"
        )
        station2 = GasStation(
            original_name="АЗС СПб",
            name="АЗС СПб",
            location="Санкт-Петербург",
            provider_id=test_provider.id,
            is_validated="valid"
        )
        test_db.add_all([station1, station2])
        test_db.commit()
        
        # Поиск по "Москва"
        response = client.get("/api/v1/gas-stations?search=Москва")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert "Москва" in data["items"][0]["location"]


class TestGasStationDetail:
    """Тесты для получения АЗС по ID"""
    
    def test_get_gas_station_by_id(self, client: TestClient, test_gas_station: GasStation):
        """Тест получения АЗС по ID"""
        response = client.get(f"/api/v1/gas-stations/{test_gas_station.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_gas_station.id
        assert data["original_name"] == test_gas_station.original_name
    
    def test_get_gas_station_not_found(self, client: TestClient):
        """Тест получения несуществующей АЗС"""
        response = client.get("/api/v1/gas-stations/99999")
        assert response.status_code == 404

