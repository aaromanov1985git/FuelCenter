"""
Роутер для работы с транспортными средствами
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.logger import logger
from app.models import Vehicle
from app.schemas import VehicleResponse, VehicleUpdate, VehicleListResponse, MergeRequest, MergeResponse
from app.services.vehicle_service import VehicleService

router = APIRouter(prefix="/api/v1/vehicles", tags=["vehicles"])


@router.get("", response_model=VehicleListResponse)
async def get_vehicles(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_validated: Optional[str] = Query(None, description="Фильтр по статусу валидации"),
    db: Session = Depends(get_db)
):
    """
    Получение списка транспортных средств
    """
    vehicle_service = VehicleService(db)
    vehicles, total = vehicle_service.get_vehicles(
        skip=skip,
        limit=limit,
        is_validated=is_validated
    )
    
    logger.debug("Список ТС загружен", extra={"total": total, "returned": len(vehicles)})
    
    return VehicleListResponse(total=total, items=vehicles)


@router.get("/{vehicle_id}", response_model=VehicleResponse)
async def get_vehicle(vehicle_id: int, db: Session = Depends(get_db)):
    """
    Получение ТС по ID
    """
    vehicle_service = VehicleService(db)
    vehicle = vehicle_service.get_vehicle(vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Транспортное средство не найдено")
    return vehicle


@router.put("/{vehicle_id}", response_model=VehicleResponse)
async def update_vehicle(
    vehicle_id: int,
    vehicle_update: VehicleUpdate,
    db: Session = Depends(get_db)
):
    """
    Обновление данных ТС
    """
    vehicle_service = VehicleService(db)
    vehicle = vehicle_service.update_vehicle(
        vehicle_id=vehicle_id,
        garage_number=vehicle_update.garage_number,
        license_plate=vehicle_update.license_plate,
        is_validated=vehicle_update.is_validated
    )
    
    if not vehicle:
        raise HTTPException(status_code=404, detail="Транспортное средство не найдено")
    
    return vehicle


@router.post("/{vehicle_id}/merge", response_model=MergeResponse)
async def merge_vehicles(
    vehicle_id: int,
    merge_request: MergeRequest,
    db: Session = Depends(get_db)
):
    """
    Слияние двух транспортных средств
    
    Все транзакции и связи с vehicle_id переносятся на target_id,
    после чего vehicle_id удаляется
    """
    vehicle_service = VehicleService(db)
    
    # Проверяем существование обоих ТС
    source_vehicle = vehicle_service.get_vehicle(vehicle_id)
    target_vehicle = vehicle_service.get_vehicle(merge_request.target_id)
    
    if not source_vehicle:
        raise HTTPException(status_code=404, detail="Исходное транспортное средство не найдено")
    
    if not target_vehicle:
        raise HTTPException(status_code=404, detail="Целевое транспортное средство не найдено")
    
    if vehicle_id == merge_request.target_id:
        raise HTTPException(status_code=400, detail="Нельзя объединить ТС с самим собой")
    
    try:
        result = vehicle_service.merge_vehicles(vehicle_id, merge_request.target_id)
        
        if not result:
            raise HTTPException(status_code=500, detail="Ошибка при слиянии ТС")
        
        logger.info(
            "ТС успешно объединены",
            extra={
                "source_vehicle_id": vehicle_id,
                "target_vehicle_id": merge_request.target_id
            }
        )
        
        return MergeResponse(
            success=True,
            message=f"ТС '{source_vehicle.original_name}' успешно объединено с '{target_vehicle.original_name}'"
        )
    except Exception as e:
        db.rollback()
        logger.error(
            "Ошибка при слиянии ТС",
            extra={
                "source_vehicle_id": vehicle_id,
                "target_vehicle_id": merge_request.target_id,
                "error": str(e)
            },
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Ошибка при слиянии ТС: {str(e)}")
