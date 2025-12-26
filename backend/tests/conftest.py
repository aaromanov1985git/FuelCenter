"""
Pytest fixtures для тестов GSM Converter Backend
"""
import pytest
import os
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

# Отключаем rate limiting для тестов (ДО импорта приложения)
os.environ["ENABLE_RATE_LIMIT"] = "false"

from app.database import Base, get_db
from app.models import User
from app.auth import get_password_hash

# Очищаем кэш settings и перезагружаем
from app.config import get_settings
get_settings.cache_clear()

from app.main import app

# Мокируем limiter.limit для отключения rate limiting в тестах
from unittest.mock import patch

def noop_decorator(*args, **kwargs):
    """Декоратор, который ничего не делает"""
    def decorator(func):
        return func
    return decorator

# Патчим limiter.limit глобально для всех тестов (остается активным)
_rate_limit_patcher = patch('app.middleware.rate_limit.limiter.limit', side_effect=noop_decorator)
_rate_limit_patcher.start()


# Тестовая база данных в памяти
SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture(scope="function")
def test_engine():
    """Создание тестового engine для SQLite в памяти"""
    engine = create_engine(
        SQLALCHEMY_TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def test_db(test_engine) -> Generator[Session, None, None]:
    """Создание тестовой сессии БД"""
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function")
def client(test_db: Session) -> Generator[TestClient, None, None]:
    """Создание тестового клиента FastAPI"""
    
    def override_get_db():
        try:
            yield test_db
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    
    # TestClient принимает app как позиционный аргумент
    client = TestClient(app, raise_server_exceptions=False)
    yield client
    
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def test_user(test_db: Session) -> User:
    """Создание тестового пользователя"""
    user = User(
        username="testuser",
        email="test@example.com",
        hashed_password=get_password_hash("testpassword123"),
        role="user",
        is_active=True,
        is_superuser=False
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture(scope="function")
def admin_user(test_db: Session) -> User:
    """Создание тестового администратора"""
    user = User(
        username="admin",
        email="admin@example.com",
        hashed_password=get_password_hash("adminpassword123"),
        role="admin",
        is_active=True,
        is_superuser=True
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture(scope="function")
def auth_headers(client: TestClient, test_user: User) -> dict:
    """Получение заголовков авторизации для тестового пользователя"""
    response = client.post(
        "/api/v1/auth/login-json",
        json={"username": "testuser", "password": "testpassword123"}
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
def admin_auth_headers(client: TestClient, admin_user: User) -> dict:
    """Получение заголовков авторизации для администратора"""
    response = client.post(
        "/api/v1/auth/login-json",
        json={"username": "admin", "password": "adminpassword123"}
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

