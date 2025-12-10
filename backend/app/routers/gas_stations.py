"""
Роутер для работы с автозаправочными станциями (АЗС)
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.logger import logger
from app.models import GasStation
from app.schemas import GasStationResponse, GasStationUpdate, GasStationListResponse
from app.services.gas_station_service import GasStationService

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
    db: Session = Depends(get_db)
):
    """
    Обновление данных АЗС
    """
    gas_station_service = GasStationService(db)
    gas_station = gas_station_service.update_gas_station(
        gas_station_id=gas_station_id,
        original_name=gas_station_update.original_name,
        azs_number=gas_station_update.azs_number,
        location=gas_station_update.location,
        region=gas_station_update.region,
        settlement=gas_station_update.settlement,
        is_validated=gas_station_update.is_validated
    )
    
    if not gas_station:
        raise HTTPException(status_code=404, detail="АЗС не найдена")
    
    logger.info("АЗС обновлена", extra={"gas_station_id": gas_station_id})
    
    return gas_station

