"""
Роутер для работы с топливными картами
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.logger import logger
from app.models import Vehicle, FuelCard, User, ProviderTemplate
from app.services.normalization_service import normalize_owner_name, get_normalization_settings
from app.schemas import (
    FuelCardResponse, FuelCardUpdate, FuelCardListResponse,
    CardAssignmentRequest, CardAssignmentResponse, MergeRequest, MergeResponse,
    CardInfoRequest, CardInfoResponse, NormalizeOwnerRequest, NormalizeOwnerResponse
)
from app.services import assign_card_to_vehicle
from app.auth import require_auth_if_enabled, require_admin
from app.services.logging_service import logging_service
from app.services.cache_service import invalidate_fuel_cards_cache, invalidate_dashboard_cache, cached

router = APIRouter(prefix="/api/v1/fuel-cards", tags=["fuel-cards"])


@router.get("", response_model=FuelCardListResponse)
@cached(ttl=300, prefix="fuel_cards")
async def get_fuel_cards(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=10000),
    vehicle_id: Optional[int] = Query(None, description="Фильтр по ID ТС"),
    provider_id: Optional[int] = Query(None, description="Фильтр по ID провайдера"),
    card_number: Optional[str] = Query(None, description="Фильтр по номеру карты (частичное совпадение)"),
    is_blocked: Optional[bool] = Query(None, description="Фильтр по статусу блокировки (true - только заблокированные, false - только незаблокированные)"),
    db: Session = Depends(get_db)
):
    """
    Получение списка топливных карт
    """
    query = db.query(FuelCard)
    
    if vehicle_id:
        query = query.filter(FuelCard.vehicle_id == vehicle_id)
    
    if provider_id:
        query = query.filter(FuelCard.provider_id == provider_id)
    
    if card_number:
        query = query.filter(FuelCard.card_number.ilike(f"%{card_number}%"))
    
    if is_blocked is not None:
        query = query.filter(FuelCard.is_blocked == is_blocked)
    
    total = query.count()
    cards = query.order_by(FuelCard.created_at.desc()).offset(skip).limit(limit).all()
    
    logger.debug("Список топливных карт загружен", extra={
        "total": total, 
        "returned": len(cards), 
        "is_blocked_filter": is_blocked,
        "provider_id": provider_id,
        "card_number": card_number
    })
    
    return FuelCardListResponse(total=total, items=cards)


@router.get("/{card_id}", response_model=FuelCardResponse)
async def get_fuel_card(card_id: int, db: Session = Depends(get_db)):
    """
    Получение карты по ID
    """
    card = db.query(FuelCard).filter(FuelCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Топливная карта не найдена")
    return card


@router.put("/{card_id}", response_model=FuelCardResponse)
async def update_fuel_card(
    card_id: int,
    card_data: FuelCardUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Обновление топливной карты
    """
    card = db.query(FuelCard).filter(FuelCard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Топливная карта не найдена")
    
    if card_data.provider_id is not None:
        card.provider_id = card_data.provider_id
    if card_data.vehicle_id is not None:
        # Проверяем существование ТС
        vehicle = db.query(Vehicle).filter(Vehicle.id == card_data.vehicle_id).first()
        if not vehicle:
            raise HTTPException(status_code=404, detail="Транспортное средство не найдено")
        card.vehicle_id = card_data.vehicle_id
    if card_data.assignment_start_date is not None:
        card.assignment_start_date = card_data.assignment_start_date
    if card_data.assignment_end_date is not None:
        card.assignment_end_date = card_data.assignment_end_date
    if card_data.is_active_assignment is not None:
        card.is_active_assignment = card_data.is_active_assignment
    if card_data.is_blocked is not None:
        card.is_blocked = card_data.is_blocked
    if card_data.normalized_owner is not None:
        card.normalized_owner = card_data.normalized_owner
    
    # Если изменился original_owner_name (через API), нормализуем его
    if card.original_owner_name and not card.normalized_owner:
        normalized_data = normalize_owner_name(card.original_owner_name, db=db, dictionary_type="fuel_card_owner")
        if normalized_data.get('normalized'):
            card.normalized_owner = normalized_data['normalized']
    
    db.commit()
    db.refresh(card)
    
    logger.info(f"Топливная карта обновлена", extra={"card_id": card_id})
    
    # Логируем действие пользователя
    if current_user:
        try:
            logging_service.log_user_action(
                db=db,
                user_id=current_user.id,
                username=current_user.username,
                action_type="update",
                action_description=f"Обновлена топливная карта: {card.card_number}",
                action_category="fuel_card",
                entity_type="FuelCard",
                entity_id=card_id,
                status="success"
            )
        except Exception as e:
            logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    # Инвалидируем кэш топливных карт и дашборда
    invalidate_fuel_cards_cache()
    invalidate_dashboard_cache()
    logger.debug("Кэш топливных карт и дашборда инвалидирован после обновления карты")
    
    return card


@router.post("/assign", response_model=CardAssignmentResponse)
async def assign_card(
    assignment: CardAssignmentRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Закрепление карты за ТС с проверкой пересечений
    """
    success, message, overlaps = assign_card_to_vehicle(
        db,
        assignment.card_id,
        assignment.vehicle_id,
        assignment.start_date,
        assignment.end_date,
        assignment.check_overlap
    )
    
    logger.info(
        "Попытка закрепления карты за ТС",
        extra={
            "card_id": assignment.card_id,
            "vehicle_id": assignment.vehicle_id,
            "success": success
        }
    )
    
    if not success:
        return CardAssignmentResponse(
            success=False,
            message=message,
            overlaps=overlaps
        )
    
    # Логируем действие пользователя
    if current_user:
        try:
            card = db.query(FuelCard).filter(FuelCard.id == assignment.card_id).first()
            vehicle = db.query(Vehicle).filter(Vehicle.id == assignment.vehicle_id).first()
            card_number = card.card_number if card else f"ID {assignment.card_id}"
            vehicle_name = vehicle.original_name if vehicle else f"ID {assignment.vehicle_id}"
            
            logging_service.log_user_action(
                db=db,
                user_id=current_user.id,
                username=current_user.username,
                action_type="assign",
                action_description=f"Назначена карта '{card_number}' на ТС '{vehicle_name}'",
                action_category="fuel_card",
                entity_type="FuelCard",
                entity_id=assignment.card_id,
                status="success",
                extra_data={
                    "card_id": assignment.card_id,
                    "vehicle_id": assignment.vehicle_id,
                    "start_date": assignment.start_date.isoformat() if assignment.start_date else None,
                    "end_date": assignment.end_date.isoformat() if assignment.end_date else None
                }
            )
        except Exception as e:
            logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    # Инвалидируем кэш топливных карт и дашборда
    invalidate_fuel_cards_cache()
    invalidate_dashboard_cache()
    logger.debug("Кэш топливных карт и дашборда инвалидирован после назначения карты")
    
    return CardAssignmentResponse(
        success=True,
        message=message,
        overlaps=None
    )


@router.post("/{card_id}/merge", response_model=MergeResponse)
async def merge_fuel_cards(
    card_id: int,
    merge_request: MergeRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Слияние двух топливных карт
    
    Все транзакции с card_id переносятся на target_id,
    после чего card_id удаляется
    """
    from app.models import Transaction
    
    source_card = db.query(FuelCard).filter(FuelCard.id == card_id).first()
    target_card = db.query(FuelCard).filter(FuelCard.id == merge_request.target_id).first()
    
    if not source_card:
        raise HTTPException(status_code=404, detail="Исходная топливная карта не найдена")
    
    if not target_card:
        raise HTTPException(status_code=404, detail="Целевая топливная карта не найдена")
    
    if card_id == merge_request.target_id:
        raise HTTPException(status_code=400, detail="Нельзя объединить карту с самой собой")
    
    try:
        # Обновляем все транзакции, связанные с source_card
        transactions_updated = db.query(Transaction).filter(
            Transaction.card_number == source_card.card_number
        ).update({"card_number": target_card.card_number})
        
        # Обновляем связи, если они были пустыми в target_card
        updated = False
        if not target_card.provider_id and source_card.provider_id:
            target_card.provider_id = source_card.provider_id
            updated = True
        if not target_card.vehicle_id and source_card.vehicle_id:
            target_card.vehicle_id = source_card.vehicle_id
            updated = True
        
        # Удаляем source_card
        db.delete(source_card)
        db.commit()
        db.refresh(target_card)
        
        logger.info(
            "Топливные карты успешно объединены",
            extra={
                "source_card_id": card_id,
                "target_card_id": merge_request.target_id,
                "transactions_updated": transactions_updated
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
                    action_description=f"Объединены карты: '{source_card.card_number}' с '{target_card.card_number}'",
                    action_category="fuel_card",
                    entity_type="FuelCard",
                    entity_id=merge_request.target_id,
                    status="success",
                    extra_data={
                        "source_card_id": card_id,
                        "target_card_id": merge_request.target_id,
                        "transactions_updated": transactions_updated
                    }
                )
            except Exception as e:
                logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
        
        # Инвалидируем кэш топливных карт и дашборда
        invalidate_fuel_cards_cache()
        invalidate_dashboard_cache()
        logger.debug("Кэш топливных карт и дашборда инвалидирован после слияния карт")
        
        return MergeResponse(
            success=True,
            message=f"Карта '{source_card.card_number}' успешно объединена с '{target_card.card_number}'",
            transactions_updated=transactions_updated
        )
    except Exception as e:
        db.rollback()
        logger.error(
            "Ошибка при слиянии топливных карт",
            extra={
                "source_card_id": card_id,
                "target_card_id": merge_request.target_id,
                "error": str(e)
            },
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Ошибка при слиянии карт: {str(e)}")


@router.delete("/clear")
async def clear_all_fuel_cards(
    confirm: Optional[str] = Query(None, description="Подтверждение удаления всех топливных карт"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Очистка всех топливных карт из базы данных
    """
    confirm_bool = confirm and confirm.lower() in ("true", "1", "yes")
    
    if not confirm_bool:
        raise HTTPException(
            status_code=400, 
            detail="Для очистки всех топливных карт необходимо установить параметр confirm=true"
        )
    
    try:
        total_count = db.query(FuelCard).count()
        db.query(FuelCard).delete()
        db.commit()
        
        # Логируем действие пользователя
        if current_user:
            try:
                logging_service.log_user_action(
                    db=db,
                    user_id=current_user.id,
                    username=current_user.username,
                    action_type="clear",
                    action_description=f"Очищены все топливные карты ({total_count} записей)",
                    action_category="fuel_card",
                    entity_type="FuelCard",
                    entity_id=None,
                    status="success",
                    extra_data={"deleted_count": total_count}
                )
            except Exception as e:
                logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
        
        logger.info(f"Очищены все топливные карты", extra={"deleted_count": total_count})
        
        # Инвалидируем кэш топливных карт и дашборда
        invalidate_fuel_cards_cache()
        invalidate_dashboard_cache()
        logger.debug("Кэш топливных карт и дашборда инвалидирован после очистки всех карт")
        
        return {
            "message": f"Все топливные карты успешно удалены",
            "deleted_count": total_count
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Ошибка при очистке топливных карт", extra={"error": str(e)}, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка при очистке топливных карт: {str(e)}")


@router.post("/info", response_model=CardInfoResponse)
async def get_card_info(
    request: CardInfoRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Получение информации по карте через Web API или API провайдера
    
    Поддерживает:
    - Web API (XML API getinfo) - для шаблонов с типом подключения "web"
    - API провайдеры (например, РН-Карт) - для шаблонов с типом подключения "api"
    
    Требуется шаблон провайдера с типом подключения "web" или "api"
    """
    from app.services.api_provider_service import ApiProviderService
    
    # Получаем шаблон провайдера
    if not request.provider_template_id:
        raise HTTPException(
            status_code=400,
            detail="Не указан provider_template_id. Укажите ID шаблона провайдера с настройками Web API"
        )
    
    template = db.query(ProviderTemplate).filter(
        ProviderTemplate.id == request.provider_template_id
    ).first()
    
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон провайдера не найден")
    
    # Проверяем, поддерживает ли адаптер метод get_card_info
    # WebAdapter поддерживает для XML API, RnCardAdapter поддерживает через GetCardsByContract
    if template.connection_type not in ["web", "api"]:
        raise HTTPException(
            status_code=400,
            detail=f"Шаблон имеет тип подключения '{template.connection_type}', требуется 'web' или 'api'"
        )
    
    try:
        # Создаем сервис и адаптер
        api_service = ApiProviderService(db)
        adapter = api_service.create_adapter(template)
        
        # Получаем информацию по карте
        async with adapter:
            card_info = await adapter.get_card_info(
                card_number=request.card_number,
                flags=request.flags or 23
            )
        
        # Обновляем топливную карту, если указано
        updated_card = None
        if request.update_card:
            # Ищем карту по номеру
            card = db.query(FuelCard).filter(FuelCard.card_number == request.card_number).first()
            
            if card:
                # Обновляем поля из полученной информации
                updated_fields = []
                
                # PersonName -> original_owner_name с нормализацией
                if card_info.get('person_name'):
                    card.original_owner_name = card_info['person_name']
                    # Нормализуем и сохраняем в normalized_owner (с настройками из БД)
                    normalized_data = normalize_owner_name(card_info['person_name'], db=db, dictionary_type="fuel_card_owner")
                    if normalized_data.get('normalized'):
                        card.normalized_owner = normalized_data['normalized']
                    updated_fields.append('original_owner_name')
                    if normalized_data.get('normalized'):
                        updated_fields.append('normalized_owner')
                
                # State -> is_blocked (0 = работает, 1/2/4 = заблокирована)
                if 'state' in card_info:
                    new_is_blocked = card_info['state'] != 0
                    if card.is_blocked != new_is_blocked:
                        card.is_blocked = new_is_blocked
                        updated_fields.append('is_blocked')
                
                if updated_fields:
                    db.commit()
                    db.refresh(card)
                    updated_card = card
                    logger.info(f"Топливная карта обновлена данными из API: {request.card_number}", extra={
                        "card_id": card.id,
                        "card_number": request.card_number,
                        "updated_fields": updated_fields
                    })
            else:
                logger.warning(f"Топливная карта не найдена для обновления: {request.card_number}", extra={
                    "card_number": request.card_number
                })
        
        # Логируем действие пользователя
        if current_user:
            try:
                action_type = "update" if updated_card else "view"
                action_description = (
                    f"Получена и обновлена информация по карте: {request.card_number}"
                    if updated_card
                    else f"Получена информация по карте: {request.card_number}"
                )
                
                logging_service.log_user_action(
                    db=db,
                    user_id=current_user.id,
                    username=current_user.username,
                    action_type=action_type,
                    action_description=action_description,
                    action_category="fuel_card",
                    entity_type="FuelCard",
                    entity_id=updated_card.id if updated_card else None,
                    status="success",
                    extra_data={
                        "card_number": request.card_number,
                        "template_id": request.provider_template_id,
                        "updated": bool(updated_card)
                    }
                )
            except Exception as e:
                logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
        
        logger.info(f"Информация по карте получена: {request.card_number}", extra={
            "card_number": request.card_number,
            "template_id": request.provider_template_id,
            "card_updated": bool(updated_card)
        })
        
        return CardInfoResponse(**card_info)
        
    except ValueError as e:
        logger.error(f"Ошибка при получении информации по карте: {str(e)}", extra={
            "card_number": request.card_number,
            "template_id": request.provider_template_id
        })
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Ошибка при получении информации по карте: {str(e)}", extra={
            "card_number": request.card_number,
            "template_id": request.provider_template_id
        }, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка при получении информации по карте: {str(e)}")


@router.post("/normalize-owner", response_model=NormalizeOwnerResponse)
async def normalize_owner(
    request: NormalizeOwnerRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Нормализация исходного наименования владельца карты
    
    Приоритет:
    1. Поиск госномера (российский формат) - если включен в настройках
    2. Если только цифры - гаражный номер - если включен в настройках
    3. Остальное - название компании или ФИО
    
    Использует настройки нормализации из базы данных
    """
    try:
        normalized_data = normalize_owner_name(request.owner_name, db=db, dictionary_type="fuel_card_owner")
        
        logger.info(f"Нормализация владельца выполнена", extra={
            "original": request.owner_name,
            "normalized": normalized_data.get('normalized'),
            "license_plate": normalized_data.get('license_plate'),
            "garage_number": normalized_data.get('garage_number')
        })
        
        return NormalizeOwnerResponse(**normalized_data)
    except Exception as e:
        logger.error(f"Ошибка при нормализации владельца: {str(e)}", extra={
            "owner_name": request.owner_name
        }, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка при нормализации владельца: {str(e)}")
