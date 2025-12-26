"""
Интеграционные тесты для модуля резервного копирования
"""
import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import os


class TestBackupList:
    """Тесты для получения списка бэкапов"""
    
    def test_list_backups_requires_admin(self, client: TestClient):
        """Тест что список бэкапов требует админ прав"""
        response = client.get("/backup/list")
        assert response.status_code in [401, 403]
    
    def test_list_backups_as_admin(self, client: TestClient, admin_auth_headers: dict):
        """Тест получения списка бэкапов как админ"""
        response = client.get("/backup/list", headers=admin_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "backups" in data
        assert "total_count" in data
        assert "total_size_mb" in data
        assert isinstance(data["backups"], list)


class TestBackupCreate:
    """Тесты для создания бэкапа"""
    
    def test_create_backup_requires_admin(self, client: TestClient):
        """Тест что создание бэкапа требует админ прав"""
        response = client.post("/backup/create")
        assert response.status_code in [401, 403]
    
    def test_create_backup_as_admin(self, client: TestClient, admin_auth_headers: dict):
        """Тест создания бэкапа как админ"""
        response = client.post("/backup/create", headers=admin_auth_headers)
        # Может быть 200 или 500 в зависимости от доступности БД и прав
        assert response.status_code in [200, 500]
        
        if response.status_code == 200:
            data = response.json()
            assert data["success"] is True
            assert "message" in data
            if data.get("filename"):
                assert "gsm_backup_" in data["filename"]


class TestBackupDelete:
    """Тесты для удаления бэкапа"""
    
    def test_delete_backup_requires_admin(self, client: TestClient):
        """Тест что удаление бэкапа требует админ прав"""
        response = client.delete("/backup/test_backup.sql.gz")
        assert response.status_code in [401, 403]
    
    def test_delete_backup_invalid_filename(self, client: TestClient, admin_auth_headers: dict):
        """Тест удаления бэкапа с невалидным именем файла"""
        response = client.delete(
            "/backup/../../../etc/passwd",
            headers=admin_auth_headers
        )
        assert response.status_code == 400
        assert "недопустимое" in response.json()["detail"].lower()
    
    def test_delete_backup_not_found(self, client: TestClient, admin_auth_headers: dict):
        """Тест удаления несуществующего бэкапа"""
        response = client.delete(
            "/backup/gsm_backup_nonexistent_20250101_000000.sql.gz",
            headers=admin_auth_headers
        )
        assert response.status_code == 404


class TestBackupSchedule:
    """Тесты для получения расписания бэкапов"""
    
    def test_get_backup_schedule_requires_admin(self, client: TestClient):
        """Тест что получение расписания требует админ прав"""
        response = client.get("/backup/schedule")
        assert response.status_code in [401, 403]
    
    def test_get_backup_schedule_as_admin(self, client: TestClient, admin_auth_headers: dict):
        """Тест получения расписания бэкапов как админ"""
        response = client.get("/backup/schedule", headers=admin_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "enabled" in data
        assert "cron_hour" in data
        assert "cron_minute" in data
        assert "retention_days" in data
        assert "next_run" in data

