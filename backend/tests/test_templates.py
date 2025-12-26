"""
Интеграционные тесты для модуля шаблонов провайдеров
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import ProviderTemplate, Provider


@pytest.fixture
def test_provider(test_db: Session) -> Provider:
    """Создание тестового провайдера"""
    provider = Provider(
        name="Тестовый провайдер",
        code="TEST",
        is_active=True
    )
    test_db.add(provider)
    test_db.commit()
    test_db.refresh(provider)
    return provider


@pytest.fixture
def test_template(test_db: Session, test_provider: Provider) -> ProviderTemplate:
    """Создание тестового шаблона"""
    template = ProviderTemplate(
        name="Тестовый шаблон",
        description="Описание тестового шаблона",
        provider_id=test_provider.id,
        connection_type="excel",
        is_active=True,
        field_mapping='{"date": "Дата", "amount": "Сумма"}'
    )
    test_db.add(template)
    test_db.commit()
    test_db.refresh(template)
    return template


class TestTemplatesList:
    """Тесты для получения списка шаблонов"""
    
    def test_get_templates_empty(self, client: TestClient):
        """Тест получения пустого списка шаблонов"""
        response = client.get("/api/v1/templates")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["items"] == []
    
    def test_get_templates_with_data(self, client: TestClient, test_template: ProviderTemplate, test_db: Session):
        """Тест получения списка шаблонов с данными"""
        # Инвалидируем кэш если есть
        from app.services.cache_service import CacheService
        cache = CacheService.get_instance()
        cache.delete_pattern("templates:*")
        
        response = client.get("/api/v1/templates")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert len(data["items"]) >= 1
        assert any(t["id"] == test_template.id for t in data["items"])
    
    def test_get_templates_filter_by_active(self, client: TestClient, test_template: ProviderTemplate, test_db: Session):
        """Тест фильтрации шаблонов по активности"""
        # Создаем неактивный шаблон
        inactive_template = ProviderTemplate(
            name="Неактивный шаблон",
            provider_id=test_template.provider_id,
            connection_type="excel",
            is_active=False
        )
        test_db.add(inactive_template)
        test_db.commit()
        
        # Инвалидируем кэш
        from app.services.cache_service import CacheService
        cache = CacheService.get_instance()
        cache.delete_pattern("templates:*")
        
        # Тест активных шаблонов
        response = client.get("/api/v1/templates?is_active=true")
        assert response.status_code == 200
        data = response.json()
        assert all(t["is_active"] is True for t in data["items"])
        
        # Тест неактивных шаблонов
        response = client.get("/api/v1/templates?is_active=false")
        assert response.status_code == 200
        data = response.json()
        assert all(t["is_active"] is False for t in data["items"])
    
    def test_get_templates_filter_by_connection_type(self, client: TestClient, test_template: ProviderTemplate, test_db: Session):
        """Тест фильтрации шаблонов по типу подключения"""
        # Создаем шаблон с другим типом подключения
        api_template = ProviderTemplate(
            name="API шаблон",
            provider_id=test_template.provider_id,
            connection_type="api",
            is_active=True
        )
        test_db.add(api_template)
        test_db.commit()
        
        # Инвалидируем кэш
        from app.services.cache_service import CacheService
        cache = CacheService.get_instance()
        cache.delete_pattern("templates:*")
        
        # Тест фильтрации по типу excel
        response = client.get("/api/v1/templates?connection_type=excel")
        assert response.status_code == 200
        data = response.json()
        assert all(t["connection_type"].lower() == "excel" for t in data["items"])
        
        # Тест фильтрации по типу api
        response = client.get("/api/v1/templates?connection_type=api")
        assert response.status_code == 200
        data = response.json()
        assert all(t["connection_type"].lower() == "api" for t in data["items"])


class TestTemplateDetail:
    """Тесты для получения шаблона по ID"""
    
    def test_get_template_by_id(self, client: TestClient, test_template: ProviderTemplate):
        """Тест получения шаблона по ID"""
        response = client.get(f"/api/v1/templates/{test_template.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_template.id
        assert data["name"] == test_template.name
        assert data["connection_type"] == test_template.connection_type
    
    def test_get_template_not_found(self, client: TestClient):
        """Тест получения несуществующего шаблона"""
        response = client.get("/api/v1/templates/99999")
        assert response.status_code == 404
        assert "не найден" in response.json()["detail"].lower()


class TestTemplateUpdate:
    """Тесты для обновления шаблона"""
    
    def test_update_template(self, client: TestClient, test_template: ProviderTemplate, admin_auth_headers: dict):
        """Тест обновления шаблона"""
        update_data = {
            "name": "Обновленное имя",
            "description": "Обновленное описание"
        }
        response = client.put(
            f"/api/v1/templates/{test_template.id}",
            json=update_data,
            headers=admin_auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == update_data["name"]
        assert data["description"] == update_data["description"]
    
    def test_update_template_not_found(self, client: TestClient, admin_auth_headers: dict):
        """Тест обновления несуществующего шаблона"""
        update_data = {"name": "Новое имя"}
        response = client.put(
            "/api/v1/templates/99999",
            json=update_data,
            headers=admin_auth_headers
        )
        assert response.status_code == 404
    
    def test_update_template_connection_type(self, client: TestClient, test_template: ProviderTemplate, admin_auth_headers: dict):
        """Тест обновления типа подключения"""
        update_data = {
            "connection_type": "api",
            "connection_settings": {
                "base_url": "https://api.example.com",
                "api_token": "test_token"
            }
        }
        response = client.put(
            f"/api/v1/templates/{test_template.id}",
            json=update_data,
            headers=admin_auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["connection_type"] == "api"


class TestTemplateDelete:
    """Тесты для удаления шаблона"""
    
    def test_delete_template(self, client: TestClient, test_db: Session, test_provider: Provider, admin_auth_headers: dict):
        """Тест удаления шаблона"""
        # Создаем шаблон для удаления
        template = ProviderTemplate(
            name="Шаблон для удаления",
            provider_id=test_provider.id,
            connection_type="excel",
            is_active=True
        )
        test_db.add(template)
        test_db.commit()
        test_db.refresh(template)
        template_id = template.id
        
        response = client.delete(
            f"/api/v1/templates/{template_id}",
            headers=admin_auth_headers
        )
        assert response.status_code == 200
        assert "успешно удален" in response.json()["message"].lower()
        
        # Проверяем, что шаблон удален
        deleted_template = test_db.query(ProviderTemplate).filter(ProviderTemplate.id == template_id).first()
        assert deleted_template is None
    
    def test_delete_template_not_found(self, client: TestClient, admin_auth_headers: dict):
        """Тест удаления несуществующего шаблона"""
        response = client.delete(
            "/api/v1/templates/99999",
            headers=admin_auth_headers
        )
        assert response.status_code == 404


class TestTemplateAnalyze:
    """Тесты для анализа структуры файла"""
    
    def test_analyze_template_invalid_file(self, client: TestClient):
        """Тест анализа невалидного файла"""
        # Создаем текстовый файл вместо Excel
        files = {
            "file": ("test.txt", b"not an excel file", "text/plain")
        }
        response = client.post("/api/v1/templates/analyze", files=files)
        assert response.status_code == 400
        assert "excel" in response.json()["detail"].lower() or "xlsx" in response.json()["detail"].lower()
    
    def test_analyze_template_missing_file(self, client: TestClient):
        """Тест анализа без файла"""
        response = client.post("/api/v1/templates/analyze")
        assert response.status_code == 422  # Validation error


class TestTemplateTestConnection:
    """Тесты для тестирования подключения"""
    
    def test_test_api_connection_missing_settings(self, client: TestClient):
        """Тест тестирования подключения без настроек"""
        response = client.post(
            "/api/v1/templates/test-api-connection",
            json={}
        )
        assert response.status_code == 400
        assert "настройки подключения" in response.json()["detail"].lower()
    
    def test_test_api_connection_invalid_type(self, client: TestClient):
        """Тест тестирования подключения с невалидным типом"""
        response = client.post(
            "/api/v1/templates/test-api-connection",
            json={
                "connection_settings": {"base_url": "https://api.example.com"},
                "connection_type": "invalid_type"
            }
        )
        assert response.status_code == 400
        assert "неподдерживаемый тип" in response.json()["detail"].lower()
    
    def test_test_api_connection_template_not_found(self, client: TestClient):
        """Тест тестирования подключения для несуществующего шаблона"""
        response = client.post("/api/v1/templates/99999/test-api-connection")
        assert response.status_code == 404

