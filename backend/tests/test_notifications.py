"""
Тесты для роутера notifications
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User, Notification, NotificationSettings


class TestNotificationsList:
    """Тесты для получения списка уведомлений"""
    
    def test_list_notifications_requires_auth(self, client: TestClient):
        """Проверка что список уведомлений требует аутентификации"""
        response = client.get("/api/v1/notifications")
        assert response.status_code in [401, 403]
    
    def test_list_notifications_empty(self, client: TestClient, auth_headers: dict):
        """Получение списка уведомлений (пустой список)"""
        response = client.get("/api/v1/notifications", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "items" in data
        assert "unread_count" in data
        assert data["total"] >= 0
        assert isinstance(data["items"], list)
        assert data["unread_count"] >= 0
    
    def test_list_notifications_with_filters(
        self, client: TestClient, auth_headers: dict, 
        test_user: User, test_db: Session
    ):
        """Получение списка уведомлений с фильтрами"""
        from app.repositories.notification_repository import NotificationRepository
        repo = NotificationRepository(test_db)
        
        # Создаем тестовые уведомления
        notification1 = repo.create(
            user_id=test_user.id,
            title="Test Notification 1",
            message="Test message 1",
            category="system",
            notification_type="info",
            is_read=False
        )
        notification2 = repo.create(
            user_id=test_user.id,
            title="Test Notification 2",
            message="Test message 2",
            category="errors",
            notification_type="error",
            is_read=True
        )
        test_db.commit()
        
        # Фильтр по is_read=False
        response = client.get(
            "/api/v1/notifications",
            headers=auth_headers,
            params={"is_read": False}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        if data["items"]:
            assert all(not item["is_read"] for item in data["items"])
        
        # Фильтр по category
        response = client.get(
            "/api/v1/notifications",
            headers=auth_headers,
            params={"category": "system"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        
        # Фильтр по notification_type
        response = client.get(
            "/api/v1/notifications",
            headers=auth_headers,
            params={"notification_type": "error"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        
        # Очистка
        test_db.delete(notification1)
        test_db.delete(notification2)
        test_db.commit()
    
    def test_list_notifications_with_pagination(self, client: TestClient, auth_headers: dict):
        """Получение списка уведомлений с пагинацией"""
        response = client.get(
            "/api/v1/notifications",
            headers=auth_headers,
            params={"skip": 0, "limit": 10}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) <= 10


class TestNotificationDetail:
    """Тесты для получения уведомления по ID"""
    
    def test_get_notification_by_id(
        self, client: TestClient, auth_headers: dict,
        test_user: User, test_db: Session
    ):
        """Получение уведомления по ID"""
        from app.repositories.notification_repository import NotificationRepository
        repo = NotificationRepository(test_db)
        
        notification = repo.create(
            user_id=test_user.id,
            title="Test Notification",
            message="Test message",
            category="system",
            notification_type="info"
        )
        test_db.commit()
        test_db.refresh(notification)
        
        response = client.get(
            f"/api/v1/notifications/{notification.id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == notification.id
        assert data["title"] == "Test Notification"
        assert data["message"] == "Test message"
        
        # Очистка
        test_db.delete(notification)
        test_db.commit()
    
    def test_get_notification_not_found(self, client: TestClient, auth_headers: dict):
        """Получение несуществующего уведомления"""
        response = client.get(
            "/api/v1/notifications/999999",
            headers=auth_headers
        )
        assert response.status_code == 404
    
    def test_get_notification_other_user(
        self, client: TestClient, auth_headers: dict,
        admin_user: User, test_db: Session
    ):
        """Проверка что нельзя получить уведомление другого пользователя"""
        from app.repositories.notification_repository import NotificationRepository
        repo = NotificationRepository(test_db)
        
        # Создаем уведомление для админа
        notification = repo.create(
            user_id=admin_user.id,
            title="Admin Notification",
            message="Admin message",
            category="system",
            notification_type="info"
        )
        test_db.commit()
        test_db.refresh(notification)
        
        # Пытаемся получить его как обычный пользователь
        response = client.get(
            f"/api/v1/notifications/{notification.id}",
            headers=auth_headers
        )
        assert response.status_code == 403
        
        # Очистка
        test_db.delete(notification)
        test_db.commit()


class TestNotificationMarkRead:
    """Тесты для отметки уведомлений как прочитанных"""
    
    def test_mark_notifications_read(
        self, client: TestClient, auth_headers: dict,
        test_user: User, test_db: Session
    ):
        """Отметка уведомлений как прочитанных"""
        from app.repositories.notification_repository import NotificationRepository
        repo = NotificationRepository(test_db)
        
        # Создаем непрочитанные уведомления
        notification1 = repo.create(
            user_id=test_user.id,
            title="Unread 1",
            message="Message 1",
            category="system",
            notification_type="info",
            is_read=False
        )
        notification2 = repo.create(
            user_id=test_user.id,
            title="Unread 2",
            message="Message 2",
            category="system",
            notification_type="info",
            is_read=False
        )
        test_db.commit()
        test_db.refresh(notification1)
        test_db.refresh(notification2)
        
        # Отмечаем как прочитанные
        response = client.post(
            "/api/v1/notifications/mark-read",
            headers=auth_headers,
            json={"notification_ids": [notification1.id, notification2.id]}
        )
        assert response.status_code == 200
        data = response.json()
        assert "marked_count" in data
        assert data["marked_count"] >= 2
        
        # Проверяем, что уведомления помечены как прочитанные
        test_db.refresh(notification1)
        test_db.refresh(notification2)
        assert notification1.is_read is True
        assert notification2.is_read is True
        
        # Очистка
        test_db.delete(notification1)
        test_db.delete(notification2)
        test_db.commit()
    
    def test_mark_notifications_read_requires_auth(self, client: TestClient):
        """Проверка что отметка требует аутентификации"""
        response = client.post(
            "/api/v1/notifications/mark-read",
            json={"notification_ids": [1]}
        )
        assert response.status_code in [401, 403]


class TestNotificationSettings:
    """Тесты для настроек уведомлений"""
    
    def test_get_notification_settings(
        self, client: TestClient, auth_headers: dict
    ):
        """Получение настроек уведомлений"""
        response = client.get(
            "/api/v1/notifications/settings",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "user_id" in data
        assert "email_enabled" in data
        assert "telegram_enabled" in data
        assert "push_enabled" in data
        assert "in_app_enabled" in data
        assert "categories" in data
    
    def test_get_notification_settings_requires_auth(self, client: TestClient):
        """Проверка что получение настроек требует аутентификации"""
        response = client.get("/api/v1/notifications/settings")
        assert response.status_code in [401, 403]
    
    def test_update_notification_settings(
        self, client: TestClient, auth_headers: dict
    ):
        """Обновление настроек уведомлений"""
        update_data = {
            "email_enabled": False,
            "push_enabled": True,
            "categories": {
                "upload_events": True,
                "errors": False,
                "system": True,
                "transactions": False
            }
        }
        
        response = client.put(
            "/api/v1/notifications/settings",
            headers=auth_headers,
            json=update_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email_enabled"] is False
        assert data["push_enabled"] is True
        assert data["categories"]["upload_events"] is True
        assert data["categories"]["errors"] is False
    
    def test_update_notification_settings_requires_auth(self, client: TestClient):
        """Проверка что обновление настроек требует аутентификации"""
        response = client.put(
            "/api/v1/notifications/settings",
            json={"email_enabled": False}
        )
        assert response.status_code in [401, 403]


class TestNotificationCreate:
    """Тесты для создания уведомлений"""
    
    def test_create_notification(
        self, client: TestClient, auth_headers: dict
    ):
        """Создание уведомления для текущего пользователя"""
        notification_data = {
            "title": "Test Notification",
            "message": "Test message",
            "category": "system",
            "type": "info"
        }
        
        response = client.post(
            "/api/v1/notifications",
            headers=auth_headers,
            json=notification_data
        )
        # Может быть 201 или 200 в зависимости от реализации
        assert response.status_code in [200, 201]
        data = response.json()
        assert "id" in data
        assert data["title"] == "Test Notification"
        assert data["message"] == "Test message"
    
    def test_create_notification_requires_auth(self, client: TestClient):
        """Проверка что создание уведомления требует аутентификации"""
        response = client.post(
            "/api/v1/notifications",
            json={"title": "Test", "message": "Test"}
        )
        assert response.status_code in [401, 403]
    
    def test_create_notification_as_admin(
        self, client: TestClient, admin_auth_headers: dict,
        test_user: User
    ):
        """Создание уведомления для другого пользователя (только админ)"""
        notification_data = {
            "user_id": test_user.id,
            "title": "Admin Notification",
            "message": "Admin message",
            "category": "system",
            "type": "info"
        }
        
        response = client.post(
            "/api/v1/notifications",
            headers=admin_auth_headers,
            json=notification_data
        )
        assert response.status_code in [200, 201]
        data = response.json()
        assert data["user_id"] == test_user.id


class TestNotificationDelete:
    """Тесты для удаления уведомлений"""
    
    def test_delete_notification(
        self, client: TestClient, auth_headers: dict,
        test_user: User, test_db: Session
    ):
        """Удаление уведомления"""
        from app.repositories.notification_repository import NotificationRepository
        repo = NotificationRepository(test_db)
        
        notification = repo.create(
            user_id=test_user.id,
            title="To Delete",
            message="Will be deleted",
            category="system",
            notification_type="info"
        )
        test_db.commit()
        test_db.refresh(notification)
        
        response = client.delete(
            f"/api/v1/notifications/{notification.id}",
            headers=auth_headers
        )
        assert response.status_code == 204
        
        # Проверяем, что уведомление удалено
        deleted = repo.get_by_id(notification.id)
        assert deleted is None
    
    def test_delete_notification_not_found(self, client: TestClient, auth_headers: dict):
        """Удаление несуществующего уведомления"""
        response = client.delete(
            "/api/v1/notifications/999999",
            headers=auth_headers
        )
        assert response.status_code == 404
    
    def test_delete_notification_requires_auth(self, client: TestClient):
        """Проверка что удаление требует аутентификации"""
        response = client.delete("/api/v1/notifications/1")
        assert response.status_code in [401, 403]


class TestAlertManagerWebhook:
    """Тесты для webhook AlertManager"""
    
    def test_alertmanager_webhook(
        self, client: TestClient, admin_user: User, test_db: Session
    ):
        """Обработка webhook от AlertManager"""
        webhook_data = {
            "version": "4",
            "status": "firing",
            "receiver": "default",
            "alerts": [
                {
                    "status": "firing",
                    "labels": {
                        "alertname": "HighErrorRate",
                        "severity": "critical"
                    },
                    "annotations": {
                        "summary": "High error rate detected",
                        "description": "Error rate is above threshold"
                    },
                    "startsAt": "2023-01-01T00:00:00Z"
                }
            ]
        }
        
        response = client.post(
            "/api/v1/notifications/webhook/alertmanager",
            json=webhook_data
        )
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert data["status"] == "ok"
        assert "processed" in data
        assert data["processed"] == 1
    
    def test_alertmanager_webhook_no_auth_required(self, client: TestClient):
        """Проверка что webhook не требует аутентификации"""
        webhook_data = {
            "version": "4",
            "status": "firing",
            "alerts": []
        }
        
        response = client.post(
            "/api/v1/notifications/webhook/alertmanager",
            json=webhook_data
        )
        # Webhook должен работать без аутентификации
        assert response.status_code == 200
    
    def test_alertmanager_webhook_empty_alerts(self, client: TestClient):
        """Обработка webhook с пустым списком алертов"""
        webhook_data = {
            "version": "4",
            "status": "resolved",
            "alerts": []
        }
        
        response = client.post(
            "/api/v1/notifications/webhook/alertmanager",
            json=webhook_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["processed"] == 0

