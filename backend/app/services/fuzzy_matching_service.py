"""
Сервис нечёткого поиска (fuzzy matching)
Поиск похожих записей с использованием алгоритмов нечёткого сравнения строк
"""
from typing import List, Tuple
from sqlalchemy.orm import Session
from rapidfuzz import fuzz, process

from app.models import Vehicle, FuelCard
from app.services.normalization_service import normalize_vehicle_name, normalize_card_number


def find_similar_vehicles(
    db: Session,
    vehicle_name: str,
    threshold: int = 85
) -> List[Tuple[Vehicle, int]]:
    """
    Поиск похожих транспортных средств с использованием fuzzy matching

    Args:
        db: Сессия БД
        vehicle_name: Название ТС для поиска
        threshold: Порог схожести (0-100), по умолчанию 85

    Returns:
        Список кортежей (Vehicle, score) отсортированный по убыванию score

    Examples:
        >>> similar = find_similar_vehicles(db, "КАМАЗ 5490", threshold=80)
        >>> for vehicle, score in similar:
        ...     print(f"{vehicle.original_name}: {score}%")
    """
    if not vehicle_name:
        return []

    normalized_name = normalize_vehicle_name(vehicle_name)

    # Получаем все ТС из БД
    all_vehicles = db.query(Vehicle).all()

    if not all_vehicles:
        return []

    # Создаем словарь для быстрого доступа
    vehicle_dict = {v.id: v for v in all_vehicles}

    # Используем rapidfuzz для поиска похожих
    # process.extract работает со словарями {key: value}, где value - строка для сравнения
    # Создаем словарь {vehicle_id: normalize_vehicle_name(...)} для поиска
    choices = {v.id: normalize_vehicle_name(v.original_name) for v in all_vehicles}

    # Ищем похожие записи
    # process.extract возвращает список кортежей (matched_key, score, index)
    # где matched_key - это ключ из словаря choices (vehicle_id)
    results = process.extract(
        normalized_name,
        choices,
        scorer=fuzz.ratio,
        limit=5
    )

    # Фильтруем по порогу и возвращаем Vehicle объекты
    # results содержит (vehicle_id, score, index)
    similar = []
    for vehicle_id, score, _ in results:
        if score >= threshold and vehicle_id in vehicle_dict:
            similar.append((vehicle_dict[vehicle_id], score))

    return similar


def find_similar_cards(
    db: Session,
    card_number: str,
    threshold: int = 90
) -> List[Tuple[FuelCard, int]]:
    """
    Поиск похожих топливных карт с использованием fuzzy matching

    Args:
        db: Сессия БД
        card_number: Номер карты для поиска
        threshold: Порог схожести (0-100), по умолчанию 90

    Returns:
        Список кортежей (FuelCard, score) отсортированный по убыванию score

    Examples:
        >>> similar = find_similar_cards(db, "1234567890", threshold=85)
        >>> for card, score in similar:
        ...     print(f"{card.card_number}: {score}%")
    """
    if not card_number:
        return []

    normalized_number = normalize_card_number(card_number)

    # Получаем все карты из БД
    all_cards = db.query(FuelCard).all()

    if not all_cards:
        return []

    # Создаем словарь для быстрого доступа
    card_dict = {c.id: c for c in all_cards}

    # Используем rapidfuzz для поиска похожих
    choices = {c.id: normalize_card_number(c.card_number) for c in all_cards}

    # Ищем похожие записи
    results = process.extract(
        normalized_number,
        choices,
        scorer=fuzz.ratio,
        limit=5
    )

    # Фильтруем по порогу и возвращаем FuelCard объекты
    similar = [
        (card_dict[card_id], score)
        for card_id, score, _ in results
        if score >= threshold and card_id in card_dict
    ]

    return similar
