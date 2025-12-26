"""
API для управления резервными копиями базы данных
"""
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from datetime import datetime
import os

from app.database import get_db
from app.auth import get_current_active_user, require_admin
from app.models import User
from app.logger import logger

# Импортируем скрипт бэкапа
import sys
sys.path.insert(0, '/app')
from scripts.backup_db import DatabaseBackup


router = APIRouter(prefix="/backup", tags=["Backup"])


class BackupInfo(BaseModel):
    """Информация о бэкапе"""
    filename: str
    path: str
    size_mb: float
    created: str


class BackupListResponse(BaseModel):
    """Ответ со списком бэкапов"""
    backups: List[BackupInfo]
    total_count: int
    total_size_mb: float


class BackupCreateResponse(BaseModel):
    """Ответ на создание бэкапа"""
    success: bool
    message: str
    filename: str | None = None
    size_mb: float | None = None


class BackupScheduleConfig(BaseModel):
    """Конфигурация расписания бэкапов"""
    enabled: bool
    cron_hour: int = 3  # По умолчанию в 3 ночи
    cron_minute: int = 0
    retention_days: int = 7


def get_backup_service() -> DatabaseBackup:
    """Фабрика для создания сервиса бэкапа"""
    return DatabaseBackup(
        db_host=os.getenv("POSTGRES_HOST", "db"),
        db_port=int(os.getenv("POSTGRES_PORT", "5432")),
        db_name=os.getenv("POSTGRES_DB", "gsm_db"),
        db_user=os.getenv("POSTGRES_USER", "gsm_user"),
        db_password=os.getenv("POSTGRES_PASSWORD", "gsm_password"),
        backup_dir=os.getenv("BACKUP_DIR", "/app/backups"),
        retention_days=int(os.getenv("BACKUP_RETENTION_DAYS", "7")),
        compress=True
    )


@router.get("/list", response_model=BackupListResponse)
async def list_backups(
    current_user: User = Depends(require_admin)
):
    """
    Получить список всех резервных копий.
    Только для администраторов.
    """
    backup_service = get_backup_service()
    backups = backup_service.list_backups()
    
    total_size = sum(b["size_mb"] for b in backups)
    
    return BackupListResponse(
        backups=[BackupInfo(**b) for b in backups],
        total_count=len(backups),
        total_size_mb=round(total_size, 2)
    )


@router.post("/create", response_model=BackupCreateResponse)
async def create_backup(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Создать новую резервную копию базы данных.
    Только для администраторов.
    """
    logger.info(f"Запрос на создание бэкапа от пользователя: {current_user.username}")
    
    backup_service = get_backup_service()
    
    try:
        backup_path = backup_service.create_backup()
        
        if backup_path:
            stat = backup_path.stat()
            size_mb = round(stat.st_size / (1024 * 1024), 2)
            
            logger.info(f"Бэкап создан: {backup_path.name} ({size_mb} MB)")
            
            # Очистка старых бэкапов в фоне
            background_tasks.add_task(backup_service.cleanup_old_backups)
            
            return BackupCreateResponse(
                success=True,
                message="Резервная копия успешно создана",
                filename=backup_path.name,
                size_mb=size_mb
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Не удалось создать резервную копию"
            )
    except Exception as e:
        logger.error(f"Ошибка создания бэкапа: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка создания резервной копии: {str(e)}"
        )


@router.delete("/{filename}")
async def delete_backup(
    filename: str,
    current_user: User = Depends(require_admin)
):
    """
    Удалить резервную копию.
    Только для администраторов.
    """
    backup_service = get_backup_service()
    backup_path = backup_service.backup_dir / filename
    
    if not backup_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Резервная копия не найдена"
        )
    
    # Проверка что файл - это бэкап
    if not filename.startswith("gsm_backup_"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Недопустимое имя файла"
        )
    
    try:
        backup_path.unlink()
        logger.info(f"Бэкап удалён: {filename} пользователем {current_user.username}")
        return {"message": f"Резервная копия {filename} удалена"}
    except Exception as e:
        logger.error(f"Ошибка удаления бэкапа: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка удаления: {str(e)}"
        )


@router.get("/schedule")
async def get_backup_schedule(
    current_user: User = Depends(require_admin)
):
    """
    Получить текущее расписание автоматических бэкапов.
    """
    # В реальном приложении эти настройки хранятся в БД или конфиге
    return {
        "enabled": os.getenv("BACKUP_SCHEDULE_ENABLED", "true").lower() == "true",
        "cron_hour": int(os.getenv("BACKUP_CRON_HOUR", "3")),
        "cron_minute": int(os.getenv("BACKUP_CRON_MINUTE", "0")),
        "retention_days": int(os.getenv("BACKUP_RETENTION_DAYS", "7")),
        "next_run": "Ежедневно в 03:00"
    }

