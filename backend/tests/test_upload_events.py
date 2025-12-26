"""
Тесты для роутера upload_events
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.models import User, UploadEvent, Provider, ProviderTemplate


class TestUploadEventsList:
    """Тесты для получения списка событий загрузки"""
    
    def test_list_upload_events_empty(self, client: TestClient, auth_headers: dict):
        """Получение списка событий загрузки (пустой список)"""
        response = client.get("/api/v1/upload-events", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data or "items" in data
        assert isinstance(data.get("items", []), list)
    
    def test_list_upload_events_with_filters(
        self, client: TestClient, auth_headers: dict, test_db: Session
    ):
        """Получение списка событий загрузки с фильтрами"""
        # Создаем тестовое событие
        provider = test_db.query(Provider).first()
        if not provider:
            pytest.skip("Нет провайдеров в БД")
        
        event = UploadEvent(
            provider_id=provider.id,
            source_type="manual",
            status="success",
            is_scheduled=False,
            transactions_total=10,
            transactions_created=10
        )
        test_db.add(event)
        test_db.commit()
        test_db.refresh(event)
        
        # Фильтр по provider_id
        response = client.get(
            "/api/v1/upload-events",
            headers=auth_headers,
            params={"provider_id": provider.id}
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data or isinstance(data, list)
        
        # Фильтр по status
        response = client.get(
            "/api/v1/upload-events",
            headers=auth_headers,
            params={"status": "success"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data or isinstance(data, list)
        
        # Фильтр по source_type
        response = client.get(
            "/api/v1/upload-events",
            headers=auth_headers,
            params={"source_type": "manual"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data or isinstance(data, list)
        
        # Очистка
        test_db.delete(event)
        test_db.commit()
    
    def test_list_upload_events_with_pagination(
        self, client: TestClient, auth_headers: dict
    ):
        """Получение списка событий загрузки с пагинацией"""
        response = client.get(
            "/api/v1/upload-events",
            headers=auth_headers,
            params={"page": 1, "limit": 10}
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data or isinstance(data, list)
    
    def test_list_upload_events_requires_auth(self, client: TestClient):
        """Проверка что список событий требует аутентификации"""
        response = client.get("/api/v1/upload-events")
        assert response.status_code in [401, 403]


class TestUploadEventDetail:
    """Тесты для получения события загрузки по ID"""
    
    def test_get_upload_event_by_id(
        self, client: TestClient, auth_headers: dict,
        test_db: Session
    ):
        """Получение события загрузки по ID"""
        provider = test_db.query(Provider).first()
        if not provider:
            pytest.skip("Нет провайдеров в БД")
        
        event = UploadEvent(
            provider_id=provider.id,
            source_type="manual",
            status="success",
            is_scheduled=False,
            transactions_total=5,
            transactions_created=5
        )
        test_db.add(event)
        test_db.commit()
        test_db.refresh(event)
        
        response = client.get(
            f"/api/v1/upload-events/{event.id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == event.id
        assert data["provider_id"] == provider.id
        assert data["status"] == "success"
        
        # Очистка
        test_db.delete(event)
        test_db.commit()
    
    def test_get_upload_event_not_found(self, client: TestClient, auth_headers: dict):
        """Получение несуществующего события загрузки"""
        response = client.get(
            "/api/v1/upload-events/999999",
            headers=auth_headers
        )
        assert response.status_code == 404


class TestUploadEventsSearch:
    """Тесты для поиска событий загрузки"""
    
    def test_search_upload_events(
        self, client: TestClient, auth_headers: dict,
        test_db: Session
    ):
        """Поиск событий загрузки"""
        provider = test_db.query(Provider).first()
        if not provider:
            pytest.skip("Нет провайдеров в БД")
        
        event = UploadEvent(
            provider_id=provider.id,
            source_type="manual",
            status="success",
            is_scheduled=False,
            file_name="test_file.xlsx",
            message="Test upload"
        )
        test_db.add(event)
        test_db.commit()
        test_db.refresh(event)
        
        # Поиск по имени файла
        response = client.get(
            "/api/v1/upload-events",
            headers=auth_headers,
            params={"search": "test_file"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data or isinstance(data, list)
        
        # Очистка
        test_db.delete(event)
        test_db.commit()


class TestUploadEventsClear:
    """Тесты для очистки событий загрузки"""
    
    def test_clear_all_upload_events(
        self, client: TestClient, admin_auth_headers: dict,
        test_db: Session
    ):
        """Очистка всех событий загрузки"""
        provider = test_db.query(Provider).first()
        if not provider:
            pytest.skip("Нет провайдеров в БД")
        
        # Создаем несколько событий
        for i in range(3):
            event = UploadEvent(
                provider_id=provider.id,
                source_type="manual",
                status="success",
                is_scheduled=False
            )
            test_db.add(event)
        test_db.commit()
        
        # Очищаем все события
        response = client.delete(
            "/api/v1/upload-events/clear",
            headers=admin_auth_headers,
            params={"confirm": "true"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "deleted_count" in data
        assert data["deleted_count"] >= 3
    
    def test_clear_all_upload_events_requires_confirm(
        self, client: TestClient, admin_auth_headers: dict
    ):
        """Проверка что очистка требует подтверждения"""
        response = client.delete(
            "/api/v1/upload-events/clear",
            headers=admin_auth_headers
        )
        assert response.status_code == 400
        assert "confirm" in response.json()["detail"].lower()
    
    def test_clear_all_upload_events_requires_admin(
        self, client: TestClient, auth_headers: dict
    ):
        """Проверка что очистка требует админ прав"""
        response = client.delete(
            "/api/v1/upload-events/clear",
            headers=auth_headers,
            params={"confirm": "true"}
        )
        assert response.status_code in [401, 403]

