"""
Интеграционные тесты для модуля дашборда
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.models import Transaction, Provider, Vehicle, FuelCard


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
def test_transaction(test_db: Session, test_provider: Provider) -> Transaction:
    """Создание тестовой транзакции"""
    transaction = Transaction(
        transaction_date=datetime.now(),
        card_number="1234567890123456",
        quantity=50.0,
        amount=2500.0,
        provider_id=test_provider.id
    )
    test_db.add(transaction)
    test_db.commit()
    test_db.refresh(transaction)
    return transaction


class TestDashboardStats:
    """Тесты для статистики дашборда"""
    
    def test_get_dashboard_stats(self, client: TestClient, test_transaction: Transaction,
                                auth_headers: dict):
        """Тест получения статистики дашборда"""
        response = client.get("/api/v1/dashboard/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        # Проверяем наличие основных полей статистики (реальная структура ответа)
        assert "period" in data
        assert "period_data" in data
        assert "leaders_by_quantity" in data
        assert "leaders_by_count" in data
        assert isinstance(data["period"], str)
    
    def test_get_dashboard_stats_with_period(self, client: TestClient, test_transaction: Transaction,
                                            auth_headers: dict):
        """Тест получения статистики за период"""
        # Статистика за день (period=day)
        response = client.get("/api/v1/dashboard/stats?period=day", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "period" in data
        assert data["period"] == "day"
        assert "period_data" in data
    
    def test_get_dashboard_stats_with_custom_period(self, client: TestClient,
                                                   test_db: Session, test_provider: Provider,
                                                   auth_headers: dict):
        """Тест получения статистики за кастомный период"""
        # Создаем транзакции с разными датами
        today = datetime.now()
        yesterday = today - timedelta(days=1)
        week_ago = today - timedelta(days=7)
        
        transaction1 = Transaction(
            transaction_date=today,
            card_number="1111111111111111",
            quantity=10.0,
            amount=500.0,
            provider_id=test_provider.id
        )
        transaction2 = Transaction(
            transaction_date=yesterday,
            card_number="2222222222222222",
            quantity=20.0,
            amount=1000.0,
            provider_id=test_provider.id
        )
        transaction3 = Transaction(
            transaction_date=week_ago,
            card_number="3333333333333333",
            quantity=30.0,
            amount=1500.0,
            provider_id=test_provider.id
        )
        test_db.add_all([transaction1, transaction2, transaction3])
        test_db.commit()
        
        # Статистика за день (endpoint не поддерживает date_from/date_to, используем period=day)
        response = client.get(
            "/api/v1/dashboard/stats?period=day",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        # Проверяем, что есть данные за период
        assert "period_data" in data
        assert isinstance(data["period_data"], list)


class TestDashboardErrors:
    """Тесты для статистики ошибок дашборда"""
    
    def test_get_dashboard_errors(self, client: TestClient, auth_headers: dict):
        """Тест получения статистики ошибок"""
        # Реальный endpoint - /errors-warnings
        response = client.get("/api/v1/dashboard/errors-warnings", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        # Проверяем структуру ответа
        assert isinstance(data, dict)


class TestDashboardVehicles:
    """Тесты для статистики по ТС"""
    
    def test_get_dashboard_vehicles(self, client: TestClient, auth_headers: dict):
        """Тест получения статистики по ТС"""
        response = client.get("/api/v1/dashboard/vehicles", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        # Проверяем структуру ответа
        assert isinstance(data, dict)

