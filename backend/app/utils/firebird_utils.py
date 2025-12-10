"""
Утилиты для работы с Firebird
"""
from functools import wraps
from fastapi import HTTPException
from typing import Callable, Any

# Опциональный импорт FirebirdService
try:
    from app.services.firebird_service import FirebirdService
    FIREBIRD_AVAILABLE = True
except ImportError:
    FIREBIRD_AVAILABLE = False
    FirebirdService = None


def check_firebird_available() -> bool:
    """
    Проверка доступности функциональности Firebird
    
    Returns:
        bool: True если Firebird доступен
    """
    return FIREBIRD_AVAILABLE


def require_firebird(func: Callable) -> Callable:
    """
    Декоратор для проверки доступности Firebird перед выполнением функции
    
    Args:
        func: Функция для обертки
    
    Returns:
        Callable: Обернутая функция
    
    Raises:
        HTTPException: Если Firebird недоступен
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        if not FIREBIRD_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail="Функциональность Firebird недоступна. Установите библиотеку fdb: pip install fdb==2.0.2"
            )
        return await func(*args, **kwargs)
    
    return wrapper


def get_firebird_service():
    """
    Получение экземпляра FirebirdService
    
    Returns:
        FirebirdService: Экземпляр сервиса
    
    Raises:
        HTTPException: Если Firebird недоступен
    """
    if not FIREBIRD_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Функциональность Firebird недоступна. Установите библиотеку fdb: pip install fdb==2.0.2"
        )
    return FirebirdService

