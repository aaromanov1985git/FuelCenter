"""
Сервис управления связями между сущностями
Закрепление карт за транспортными средствами, проверка пересечений
"""
from datetime import date
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from app.models import FuelCard, Vehicle


def check_card_overlap(
    db: Session,
    card_id: int,
    vehicle_id: int,
    start_date: date,
    end_date: Optional[date] = None
) -> Tuple[bool, List[Dict[str, Any]]]:
    """
    Проверка пересечений закрепления карты за ТС

    Проверяет, нет ли конфликтов с другими активными закреплениями
    этой карты за другими ТС в указанном периоде.

    Args:
        db: Сессия БД
        card_id: ID топливной карты
        vehicle_id: ID транспортного средства
        start_date: Дата начала закрепления
        end_date: Дата окончания закрепления (None = бессрочно)

    Returns:
        Tuple[bool, List[Dict]]: (есть_пересечения, список_пересечений)

    Examples:
        >>> has_overlap, overlaps = check_card_overlap(db, card_id=1, vehicle_id=2, start_date=date(2024, 1, 1))
        >>> if has_overlap:
        ...     print(f"Found {len(overlaps)} overlapping assignments")
    """
    if end_date is None:
        end_date = date(2099, 12, 31)  # Бессрочное закрепление

    # Ищем активные закрепления этой карты за другими ТС в указанном периоде
    overlaps = db.query(FuelCard).filter(
        FuelCard.id == card_id,
        FuelCard.is_active_assignment == True,
        FuelCard.vehicle_id.isnot(None),
        FuelCard.vehicle_id != vehicle_id,
        or_(
            # Пересечение: начало нового периода внутри существующего
            and_(
                FuelCard.assignment_start_date <= start_date,
                or_(
                    FuelCard.assignment_end_date.is_(None),
                    FuelCard.assignment_end_date >= start_date
                )
            ),
            # Пересечение: конец нового периода внутри существующего
            and_(
                FuelCard.assignment_start_date <= end_date,
                or_(
                    FuelCard.assignment_end_date.is_(None),
                    FuelCard.assignment_end_date >= end_date
                )
            ),
            # Пересечение: новый период полностью содержит существующий
            and_(
                FuelCard.assignment_start_date >= start_date,
                or_(
                    FuelCard.assignment_end_date.is_(None),
                    FuelCard.assignment_end_date <= end_date
                )
            )
        )
    ).all()

    if overlaps:
        overlap_list = []
        for overlap in overlaps:
            vehicle = db.query(Vehicle).filter(Vehicle.id == overlap.vehicle_id).first()
            overlap_list.append({
                "card_id": overlap.id,
                "vehicle_id": overlap.vehicle_id,
                "vehicle_name": vehicle.original_name if vehicle else "Неизвестно",
                "start_date": overlap.assignment_start_date.isoformat() if overlap.assignment_start_date else None,
                "end_date": overlap.assignment_end_date.isoformat() if overlap.assignment_end_date else None
            })
        return True, overlap_list

    return False, []


def assign_card_to_vehicle(
    db: Session,
    card_id: int,
    vehicle_id: int,
    start_date: date,
    end_date: Optional[date] = None,
    check_overlap: bool = True
) -> Tuple[bool, str, Optional[List[Dict[str, Any]]]]:
    """
    Закрепление карты за ТС с проверкой пересечений

    Деактивирует предыдущие активные закрепления карты и создает новое.

    Args:
        db: Сессия БД
        card_id: ID топливной карты
        vehicle_id: ID транспортного средства
        start_date: Дата начала закрепления
        end_date: Дата окончания закрепления (None = бессрочно)
        check_overlap: Проверять ли пересечения (по умолчанию True)

    Returns:
        Tuple[bool, str, Optional[List[Dict]]]: (успех, сообщение, список_пересечений)

    Examples:
        >>> success, message, overlaps = assign_card_to_vehicle(
        ...     db, card_id=1, vehicle_id=2, start_date=date(2024, 1, 1)
        ... )
        >>> if success:
        ...     print("Card assigned successfully")
        ... else:
        ...     print(f"Failed: {message}")
    """
    card = db.query(FuelCard).filter(FuelCard.id == card_id).first()
    if not card:
        return False, "Карта не найдена", None

    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        return False, "Транспортное средство не найдено", None

    # Проверка пересечений
    if check_overlap:
        has_overlap, overlaps = check_card_overlap(db, card_id, vehicle_id, start_date, end_date)
        if has_overlap:
            return False, "Обнаружены пересечения с другими закреплениями", overlaps

    # Деактивируем предыдущие активные закрепления этой карты
    db.query(FuelCard).filter(
        FuelCard.id == card_id,
        FuelCard.is_active_assignment == True
    ).update({"is_active_assignment": False})

    # Создаем новое закрепление (или обновляем существующее)
    card.vehicle_id = vehicle_id
    card.assignment_start_date = start_date
    card.assignment_end_date = end_date
    card.is_active_assignment = True

    db.commit()

    return True, "Карта успешно закреплена за ТС", None
