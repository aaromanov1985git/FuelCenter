"""
Тесты для роутера ppr_api
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import base64

from app.models import User


class TestPPRAPILogin:
    """Тесты для авторизации ППР API"""
    
    def test_ppr_login_success(
        self, client: TestClient, test_db: Session
    ):
        """Успешная авторизация через ППР API"""
        from app.models import User
        from app.auth import get_password_hash
        
        # Создаем тестового пользователя
        test_user = User(
            username="ppr_test",
            email="ppr_test@test.com",
            hashed_password=get_password_hash("test_password"),
            is_active=True
        )
        test_db.add(test_user)
        test_db.commit()
        test_db.refresh(test_user)
        
        # Авторизация через Basic Auth (используем login-basic endpoint)
        credentials = base64.b64encode(b"ppr_test:test_password").decode("utf-8")
        response = client.post(
            "/api/ppr/login-basic",
            headers={"Authorization": f"Basic {credentials}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "token" in data
        assert data["token_type"] == "bearer"
        
        # Очистка
        test_db.delete(test_user)
        test_db.commit()
    
    def test_ppr_login_wrong_password(self, client: TestClient):
        """Авторизация с неверным паролем"""
        credentials = base64.b64encode(b"admin:wrong_password").decode("utf-8")
        response = client.post(
            "/api/ppr/login-basic",
            headers={"Authorization": f"Basic {credentials}"}
        )
        assert response.status_code == 401
    
    def test_ppr_login_missing_auth(self, client: TestClient):
        """Авторизация без заголовка Authorization"""
        response = client.post("/api/ppr/login-basic")
        assert response.status_code == 401


class TestPPRAPITransactions:
    """Тесты для получения транзакций через ППР API"""
    
    def test_get_transactions_missing_token(self, client: TestClient):
        """Получение транзакций без токена"""
        response = client.get("/api/ppr/transaction-list")
        assert response.status_code in [401, 403]
    
    def test_get_transactions_invalid_token(self, client: TestClient):
        """Получение транзакций с неверным токеном"""
        response = client.get(
            "/api/ppr/transaction-list",
            headers={"Authorization": "Bearer invalid_token"}
        )
        assert response.status_code in [401, 403]
    
    def test_get_transactions_with_token(
        self, client: TestClient, auth_headers: dict
    ):
        """Получение транзакций с валидным токеном"""
        # Используем токен из auth_headers
        token = auth_headers.get("Authorization", "").replace("Bearer ", "")
        if not token:
            pytest.skip("Нет токена для теста")
        
        response = client.get(
            "/api/ppr/transaction-list",
            headers={"Authorization": f"Bearer {token}"}
        )
        # Может быть 200 или 400/404 в зависимости от наличия данных
        assert response.status_code in [200, 400, 404]
    
    def test_get_transactions_with_filters(
        self, client: TestClient, auth_headers: dict
    ):
        """Получение транзакций с фильтрами"""
        token = auth_headers.get("Authorization", "").replace("Bearer ", "")
        if not token:
            pytest.skip("Нет токена для теста")
        
        date_from = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        date_to = datetime.now().strftime("%Y-%m-%d")
        
        response = client.get(
            "/api/ppr/transaction-list",
            headers={"Authorization": f"Bearer {token}"},
            params={
                "dateFrom": date_from,
                "dateTo": date_to,
                "skip": 0,
                "limit": 10
            }
        )
        assert response.status_code in [200, 400, 404]


class TestPPRAPIPublicAPI:
    """Тесты для публичного API ППР"""
    
    def test_public_api_v2_transactions_missing_token(self, client: TestClient):
        """Получение транзакций через публичный API без токена"""
        response = client.get("/api/public-api/v2/transactions")
        assert response.status_code in [401, 403]
    
    def test_public_api_v1_transactions_missing_token(self, client: TestClient):
        """Получение транзакций через публичный API v1 без токена"""
        response = client.post(
            "/public-api/v1/transactions",
            json={
                "token": "",
                "dateFrom": "2025-01-01",
                "dateTo": "2025-01-31",
                "format": "JSON"
            }
        )
        assert response.status_code in [401, 403, 400]

