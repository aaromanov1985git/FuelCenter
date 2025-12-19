"""
Роутер для управления настройками нормализации
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
import json
from app.database import get_db
from app.logger import logger
from app.models import NormalizationSettings, User
from app.schemas import (
    NormalizationSettingsResponse, NormalizationSettingsCreate, 
    NormalizationSettingsUpdate, NormalizationSettingsListResponse
)
from app.auth import require_auth_if_enabled, require_admin
from app.services.logging_service import logging_service

router = APIRouter(prefix="/api/v1/normalization-settings", tags=["normalization-settings"])


@router.get("", response_model=NormalizationSettingsListResponse)
async def get_normalization_settings(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Получение списка всех настроек нормализации
    """
    settings = db.query(NormalizationSettings).all()
    
    # Преобразуем options из JSON в объект
    items = []
    for setting in settings:
        setting_dict = {
            "id": setting.id,
            "dictionary_type": setting.dictionary_type,
            "options": {},
            "created_at": setting.created_at,
            "updated_at": setting.updated_at
        }
        
        if setting.options:
            try:
                if isinstance(setting.options, str):
                    setting_dict["options"] = json.loads(setting.options)
                else:
                    setting_dict["options"] = setting.options
            except (json.JSONDecodeError, TypeError):
                setting_dict["options"] = {}
        
        items.append(NormalizationSettingsResponse(**setting_dict))
    
    return NormalizationSettingsListResponse(total=len(items), items=items)


@router.get("/{dictionary_type}", response_model=NormalizationSettingsResponse)
async def get_normalization_setting(
    dictionary_type: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Получение настроек нормализации для конкретного типа справочника
    """
    setting = db.query(NormalizationSettings).filter(
        NormalizationSettings.dictionary_type == dictionary_type
    ).first()
    
    if not setting:
        raise HTTPException(status_code=404, detail=f"Настройки нормализации для типа '{dictionary_type}' не найдены")
    
    setting_dict = {
        "id": setting.id,
        "dictionary_type": setting.dictionary_type,
        "options": {},
        "created_at": setting.created_at,
        "updated_at": setting.updated_at
    }
    
    if setting.options:
        try:
            if isinstance(setting.options, str):
                setting_dict["options"] = json.loads(setting.options)
            else:
                setting_dict["options"] = setting.options
        except (json.JSONDecodeError, TypeError):
            setting_dict["options"] = {}
    
    return NormalizationSettingsResponse(**setting_dict)


@router.post("", response_model=NormalizationSettingsResponse)
async def create_normalization_setting(
    setting_data: NormalizationSettingsCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Создание настроек нормализации
    """
    # Проверяем, не существует ли уже настройки для этого типа
    existing = db.query(NormalizationSettings).filter(
        NormalizationSettings.dictionary_type == setting_data.dictionary_type
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Настройки нормализации для типа '{setting_data.dictionary_type}' уже существуют. Используйте PUT для обновления."
        )
    
    # Преобразуем options в JSON строку
    options_json = json.dumps(setting_data.options.model_dump(), ensure_ascii=False)
    
    db_setting = NormalizationSettings(
        dictionary_type=setting_data.dictionary_type,
        options=options_json
    )
    
    db.add(db_setting)
    db.commit()
    db.refresh(db_setting)
    
    logger.info(f"Созданы настройки нормализации: {setting_data.dictionary_type}", extra={
        "dictionary_type": setting_data.dictionary_type
    })
    
    # Логируем действие пользователя
    if current_user:
        try:
            logging_service.log_user_action(
                db=db,
                user_id=current_user.id,
                username=current_user.username,
                action_type="create",
                action_description=f"Созданы настройки нормализации: {setting_data.dictionary_type}",
                action_category="normalization",
                entity_type="NormalizationSettings",
                entity_id=db_setting.id,
                status="success"
            )
        except Exception as e:
            logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    setting_dict = {
        "id": db_setting.id,
        "dictionary_type": db_setting.dictionary_type,
        "options": setting_data.options.model_dump(),
        "created_at": db_setting.created_at,
        "updated_at": db_setting.updated_at
    }
    
    return NormalizationSettingsResponse(**setting_dict)


@router.put("/{dictionary_type}", response_model=NormalizationSettingsResponse)
async def update_normalization_setting(
    dictionary_type: str,
    setting_data: NormalizationSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Обновление настроек нормализации
    """
    setting = db.query(NormalizationSettings).filter(
        NormalizationSettings.dictionary_type == dictionary_type
    ).first()
    
    if not setting:
        raise HTTPException(
            status_code=404,
            detail=f"Настройки нормализации для типа '{dictionary_type}' не найдены"
        )
    
    if setting_data.options:
        # Преобразуем options в JSON строку
        options_json = json.dumps(setting_data.options.model_dump(), ensure_ascii=False)
        setting.options = options_json
    
    db.commit()
    db.refresh(setting)
    
    logger.info(f"Обновлены настройки нормализации: {dictionary_type}", extra={
        "dictionary_type": dictionary_type
    })
    
    # Логируем действие пользователя
    if current_user:
        try:
            logging_service.log_user_action(
                db=db,
                user_id=current_user.id,
                username=current_user.username,
                action_type="update",
                action_description=f"Обновлены настройки нормализации: {dictionary_type}",
                action_category="normalization",
                entity_type="NormalizationSettings",
                entity_id=setting.id,
                status="success"
            )
        except Exception as e:
            logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    setting_dict = {
        "id": setting.id,
        "dictionary_type": setting.dictionary_type,
        "options": setting_data.options.model_dump() if setting_data.options else {},
        "created_at": setting.created_at,
        "updated_at": setting.updated_at
    }
    
    if not setting_data.options and setting.options:
        try:
            if isinstance(setting.options, str):
                setting_dict["options"] = json.loads(setting.options)
            else:
                setting_dict["options"] = setting.options
        except (json.JSONDecodeError, TypeError):
            setting_dict["options"] = {}
    
    return NormalizationSettingsResponse(**setting_dict)


@router.delete("/{dictionary_type}")
async def delete_normalization_setting(
    dictionary_type: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Удаление настроек нормализации
    """
    setting = db.query(NormalizationSettings).filter(
        NormalizationSettings.dictionary_type == dictionary_type
    ).first()
    
    if not setting:
        raise HTTPException(
            status_code=404,
            detail=f"Настройки нормализации для типа '{dictionary_type}' не найдены"
        )
    
    setting_id = setting.id
    db.delete(setting)
    db.commit()
    
    logger.info(f"Удалены настройки нормализации: {dictionary_type}", extra={
        "dictionary_type": dictionary_type
    })
    
    # Логируем действие пользователя
    if current_user:
        try:
            logging_service.log_user_action(
                db=db,
                user_id=current_user.id,
                username=current_user.username,
                action_type="delete",
                action_description=f"Удалены настройки нормализации: {dictionary_type}",
                action_category="normalization",
                entity_type="NormalizationSettings",
                entity_id=setting_id,
                status="success"
            )
        except Exception as e:
            logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    return {"message": f"Настройки нормализации для типа '{dictionary_type}' успешно удалены"}
