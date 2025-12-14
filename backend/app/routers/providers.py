"""
Роутер для работы с провайдерами
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.logger import logger
from app.models import Provider, ProviderTemplate, User
from app.auth import require_auth_if_enabled
from app.services.logging_service import logging_service
from app.schemas import (
    ProviderResponse, ProviderCreate, ProviderUpdate, ProviderListResponse,
    ProviderTemplateResponse, ProviderTemplateCreate, ProviderTemplateListResponse
)
from app.services.provider_service import ProviderService
from app.utils import serialize_template_json

router = APIRouter(prefix="/api/v1/providers", tags=["providers"])


@router.get("", response_model=ProviderListResponse)
async def get_providers(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_active: Optional[bool] = Query(None, description="Фильтр по активности"),
    db: Session = Depends(get_db)
):
    """
    Получение списка провайдеров
    """
    provider_service = ProviderService(db)
    providers, total = provider_service.get_providers(
        skip=skip,
        limit=limit,
        is_active=is_active
    )
    
    logger.debug("Список провайдеров загружен", extra={"total": total, "returned": len(providers)})
    
    return ProviderListResponse(total=total, items=providers)


@router.get("/{provider_id}", response_model=ProviderResponse)
async def get_provider(provider_id: int, db: Session = Depends(get_db)):
    """
    Получение провайдера по ID
    """
    provider_service = ProviderService(db)
    provider = provider_service.get_provider(provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Провайдер не найден")
    return provider


@router.post("", response_model=ProviderResponse)
async def create_provider(
    provider: ProviderCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Создание нового провайдера
    """
    provider_service = ProviderService(db)
    try:
        db_provider = provider_service.create_provider(
            name=provider.name,
            code=provider.code,
            organization_id=provider.organization_id,
            is_active=provider.is_active
        )
        
        # Логируем действие пользователя
        if current_user:
            try:
                logging_service.log_user_action(
                    db=db,
                    user_id=current_user.id,
                    username=current_user.username,
                    action_type="create",
                    action_description=f"Создан провайдер: {db_provider.name}",
                    action_category="provider",
                    entity_type="Provider",
                    entity_id=db_provider.id,
                    status="success"
                )
            except Exception as e:
                logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
        
        return db_provider
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{provider_id}", response_model=ProviderResponse)
async def update_provider(
    provider_id: int,
    provider: ProviderUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Обновление провайдера
    """
    provider_service = ProviderService(db)
    try:
        db_provider = provider_service.update_provider(
            provider_id=provider_id,
            name=provider.name,
            code=provider.code,
            organization_id=provider.organization_id,
            is_active=provider.is_active
        )
        if not db_provider:
            raise HTTPException(status_code=404, detail="Провайдер не найден")
        
        # Логируем действие пользователя
        if current_user:
            try:
                logging_service.log_user_action(
                    db=db,
                    user_id=current_user.id,
                    username=current_user.username,
                    action_type="update",
                    action_description=f"Обновлен провайдер: {db_provider.name}",
                    action_category="provider",
                    entity_type="Provider",
                    entity_id=db_provider.id,
                    status="success"
                )
            except Exception as e:
                logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
        
        return db_provider
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{provider_id}")
async def delete_provider(
    provider_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Удаление провайдера
    """
    provider_service = ProviderService(db)
    # Получаем информацию о провайдере перед удалением для логирования
    provider = provider_service.get_provider(provider_id)
    provider_name = provider.name if provider else f"ID {provider_id}"
    
    success = provider_service.delete_provider(provider_id)
    if not success:
        raise HTTPException(status_code=404, detail="Провайдер не найден")
    
    # Логируем действие пользователя
    if current_user:
        try:
            logging_service.log_user_action(
                db=db,
                user_id=current_user.id,
                username=current_user.username,
                action_type="delete",
                action_description=f"Удален провайдер: {provider_name}",
                action_category="provider",
                entity_type="Provider",
                entity_id=provider_id,
                status="success"
            )
        except Exception as e:
            logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    return {"message": "Провайдер успешно удален"}


@router.get("/{provider_id}/templates", response_model=ProviderTemplateListResponse)
async def get_provider_templates(
    provider_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_active: Optional[bool] = Query(None, description="Фильтр по активности"),
    db: Session = Depends(get_db)
):
    """
    Получение списка шаблонов провайдера
    """
    provider_service = ProviderService(db)
    templates, total = provider_service.get_provider_templates(
        provider_id=provider_id,
        skip=skip,
        limit=limit,
        is_active=is_active
    )
    
    if total == 0 and not provider_service.get_provider(provider_id):
        raise HTTPException(status_code=404, detail="Провайдер не найден")
    
    logger.debug("Список шаблонов провайдера загружен", extra={"provider_id": provider_id, "total": total})
    
    return ProviderTemplateListResponse(total=total, items=templates)


@router.post("/{provider_id}/templates", response_model=ProviderTemplateResponse)
async def create_template(
    provider_id: int,
    template: ProviderTemplateCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Создание нового шаблона провайдера
    """
    logger.info("Получен запрос на создание шаблона", extra={
        "provider_id": provider_id,
        "template_name": template.name,
        "connection_type": template.connection_type
    })
    
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Провайдер не найден")
    
    # Убеждаемся, что provider_id в теле запроса совпадает с URL (если указан)
    if template.provider_id != provider_id:
        logger.warning("Несоответствие provider_id", extra={
            "url_provider_id": provider_id,
            "body_provider_id": template.provider_id
        })
        raise HTTPException(
            status_code=400,
            detail=f"provider_id в теле запроса ({template.provider_id}) не совпадает с ID в URL ({provider_id})"
        )
    
    # Конвертируем field_mapping в JSON строку
    field_mapping_json = serialize_template_json(template.field_mapping)
    
    # Конвертируем connection_settings в JSON строку, если указаны
    connection_settings_json = serialize_template_json(template.connection_settings)
    
    # Конвертируем fuel_type_mapping в JSON строку, если указано
    fuel_type_mapping_json = serialize_template_json(template.fuel_type_mapping) if template.fuel_type_mapping else None
    
    db_template = ProviderTemplate(
        provider_id=provider_id,
        name=template.name,
        description=template.description,
        connection_type=template.connection_type if template.connection_type else "file",
        connection_settings=connection_settings_json,
        field_mapping=field_mapping_json,
        header_row=template.header_row if template.header_row is not None else 0,
        data_start_row=template.data_start_row if template.data_start_row is not None else 1,
        source_table=template.source_table,
        source_query=template.source_query,
        fuel_type_mapping=fuel_type_mapping_json,
        is_active=template.is_active if template.is_active is not None else True,
        auto_load_enabled=template.auto_load_enabled if template.auto_load_enabled is not None else False,
        auto_load_schedule=template.auto_load_schedule,
        auto_load_date_from_offset=template.auto_load_date_from_offset if template.auto_load_date_from_offset is not None else -7,
        auto_load_date_to_offset=template.auto_load_date_to_offset if template.auto_load_date_to_offset is not None else -1
    )
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    
    logger.info("Шаблон создан", extra={"template_id": db_template.id, "provider_id": provider_id})
    
    # Логируем действие пользователя
    if current_user:
        try:
            logging_service.log_user_action(
                db=db,
                user_id=current_user.id,
                username=current_user.username,
                action_type="create",
                action_description=f"Создан шаблон: {db_template.name}",
                action_category="template",
                entity_type="ProviderTemplate",
                entity_id=db_template.id,
                status="success",
                extra_data={"provider_id": provider_id}
            )
        except Exception as e:
            logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    # Перезагружаем расписания, если у нового шаблона включена автозагрузка
    if db_template.auto_load_enabled and db_template.auto_load_schedule:
        try:
            from app.services.scheduler_service import SchedulerService
            scheduler = SchedulerService.get_instance()
            scheduler.reload_schedules()
            logger.info("Расписания автоматической загрузки перезагружены после создания шаблона", extra={
                "template_id": db_template.id
            })
        except Exception as e:
            logger.warning("Не удалось перезагрузить расписания после создания шаблона", extra={
                "template_id": db_template.id,
                "error": str(e)
            })
    
    # Явно преобразуем объект SQLAlchemy в Pydantic модель для корректной сериализации
    try:
        template_response = ProviderTemplateResponse.model_validate(db_template)
        return template_response
    except Exception as e:
        logger.error(f"Ошибка при преобразовании шаблона в ответ: {e}", exc_info=True)
        # Если преобразование не удалось, возвращаем объект напрямую (FastAPI попытается сериализовать)
        return db_template
