"""
Тесты для роутера logs
"""
import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import SystemLog, UserActionLog, User


class TestSystemLogs:
    """Тесты для системных логов"""
    
    def test_list_system_logs_empty(self, client: TestClient, admin_auth_headers: dict):
        """Получение списка системных логов (пустой список)"""
        response = client.get("/api/v1/logs/system", headers=admin_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "items" in data
        assert data["total"] >= 0
        assert isinstance(data["items"], list)
    
    def test_list_system_logs_requires_admin(self, client: TestClient, auth_headers: dict):
        """Проверка что список системных логов требует админ прав"""
        response = client.get("/api/v1/logs/system", headers=auth_headers)
        # Может быть 401 или 403 в зависимости от настроек
        assert response.status_code in [401, 403]
    
    def test_list_system_logs_with_filters(self, client: TestClient, admin_auth_headers: dict, test_db: Session):
        """Получение списка системных логов с фильтрами"""
        # Создаем тестовый лог
        test_log = SystemLog(
            level="INFO",
            message="Test log message",
            event_type="test",
            event_category="test_category"
        )
        test_db.add(test_log)
        test_db.commit()
        test_db.refresh(test_log)
        
        # Фильтр по уровню
        response = client.get(
            "/api/v1/logs/system",
            headers=admin_auth_headers,
            params={"level": "INFO"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        if data["items"]:
            assert all(log["level"] == "INFO" for log in data["items"])
        
        # Фильтр по типу события
        response = client.get(
            "/api/v1/logs/system",
            headers=admin_auth_headers,
            params={"event_type": "test"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        
        # Фильтр по категории
        response = client.get(
            "/api/v1/logs/system",
            headers=admin_auth_headers,
            params={"event_category": "test_category"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        
        # Поиск по сообщению
        response = client.get(
            "/api/v1/logs/system",
            headers=admin_auth_headers,
            params={"search": "Test log"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        
        # Очистка
        test_db.delete(test_log)
        test_db.commit()
    
    def test_list_system_logs_with_pagination(self, client: TestClient, admin_auth_headers: dict):
        """Получение списка системных логов с пагинацией"""
        response = client.get(
            "/api/v1/logs/system",
            headers=admin_auth_headers,
            params={"skip": 0, "limit": 10}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) <= 10
    
    def test_get_system_log_by_id(self, client: TestClient, admin_auth_headers: dict, test_db: Session):
        """Получение системного лога по ID"""
        # Создаем тестовый лог
        test_log = SystemLog(
            level="ERROR",
            message="Test error log",
            event_type="test_error"
        )
        test_db.add(test_log)
        test_db.commit()
        test_db.refresh(test_log)
        
        response = client.get(
            f"/api/v1/logs/system/{test_log.id}",
            headers=admin_auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_log.id
        assert data["level"] == "ERROR"
        assert data["message"] == "Test error log"
        
        # Очистка
        test_db.delete(test_log)
        test_db.commit()
    
    def test_get_system_log_not_found(self, client: TestClient, admin_auth_headers: dict):
        """Получение несуществующего системного лога"""
        response = client.get(
            "/api/v1/logs/system/999999",
            headers=admin_auth_headers
        )
        assert response.status_code == 404
    
    def test_get_system_log_requires_admin(self, client: TestClient, auth_headers: dict):
        """Проверка что получение системного лога требует админ прав"""
        response = client.get("/api/v1/logs/system/1", headers=auth_headers)
        assert response.status_code in [401, 403]


class TestUserActionLogs:
    """Тесты для логов действий пользователей"""
    
    def test_list_user_action_logs_empty(self, client: TestClient, admin_auth_headers: dict):
        """Получение списка логов действий пользователей (пустой список)"""
        response = client.get("/api/v1/logs/user-actions", headers=admin_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "items" in data
        assert data["total"] >= 0
        assert isinstance(data["items"], list)
    
    def test_list_user_action_logs_requires_admin(self, client: TestClient, auth_headers: dict):
        """Проверка что список логов действий требует админ прав"""
        response = client.get("/api/v1/logs/user-actions", headers=auth_headers)
        assert response.status_code in [401, 403]
    
    def test_list_user_action_logs_with_filters(
        self, client: TestClient, admin_auth_headers: dict, 
        test_db: Session, test_user: User
    ):
        """Получение списка логов действий с фильтрами"""
        # Создаем тестовый лог действия
        test_log = UserActionLog(
            user_id=test_user.id,
            username=test_user.username,
            action_type="test",
            action_description="Test action",
            action_category="test_category",
            status="success"
        )
        test_db.add(test_log)
        test_db.commit()
        test_db.refresh(test_log)
        
        # Фильтр по user_id
        response = client.get(
            "/api/v1/logs/user-actions",
            headers=admin_auth_headers,
            params={"user_id": test_user.id}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        
        # Фильтр по username
        response = client.get(
            "/api/v1/logs/user-actions",
            headers=admin_auth_headers,
            params={"username": test_user.username}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        
        # Фильтр по типу действия
        response = client.get(
            "/api/v1/logs/user-actions",
            headers=admin_auth_headers,
            params={"action_type": "test"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        
        # Фильтр по статусу
        response = client.get(
            "/api/v1/logs/user-actions",
            headers=admin_auth_headers,
            params={"status": "success"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        
        # Очистка
        test_db.delete(test_log)
        test_db.commit()
    
    def test_get_user_action_log_by_id(
        self, client: TestClient, admin_auth_headers: dict,
        test_db: Session, test_user: User
    ):
        """Получение лога действия пользователя по ID"""
        # Создаем тестовый лог
        test_log = UserActionLog(
            user_id=test_user.id,
            username=test_user.username,
            action_type="view",
            action_description="Viewed dashboard",
            action_category="dashboard",
            status="success"
        )
        test_db.add(test_log)
        test_db.commit()
        test_db.refresh(test_log)
        
        response = client.get(
            f"/api/v1/logs/user-actions/{test_log.id}",
            headers=admin_auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_log.id
        assert data["user_id"] == test_user.id
        assert data["action_type"] == "view"
        
        # Очистка
        test_db.delete(test_log)
        test_db.commit()
    
    def test_get_user_action_log_not_found(self, client: TestClient, admin_auth_headers: dict):
        """Получение несуществующего лога действия"""
        response = client.get(
            "/api/v1/logs/user-actions/999999",
            headers=admin_auth_headers
        )
        assert response.status_code == 404
    
    def test_list_my_action_logs(self, client: TestClient, auth_headers: dict, test_user: User, test_db: Session):
        """Получение собственных действий пользователя"""
        # Создаем тестовый лог для текущего пользователя
        test_log = UserActionLog(
            user_id=test_user.id,
            username=test_user.username,
            action_type="test",
            action_description="My test action",
            action_category="test",
            status="success"
        )
        test_db.add(test_log)
        test_db.commit()
        test_db.refresh(test_log)
        
        response = client.get("/api/v1/logs/my-actions", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "items" in data
        # Проверяем, что все логи принадлежат текущему пользователю
        if data["items"]:
            assert all(log["user_id"] == test_user.id for log in data["items"])
        
        # Очистка
        test_db.delete(test_log)
        test_db.commit()


class TestLogDeletion:
    """Тесты для удаления логов"""
    
    def test_delete_old_system_logs(self, client: TestClient, admin_auth_headers: dict, test_db: Session):
        """Удаление старых системных логов"""
        # Создаем старый лог (100 дней назад)
        old_date = datetime.utcnow() - timedelta(days=100)
        old_log = SystemLog(
            level="INFO",
            message="Old log",
            created_at=old_date
        )
        test_db.add(old_log)
        test_db.commit()
        test_db.refresh(old_log)
        
        # Удаляем логи старше 90 дней
        response = client.delete(
            "/api/v1/logs/system",
            headers=admin_auth_headers,
            params={"days": 90}
        )
        assert response.status_code == 204
        
        # Проверяем, что лог удален
        log = test_db.query(SystemLog).filter(SystemLog.id == old_log.id).first()
        assert log is None
    
    def test_delete_old_system_logs_requires_admin(self, client: TestClient, auth_headers: dict):
        """Проверка что удаление старых логов требует админ прав"""
        response = client.delete("/api/v1/logs/system", headers=auth_headers, params={"days": 90})
        assert response.status_code in [401, 403]
    
    def test_clear_all_system_logs(self, client: TestClient, admin_auth_headers: dict, test_db: Session):
        """Очистка всех системных логов"""
        # Создаем несколько тестовых логов
        for i in range(3):
            log = SystemLog(
                level="INFO",
                message=f"Test log {i}",
                event_type="test"
            )
            test_db.add(log)
        test_db.commit()
        
        # Очищаем все логи
        response = client.delete(
            "/api/v1/logs/system/clear",
            headers=admin_auth_headers,
            params={"confirm": "true"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "deleted_count" in data
        assert data["deleted_count"] >= 3
    
    def test_clear_all_system_logs_requires_confirm(self, client: TestClient, admin_auth_headers: dict):
        """Проверка что очистка требует подтверждения"""
        response = client.delete(
            "/api/v1/logs/system/clear",
            headers=admin_auth_headers
        )
        assert response.status_code == 400
        assert "confirm" in response.json()["detail"].lower()
    
    def test_clear_all_user_action_logs(self, client: TestClient, admin_auth_headers: dict, test_db: Session, test_user: User):
        """Очистка всех логов действий пользователей"""
        # Создаем несколько тестовых логов
        for i in range(3):
            log = UserActionLog(
                user_id=test_user.id,
                username=test_user.username,
                action_type="test",
                action_description=f"Test action {i}",
                status="success"
            )
            test_db.add(log)
        test_db.commit()
        
        # Очищаем все логи
        response = client.delete(
            "/api/v1/logs/user-actions/clear",
            headers=admin_auth_headers,
            params={"confirm": "true"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "deleted_count" in data
        assert data["deleted_count"] >= 3
    
    def test_clear_all_user_action_logs_requires_confirm(self, client: TestClient, admin_auth_headers: dict):
        """Проверка что очистка требует подтверждения"""
        response = client.delete(
            "/api/v1/logs/user-actions/clear",
            headers=admin_auth_headers
        )
        assert response.status_code == 400
        assert "confirm" in response.json()["detail"].lower()


class TestLogsTestEndpoint:
    """Тесты для тестового endpoint"""
    
    def test_test_logs_endpoint(self, client: TestClient):
        """Тестовый endpoint должен работать без авторизации"""
        response = client.get("/api/v1/logs/test")
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "items" in data
        assert isinstance(data["items"], list)

