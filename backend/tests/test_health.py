"""
Тесты для health check endpoints
"""
import pytest
from fastapi.testclient import TestClient


class TestHealthEndpoints:
    """Тесты health check endpoints"""
    
    def test_liveness_probe(self, client: TestClient):
        """Liveness probe должен возвращать 200"""
        response = client.get("/health/live")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "alive"
        assert "timestamp" in data
    
    def test_readiness_probe_healthy(self, client: TestClient):
        """Readiness probe при здоровой системе"""
        response = client.get("/health/ready")
        # Может быть 200 или 503 в зависимости от состояния Redis
        assert response.status_code in [200, 503]
        data = response.json()
        assert "status" in data
        assert "checks" in data
        assert "database" in data["checks"]
    
    def test_full_health_check(self, client: TestClient):
        """Полная проверка здоровья системы"""
        response = client.get("/health/")
        assert response.status_code in [200, 503]
        data = response.json()
        
        # Проверяем структуру ответа
        assert "status" in data
        assert "timestamp" in data
        assert "version" in data
        assert "checks" in data
        
        # Проверяем наличие всех проверок
        checks = data["checks"]
        assert "database" in checks
        assert "redis" in checks

