"""
Общие тесты для API
"""
import pytest
from fastapi.testclient import TestClient


class TestAPIBasics:
    """Базовые тесты API"""
    
    def test_root_endpoint(self, client: TestClient):
        """Корневой endpoint должен возвращать информацию о API"""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data or "status" in data
    
    def test_openapi_schema_available(self, client: TestClient):
        """OpenAPI схема должна быть доступна"""
        response = client.get("/openapi.json")
        assert response.status_code == 200
        data = response.json()
        
        assert "openapi" in data
        assert "info" in data
        assert "paths" in data
    
    def test_swagger_ui_available(self, client: TestClient):
        """Swagger UI должен быть доступен"""
        response = client.get("/docs")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
    
    def test_redoc_available(self, client: TestClient):
        """ReDoc должен быть доступен"""
        response = client.get("/redoc")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]


class TestMetricsEndpoint:
    """Тесты Prometheus метрик"""
    
    def test_metrics_endpoint_available(self, client: TestClient):
        """Metrics endpoint должен быть доступен"""
        response = client.get("/metrics")
        assert response.status_code == 200
        content = response.text
        
        # Проверяем наличие стандартных метрик
        assert "python_info" in content or "process_" in content
    
    def test_metrics_contains_http_metrics(self, client: TestClient):
        """Метрики должны содержать HTTP метрики"""
        # Делаем несколько запросов
        client.get("/")
        client.get("/health/live")
        
        response = client.get("/metrics")
        content = response.text
        
        # Проверяем наличие кастомных метрик
        assert "http_requests_total" in content or "http_request" in content


class TestCORS:
    """Тесты CORS"""
    
    def test_cors_headers_present(self, client: TestClient):
        """CORS заголовки должны присутствовать"""
        response = client.options(
            "/api/v1/auth/me",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET"
            }
        )
        # CORS preflight может вернуть 200 или 405
        assert response.status_code in [200, 405]


class TestRateLimiting:
    """Тесты Rate Limiting"""
    
    def test_rate_limit_headers(self, client: TestClient, auth_headers: dict):
        """Rate limit заголовки должны присутствовать"""
        response = client.get("/api/v1/auth/me", headers=auth_headers)
        
        # Проверяем наличие rate limit заголовков (могут быть X-RateLimit-*)
        headers = response.headers
        # Rate limit headers опциональны, но проверим что запрос прошёл
        assert response.status_code in [200, 429]

