"""
Утилиты для работы с датами
"""
from datetime import datetime
from typing import Optional, Tuple
from fastapi import HTTPException


def parse_date_range(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
) -> Tuple[Optional[datetime], Optional[datetime]]:
    """
    Парсинг диапазона дат из строковых параметров
    
    Поддерживает форматы:
    - YYYY-MM-DD
    - YYYY-MM-DD HH:MM:SS
    
    Для date_to без времени автоматически устанавливается время 23:59:59
    
    Args:
        date_from: Начальная дата (включительно)
        date_to: Конечная дата (включительно)
    
    Returns:
        Tuple[Optional[datetime], Optional[datetime]]: Парсенные даты
    
    Raises:
        HTTPException: Если формат даты неверный
    """
    parsed_date_from = None
    parsed_date_to = None
    
    if date_from:
        try:
            parsed_date_from = datetime.strptime(date_from, '%Y-%m-%d %H:%M:%S')
        except ValueError:
            try:
                parsed_date_from = datetime.strptime(date_from, '%Y-%m-%d')
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Неверный формат date_from: {date_from}. Используйте YYYY-MM-DD или YYYY-MM-DD HH:MM:SS"
                )
    
    if date_to:
        try:
            parsed_date_to = datetime.strptime(date_to, '%Y-%m-%d %H:%M:%S')
        except ValueError:
            try:
                parsed_date_to = datetime.strptime(date_to, '%Y-%m-%d')
                # Устанавливаем время на конец дня
                parsed_date_to = parsed_date_to.replace(hour=23, minute=59, second=59)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Неверный формат date_to: {date_to}. Используйте YYYY-MM-DD или YYYY-MM-DD HH:MM:SS"
                )
    
    return parsed_date_from, parsed_date_to

