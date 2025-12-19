"""
Роутер для работы с видами топлива
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.logger import logger
from app.models import FuelType, User
from app.schemas import FuelTypeResponse, FuelTypeUpdate, FuelTypeListResponse
from app.services.fuel_type_service import FuelTypeService
from app.auth import require_auth_if_enabled, require_admin
from app.services.logging_service import logging_service

router = APIRouter(prefix="/api/v1/fuel-types", tags=["fuel-types"])


@router.get("", response_model=FuelTypeListResponse)
async def get_fuel_types(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_validated: Optional[str] = Query(None, description="Фильтр по статусу валидации: pending, valid, invalid"),
    include_transactions_count: bool = Query(True, description="Включать количество транзакций для каждого вида топлива"),
    db: Session = Depends(get_db)
):
    """
    Получение списка видов топлива
    
    Фильтры:
    - is_validated: pending (требуют проверки), valid (валидные), invalid (с ошибками)
    - include_transactions_count: включать количество транзакций (по умолчанию True)
    """
    fuel_type_service = FuelTypeService(db)
    fuel_types, total = fuel_type_service.get_fuel_types(
        skip=skip,
        limit=limit,
        is_validated=is_validated
    )
    
    # Добавляем количество транзакций для каждого вида топлива
    if include_transactions_count and fuel_types:
        fuel_type_ids = [ft.id for ft in fuel_types]
        transactions_counts = fuel_type_service.get_transactions_counts_batch(fuel_type_ids)
        
        # Добавляем поле transactions_count к каждому виду топлива
        for fuel_type in fuel_types:
            fuel_type.transactions_count = transactions_counts.get(fuel_type.id, 0)
    
    logger.debug("Список видов топлива загружен", extra={"total": total, "returned": len(fuel_types)})
    
    return FuelTypeListResponse(total=total, items=fuel_types)


@router.get("/stats")
async def get_fuel_types_stats(
    db: Session = Depends(get_db)
):
    """
    Получение статистики по видам топлива для дашборда
    """
    fuel_type_service = FuelTypeService(db)
    stats = fuel_type_service.get_stats_summary()
    
    logger.debug("Статистика видов топлива загружена", extra=stats)
    
    return stats


@router.get("/{fuel_type_id}", response_model=FuelTypeResponse)
async def get_fuel_type(
    fuel_type_id: int,
    db: Session = Depends(get_db)
):
    """
    Получение вида топлива по ID
    """
    fuel_type_service = FuelTypeService(db)
    fuel_type = fuel_type_service.get_fuel_type(fuel_type_id)
    if not fuel_type:
        raise HTTPException(status_code=404, detail="Вид топлива не найден")
    return fuel_type


@router.put("/{fuel_type_id}", response_model=FuelTypeResponse)
async def update_fuel_type(
    fuel_type_id: int,
    fuel_type_update: FuelTypeUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Обновление данных вида топлива
    """
    fuel_type_service = FuelTypeService(db)
    # original_name нельзя изменять - это поле только для чтения
    # Оно устанавливается только при создании записи из транзакций
    fuel_type = fuel_type_service.update_fuel_type(
        fuel_type_id=fuel_type_id,
        original_name=None,  # Не изменяем original_name
        normalized_name=fuel_type_update.normalized_name,
        is_validated=fuel_type_update.is_validated
    )
    
    if not fuel_type:
        raise HTTPException(status_code=404, detail="Вид топлива не найден")
    
    logger.info("Вид топлива обновлен", extra={"fuel_type_id": fuel_type_id})
    
    # Логируем действие пользователя
    if current_user:
        try:
            logging_service.log_user_action(
                db=db,
                user_id=current_user.id,
                username=current_user.username,
                action_type="update",
                action_description=f"Обновлен вид топлива: {fuel_type.original_name}",
                action_category="fuel_type",
                entity_type="FuelType",
                entity_id=fuel_type_id,
                status="success"
            )
        except Exception as e:
            logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    return fuel_type


@router.delete("/clear")
async def clear_all_fuel_types(
    confirm: Optional[str] = Query(None, description="Подтверждение удаления всех видов топлива"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Очистка всех видов топлива из базы данных
    """
    confirm_bool = confirm and confirm.lower() in ("true", "1", "yes")
    
    if not confirm_bool:
        raise HTTPException(
            status_code=400, 
            detail="Для очистки всех видов топлива необходимо установить параметр confirm=true"
        )
    
    try:
        total_count = db.query(FuelType).count()
        db.query(FuelType).delete()
        db.commit()
        
        # Логируем действие пользователя
        if current_user:
            try:
                logging_service.log_user_action(
                    db=db,
                    user_id=current_user.id,
                    username=current_user.username,
                    action_type="clear",
                    action_description=f"Очищены все виды топлива ({total_count} записей)",
                    action_category="fuel_type",
                    entity_type="FuelType",
                    entity_id=None,
                    status="success",
                    extra_data={"deleted_count": total_count}
                )
            except Exception as e:
                logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
        
        logger.info(f"Очищены все виды топлива", extra={"deleted_count": total_count})
        
        return {
            "message": f"Все виды топлива успешно удалены",
            "deleted_count": total_count
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Ошибка при очистке видов топлива", extra={"error": str(e)}, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка при очистке видов топлива: {str(e)}")
