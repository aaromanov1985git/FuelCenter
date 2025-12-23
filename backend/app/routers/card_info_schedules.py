"""
Роутер для управления регламентами получения информации по картам
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
import json
from app.database import get_db
from app.logger import logger
from app.models import CardInfoSchedule, ProviderTemplate, User
from app.schemas import (
    CardInfoScheduleResponse, CardInfoScheduleCreate, 
    CardInfoScheduleUpdate, CardInfoScheduleListResponse, CardInfoScheduleRunResult
)
from app.auth import require_auth_if_enabled, require_admin
from app.services.logging_service import logging_service
from app.services.scheduler_service import SchedulerService

router = APIRouter(prefix="/api/v1/card-info-schedules", tags=["card-info-schedules"])


@router.get("", response_model=CardInfoScheduleListResponse)
async def get_card_info_schedules(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Получение списка всех регламентов получения информации по картам
    """
    schedules = db.query(CardInfoSchedule).all()
    
    items = []
    for schedule in schedules:
        schedule_dict = {
            "id": schedule.id,
            "name": schedule.name,
            "description": schedule.description,
            "provider_template_id": schedule.provider_template_id,
            "schedule": schedule.schedule,
            "filter_options": {},
            "auto_update": schedule.auto_update,
            "flags": schedule.flags,
            "is_active": schedule.is_active,
            "last_run_date": schedule.last_run_date,
            "last_run_result": None,
            "created_at": schedule.created_at,
            "updated_at": schedule.updated_at
        }
        
        # Парсим filter_options
        if schedule.filter_options:
            try:
                if isinstance(schedule.filter_options, str):
                    schedule_dict["filter_options"] = json.loads(schedule.filter_options)
                else:
                    schedule_dict["filter_options"] = schedule.filter_options
            except (json.JSONDecodeError, TypeError):
                schedule_dict["filter_options"] = {}
        
        # Парсим last_run_result
        if schedule.last_run_result:
            try:
                if isinstance(schedule.last_run_result, str):
                    schedule_dict["last_run_result"] = json.loads(schedule.last_run_result)
                else:
                    schedule_dict["last_run_result"] = schedule.last_run_result
            except (json.JSONDecodeError, TypeError):
                schedule_dict["last_run_result"] = None
        
        items.append(CardInfoScheduleResponse(**schedule_dict))
    
    return CardInfoScheduleListResponse(total=len(items), items=items)


@router.get("/{schedule_id}", response_model=CardInfoScheduleResponse)
async def get_card_info_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Получение регламента по ID
    """
    schedule = db.query(CardInfoSchedule).filter(CardInfoSchedule.id == schedule_id).first()
    
    if not schedule:
        raise HTTPException(status_code=404, detail="Регламент не найден")
    
    schedule_dict = {
        "id": schedule.id,
        "name": schedule.name,
        "description": schedule.description,
        "provider_template_id": schedule.provider_template_id,
        "schedule": schedule.schedule,
        "filter_options": {},
        "auto_update": schedule.auto_update,
        "flags": schedule.flags,
        "is_active": schedule.is_active,
        "last_run_date": schedule.last_run_date,
        "last_run_result": None,
        "created_at": schedule.created_at,
        "updated_at": schedule.updated_at
    }
    
    # Парсим filter_options
    if schedule.filter_options:
        try:
            if isinstance(schedule.filter_options, str):
                schedule_dict["filter_options"] = json.loads(schedule.filter_options)
            else:
                schedule_dict["filter_options"] = schedule.filter_options
        except (json.JSONDecodeError, TypeError):
            schedule_dict["filter_options"] = {}
    
    # Парсим last_run_result
    if schedule.last_run_result:
        try:
            if isinstance(schedule.last_run_result, str):
                schedule_dict["last_run_result"] = json.loads(schedule.last_run_result)
            else:
                schedule_dict["last_run_result"] = schedule.last_run_result
        except (json.JSONDecodeError, TypeError):
            schedule_dict["last_run_result"] = None
    
    return CardInfoScheduleResponse(**schedule_dict)


@router.post("", response_model=CardInfoScheduleResponse)
async def create_card_info_schedule(
    schedule_data: CardInfoScheduleCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Создание регламента получения информации по картам
    """
    # Проверяем шаблон провайдера
    template = db.query(ProviderTemplate).filter(
        ProviderTemplate.id == schedule_data.provider_template_id
    ).first()
    
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон провайдера не найден")
    
    if template.connection_type not in ["web", "api"]:
        raise HTTPException(
            status_code=400,
            detail=f"Шаблон должен иметь тип подключения 'web' или 'api', получен: {template.connection_type}"
        )
    
    # Преобразуем filter_options в JSON
    filter_options_json = json.dumps(
        schedule_data.filter_options.model_dump() if schedule_data.filter_options else {},
        ensure_ascii=False
    )
    
    db_schedule = CardInfoSchedule(
        name=schedule_data.name,
        description=schedule_data.description,
        provider_template_id=schedule_data.provider_template_id,
        schedule=schedule_data.schedule,
        filter_options=filter_options_json,
        auto_update=schedule_data.auto_update if schedule_data.auto_update is not None else True,
        flags=schedule_data.flags if schedule_data.flags is not None else 23,
        is_active=schedule_data.is_active if schedule_data.is_active is not None else True
    )
    
    db.add(db_schedule)
    db.commit()
    db.refresh(db_schedule)
    
    logger.info(f"Создан регламент получения информации по картам: {schedule_data.name}", extra={
        "schedule_id": db_schedule.id
    })
    
    # Перезагружаем расписания в планировщике
    try:
        scheduler = SchedulerService.get_instance()
        scheduler.reload_schedules()
    except Exception as e:
        logger.error(f"Ошибка при перезагрузке расписаний: {e}", exc_info=True)
    
    # Логируем действие пользователя
    if current_user:
        try:
            logging_service.log_user_action(
                db=db,
                user_id=current_user.id,
                username=current_user.username,
                action_type="create",
                action_description=f"Создан регламент получения информации по картам: {schedule_data.name}",
                action_category="card_info_schedule",
                entity_type="CardInfoSchedule",
                entity_id=db_schedule.id,
                status="success"
            )
        except Exception as e:
            logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    # Формируем ответ
    schedule_dict = {
        "id": db_schedule.id,
        "name": db_schedule.name,
        "description": db_schedule.description,
        "provider_template_id": db_schedule.provider_template_id,
        "schedule": db_schedule.schedule,
        "filter_options": schedule_data.filter_options.model_dump() if schedule_data.filter_options else {},
        "auto_update": db_schedule.auto_update,
        "flags": db_schedule.flags,
        "is_active": db_schedule.is_active,
        "last_run_date": db_schedule.last_run_date,
        "last_run_result": None,
        "created_at": db_schedule.created_at,
        "updated_at": db_schedule.updated_at
    }
    
    return CardInfoScheduleResponse(**schedule_dict)


@router.put("/{schedule_id}", response_model=CardInfoScheduleResponse)
async def update_card_info_schedule(
    schedule_id: int,
    schedule_data: CardInfoScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Обновление регламента получения информации по картам
    """
    schedule = db.query(CardInfoSchedule).filter(CardInfoSchedule.id == schedule_id).first()
    
    if not schedule:
        raise HTTPException(status_code=404, detail="Регламент не найден")
    
    # Обновляем поля
    if schedule_data.name is not None:
        schedule.name = schedule_data.name
    if schedule_data.description is not None:
        schedule.description = schedule_data.description
    if schedule_data.provider_template_id is not None:
        # Проверяем шаблон провайдера
        template = db.query(ProviderTemplate).filter(
            ProviderTemplate.id == schedule_data.provider_template_id
        ).first()
        if not template:
            raise HTTPException(status_code=404, detail="Шаблон провайдера не найден")
        if template.connection_type != "web":
            raise HTTPException(
                status_code=400,
                detail=f"Шаблон должен иметь тип подключения 'web', получен: {template.connection_type}"
            )
        schedule.provider_template_id = schedule_data.provider_template_id
    if schedule_data.schedule is not None:
        schedule.schedule = schedule_data.schedule
    if schedule_data.filter_options is not None:
        schedule.filter_options = json.dumps(
            schedule_data.filter_options.model_dump(),
            ensure_ascii=False
        )
    if schedule_data.auto_update is not None:
        schedule.auto_update = schedule_data.auto_update
    if schedule_data.flags is not None:
        schedule.flags = schedule_data.flags
    if schedule_data.is_active is not None:
        schedule.is_active = schedule_data.is_active
    
    db.commit()
    db.refresh(schedule)
    
    logger.info(f"Обновлен регламент получения информации по картам: {schedule.name}", extra={
        "schedule_id": schedule.id
    })
    
    # Перезагружаем расписания в планировщике
    try:
        scheduler = SchedulerService.get_instance()
        scheduler.reload_schedules()
    except Exception as e:
        logger.error(f"Ошибка при перезагрузке расписаний: {e}", exc_info=True)
    
    # Логируем действие пользователя
    if current_user:
        try:
            logging_service.log_user_action(
                db=db,
                user_id=current_user.id,
                username=current_user.username,
                action_type="update",
                action_description=f"Обновлен регламент получения информации по картам: {schedule.name}",
                action_category="card_info_schedule",
                entity_type="CardInfoSchedule",
                entity_id=schedule.id,
                status="success"
            )
        except Exception as e:
            logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    # Формируем ответ
    schedule_dict = {
        "id": schedule.id,
        "name": schedule.name,
        "description": schedule.description,
        "provider_template_id": schedule.provider_template_id,
        "schedule": schedule.schedule,
        "filter_options": {},
        "auto_update": schedule.auto_update,
        "flags": schedule.flags,
        "is_active": schedule.is_active,
        "last_run_date": schedule.last_run_date,
        "last_run_result": None,
        "created_at": schedule.created_at,
        "updated_at": schedule.updated_at
    }
    
    # Парсим filter_options
    if schedule.filter_options:
        try:
            if isinstance(schedule.filter_options, str):
                schedule_dict["filter_options"] = json.loads(schedule.filter_options)
            else:
                schedule_dict["filter_options"] = schedule.filter_options
        except (json.JSONDecodeError, TypeError):
            schedule_dict["filter_options"] = {}
    
    return CardInfoScheduleResponse(**schedule_dict)


@router.delete("/{schedule_id}")
async def delete_card_info_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Удаление регламента получения информации по картам
    """
    schedule = db.query(CardInfoSchedule).filter(CardInfoSchedule.id == schedule_id).first()
    
    if not schedule:
        raise HTTPException(status_code=404, detail="Регламент не найден")
    
    schedule_name = schedule.name
    db.delete(schedule)
    db.commit()
    
    logger.info(f"Удален регламент получения информации по картам: {schedule_name}", extra={
        "schedule_id": schedule_id
    })
    
    # Перезагружаем расписания в планировщике
    try:
        scheduler = SchedulerService.get_instance()
        scheduler.reload_schedules()
    except Exception as e:
        logger.error(f"Ошибка при перезагрузке расписаний: {e}", exc_info=True)
    
    # Логируем действие пользователя
    if current_user:
        try:
            logging_service.log_user_action(
                db=db,
                user_id=current_user.id,
                username=current_user.username,
                action_type="delete",
                action_description=f"Удален регламент получения информации по картам: {schedule_name}",
                action_category="card_info_schedule",
                entity_type="CardInfoSchedule",
                entity_id=schedule_id,
                status="success"
            )
        except Exception as e:
            logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    return {"message": f"Регламент '{schedule_name}' успешно удален"}


@router.post("/{schedule_id}/run")
async def run_card_info_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Ручной запуск регламента получения информации по картам
    """
    from app.services.card_info_schedule_service import CardInfoScheduleService
    
    schedule = db.query(CardInfoSchedule).filter(CardInfoSchedule.id == schedule_id).first()
    
    if not schedule:
        raise HTTPException(status_code=404, detail="Регламент не найден")
    
    try:
        service = CardInfoScheduleService(db)
        result = await service.execute_schedule(schedule)
        
        return {
            "status": "success",
            "result": result
        }
    except Exception as e:
        logger.error(f"Ошибка при ручном запуске регламента: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка выполнения регламента: {str(e)}")
