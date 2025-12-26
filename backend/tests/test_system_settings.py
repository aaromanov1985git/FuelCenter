"""
Тесты для роутера system_settings
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User, SystemSettings


class TestEmailSettings:
    """Тесты для настроек email"""
    
    def test_get_email_settings_requires_admin(self, client: TestClient, auth_headers: dict):
        """Проверка что получение настроек email требует админ прав"""
        response = client.get("/api/v1/system-settings/email", headers=auth_headers)
        assert response.status_code in [401, 403]
    
    def test_get_email_settings(self, client: TestClient, admin_auth_headers: dict):
        """Получение настроек email"""
        response = client.get("/api/v1/system-settings/email", headers=admin_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "email_enabled" in data
        assert "smtp_host" in data
        assert "smtp_port" in data
        assert "smtp_user" in data
        assert "smtp_password_set" in data
        assert "from_address" in data
        assert "from_name" in data
        assert "use_tls" in data
        assert isinstance(data["email_enabled"], bool)
        assert isinstance(data["smtp_port"], int)
        assert isinstance(data["smtp_password_set"], bool)
    
    def test_update_email_settings(
        self, client: TestClient, admin_auth_headers: dict, test_db: Session
    ):
        """Обновление настроек email"""
        update_data = {
            "email_enabled": True,
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "smtp_user": "test@example.com",
            "smtp_password": "test_password",
            "from_address": "noreply@example.com",
            "from_name": "Test System",
            "use_tls": True
        }
        
        response = client.put(
            "/api/v1/system-settings/email",
            headers=admin_auth_headers,
            json=update_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email_enabled"] is True
        assert data["smtp_host"] == "smtp.example.com"
        assert data["smtp_port"] == 587
        assert data["smtp_user"] == "test@example.com"
        assert data["smtp_password_set"] is True
        assert data["from_address"] == "noreply@example.com"
        assert data["from_name"] == "Test System"
        assert data["use_tls"] is True
        
        # Проверяем, что пароль зашифрован в БД
        setting = test_db.query(SystemSettings).filter(
            SystemSettings.key == "email_smtp_password"
        ).first()
        assert setting is not None
        assert setting.is_encrypted is True
        assert setting.value.startswith("encrypted:")
    
    def test_update_email_settings_partial(
        self, client: TestClient, admin_auth_headers: dict
    ):
        """Частичное обновление настроек email"""
        update_data = {
            "email_enabled": False,
            "smtp_port": 465
        }
        
        response = client.put(
            "/api/v1/system-settings/email",
            headers=admin_auth_headers,
            json=update_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email_enabled"] is False
        assert data["smtp_port"] == 465
    
    def test_update_email_settings_requires_admin(self, client: TestClient, auth_headers: dict):
        """Проверка что обновление настроек email требует админ прав"""
        response = client.put(
            "/api/v1/system-settings/email",
            headers=auth_headers,
            json={"email_enabled": True}
        )
        assert response.status_code in [401, 403]
    
    def test_test_email_settings_requires_admin(self, client: TestClient, auth_headers: dict):
        """Проверка что тестовая отправка email требует админ прав"""
        response = client.post(
            "/api/v1/system-settings/email/test",
            headers=auth_headers,
            json={"to_email": "test@example.com"}
        )
        assert response.status_code in [401, 403]
    
    def test_test_email_settings_missing_config(
        self, client: TestClient, admin_auth_headers: dict
    ):
        """Тестовая отправка email без настроек должна вернуть ошибку"""
        # Очищаем настройки SMTP
        response = client.put(
            "/api/v1/system-settings/email",
            headers=admin_auth_headers,
            json={
                "smtp_host": None,
                "smtp_user": None,
                "from_address": None
            }
        )
        
        # Пытаемся отправить тестовое письмо
        response = client.post(
            "/api/v1/system-settings/email/test",
            headers=admin_auth_headers,
            json={"to_email": "test@example.com"}
        )
        assert response.status_code == 400
        assert "настройки" in response.json()["detail"].lower() or "smtp" in response.json()["detail"].lower()


class TestTelegramSettings:
    """Тесты для настроек Telegram"""
    
    def test_get_telegram_settings_requires_admin(self, client: TestClient, auth_headers: dict):
        """Проверка что получение настроек Telegram требует админ прав"""
        response = client.get("/api/v1/system-settings/telegram", headers=auth_headers)
        assert response.status_code in [401, 403]
    
    def test_get_telegram_settings(self, client: TestClient, admin_auth_headers: dict):
        """Получение настроек Telegram"""
        response = client.get("/api/v1/system-settings/telegram", headers=admin_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "telegram_enabled" in data
        assert "bot_token_set" in data
        assert isinstance(data["telegram_enabled"], bool)
        assert isinstance(data["bot_token_set"], bool)
    
    def test_update_telegram_settings(
        self, client: TestClient, admin_auth_headers: dict, test_db: Session
    ):
        """Обновление настроек Telegram"""
        update_data = {
            "telegram_enabled": True,
            "bot_token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
        }
        
        response = client.put(
            "/api/v1/system-settings/telegram",
            headers=admin_auth_headers,
            json=update_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["telegram_enabled"] is True
        assert data["bot_token_set"] is True
        
        # Проверяем, что токен зашифрован в БД
        setting = test_db.query(SystemSettings).filter(
            SystemSettings.key == "telegram_bot_token"
        ).first()
        assert setting is not None
        assert setting.is_encrypted is True
        assert setting.value.startswith("encrypted:")
    
    def test_update_telegram_settings_partial(
        self, client: TestClient, admin_auth_headers: dict
    ):
        """Частичное обновление настроек Telegram"""
        update_data = {
            "telegram_enabled": False
        }
        
        response = client.put(
            "/api/v1/system-settings/telegram",
            headers=admin_auth_headers,
            json=update_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["telegram_enabled"] is False
    
    def test_update_telegram_settings_requires_admin(self, client: TestClient, auth_headers: dict):
        """Проверка что обновление настроек Telegram требует админ прав"""
        response = client.put(
            "/api/v1/system-settings/telegram",
            headers=auth_headers,
            json={"telegram_enabled": True}
        )
        assert response.status_code in [401, 403]


class TestSystemSettingsSecurity:
    """Тесты безопасности для системных настроек"""
    
    def test_password_not_returned_in_response(
        self, client: TestClient, admin_auth_headers: dict, test_db: Session
    ):
        """Проверка что пароль не возвращается в ответе"""
        # Устанавливаем пароль
        update_data = {
            "smtp_password": "secret_password_123"
        }
        client.put(
            "/api/v1/system-settings/email",
            headers=admin_auth_headers,
            json=update_data
        )
        
        # Получаем настройки
        response = client.get("/api/v1/system-settings/email", headers=admin_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "smtp_password" not in data
        assert "smtp_password_set" in data
        assert data["smtp_password_set"] is True
    
    def test_bot_token_not_returned_in_response(
        self, client: TestClient, admin_auth_headers: dict
    ):
        """Проверка что токен бота не возвращается в ответе"""
        # Устанавливаем токен
        update_data = {
            "bot_token": "secret_token_123"
        }
        client.put(
            "/api/v1/system-settings/telegram",
            headers=admin_auth_headers,
            json=update_data
        )
        
        # Получаем настройки
        response = client.get("/api/v1/system-settings/telegram", headers=admin_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "bot_token" not in data
        assert "bot_token_set" in data
        assert data["bot_token_set"] is True

