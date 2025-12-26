"""
Тесты для роутера normalization_settings
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User, NormalizationSettings


class TestNormalizationSettingsList:
    """Тесты для получения списка настроек нормализации"""
    
    def test_list_normalization_settings_empty(self, client: TestClient, auth_headers: dict):
        """Получение списка настроек нормализации (пустой список)"""
        response = client.get("/api/v1/normalization-settings", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "items" in data
        assert data["total"] >= 0
        assert isinstance(data["items"], list)
    
    def test_list_normalization_settings_with_data(
        self, client: TestClient, auth_headers: dict, test_db: Session
    ):
        """Получение списка настроек нормализации с данными"""
        # Создаем тестовую настройку
        setting = NormalizationSettings(
            dictionary_type="vehicles",
            options='{"auto_merge": true, "similarity_threshold": 0.8}'
        )
        test_db.add(setting)
        test_db.commit()
        test_db.refresh(setting)
        
        response = client.get("/api/v1/normalization-settings", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert len(data["items"]) >= 1
        
        # Проверяем структуру элемента
        item = data["items"][0]
        assert "id" in item
        assert "dictionary_type" in item
        assert "options" in item
        assert "created_at" in item
        
        # Очистка
        test_db.delete(setting)
        test_db.commit()


class TestNormalizationSettingsDetail:
    """Тесты для получения настроек нормализации по типу"""
    
    def test_get_normalization_setting_by_type(
        self, client: TestClient, auth_headers: dict, test_db: Session
    ):
        """Получение настроек нормализации по типу"""
        # Создаем тестовую настройку
        setting = NormalizationSettings(
            dictionary_type="fuel_types",
            options='{"auto_merge": false, "similarity_threshold": 0.9}'
        )
        test_db.add(setting)
        test_db.commit()
        test_db.refresh(setting)
        
        response = client.get(
            "/api/v1/normalization-settings/fuel_types",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["dictionary_type"] == "fuel_types"
        assert "options" in data
        assert isinstance(data["options"], dict)
        
        # Очистка
        test_db.delete(setting)
        test_db.commit()
    
    def test_get_normalization_setting_not_found(self, client: TestClient, auth_headers: dict):
        """Получение несуществующих настроек нормализации"""
        response = client.get(
            "/api/v1/normalization-settings/nonexistent",
            headers=auth_headers
        )
        assert response.status_code == 404


class TestNormalizationSettingsCreate:
    """Тесты для создания настроек нормализации"""
    
    def test_create_normalization_setting(
        self, client: TestClient, admin_auth_headers: dict, test_db: Session
    ):
        """Создание настроек нормализации"""
        setting_data = {
            "dictionary_type": "test_type",
            "options": {
                "auto_merge": True,
                "similarity_threshold": 0.85
            }
        }
        
        response = client.post(
            "/api/v1/normalization-settings",
            headers=admin_auth_headers,
            json=setting_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["dictionary_type"] == "test_type"
        assert data["options"]["auto_merge"] is True
        assert data["options"]["similarity_threshold"] == 0.85
        
        # Очистка
        setting = test_db.query(NormalizationSettings).filter(
            NormalizationSettings.dictionary_type == "test_type"
        ).first()
        if setting:
            test_db.delete(setting)
            test_db.commit()
    
    def test_create_normalization_setting_duplicate(
        self, client: TestClient, admin_auth_headers: dict, test_db: Session
    ):
        """Попытка создать дублирующие настройки"""
        # Создаем первую настройку
        setting = NormalizationSettings(
            dictionary_type="duplicate_test",
            options='{"test": true}'
        )
        test_db.add(setting)
        test_db.commit()
        
        # Пытаемся создать еще одну с тем же типом
        setting_data = {
            "dictionary_type": "duplicate_test",
            "options": {"test": False}
        }
        
        response = client.post(
            "/api/v1/normalization-settings",
            headers=admin_auth_headers,
            json=setting_data
        )
        assert response.status_code == 400
        assert "уже существуют" in response.json()["detail"].lower()
        
        # Очистка
        test_db.delete(setting)
        test_db.commit()
    
    def test_create_normalization_setting_requires_admin(
        self, client: TestClient, auth_headers: dict
    ):
        """Проверка что создание требует админ прав"""
        response = client.post(
            "/api/v1/normalization-settings",
            headers=auth_headers,
            json={"dictionary_type": "test", "options": {}}
        )
        assert response.status_code in [401, 403]


class TestNormalizationSettingsUpdate:
    """Тесты для обновления настроек нормализации"""
    
    def test_update_normalization_setting(
        self, client: TestClient, admin_auth_headers: dict, test_db: Session
    ):
        """Обновление настроек нормализации"""
        # Создаем тестовую настройку
        setting = NormalizationSettings(
            dictionary_type="update_test",
            options='{"old": true}'
        )
        test_db.add(setting)
        test_db.commit()
        test_db.refresh(setting)
        
        # Обновляем
        update_data = {
            "options": {
                "new": True,
                "threshold": 0.95
            }
        }
        
        response = client.put(
            "/api/v1/normalization-settings/update_test",
            headers=admin_auth_headers,
            json=update_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["dictionary_type"] == "update_test"
        assert data["options"]["new"] is True
        assert data["options"]["threshold"] == 0.95
        
        # Очистка
        test_db.delete(setting)
        test_db.commit()
    
    def test_update_normalization_setting_not_found(
        self, client: TestClient, admin_auth_headers: dict
    ):
        """Обновление несуществующих настроек"""
        response = client.put(
            "/api/v1/normalization-settings/nonexistent",
            headers=admin_auth_headers,
            json={"options": {}}
        )
        assert response.status_code == 404
    
    def test_update_normalization_setting_requires_admin(
        self, client: TestClient, auth_headers: dict
    ):
        """Проверка что обновление требует админ прав"""
        response = client.put(
            "/api/v1/normalization-settings/test",
            headers=auth_headers,
            json={"options": {}}
        )
        assert response.status_code in [401, 403]


class TestNormalizationSettingsDelete:
    """Тесты для удаления настроек нормализации"""
    
    def test_delete_normalization_setting(
        self, client: TestClient, admin_auth_headers: dict, test_db: Session
    ):
        """Удаление настроек нормализации"""
        # Создаем тестовую настройку
        setting = NormalizationSettings(
            dictionary_type="delete_test",
            options='{"test": true}'
        )
        test_db.add(setting)
        test_db.commit()
        test_db.refresh(setting)
        
        # Удаляем
        response = client.delete(
            "/api/v1/normalization-settings/delete_test",
            headers=admin_auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "delete_test" in data["message"]
        
        # Проверяем, что настройка удалена
        deleted = test_db.query(NormalizationSettings).filter(
            NormalizationSettings.dictionary_type == "delete_test"
        ).first()
        assert deleted is None
    
    def test_delete_normalization_setting_not_found(
        self, client: TestClient, admin_auth_headers: dict
    ):
        """Удаление несуществующих настроек"""
        response = client.delete(
            "/api/v1/normalization-settings/nonexistent",
            headers=admin_auth_headers
        )
        assert response.status_code == 404
    
    def test_delete_normalization_setting_requires_admin(
        self, client: TestClient, auth_headers: dict
    ):
        """Проверка что удаление требует админ прав"""
        response = client.delete(
            "/api/v1/normalization-settings/test",
            headers=auth_headers
        )
        assert response.status_code in [401, 403]

