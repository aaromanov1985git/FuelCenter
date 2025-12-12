"""
Сервис управления топливными картами
Создание, обновление, поиск топливных карт
"""
from typing import List, Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models import FuelCard
from app.services.normalization_service import normalize_card_number
from app.services.fuzzy_matching_service import find_similar_cards


def get_or_create_fuel_card(
    db: Session,
    card_number: str,
    provider_id: Optional[int] = None,
    vehicle_id: Optional[int] = None
) -> Tuple[FuelCard, List[str]]:
    """
    Получить или создать топливную карту в справочнике

    Использует нормализацию для поиска дублей и fuzzy matching для похожих записей.
    Возвращает карту и список предупреждений.

    Args:
        db: Сессия БД
        card_number: Номер топливной карты
        provider_id: ID провайдера (опционально)
        vehicle_id: ID транспортного средства (опционально)

    Returns:
        Tuple[FuelCard, List[str]]: Карта и список предупреждений

    Raises:
        ValueError: Если номер карты пустой или возникла критическая ошибка

    Examples:
        >>> card, warnings = get_or_create_fuel_card(db, "1234-5678-9012", provider_id=1)
        >>> print(f"Card: {card.card_number}, Warnings: {warnings}")
    """
    warnings = []

    # Преобразуем номер карты в строку, если он передан как число
    if card_number is not None:
        card_number = str(card_number).strip() if card_number else None
    else:
        card_number = None

    if not card_number:
        raise ValueError("Номер карты не может быть пустым")

    # Убеждаемся, что card_number - строка
    card_number = str(card_number).strip()

    # Нормализуем номер карты для поиска
    normalized_number = normalize_card_number(card_number)

    # Сначала ищем по точному совпадению номера карты
    card = db.query(FuelCard).filter(FuelCard.card_number == card_number).first()

    # Если не найдено, ищем по нормализованному номеру
    if not card:
        all_cards = db.query(FuelCard).all()
        for c in all_cards:
            if c.card_number and normalize_card_number(c.card_number) == normalized_number:
                card = c
                break

    # Если все еще не найдено, проверяем на похожие записи
    if not card:
        similar_cards = find_similar_cards(db, card_number, threshold=90)
        if similar_cards:
            # Берем самую похожую запись, если схожесть >= 98%
            best_match, score = similar_cards[0]
            if score >= 98:
                card = best_match
                warnings.append(
                    f"Карта '{card_number}' объединена с существующей '{best_match.card_number}' "
                    f"(схожесть: {score}%)"
                )
            elif score >= 90:
                # Предупреждаем о возможном дубле
                warnings.append(
                    f"Возможный дубль карты: найдена похожая запись '{best_match.card_number}' "
                    f"(схожесть: {score}%). Проверьте вручную."
                )

    if not card:
        try:
            card = FuelCard(
                card_number=card_number,
                provider_id=provider_id,
                vehicle_id=vehicle_id
            )
            db.add(card)
            db.flush()
        except IntegrityError as e:
            # Если возникла ошибка уникальности, значит карта уже существует
            # Откатываем транзакцию и ищем существующую карту
            db.rollback()

            # Пытаемся найти карту по номеру (возможно, была создана в другой транзакции)
            card = db.query(FuelCard).filter(FuelCard.card_number == card_number).first()

            if not card:
                # Если не нашли по точному совпадению, пробуем найти по нормализованному номеру
                all_cards = db.query(FuelCard).all()
                for c in all_cards:
                    if c.card_number and normalize_card_number(c.card_number) == normalized_number:
                        card = c
                        warnings.append(
                            f"Карта '{card_number}' объединена с существующей '{c.card_number}' "
                            f"(найдена по нормализованному номеру)"
                        )
                        break

                # Если все еще не нашли, пробуем найти похожую карту
                if not card:
                    similar_cards = find_similar_cards(db, card_number, threshold=95)
                    if similar_cards:
                        best_match, score = similar_cards[0]
                        if score >= 95:
                            card = best_match
                            warnings.append(
                                f"Карта '{card_number}' объединена с существующей '{best_match.card_number}' "
                                f"(схожесть: {score}%, обнаружена при обработке конфликта уникальности)"
                            )

            # Если карта все еще не найдена, это критическая ошибка
            if not card:
                raise ValueError(
                    f"Не удалось создать карту '{card_number}' из-за конфликта уникальности, "
                    f"но существующая карта не найдена. Ошибка БД: {str(e)}"
                )
    else:
        # Обновляем данные, если они были пустыми
        updated = False
        if provider_id and not card.provider_id:
            card.provider_id = provider_id
            updated = True
        if vehicle_id and not card.vehicle_id:
            card.vehicle_id = vehicle_id
            updated = True

        if updated:
            db.flush()

    return card, warnings
