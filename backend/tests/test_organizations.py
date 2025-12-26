"""
Интеграционные тесты для модуля организаций
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Organization, User, user_organizations


@pytest.fixture
def test_organization(test_db: Session) -> Organization:
    """Создание тестовой организации"""
    org = Organization(
        name="Тестовая организация",
        code="TEST_ORG",
        is_active=True
    )
    test_db.add(org)
    test_db.commit()
    test_db.refresh(org)
    return org


@pytest.fixture
def test_user_with_org(test_db: Session, test_organization: Organization) -> User:
    """Создание тестового пользователя с организацией"""
    from app.auth import get_password_hash
    user = User(
        username="org_user",
        email="org_user@example.com",
        hashed_password=get_password_hash("password123"),
        role="user",
        is_active=True,
        is_superuser=False
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    
    # Назначаем организацию пользователю через relationship
    user.organizations.append(test_organization)
    test_db.commit()
    test_db.refresh(user)
    
    return user


class TestOrganizationsList:
    """Тесты для получения списка организаций"""
    
    def test_get_organizations_empty(self, client: TestClient, auth_headers: dict):
        """Тест получения пустого списка организаций"""
        response = client.get("/api/v1/organizations", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["items"] == []
    
    def test_get_organizations_with_data(self, client: TestClient, test_organization: Organization,
                                        auth_headers: dict):
        """Тест получения списка организаций с данными"""
        response = client.get("/api/v1/organizations", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["id"] == test_organization.id
        assert data["items"][0]["name"] == test_organization.name
    
    def test_get_organizations_filter_by_active(self, client: TestClient, test_db: Session,
                                               auth_headers: dict):
        """Тест фильтрации по активности"""
        # Создаем активную и неактивную организации
        active_org = Organization(
            name="Активная организация",
            code="ACTIVE",
            is_active=True
        )
        inactive_org = Organization(
            name="Неактивная организация",
            code="INACTIVE",
            is_active=False
        )
        test_db.add_all([active_org, inactive_org])
        test_db.commit()
        
        # Фильтр по активным
        response = client.get("/api/v1/organizations?is_active=true", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["is_active"] is True


class TestOrganizationDetail:
    """Тесты для получения организации по ID"""
    
    def test_get_organization_by_id(self, client: TestClient, test_organization: Organization,
                                   auth_headers: dict):
        """Тест получения организации по ID"""
        response = client.get(f"/api/v1/organizations/{test_organization.id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_organization.id
        assert data["name"] == test_organization.name
    
    def test_get_organization_not_found(self, client: TestClient, auth_headers: dict):
        """Тест получения несуществующей организации"""
        response = client.get("/api/v1/organizations/99999", headers=auth_headers)
        assert response.status_code == 404


class TestOrganizationCreate:
    """Тесты для создания организации"""
    
    def test_create_organization(self, client: TestClient, admin_auth_headers: dict):
        """Тест создания организации"""
        create_data = {
            "name": "Новая организация",
            "code": "NEW_ORG",
            "is_active": True
        }
        response = client.post(
            "/api/v1/organizations",
            json=create_data,
            headers=admin_auth_headers
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Новая организация"
        assert data["code"] == "NEW_ORG"
        assert data["is_active"] is True
    
    def test_create_organization_requires_admin(self, client: TestClient, auth_headers: dict):
        """Тест, что создание требует права администратора"""
        create_data = {
            "name": "Новая организация",
            "code": "NEW_ORG",
            "is_active": True
        }
        response = client.post(
            "/api/v1/organizations",
            json=create_data,
            headers=auth_headers
        )
        # Должен быть 403 или 401 в зависимости от настроек
        assert response.status_code in [401, 403]


class TestOrganizationUpdate:
    """Тесты для обновления организации"""
    
    def test_update_organization(self, client: TestClient, test_organization: Organization,
                                admin_auth_headers: dict):
        """Тест обновления организации"""
        update_data = {
            "name": "Обновленная организация",
            "is_active": False
        }
        response = client.put(
            f"/api/v1/organizations/{test_organization.id}",
            json=update_data,
            headers=admin_auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Обновленная организация"
        assert data["is_active"] is False


class TestOrganizationDelete:
    """Тесты для удаления организации"""
    
    def test_delete_organization(self, client: TestClient, test_db: Session,
                                 admin_auth_headers: dict):
        """Тест удаления организации"""
        # Создаем организацию для удаления
        org = Organization(
            name="Организация для удаления",
            code="DELETE",
            is_active=True
        )
        test_db.add(org)
        test_db.commit()
        
        # Удаляем организацию (возвращает 204 No Content)
        response = client.delete(
            f"/api/v1/organizations/{org.id}",
            headers=admin_auth_headers
        )
        assert response.status_code == 204
        
        # Проверяем, что организация удалена
        response = client.get(f"/api/v1/organizations/{org.id}", headers=admin_auth_headers)
        assert response.status_code == 404

