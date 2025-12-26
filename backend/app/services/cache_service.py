"""
Сервис кэширования через Redis
"""
import json
import pickle
from typing import Any, Optional, Union, Callable
from functools import wraps
import hashlib
import os
import redis
from datetime import timedelta
import asyncio
import inspect

from app.logger import logger


class CacheService:
    """
    Сервис кэширования с использованием Redis
    
    Поддерживает:
    - Простое кэширование ключ-значение
    - TTL для автоматического истечения
    - Инвалидация по паттерну
    - Декоратор для кэширования функций
    """
    
    _instance: Optional['CacheService'] = None
    _client: Optional[redis.Redis] = None
    
    def __init__(self):
        """Инициализация подключения к Redis"""
        if CacheService._instance is not None:
            raise RuntimeError("CacheService is a singleton. Use get_instance()")
        
        redis_host = os.getenv("REDIS_HOST", "redis")
        redis_port = int(os.getenv("REDIS_PORT", "6379"))
        redis_db = int(os.getenv("REDIS_CACHE_DB", "1"))  # Используем отдельную БД для кэша
        
        try:
            self._client = redis.Redis(
                host=redis_host,
                port=redis_port,
                db=redis_db,
                decode_responses=False,  # Для поддержки pickle
                socket_timeout=5,
                socket_connect_timeout=5
            )
            self._client.ping()
            logger.info(f"Cache connected to Redis: {redis_host}:{redis_port}/{redis_db}")
        except Exception as e:
            logger.warning(f"Redis cache unavailable: {e}. Caching disabled.")
            self._client = None
        
        CacheService._instance = self
    
    @classmethod
    def get_instance(cls) -> 'CacheService':
        """Получить экземпляр сервиса (singleton)"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    @property
    def is_available(self) -> bool:
        """Проверка доступности кэша"""
        if self._client is None:
            return False
        try:
            self._client.ping()
            return True
        except:
            return False
    
    def _make_key(self, key: str, prefix: str = "gsm") -> str:
        """Создать полный ключ с префиксом"""
        return f"{prefix}:{key}"
    
    def get(self, key: str, prefix: str = "gsm") -> Optional[Any]:
        """
        Получить значение из кэша
        
        Args:
            key: Ключ
            prefix: Префикс ключа
            
        Returns:
            Закэшированное значение или None
        """
        if not self.is_available:
            return None
        
        try:
            full_key = self._make_key(key, prefix)
            data = self._client.get(full_key)
            if data:
                return pickle.loads(data)
            return None
        except Exception as e:
            logger.error(f"Cache get error: {e}")
            return None
    
    def set(
        self,
        key: str,
        value: Any,
        ttl: Union[int, timedelta] = 300,
        prefix: str = "gsm"
    ) -> bool:
        """
        Установить значение в кэш
        
        Args:
            key: Ключ
            value: Значение (сериализуется через pickle)
            ttl: Время жизни в секундах или timedelta
            prefix: Префикс ключа
            
        Returns:
            True если успешно
        """
        if not self.is_available:
            return False
        
        try:
            full_key = self._make_key(key, prefix)
            data = pickle.dumps(value)
            
            if isinstance(ttl, timedelta):
                ttl = int(ttl.total_seconds())
            
            self._client.setex(full_key, ttl, data)
            return True
        except Exception as e:
            logger.error(f"Cache set error: {e}")
            return False
    
    def delete(self, key: str, prefix: str = "gsm") -> bool:
        """Удалить ключ из кэша"""
        if not self.is_available:
            return False
        
        try:
            full_key = self._make_key(key, prefix)
            self._client.delete(full_key)
            return True
        except Exception as e:
            logger.error(f"Cache delete error: {e}")
            return False
    
    def delete_pattern(self, pattern: str, prefix: str = "gsm") -> int:
        """
        Удалить все ключи по паттерну
        
        Args:
            pattern: Паттерн (например, "transactions:*")
            prefix: Префикс ключа
            
        Returns:
            Количество удалённых ключей
        """
        if not self.is_available:
            return 0
        
        try:
            full_pattern = self._make_key(pattern, prefix)
            keys = self._client.keys(full_pattern)
            if keys:
                return self._client.delete(*keys)
            return 0
        except Exception as e:
            logger.error(f"Cache delete_pattern error: {e}")
            return 0
    
    def clear_all(self, prefix: str = "gsm") -> int:
        """Очистить весь кэш с указанным префиксом"""
        return self.delete_pattern("*", prefix)
    
    def get_stats(self) -> dict:
        """Получить статистику кэша"""
        if not self.is_available:
            return {"available": False}
        
        try:
            info = self._client.info()
            return {
                "available": True,
                "used_memory": info.get("used_memory_human"),
                "connected_clients": info.get("connected_clients"),
                "keyspace_hits": info.get("keyspace_hits"),
                "keyspace_misses": info.get("keyspace_misses"),
                "hit_rate": round(
                    info.get("keyspace_hits", 0) / 
                    max(info.get("keyspace_hits", 0) + info.get("keyspace_misses", 0), 1) * 100,
                    2
                )
            }
        except Exception as e:
            return {"available": False, "error": str(e)}


def cached(
    ttl: Union[int, timedelta] = 300,
    prefix: str = "func",
    key_builder: Optional[Callable] = None
):
    """
    Декоратор для кэширования результатов функций
    
    Args:
        ttl: Время жизни кэша в секундах
        prefix: Префикс для ключей
        key_builder: Функция для построения ключа (по умолчанию хеш аргументов)
        
    Example:
        @cached(ttl=60, prefix="users")
        def get_user(user_id: int):
            return db.query(User).get(user_id)
    """
    def decorator(func: Callable):
        # Проверяем, является ли функция async
        is_async = inspect.iscoroutinefunction(func)
        
        if is_async:
            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                cache = CacheService.get_instance()
                
                if not cache.is_available:
                    return await func(*args, **kwargs)
                
                # Строим ключ кэша
                if key_builder:
                    cache_key = key_builder(*args, **kwargs)
                else:
                    # Хешируем аргументы для создания ключа
                    key_data = f"{func.__module__}.{func.__name__}:{args}:{sorted(kwargs.items())}"
                    cache_key = hashlib.md5(key_data.encode()).hexdigest()
                
                # Пробуем получить из кэша
                cached_value = cache.get(cache_key, prefix=prefix)
                if cached_value is not None:
                    logger.debug(f"Cache hit: {prefix}:{cache_key}")
                    return cached_value
                
                # Выполняем функцию и кэшируем результат
                result = await func(*args, **kwargs)
                cache.set(cache_key, result, ttl=ttl, prefix=prefix)
                logger.debug(f"Cache miss, stored: {prefix}:{cache_key}")
                
                return result
            
            wrapper = async_wrapper
        else:
            @wraps(func)
            def sync_wrapper(*args, **kwargs):
                cache = CacheService.get_instance()
                
                if not cache.is_available:
                    return func(*args, **kwargs)
                
                # Строим ключ кэша
                if key_builder:
                    cache_key = key_builder(*args, **kwargs)
                else:
                    # Хешируем аргументы для создания ключа
                    key_data = f"{func.__module__}.{func.__name__}:{args}:{sorted(kwargs.items())}"
                    cache_key = hashlib.md5(key_data.encode()).hexdigest()
                
                # Пробуем получить из кэша
                cached_value = cache.get(cache_key, prefix=prefix)
                if cached_value is not None:
                    logger.debug(f"Cache hit: {prefix}:{cache_key}")
                    return cached_value
                
                # Выполняем функцию и кэшируем результат
                result = func(*args, **kwargs)
                cache.set(cache_key, result, ttl=ttl, prefix=prefix)
                logger.debug(f"Cache miss, stored: {prefix}:{cache_key}")
                
                return result
            
            wrapper = sync_wrapper
        
        # Добавляем метод для инвалидации кэша
        def invalidate(*args, **kwargs):
            cache = CacheService.get_instance()
            if key_builder:
                cache_key = key_builder(*args, **kwargs)
            else:
                key_data = f"{func.__module__}.{func.__name__}:{args}:{sorted(kwargs.items())}"
                cache_key = hashlib.md5(key_data.encode()).hexdigest()
            cache.delete(cache_key, prefix=prefix)
        
        wrapper.invalidate = invalidate
        wrapper.invalidate_all = lambda: CacheService.get_instance().delete_pattern("*", prefix=prefix)
        
        return wrapper
    return decorator


# Утилиты для кэширования

def cache_dashboard_stats(stats: dict, ttl: int = 60):
    """Кэширование статистики дашборда"""
    cache = CacheService.get_instance()
    cache.set("dashboard:stats", stats, ttl=ttl)


def get_cached_dashboard_stats() -> Optional[dict]:
    """Получение закэшированной статистики дашборда"""
    cache = CacheService.get_instance()
    return cache.get("dashboard:stats")


def invalidate_dashboard_cache():
    """Инвалидация кэша дашборда"""
    cache = CacheService.get_instance()
    cache.delete_pattern("dashboard:*")


def invalidate_transactions_cache():
    """Инвалидация кэша транзакций"""
    cache = CacheService.get_instance()
    cache.delete_pattern("transactions:*")


def invalidate_vehicles_cache():
    """Инвалидация кэша транспортных средств"""
    cache = CacheService.get_instance()
    cache.delete_pattern("vehicles:*")


def invalidate_fuel_cards_cache():
    """Инвалидация кэша топливных карт"""
    cache = CacheService.get_instance()
    cache.delete_pattern("fuel_cards:*")

