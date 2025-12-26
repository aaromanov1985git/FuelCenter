"""
Роутер для работы с транспортными средствами
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.logger import logger
from app.models import Vehicle, User
from app.schemas import VehicleResponse, VehicleUpdate, VehicleListResponse, MergeRequest, MergeResponse
from app.services.vehicle_service import VehicleService
from app.auth import optional_auth_with_token, get_user_organization_ids, require_auth_if_enabled, require_admin
from app.services.logging_service import logging_service
from app.services.cache_service import invalidate_vehicles_cache, invalidate_dashboard_cache, cached

router = APIRouter(prefix="/api/v1/vehicles", tags=["vehicles"])


@router.get("", response_model=VehicleListResponse)
@cached(ttl=300, prefix="vehicles")
async def get_vehicles(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_validated: Optional[str] = Query(None, description="Фильтр по статусу валидации"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(optional_auth_with_token)
):
    """
    Получение списка транспортных средств
    Фильтруется по доступным организациям пользователя
    """
    # Получаем ID доступных организаций пользователя
    organization_ids = None
    if current_user:
        organization_ids = get_user_organization_ids(db, current_user)
    
    vehicle_service = VehicleService(db)
    vehicles, total = vehicle_service.get_vehicles(
        skip=skip,
        limit=limit,
        is_validated=is_validated,
        organization_ids=organization_ids
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
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Обновление данных ТС
    """
    # Получаем все поля из запроса, включая None значения
    update_data = vehicle_update.model_dump(exclude_unset=False)
    logger.info(
        "Обновление ТС",
        extra={
            "vehicle_id": vehicle_id,
            "update_data": update_data,
            "organization_id": vehicle_update.organization_id
        }
    )
    vehicle_service = VehicleService(db)
    vehicle = vehicle_service.update_vehicle(
        vehicle_id=vehicle_id,
        garage_number=vehicle_update.garage_number,
        license_plate=vehicle_update.license_plate,
        is_validated=vehicle_update.is_validated,
        organization_id=vehicle_update.organization_id
    )
    
    if not vehicle:
        raise HTTPException(status_code=404, detail="Транспортное средство не найдено")
    
    # Логируем действие пользователя
    if current_user:
        try:
            logging_service.log_user_action(
                db=db,
                user_id=current_user.id,
                username=current_user.username,
                action_type="update",
                action_description=f"Обновлено транспортное средство: {vehicle.original_name}",
                action_category="vehicle",
                entity_type="Vehicle",
                entity_id=vehicle_id,
                status="success"
            )
        except Exception as e:
            logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    # Инвалидируем кэш транспортных средств и дашборда
    invalidate_vehicles_cache()
    invalidate_dashboard_cache()
    logger.debug("Кэш транспортных средств и дашборда инвалидирован после обновления ТС")
    
    return vehicle


@router.post("/{vehicle_id}/merge", response_model=MergeResponse)
async def merge_vehicles(
    vehicle_id: int,
    merge_request: MergeRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
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
        
        # Логируем действие пользователя
        if current_user:
            try:
                logging_service.log_user_action(
                    db=db,
                    user_id=current_user.id,
                    username=current_user.username,
                    action_type="merge",
                    action_description=f"Объединены ТС: '{source_vehicle.original_name}' с '{target_vehicle.original_name}'",
                    action_category="vehicle",
                    entity_type="Vehicle",
                    entity_id=merge_request.target_id,
                    status="success",
                    extra_data={
                        "source_vehicle_id": vehicle_id,
                        "target_vehicle_id": merge_request.target_id
                    }
                )
            except Exception as e:
                logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
        
        # Инвалидируем кэш транспортных средств и дашборда
        invalidate_vehicles_cache()
        invalidate_dashboard_cache()
        logger.debug("Кэш транспортных средств и дашборда инвалидирован после слияния ТС")
        
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


@router.delete("/clear")
async def clear_all_vehicles(
    confirm: Optional[str] = Query(None, description="Подтверждение удаления всех транспортных средств"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Очистка всех транспортных средств из базы данных
    """
    confirm_bool = confirm and confirm.lower() in ("true", "1", "yes")
    
    if not confirm_bool:
        raise HTTPException(
            status_code=400, 
            detail="Для очистки всех транспортных средств необходимо установить параметр confirm=true"
        )
    
    try:
        total_count = db.query(Vehicle).count()
        db.query(Vehicle).delete()
        db.commit()
        
        # Логируем действие пользователя
        if current_user:
            try:
                logging_service.log_user_action(
                    db=db,
                    user_id=current_user.id,
                    username=current_user.username,
                    action_type="clear",
                    action_description=f"Очищены все транспортные средства ({total_count} записей)",
                    action_category="vehicle",
                    entity_type="Vehicle",
                    entity_id=None,
                    status="success",
                    extra_data={"deleted_count": total_count}
                )
            except Exception as e:
                logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
        
        logger.info(f"Очищены все транспортные средства", extra={"deleted_count": total_count})
        
        # Инвалидируем кэш транспортных средств и дашборда
        invalidate_vehicles_cache()
        invalidate_dashboard_cache()
        logger.debug("Кэш транспортных средств и дашборда инвалидирован после очистки всех ТС")
        
        return {
            "message": f"Все транспортные средства успешно удалены",
            "deleted_count": total_count
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Ошибка при очистке транспортных средств", extra={"error": str(e)}, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка при очистке транспортных средств: {str(e)}")
