"""
Роутер для работы с топливными картами
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.logger import logger
from app.models import Vehicle, FuelCard
from app.schemas import (
    FuelCardResponse, FuelCardUpdate, FuelCardListResponse,
    CardAssignmentRequest, CardAssignmentResponse, MergeRequest, MergeResponse
)
from app.services import assign_card_to_vehicle

router = APIRouter(prefix="/api/v1/fuel-cards", tags=["fuel-cards"])


@router.get("", response_model=FuelCardListResponse)
async def get_fuel_cards(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    vehicle_id: Optional[int] = Query(None, description="Фильтр по ID ТС"),
    is_blocked: Optional[bool] = Query(None, description="Фильтр по статусу блокировки (true - только заблокированные, false - только незаблокированные)"),
    db: Session = Depends(get_db)
):
    """
    Получение списка топливных карт
    """
    query = db.query(FuelCard)
    
    if vehicle_id:
        query = query.filter(FuelCard.vehicle_id == vehicle_id)
    
    if is_blocked is not None:
        query = query.filter(FuelCard.is_blocked == is_blocked)
    
    total = query.count()
    cards = query.order_by(FuelCard.created_at.desc()).offset(skip).limit(limit).all()
    
    logger.debug("Список топливных карт загружен", extra={"total": total, "returned": len(cards), "is_blocked_filter": is_blocked})
    
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
    db: Session = Depends(get_db)
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
    
    db.commit()
    db.refresh(card)
    
    logger.info(f"Топливная карта обновлена", extra={"card_id": card_id})
    
    return card


@router.post("/assign", response_model=CardAssignmentResponse)
async def assign_card(
    assignment: CardAssignmentRequest,
    db: Session = Depends(get_db)
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
    
    return CardAssignmentResponse(
        success=True,
        message=message,
        overlaps=None
    )


@router.post("/{card_id}/merge", response_model=MergeResponse)
async def merge_fuel_cards(
    card_id: int,
    merge_request: MergeRequest,
    db: Session = Depends(get_db)
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
