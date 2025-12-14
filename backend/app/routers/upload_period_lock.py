"""
Роутер для управления блокировкой периода загрузки
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from app.database import get_db
from app.logger import logger
from app.models import UploadPeriodLock, User
from app.schemas import UploadPeriodLockResponse, UploadPeriodLockCreate
from app.auth import require_auth_if_enabled
from app.services.logging_service import logging_service

router = APIRouter(prefix="/api/v1/upload-period-lock", tags=["upload-period-lock"])


@router.get("", response_model=Optional[UploadPeriodLockResponse])
async def get_upload_period_lock(db: Session = Depends(get_db)):
    """
    Получение информации о блокировке периода загрузки
    """
    lock = db.query(UploadPeriodLock).first()
    if not lock:
        return None
    return lock


@router.post("", response_model=UploadPeriodLockResponse)
async def create_upload_period_lock(
    lock_data: UploadPeriodLockCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Создание или обновление блокировки периода загрузки
    """
    # Удаляем существующую блокировку если есть
    existing_lock = db.query(UploadPeriodLock).first()
    if existing_lock:
        db.delete(existing_lock)
        db.commit()
    
    # Создаем новую блокировку
    new_lock = UploadPeriodLock(
        lock_date=lock_data.lock_date
    )
    db.add(new_lock)
    db.commit()
    db.refresh(new_lock)
    
    logger.info("Блокировка периода загрузки создана", extra={"lock_date": lock_data.lock_date})
    
    # Логируем действие пользователя
    if current_user:
        try:
            logging_service.log_user_action(
                db=db,
                user_id=current_user.id,
                username=current_user.username,
                action_type="create",
                action_description=f"Создана блокировка периода загрузки до {lock_data.lock_date}",
                action_category="settings",
                entity_type="UploadPeriodLock",
                entity_id=new_lock.id,
                status="success",
                extra_data={"lock_date": lock_data.lock_date.isoformat()}
            )
        except Exception as e:
            logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    return new_lock


@router.delete("")
async def delete_upload_period_lock(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Удаление блокировки периода загрузки
    """
    lock = db.query(UploadPeriodLock).first()
    if not lock:
        raise HTTPException(status_code=404, detail="Блокировка периода загрузки не найдена")
    
    lock_date = lock.lock_date
    
    db.delete(lock)
    db.commit()
    
    logger.info("Блокировка периода загрузки удалена")
    
    # Логируем действие пользователя
    if current_user:
        try:
            logging_service.log_user_action(
                db=db,
                user_id=current_user.id,
                username=current_user.username,
                action_type="delete",
                action_description=f"Удалена блокировка периода загрузки (была до {lock_date})",
                action_category="settings",
                entity_type="UploadPeriodLock",
                entity_id=None,
                status="success",
                extra_data={"lock_date": lock_date.isoformat()}
            )
        except Exception as e:
            logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    return {"message": "Блокировка периода загрузки успешно удалена"}
