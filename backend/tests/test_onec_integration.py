"""
Тесты для роутера onec_integration
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.models import User, Provider


class TestOneCIntegrationTransactions:
    """Тесты для получения транзакций для 1С"""
    
    def test_get_transactions_for_1c_missing_provider_id(
        self, client: TestClient, auth_headers: dict
    ):
        """Получение транзакций без provider_id"""
        response = client.get(
            "/api/v1/onec/transactions",
            headers=auth_headers
        )
        assert response.status_code == 422  # Validation error
    
    def test_get_transactions_for_1c_invalid_provider(
        self, client: TestClient, auth_headers: dict
    ):
        """Получение транзакций для несуществующего провайдера"""
        response = client.get(
            "/api/v1/onec/transactions",
            headers=auth_headers,
            params={"provider_id": 999999}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["Успех"] is False
        assert "СообщениеОбОшибке" in data
    
    def test_get_transactions_for_1c_with_provider(
        self, client: TestClient, auth_headers: dict,
        test_db: Session
    ):
        """Получение транзакций для существующего провайдера"""
        provider = test_db.query(Provider).first()
        if not provider:
            pytest.skip("Нет провайдеров в БД")
        
        response = client.get(
            "/api/v1/onec/transactions",
            headers=auth_headers,
            params={"provider_id": provider.id}
        )
        assert response.status_code == 200
        data = response.json()
        assert "Успех" in data
        assert "Транзакции" in data
        assert "ВсегоЗаписей" in data
        assert isinstance(data["Транзакции"], list)
    
    def test_get_transactions_for_1c_with_dates(
        self, client: TestClient, auth_headers: dict,
        test_db: Session
    ):
        """Получение транзакций с фильтрами по датам"""
        provider = test_db.query(Provider).first()
        if not provider:
            pytest.skip("Нет провайдеров в БД")
        
        date_from = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        date_to = datetime.now().strftime("%Y-%m-%d")
        
        response = client.get(
            "/api/v1/onec/transactions",
            headers=auth_headers,
            params={
                "provider_id": provider.id,
                "date_from": date_from,
                "date_to": date_to
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "Успех" in data
        assert "Транзакции" in data
    
    def test_get_transactions_for_1c_with_pagination(
        self, client: TestClient, auth_headers: dict,
        test_db: Session
    ):
        """Получение транзакций с пагинацией"""
        provider = test_db.query(Provider).first()
        if not provider:
            pytest.skip("Нет провайдеров в БД")
        
        response = client.get(
            "/api/v1/onec/transactions",
            headers=auth_headers,
            params={
                "provider_id": provider.id,
                "skip": 0,
                "limit": 10
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "Успех" in data
        assert len(data["Транзакции"]) <= 10
    
    def test_get_transactions_for_1c_requires_auth(self, client: TestClient):
        """Проверка что получение транзакций требует аутентификации"""
        response = client.get(
            "/api/v1/onec/transactions",
            params={"provider_id": 1}
        )
        assert response.status_code in [401, 403]

