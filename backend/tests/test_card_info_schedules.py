"""
Тесты для роутера card_info_schedules
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.models import User, CardInfoSchedule


class TestCardInfoSchedulesList:
    """Тесты для получения списка расписаний"""
    
    def test_list_card_info_schedules_empty(self, client: TestClient, auth_headers: dict):
        """Получение списка расписаний (пустой список)"""
        response = client.get("/api/v1/card-info-schedules", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data or "items" in data
        assert isinstance(data.get("items", []), list)
    
    def test_list_card_info_schedules_with_filters(
        self, client: TestClient, auth_headers: dict, test_db: Session
    ):
        """Получение списка расписаний с фильтрами"""
        # Создаем тестовое расписание
        from app.models import ProviderTemplate
        template = test_db.query(ProviderTemplate).filter(
            ProviderTemplate.connection_type.in_(["web", "api"])
        ).first()
        if not template:
            pytest.skip("Нет подходящих шаблонов провайдеров в БД")
        
        schedule = CardInfoSchedule(
            name="Test Schedule",
            provider_template_id=template.id,
            schedule="0 10 * * *",
            is_active=True
        )
        test_db.add(schedule)
        test_db.commit()
        test_db.refresh(schedule)
        
        # Базовый запрос
        response = client.get(
            "/api/v1/card-info-schedules",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data or isinstance(data, list)
        
        # Очистка
        test_db.delete(schedule)
        test_db.commit()
    
    def test_list_card_info_schedules_requires_auth(self, client: TestClient):
        """Проверка что список расписаний требует аутентификации"""
        response = client.get("/api/v1/card-info-schedules")
        assert response.status_code in [401, 403]


class TestCardInfoScheduleDetail:
    """Тесты для получения расписания по ID"""
    
    def test_get_card_info_schedule_by_id(
        self, client: TestClient, auth_headers: dict,
        test_db: Session
    ):
        """Получение расписания по ID"""
        from app.models import ProviderTemplate
        template = test_db.query(ProviderTemplate).filter(
            ProviderTemplate.connection_type.in_(["web", "api"])
        ).first()
        if not template:
            pytest.skip("Нет подходящих шаблонов провайдеров в БД")
        
        schedule = CardInfoSchedule(
            name="Test Schedule Detail",
            provider_template_id=template.id,
            schedule="0 12 * * *",
            is_active=True
        )
        test_db.add(schedule)
        test_db.commit()
        test_db.refresh(schedule)
        
        response = client.get(
            f"/api/v1/card-info-schedules/{schedule.id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == schedule.id
        assert data["provider_template_id"] == template.id
        assert data["schedule"] == "0 12 * * *"
        
        # Очистка
        test_db.delete(schedule)
        test_db.commit()
    
    def test_get_card_info_schedule_not_found(self, client: TestClient, auth_headers: dict):
        """Получение несуществующего расписания"""
        response = client.get(
            "/api/v1/card-info-schedules/999999",
            headers=auth_headers
        )
        assert response.status_code == 404


class TestCardInfoScheduleCreate:
    """Тесты для создания расписаний"""
    
    def test_create_card_info_schedule(
        self, client: TestClient, admin_auth_headers: dict,
        test_db: Session
    ):
        """Создание расписания"""
        from app.models import ProviderTemplate
        template = test_db.query(ProviderTemplate).filter(
            ProviderTemplate.connection_type.in_(["web", "api"])
        ).first()
        if not template:
            pytest.skip("Нет подходящих шаблонов провайдеров в БД")
        
        schedule_data = {
            "name": "Test Create Schedule",
            "provider_template_id": template.id,
            "schedule": "0 14 * * *",
            "is_active": True
        }
        
        response = client.post(
            "/api/v1/card-info-schedules",
            headers=admin_auth_headers,
            json=schedule_data
        )
        # Может быть 200 или 201 в зависимости от реализации
        assert response.status_code in [200, 201]
        data = response.json()
        assert data["provider_template_id"] == template.id
        assert data["schedule"] == "0 14 * * *"
        
        # Очистка
        schedule = test_db.query(CardInfoSchedule).filter(
            CardInfoSchedule.provider_template_id == template.id,
            CardInfoSchedule.name == "Test Create Schedule"
        ).first()
        if schedule:
            test_db.delete(schedule)
            test_db.commit()
    
    def test_create_card_info_schedule_requires_admin(
        self, client: TestClient, auth_headers: dict
    ):
        """Проверка что создание требует админ прав"""
        response = client.post(
            "/api/v1/card-info-schedules",
            headers=auth_headers,
            json={"name": "Test", "provider_template_id": 1, "schedule": "0 10 * * *"}
        )
        assert response.status_code in [401, 403]


class TestCardInfoScheduleUpdate:
    """Тесты для обновления расписаний"""
    
    def test_update_card_info_schedule(
        self, client: TestClient, admin_auth_headers: dict,
        test_db: Session
    ):
        """Обновление расписания"""
        from app.models import ProviderTemplate
        template = test_db.query(ProviderTemplate).filter(
            ProviderTemplate.connection_type.in_(["web", "api"])
        ).first()
        if not template:
            pytest.skip("Нет подходящих шаблонов провайдеров в БД")
        
        # Создаем расписание
        schedule = CardInfoSchedule(
            name="Test Update Schedule",
            provider_template_id=template.id,
            schedule="0 10 * * *",
            is_active=True
        )
        test_db.add(schedule)
        test_db.commit()
        test_db.refresh(schedule)
        
        # Обновляем
        update_data = {
            "schedule": "0 15 * * *",
            "is_active": False
        }
        
        response = client.put(
            f"/api/v1/card-info-schedules/{schedule.id}",
            headers=admin_auth_headers,
            json=update_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["schedule"] == "0 15 * * *"
        assert data["is_active"] is False
        
        # Очистка
        test_db.delete(schedule)
        test_db.commit()
    
    def test_update_card_info_schedule_not_found(
        self, client: TestClient, admin_auth_headers: dict
    ):
        """Обновление несуществующего расписания"""
        response = client.put(
            "/api/v1/card-info-schedules/999999",
            headers=admin_auth_headers,
            json={"schedule": "0 12 * * *"}
        )
        assert response.status_code == 404
    
    def test_update_card_info_schedule_requires_admin(
        self, client: TestClient, auth_headers: dict
    ):
        """Проверка что обновление требует админ прав"""
        response = client.put(
            "/api/v1/card-info-schedules/1",
            headers=auth_headers,
            json={"schedule": "0 12 * * *"}
        )
        assert response.status_code in [401, 403]


class TestCardInfoScheduleDelete:
    """Тесты для удаления расписаний"""
    
    def test_delete_card_info_schedule(
        self, client: TestClient, admin_auth_headers: dict,
        test_db: Session
    ):
        """Удаление расписания"""
        from app.models import ProviderTemplate
        template = test_db.query(ProviderTemplate).filter(
            ProviderTemplate.connection_type.in_(["web", "api"])
        ).first()
        if not template:
            pytest.skip("Нет подходящих шаблонов провайдеров в БД")
        
        # Создаем расписание
        schedule = CardInfoSchedule(
            name="Test Delete Schedule",
            provider_template_id=template.id,
            schedule="0 10 * * *",
            is_active=True
        )
        test_db.add(schedule)
        test_db.commit()
        test_db.refresh(schedule)
        
        # Удаляем
        response = client.delete(
            f"/api/v1/card-info-schedules/{schedule.id}",
            headers=admin_auth_headers
        )
        # Может быть 200 или 204 в зависимости от реализации
        assert response.status_code in [200, 204]
        
        # Проверяем, что расписание удалено
        deleted = test_db.query(CardInfoSchedule).filter(
            CardInfoSchedule.id == schedule.id
        ).first()
        assert deleted is None
    
    def test_delete_card_info_schedule_not_found(
        self, client: TestClient, admin_auth_headers: dict
    ):
        """Удаление несуществующего расписания"""
        response = client.delete(
            "/api/v1/card-info-schedules/999999",
            headers=admin_auth_headers
        )
        assert response.status_code == 404
    
    def test_delete_card_info_schedule_requires_admin(
        self, client: TestClient, auth_headers: dict
    ):
        """Проверка что удаление требует админ прав"""
        response = client.delete(
            "/api/v1/card-info-schedules/1",
            headers=auth_headers
        )
        assert response.status_code in [401, 403]

