"""
Интеграционные тесты для модуля пользователей
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User


@pytest.fixture
def test_user_for_management(test_db: Session) -> User:
    """Создание тестового пользователя для управления"""
    from app.auth import get_password_hash
    user = User(
        username="testuser",
        email="testuser@example.com",
        hashed_password=get_password_hash("testpass123"),
        role="user",
        is_active=True
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


class TestUsersList:
    """Тесты для получения списка пользователей"""
    
    def test_list_users_requires_admin(self, client: TestClient):
        """Тест что список пользователей требует админ прав"""
        response = client.get("/api/v1/users")
        # Может быть 401 или 403 в зависимости от настроек auth
        assert response.status_code in [401, 403]
    
    def test_list_users_as_admin(self, client: TestClient, admin_auth_headers: dict):
        """Тест получения списка пользователей как админ"""
        response = client.get("/api/v1/users", headers=admin_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "items" in data
        assert isinstance(data["items"], list)
    
    def test_list_users_with_search(self, client: TestClient, test_user_for_management: User, admin_auth_headers: dict):
        """Тест поиска пользователей"""
        response = client.get(
            f"/api/v1/users?search={test_user_for_management.username}",
            headers=admin_auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert any(u["username"] == test_user_for_management.username for u in data["items"])
    
    def test_list_users_pagination(self, client: TestClient, admin_auth_headers: dict):
        """Тест пагинации списка пользователей"""
        response = client.get("/api/v1/users?skip=0&limit=1", headers=admin_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) <= 1


class TestUserCreate:
    """Тесты для создания пользователя"""
    
    def test_create_user_requires_admin(self, client: TestClient):
        """Тест что создание пользователя требует админ прав"""
        user_data = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "password123",
            "role": "user"
        }
        response = client.post("/api/v1/users", json=user_data)
        assert response.status_code in [401, 403]
    
    def test_create_user(self, client: TestClient, admin_auth_headers: dict, test_db: Session):
        """Тест создания пользователя"""
        user_data = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "password123",
            "role": "user"
        }
        response = client.post(
            "/api/v1/users",
            json=user_data,
            headers=admin_auth_headers
        )
        assert response.status_code == 201
        data = response.json()
        assert data["username"] == user_data["username"]
        assert data["email"] == user_data["email"]
        assert data["role"] == user_data["role"]
        assert data["is_active"] is True
        
        # Проверяем что пользователь создан в БД
        from app.auth import get_user_by_username
        created_user = get_user_by_username(test_db, user_data["username"])
        assert created_user is not None
    
    def test_create_user_duplicate_username(self, client: TestClient, test_user_for_management: User, admin_auth_headers: dict):
        """Тест создания пользователя с существующим username"""
        user_data = {
            "username": test_user_for_management.username,
            "email": "different@example.com",
            "password": "password123",
            "role": "user"
        }
        response = client.post(
            "/api/v1/users",
            json=user_data,
            headers=admin_auth_headers
        )
        assert response.status_code == 400
        assert "уже существует" in response.json()["detail"].lower()
    
    def test_create_user_duplicate_email(self, client: TestClient, test_user_for_management: User, admin_auth_headers: dict):
        """Тест создания пользователя с существующим email"""
        user_data = {
            "username": "differentuser",
            "email": test_user_for_management.email,
            "password": "password123",
            "role": "user"
        }
        response = client.post(
            "/api/v1/users",
            json=user_data,
            headers=admin_auth_headers
        )
        assert response.status_code == 400
        assert "уже существует" in response.json()["detail"].lower()


class TestUserUpdate:
    """Тесты для обновления пользователя"""
    
    def test_update_user_requires_admin(self, client: TestClient, test_user_for_management: User):
        """Тест что обновление пользователя требует админ прав"""
        update_data = {"email": "newemail@example.com"}
        response = client.patch(
            f"/api/v1/users/{test_user_for_management.id}",
            json=update_data
        )
        assert response.status_code in [401, 403]
    
    def test_update_user(self, client: TestClient, test_user_for_management: User, admin_auth_headers: dict):
        """Тест обновления пользователя"""
        update_data = {
            "email": "updated@example.com",
            "role": "admin"
        }
        response = client.patch(
            f"/api/v1/users/{test_user_for_management.id}",
            json=update_data,
            headers=admin_auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == update_data["email"]
        assert data["role"] == update_data["role"]
    
    def test_update_user_not_found(self, client: TestClient, admin_auth_headers: dict):
        """Тест обновления несуществующего пользователя"""
        update_data = {"email": "new@example.com"}
        response = client.patch(
            "/api/v1/users/99999",
            json=update_data,
            headers=admin_auth_headers
        )
        assert response.status_code == 404
    
    def test_update_user_cannot_deactivate_self(self, client: TestClient, admin_user: User, admin_auth_headers: dict):
        """Тест что нельзя деактивировать самого себя"""
        update_data = {"is_active": False}
        response = client.patch(
            f"/api/v1/users/{admin_user.id}",
            json=update_data,
            headers=admin_auth_headers
        )
        assert response.status_code == 400
        assert "деактивировать" in response.json()["detail"].lower()


class TestUserDelete:
    """Тесты для удаления пользователя"""
    
    def test_delete_user_requires_admin(self, client: TestClient, test_user_for_management: User):
        """Тест что удаление пользователя требует админ прав"""
        response = client.delete(f"/api/v1/users/{test_user_for_management.id}")
        assert response.status_code in [401, 403]
    
    def test_delete_user(self, client: TestClient, test_db: Session, admin_auth_headers: dict):
        """Тест удаления пользователя"""
        # Создаем пользователя для удаления
        from app.auth import get_password_hash
        user = User(
            username="todelete",
            email="todelete@example.com",
            hashed_password=get_password_hash("password123"),
            role="user",
            is_active=True
        )
        test_db.add(user)
        test_db.commit()
        test_db.refresh(user)
        user_id = user.id
        
        response = client.delete(
            f"/api/v1/users/{user_id}",
            headers=admin_auth_headers
        )
        assert response.status_code == 204
        
        # Проверяем что пользователь удален
        from app.auth import get_user_by_id
        deleted_user = get_user_by_id(test_db, user_id)
        assert deleted_user is None
    
    def test_delete_user_not_found(self, client: TestClient, admin_auth_headers: dict):
        """Тест удаления несуществующего пользователя"""
        response = client.delete(
            "/api/v1/users/99999",
            headers=admin_auth_headers
        )
        assert response.status_code == 404
    
    def test_delete_user_cannot_delete_self(self, client: TestClient, admin_user: User, admin_auth_headers: dict):
        """Тест что нельзя удалить самого себя"""
        response = client.delete(
            f"/api/v1/users/{admin_user.id}",
            headers=admin_auth_headers
        )
        assert response.status_code == 400
        assert "удалить" in response.json()["detail"].lower()

