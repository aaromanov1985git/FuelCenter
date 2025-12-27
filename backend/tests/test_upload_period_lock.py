"""
Тесты для роутера upload_period_lock
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.models import User, UploadPeriodLock


class TestUploadPeriodLockGet:
    """Тесты для получения блокировки периода загрузки"""
    
    def test_get_upload_period_lock_empty(self, client: TestClient):
        """Получение блокировки когда её нет"""
        response = client.get("/api/v1/upload-period-lock")
        assert response.status_code == 200
        data = response.json()
        # Может быть None или пустой объект
        assert data is None or data == {}
    
    def test_get_upload_period_lock_exists(
        self, client: TestClient, auth_headers: dict,
        test_db: Session
    ):
        """Получение существующей блокировки"""
        # Создаем блокировку
        lock = UploadPeriodLock(
            lock_date=datetime.now().date() + timedelta(days=7)
        )
        test_db.add(lock)
        test_db.commit()
        test_db.refresh(lock)
        
        response = client.get("/api/v1/upload-period-lock")
        assert response.status_code == 200
        data = response.json()
        assert data is not None
        assert "lock_date" in data
        
        # Очистка
        test_db.delete(lock)
        test_db.commit()


class TestUploadPeriodLockCreate:
    """Тесты для создания блокировки периода загрузки"""
    
    def test_create_upload_period_lock(
        self, client: TestClient, auth_headers: dict,
        test_db: Session
    ):
        """Создание блокировки периода загрузки"""
        lock_date = (datetime.now().date() + timedelta(days=7)).isoformat()
        
        response = client.post(
            "/api/v1/upload-period-lock",
            headers=auth_headers,
            json={"lock_date": lock_date}
        )
        assert response.status_code == 200
        data = response.json()
        assert "lock_date" in data
        assert data["lock_date"] == lock_date
        
        # Очистка
        lock = test_db.query(UploadPeriodLock).first()
        if lock:
            test_db.delete(lock)
            test_db.commit()
    
    def test_create_upload_period_lock_replaces_existing(
        self, client: TestClient, auth_headers: dict,
        test_db: Session
    ):
        """Создание блокировки заменяет существующую"""
        # Создаем первую блокировку
        old_lock = UploadPeriodLock(
            lock_date=datetime.now().date() + timedelta(days=5)
        )
        test_db.add(old_lock)
        test_db.commit()
        
        # Создаем новую блокировку
        new_lock_date = (datetime.now().date() + timedelta(days=10)).isoformat()
        response = client.post(
            "/api/v1/upload-period-lock",
            headers=auth_headers,
            json={"lock_date": new_lock_date}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["lock_date"] == new_lock_date
        
        # Проверяем, что старая блокировка удалена
        old_lock_check = test_db.query(UploadPeriodLock).filter(
            UploadPeriodLock.id == old_lock.id
        ).first()
        assert old_lock_check is None
        
        # Очистка
        new_lock = test_db.query(UploadPeriodLock).first()
        if new_lock:
            test_db.delete(new_lock)
            test_db.commit()
    
    def test_create_upload_period_lock_requires_auth(self, client: TestClient):
        """Проверка что создание требует аутентификации"""
        lock_date = (datetime.now().date() + timedelta(days=7)).isoformat()
        response = client.post(
            "/api/v1/upload-period-lock",
            json={"lock_date": lock_date}
        )
        assert response.status_code in [401, 403]


class TestUploadPeriodLockDelete:
    """Тесты для удаления блокировки периода загрузки"""
    
    def test_delete_upload_period_lock(
        self, client: TestClient, auth_headers: dict,
        test_db: Session
    ):
        """Удаление блокировки периода загрузки"""
        # Создаем блокировку
        lock = UploadPeriodLock(
            lock_date=datetime.now().date() + timedelta(days=7)
        )
        test_db.add(lock)
        test_db.commit()
        test_db.refresh(lock)
        
        # Удаляем
        response = client.delete(
            "/api/v1/upload-period-lock",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        
        # Проверяем, что блокировка удалена
        deleted = test_db.query(UploadPeriodLock).filter(
            UploadPeriodLock.id == lock.id
        ).first()
        assert deleted is None
    
    def test_delete_upload_period_lock_not_found(
        self, client: TestClient, auth_headers: dict
    ):
        """Удаление несуществующей блокировки"""
        response = client.delete(
            "/api/v1/upload-period-lock",
            headers=auth_headers
        )
        assert response.status_code == 404
    
    def test_delete_upload_period_lock_requires_auth(self, client: TestClient):
        """Проверка что удаление требует аутентификации"""
        response = client.delete("/api/v1/upload-period-lock")
        assert response.status_code in [401, 403]

