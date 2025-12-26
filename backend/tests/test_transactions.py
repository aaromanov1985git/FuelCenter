"""
Интеграционные тесты для модуля транзакций
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.models import Transaction, Provider, FuelType, Vehicle, FuelCard


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
def test_fuel_type(test_db: Session) -> FuelType:
    """Создание тестового типа топлива"""
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


@pytest.fixture
def test_transaction(
    test_db: Session,
    test_provider: Provider,
    test_fuel_type: FuelType,
    test_vehicle: Vehicle,
    test_fuel_card: FuelCard
) -> Transaction:
    """Создание тестовой транзакции"""
    transaction = Transaction(
        transaction_date=datetime.now(),
        card_number=test_fuel_card.card_number,
        provider_id=test_provider.id,
        vehicle_id=test_vehicle.id,
        product=test_fuel_type.original_name,
        quantity=50.0,
        price=55.50,
        amount=2775.0,
        operation_type="Покупка"
    )
    test_db.add(transaction)
    test_db.commit()
    test_db.refresh(transaction)
    return transaction


class TestTransactionsEndpoints:
    """Тесты endpoints транзакций"""
    
    def test_get_transactions_list_authenticated(
        self,
        client: TestClient,
        auth_headers: dict,
        test_transaction: Transaction
    ):
        """Получение списка транзакций авторизованным пользователем"""
        response = client.get("/api/v1/transactions", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "items" in data
        assert "total" in data
        assert len(data["items"]) >= 1
    
    def test_get_transactions_list_unauthenticated(self, client: TestClient):
        """Попытка получения транзакций без авторизации"""
        response = client.get("/api/v1/transactions")
        assert response.status_code == 401
    
    def test_get_transaction_by_id(
        self,
        client: TestClient,
        auth_headers: dict,
        test_transaction: Transaction
    ):
        """Получение транзакции по ID"""
        response = client.get(
            f"/api/v1/transactions/{test_transaction.id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["id"] == test_transaction.id
        assert float(data["quantity"]) == float(test_transaction.quantity)
        assert float(data["amount"]) == float(test_transaction.amount)
    
    def test_get_transaction_not_found(
        self,
        client: TestClient,
        auth_headers: dict
    ):
        """Попытка получения несуществующей транзакции"""
        response = client.get(
            "/api/v1/transactions/99999",
            headers=auth_headers
        )
        assert response.status_code == 404
    
    def test_transactions_pagination(
        self,
        client: TestClient,
        auth_headers: dict,
        test_db: Session,
        test_provider: Provider,
        test_fuel_type: FuelType
    ):
        """Тест пагинации транзакций"""
        # Создаём несколько транзакций
        for i in range(15):
            t = Transaction(
                transaction_date=datetime.now() - timedelta(days=i),
                card_number=f"CARD{i:04d}",
                provider_id=test_provider.id,
                product=test_fuel_type.original_name,
                quantity=10.0 + i,
                price=50.0,
                amount=(10.0 + i) * 50.0
            )
            test_db.add(t)
        test_db.commit()
        
        # Первая страница
        response = client.get(
            "/api/v1/transactions?skip=0&limit=10",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 10
        
        # Вторая страница
        response = client.get(
            "/api/v1/transactions?skip=10&limit=10",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) >= 5  # Минимум 5 записей на второй странице


class TestTransactionsFiltering:
    """Тесты фильтрации транзакций"""
    
    def test_filter_by_date_range(
        self,
        client: TestClient,
        auth_headers: dict,
        test_transaction: Transaction
    ):
        """Фильтрация по диапазону дат"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = client.get(
            f"/api/v1/transactions?date_from={today}&date_to={today}",
            headers=auth_headers
        )
        assert response.status_code == 200
    
    def test_filter_by_provider(
        self,
        client: TestClient,
        auth_headers: dict,
        test_transaction: Transaction,
        test_provider: Provider
    ):
        """Фильтрация по провайдеру"""
        response = client.get(
            f"/api/v1/transactions?provider_id={test_provider.id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Все транзакции должны быть от этого провайдера
        for item in data["items"]:
            assert item["provider_id"] == test_provider.id

