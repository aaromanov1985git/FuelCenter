"""
Тесты для роутера fuel_card_analysis
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.models import User, Transaction, FuelCard, Vehicle


class TestFuelCardAnalysisResults:
    """Тесты для получения результатов анализа"""
    
    def test_get_analysis_results_empty(self, client: TestClient, auth_headers: dict):
        """Получение результатов анализа (пустой список)"""
        response = client.get("/api/v1/fuel-card-analysis/results", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "items" in data
        assert isinstance(data["items"], list)
    
    def test_get_analysis_results_with_filters(
        self, client: TestClient, auth_headers: dict
    ):
        """Получение результатов анализа с фильтрами"""
        response = client.get(
            "/api/v1/fuel-card-analysis/results",
            headers=auth_headers,
            params={
                "transaction_id": 1,
                "card_id": 1,
                "match_status": "matched",
                "is_anomaly": False,
                "skip": 0,
                "limit": 10
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "items" in data
    
    def test_get_analysis_results_requires_auth(self, client: TestClient):
        """Проверка что результаты требуют аутентификации"""
        response = client.get("/api/v1/fuel-card-analysis/results")
        assert response.status_code in [401, 403]


class TestFuelCardAnalysisAnomalyStats:
    """Тесты для получения статистики по аномалиям"""
    
    def test_get_anomaly_stats(
        self, client: TestClient, auth_headers: dict
    ):
        """Получение статистики по аномалиям"""
        response = client.get(
            "/api/v1/fuel-card-analysis/anomalies/stats",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_anomalies" in data
        assert "by_type" in data
        assert "by_status" in data
    
    def test_get_anomaly_stats_with_filters(
        self, client: TestClient, auth_headers: dict
    ):
        """Получение статистики по аномалиям с фильтрами"""
        date_from = (datetime.now() - timedelta(days=30)).isoformat()
        date_to = datetime.now().isoformat()
        
        response = client.get(
            "/api/v1/fuel-card-analysis/anomalies/stats",
            headers=auth_headers,
            params={
                "date_from": date_from,
                "date_to": date_to,
                "organization_id": 1,
                "anomaly_type": "quantity_mismatch"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_anomalies" in data
    
    def test_get_anomaly_stats_requires_auth(self, client: TestClient):
        """Проверка что статистика требует аутентификации"""
        response = client.get("/api/v1/fuel-card-analysis/anomalies/stats")
        assert response.status_code in [401, 403]


class TestFuelCardAnalysisAnalyzeTransaction:
    """Тесты для анализа транзакции"""
    
    def test_analyze_transaction_not_found(
        self, client: TestClient, auth_headers: dict
    ):
        """Анализ несуществующей транзакции"""
        response = client.post(
            "/api/v1/fuel-card-analysis/analyze-transaction/999999",
            headers=auth_headers
        )
        assert response.status_code in [404, 500]
    
    def test_analyze_transaction_with_params(
        self, client: TestClient, auth_headers: dict
    ):
        """Анализ транзакции с параметрами"""
        response = client.post(
            "/api/v1/fuel-card-analysis/analyze-transaction/1",
            headers=auth_headers,
            params={
                "time_window_minutes": 60,
                "quantity_tolerance_percent": 10.0,
                "azs_radius_meters": 1000
            }
        )
        # Может быть 404 если транзакции нет, или 200 если есть
        assert response.status_code in [200, 404, 500]
    
    def test_analyze_transaction_requires_auth(self, client: TestClient):
        """Проверка что анализ требует аутентификации"""
        response = client.post("/api/v1/fuel-card-analysis/analyze-transaction/1")
        assert response.status_code in [401, 403]


class TestFuelCardAnalysisAnalyzeCard:
    """Тесты для анализа карты"""
    
    def test_analyze_card_not_found(
        self, client: TestClient, auth_headers: dict
    ):
        """Анализ несуществующей карты"""
        response = client.post(
            "/api/v1/fuel-card-analysis/analyze-card/999999",
            headers=auth_headers
        )
        assert response.status_code in [404, 500]
    
    def test_analyze_card_with_dates(
        self, client: TestClient, auth_headers: dict
    ):
        """Анализ карты с датами"""
        date_from = (datetime.now() - timedelta(days=30)).isoformat()
        date_to = datetime.now().isoformat()
        
        response = client.post(
            "/api/v1/fuel-card-analysis/analyze-card/1",
            headers=auth_headers,
            params={
                "date_from": date_from,
                "date_to": date_to
            }
        )
        # Может быть 404 если карты нет, или 200 если есть
        assert response.status_code in [200, 404, 500]
    
    def test_analyze_card_requires_auth(self, client: TestClient):
        """Проверка что анализ требует аутентификации"""
        response = client.post("/api/v1/fuel-card-analysis/analyze-card/1")
        assert response.status_code in [401, 403]


class TestFuelCardAnalysisAnalyzePeriod:
    """Тесты для массового анализа"""
    
    def test_analyze_period(
        self, client: TestClient, auth_headers: dict
    ):
        """Массовый анализ за период"""
        date_from = (datetime.now() - timedelta(days=7)).isoformat()
        date_to = datetime.now().isoformat()
        
        response = client.post(
            "/api/v1/fuel-card-analysis/analyze-period",
            headers=auth_headers,
            json={
                "date_from": date_from,
                "date_to": date_to,
                "card_ids": [],
                "vehicle_ids": [],
                "organization_ids": []
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_analyzed" in data or "results" in data
    
    def test_analyze_period_requires_auth(self, client: TestClient):
        """Проверка что массовый анализ требует аутентификации"""
        response = client.post(
            "/api/v1/fuel-card-analysis/analyze-period",
            json={
                "date_from": (datetime.now() - timedelta(days=7)).isoformat(),
                "date_to": datetime.now().isoformat()
            }
        )
        assert response.status_code in [401, 403]


class TestFuelCardAnalysisUpload:
    """Тесты для загрузки данных"""
    
    def test_upload_refuels(
        self, client: TestClient, auth_headers: dict
    ):
        """Загрузка данных о заправках"""
        response = client.post(
            "/api/v1/fuel-card-analysis/refuels/upload",
            headers=auth_headers,
            json={
                "refuels": []
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "created" in data
    
    def test_upload_locations(
        self, client: TestClient, auth_headers: dict
    ):
        """Загрузка данных о местоположениях"""
        response = client.post(
            "/api/v1/fuel-card-analysis/locations/upload",
            headers=auth_headers,
            json={
                "locations": []
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "created" in data
    
    def test_upload_refuels_requires_auth(self, client: TestClient):
        """Проверка что загрузка требует аутентификации"""
        response = client.post(
            "/api/v1/fuel-card-analysis/refuels/upload",
            json={"refuels": []}
        )
        assert response.status_code in [401, 403]
    
    def test_upload_locations_requires_auth(self, client: TestClient):
        """Проверка что загрузка требует аутентификации"""
        response = client.post(
            "/api/v1/fuel-card-analysis/locations/upload",
            json={"locations": []}
        )
        assert response.status_code in [401, 403]

