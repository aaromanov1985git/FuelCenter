"""
Роутер для работы с автозаправочными станциями (АЗС)
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.logger import logger
from app.models import GasStation, User
from app.schemas import GasStationResponse, GasStationUpdate, GasStationListResponse
from app.services.gas_station_service import GasStationService
from app.auth import require_auth_if_enabled, require_admin
from app.services.logging_service import logging_service

router = APIRouter(prefix="/api/v1/gas-stations", tags=["gas-stations"])


@router.get("", response_model=GasStationListResponse)
async def get_gas_stations(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_validated: Optional[str] = Query(None, description="Фильтр по статусу валидации: pending, valid, invalid"),
    db: Session = Depends(get_db)
):
    """
    Получение списка автозаправочных станций
    
    Фильтры:
    - is_validated: pending (требуют проверки), valid (валидные), invalid (с ошибками)
    """
    gas_station_service = GasStationService(db)
    gas_stations, total = gas_station_service.get_gas_stations(
        skip=skip,
        limit=limit,
        is_validated=is_validated
    )
    
    logger.debug("Список АЗС загружен", extra={"total": total, "returned": len(gas_stations)})
    
    return GasStationListResponse(total=total, items=gas_stations)


@router.get("/stats")
async def get_gas_stations_stats(
    db: Session = Depends(get_db)
):
    """
    Получение статистики по АЗС для дашборда
    """
    gas_station_service = GasStationService(db)
    stats = gas_station_service.get_stats_summary()
    
    logger.debug("Статистика АЗС загружена", extra=stats)
    
    return stats


@router.get("/{gas_station_id}", response_model=GasStationResponse)
async def get_gas_station(
    gas_station_id: int,
    db: Session = Depends(get_db)
):
    """
    Получение АЗС по ID
    """
    gas_station_service = GasStationService(db)
    gas_station = gas_station_service.get_gas_station(gas_station_id)
    if not gas_station:
        raise HTTPException(status_code=404, detail="АЗС не найдена")
    return gas_station


@router.put("/{gas_station_id}", response_model=GasStationResponse)
async def update_gas_station(
    gas_station_id: int,
    gas_station_update: GasStationUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Обновление данных АЗС
    """
    gas_station_service = GasStationService(db)
    # original_name нельзя изменять - это поле только для чтения
    # Оно устанавливается только при создании записи из загружаемых файлов
    gas_station = gas_station_service.update_gas_station(
        gas_station_id=gas_station_id,
        original_name=None,  # Не изменяем original_name
        name=gas_station_update.name,  # Позволяем изменять наименование
        provider_id=gas_station_update.provider_id,
        azs_number=gas_station_update.azs_number,
        location=gas_station_update.location,
        region=gas_station_update.region,
        settlement=gas_station_update.settlement,
        latitude=gas_station_update.latitude,
        longitude=gas_station_update.longitude,
        is_validated=gas_station_update.is_validated
    )
    
    if not gas_station:
        raise HTTPException(status_code=404, detail="АЗС не найдена")
    
    logger.info("АЗС обновлена", extra={"gas_station_id": gas_station_id})
    
    # Логируем действие пользователя
    if current_user:
        try:
            logging_service.log_user_action(
                db=db,
                user_id=current_user.id,
                username=current_user.username,
                action_type="update",
                action_description=f"Обновлена АЗС: {gas_station.original_name}",
                action_category="gas_station",
                entity_type="GasStation",
                entity_id=gas_station_id,
                status="success"
            )
        except Exception as e:
            logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    return gas_station


@router.delete("/clear")
async def clear_all_gas_stations(
    confirm: Optional[str] = Query(None, description="Подтверждение удаления всех АЗС"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Очистка всех АЗС из базы данных
    """
    confirm_bool = confirm and confirm.lower() in ("true", "1", "yes")
    
    if not confirm_bool:
        raise HTTPException(
            status_code=400, 
            detail="Для очистки всех АЗС необходимо установить параметр confirm=true"
        )
    
    try:
        total_count = db.query(GasStation).count()
        db.query(GasStation).delete()
        db.commit()
        
        # Логируем действие пользователя
        if current_user:
            try:
                logging_service.log_user_action(
                    db=db,
                    user_id=current_user.id,
                    username=current_user.username,
                    action_type="clear",
                    action_description=f"Очищены все АЗС ({total_count} записей)",
                    action_category="gas_station",
                    entity_type="GasStation",
                    entity_id=None,
                    status="success",
                    extra_data={"deleted_count": total_count}
                )
            except Exception as e:
                logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
        
        logger.info(f"Очищены все АЗС", extra={"deleted_count": total_count})
        
        return {
            "message": f"Все АЗС успешно удалены",
            "deleted_count": total_count
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Ошибка при очистке АЗС", extra={"error": str(e)}, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка при очистке АЗС: {str(e)}")

