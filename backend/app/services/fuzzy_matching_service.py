"""
Сервис нечёткого поиска (fuzzy matching)
Поиск похожих записей с использованием алгоритмов нечёткого сравнения строк
"""
from typing import List, Tuple, Optional
from sqlalchemy.orm import Session
from rapidfuzz import fuzz, process

from app.models import Vehicle, FuelCard
from app.services.normalization_service import normalize_vehicle_name, normalize_card_number

# Максимальное количество записей для обработки в одном батче
# Предотвращает OutOfMemory при больших объемах данных
BATCH_SIZE = 5000
# Максимальное общее количество записей для обработки
# Если записей больше, обрабатываем только первые MAX_RECORDS
MAX_RECORDS = 50000


def find_similar_vehicles(
    db: Session,
    vehicle_name: str,
    threshold: int = 85,
    max_results: int = 5
) -> List[Tuple[Vehicle, int]]:
    """
    Поиск похожих транспортных средств с использованием fuzzy matching
    Оптимизирован для работы с большими объемами данных через батчинг

    Args:
        db: Сессия БД
        vehicle_name: Название ТС для поиска
        threshold: Порог схожести (0-100), по умолчанию 85
        max_results: Максимальное количество результатов (по умолчанию 5)

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

    # Получаем общее количество записей для оценки необходимости батчинга
    total_count = db.query(Vehicle).count()
    
    if total_count == 0:
        return []

    # Для больших объемов данных используем батчинг
    if total_count > BATCH_SIZE:
        # Обрабатываем батчами, собирая лучшие результаты
        all_results = []
        offset = 0
        processed = 0
        
        while offset < total_count and processed < MAX_RECORDS:
            # Получаем батч записей
            batch = db.query(Vehicle).offset(offset).limit(BATCH_SIZE).all()
            
            if not batch:
                break
            
            # Создаем словарь для батча
            vehicle_dict = {v.id: v for v in batch}
            choices = {v.id: normalize_vehicle_name(v.original_name) for v in batch}
            
            # Ищем похожие записи в батче
            batch_results = process.extract(
                normalized_name,
                choices,
                scorer=fuzz.ratio,
                limit=max_results * 2  # Берем больше для последующей фильтрации
            )
            
            # Добавляем результаты батча
            for vehicle_id, score, _ in batch_results:
                if score >= threshold and vehicle_id in vehicle_dict:
                    all_results.append((vehicle_dict[vehicle_id], score))
            
            offset += BATCH_SIZE
            processed += len(batch)
        
        # Сортируем все результаты по score и берем топ
        all_results.sort(key=lambda x: x[1], reverse=True)
        return all_results[:max_results]
    else:
        # Для небольших объемов используем старый подход
        all_vehicles = db.query(Vehicle).all()
        vehicle_dict = {v.id: v for v in all_vehicles}
        choices = {v.id: normalize_vehicle_name(v.original_name) for v in all_vehicles}
        
        results = process.extract(
            normalized_name,
            choices,
            scorer=fuzz.ratio,
            limit=max_results
        )
        
        similar = []
        for vehicle_id, score, _ in results:
            if score >= threshold and vehicle_id in vehicle_dict:
                similar.append((vehicle_dict[vehicle_id], score))
        
        return similar


def find_similar_cards(
    db: Session,
    card_number: str,
    threshold: int = 90,
    max_results: int = 5
) -> List[Tuple[FuelCard, int]]:
    """
    Поиск похожих топливных карт с использованием fuzzy matching
    Оптимизирован для работы с большими объемами данных через батчинг

    Args:
        db: Сессия БД
        card_number: Номер карты для поиска
        threshold: Порог схожести (0-100), по умолчанию 90
        max_results: Максимальное количество результатов (по умолчанию 5)

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

    # Получаем общее количество записей для оценки необходимости батчинга
    total_count = db.query(FuelCard).count()
    
    if total_count == 0:
        return []

    # Для больших объемов данных используем батчинг
    if total_count > BATCH_SIZE:
        # Обрабатываем батчами, собирая лучшие результаты
        all_results = []
        offset = 0
        processed = 0
        
        while offset < total_count and processed < MAX_RECORDS:
            # Получаем батч записей
            batch = db.query(FuelCard).offset(offset).limit(BATCH_SIZE).all()
            
            if not batch:
                break
            
            # Создаем словарь для батча
            card_dict = {c.id: c for c in batch}
            choices = {c.id: normalize_card_number(c.card_number) for c in batch}
            
            # Ищем похожие записи в батче
            batch_results = process.extract(
                normalized_number,
                choices,
                scorer=fuzz.ratio,
                limit=max_results * 2  # Берем больше для последующей фильтрации
            )
            
            # Добавляем результаты батча
            for card_id, score, _ in batch_results:
                if score >= threshold and card_id in card_dict:
                    all_results.append((card_dict[card_id], score))
            
            offset += BATCH_SIZE
            processed += len(batch)
        
        # Сортируем все результаты по score и берем топ
        all_results.sort(key=lambda x: x[1], reverse=True)
        return all_results[:max_results]
    else:
        # Для небольших объемов используем старый подход
        all_cards = db.query(FuelCard).all()
        card_dict = {c.id: c for c in all_cards}
        choices = {c.id: normalize_card_number(c.card_number) for c in all_cards}
        
        results = process.extract(
            normalized_number,
            choices,
            scorer=fuzz.ratio,
            limit=max_results
        )
        
        similar = [
            (card_dict[card_id], score)
            for card_id, score, _ in results
            if score >= threshold and card_id in card_dict
        ]
        
        return similar
