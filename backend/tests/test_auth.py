"""
Тесты для модуля аутентификации
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    authenticate_user,
    get_user_by_username,
    get_user_by_email
)
from app.models import User


class TestPasswordHashing:
    """Тесты хеширования паролей"""
    
    def test_password_hash_is_different_from_plain(self):
        """Хеш пароля должен отличаться от исходного пароля"""
        password = "mysecretpassword"
        hashed = get_password_hash(password)
        assert hashed != password
    
    def test_password_verification_correct(self):
        """Проверка правильного пароля должна возвращать True"""
        password = "mysecretpassword"
        hashed = get_password_hash(password)
        assert verify_password(password, hashed) is True
    
    def test_password_verification_incorrect(self):
        """Проверка неправильного пароля должна возвращать False"""
        password = "mysecretpassword"
        wrong_password = "wrongpassword"
        hashed = get_password_hash(password)
        assert verify_password(wrong_password, hashed) is False
    
    def test_password_hash_is_unique(self):
        """Каждый хеш должен быть уникальным (разная соль)"""
        password = "mysecretpassword"
        hashed1 = get_password_hash(password)
        hashed2 = get_password_hash(password)
        assert hashed1 != hashed2  # Разная соль -> разный хеш
        # Но оба должны верифицироваться
        assert verify_password(password, hashed1) is True
        assert verify_password(password, hashed2) is True


class TestJWTToken:
    """Тесты JWT токенов"""
    
    def test_create_access_token(self):
        """Создание токена должно возвращать строку"""
        data = {"sub": "testuser", "user_id": 1, "role": "user"}
        token = create_access_token(data)
        assert isinstance(token, str)
        assert len(token) > 0
    
    def test_token_contains_payload(self):
        """Токен должен содержать payload"""
        from jose import jwt
        from app.auth import SECRET_KEY, ALGORITHM
        
        data = {"sub": "testuser", "user_id": 1, "role": "admin"}
        token = create_access_token(data)
        
        decoded = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert decoded["sub"] == "testuser"
        assert decoded["user_id"] == 1
        assert decoded["role"] == "admin"
        assert "exp" in decoded  # Должен содержать время истечения


class TestUserAuthentication:
    """Тесты аутентификации пользователей"""
    
    def test_authenticate_valid_user(self, test_db: Session, test_user: User):
        """Аутентификация с правильными данными должна вернуть пользователя"""
        user = authenticate_user(test_db, "testuser", "testpassword123")
        assert user is not None
        assert user.username == "testuser"
        assert user.email == "test@example.com"
    
    def test_authenticate_wrong_password(self, test_db: Session, test_user: User):
        """Аутентификация с неправильным паролем должна вернуть None"""
        user = authenticate_user(test_db, "testuser", "wrongpassword")
        assert user is None
    
    def test_authenticate_nonexistent_user(self, test_db: Session):
        """Аутентификация несуществующего пользователя должна вернуть None"""
        user = authenticate_user(test_db, "nonexistent", "anypassword")
        assert user is None
    
    def test_get_user_by_username(self, test_db: Session, test_user: User):
        """Поиск пользователя по username"""
        user = get_user_by_username(test_db, "testuser")
        assert user is not None
        assert user.id == test_user.id
    
    def test_get_user_by_email(self, test_db: Session, test_user: User):
        """Поиск пользователя по email"""
        user = get_user_by_email(test_db, "test@example.com")
        assert user is not None
        assert user.id == test_user.id


class TestAuthEndpoints:
    """Тесты эндпоинтов аутентификации"""
    
    def test_login_success(self, client: TestClient, test_user: User):
        """Успешный вход должен вернуть токен"""
        response = client.post(
            "/api/v1/auth/login-json",
            json={"username": "testuser", "password": "testpassword123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert "expires_in" in data
    
    def test_login_wrong_password(self, client: TestClient, test_user: User):
        """Вход с неправильным паролем должен вернуть 401"""
        response = client.post(
            "/api/v1/auth/login-json",
            json={"username": "testuser", "password": "wrongpassword"}
        )
        assert response.status_code == 401
        assert "Неверное имя пользователя или пароль" in response.json()["detail"]
    
    def test_login_nonexistent_user(self, client: TestClient):
        """Вход несуществующего пользователя должен вернуть 401"""
        response = client.post(
            "/api/v1/auth/login-json",
            json={"username": "nonexistent", "password": "anypassword"}
        )
        assert response.status_code == 401
    
    def test_get_me_authenticated(self, client: TestClient, auth_headers: dict):
        """Получение информации о текущем пользователе с токеном"""
        response = client.get("/api/v1/auth/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"
        assert data["email"] == "test@example.com"
    
    def test_get_me_unauthenticated(self, client: TestClient):
        """Получение информации без токена должно вернуть 401"""
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 401
    
    def test_register_as_admin(
        self, 
        client: TestClient, 
        admin_auth_headers: dict
    ):
        """Администратор может регистрировать новых пользователей"""
        response = client.post(
            "/api/v1/auth/register",
            json={
                "username": "newuser",
                "email": "newuser@example.com",
                "password": "newpassword123",
                "role": "user"
            },
            headers=admin_auth_headers
        )
        assert response.status_code == 201
        data = response.json()
        assert data["username"] == "newuser"
        assert data["role"] == "user"
    
    def test_register_as_regular_user_fails(
        self, 
        client: TestClient, 
        auth_headers: dict
    ):
        """Обычный пользователь не может регистрировать других"""
        response = client.post(
            "/api/v1/auth/register",
            json={
                "username": "anotheruser",
                "email": "another@example.com",
                "password": "password123",
                "role": "user"
            },
            headers=auth_headers
        )
        assert response.status_code == 403


class TestSecureLogin:
    """Тесты безопасного входа с cookies"""
    
    def test_secure_login_sets_cookie(self, client: TestClient, test_user: User):
        """Безопасный вход должен установить httpOnly cookie"""
        response = client.post(
            "/api/v1/auth/login-secure",
            json={"username": "testuser", "password": "testpassword123"}
        )
        assert response.status_code == 200
        
        # Проверяем, что cookie установлена
        assert "gsm_access_token" in response.cookies
    
    def test_logout_clears_cookie(self, client: TestClient, test_user: User):
        """Выход должен очистить cookie"""
        # Сначала входим через обычный логин для получения токена
        login_response = client.post(
            "/api/v1/auth/login-json",
            json={"username": "testuser", "password": "testpassword123"}
        )
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Выходим с токеном в заголовке
        logout_response = client.post(
            "/api/v1/auth/logout",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert logout_response.status_code == 200

