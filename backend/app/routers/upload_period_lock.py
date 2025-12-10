"""
Роутер для управления блокировкой периода загрузки
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from app.database import get_db
from app.logger import logger
from app.models import UploadPeriodLock
from app.schemas import UploadPeriodLockResponse, UploadPeriodLockCreate

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
    db: Session = Depends(get_db)
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
    
    return new_lock


@router.delete("")
async def delete_upload_period_lock(db: Session = Depends(get_db)):
    """
    Удаление блокировки периода загрузки
    """
    lock = db.query(UploadPeriodLock).first()
    if not lock:
        raise HTTPException(status_code=404, detail="Блокировка периода загрузки не найдена")
    
    db.delete(lock)
    db.commit()
    
    logger.info("Блокировка периода загрузки удалена")
    
    return {"message": "Блокировка периода загрузки успешно удалена"}
