"""
Unit тесты для сервиса кэширования
"""
import pytest
import time
from app.services.cache_service import CacheService


@pytest.fixture
def cache_service():
    """Создание экземпляра CacheService для тестов"""
    # Используем in-memory Redis для тестов или мокируем
    service = CacheService.get_instance()
    # Очищаем кэш перед тестом
    service._client.flushdb()
    yield service
    # Очищаем кэш после теста
    service._client.flushdb()


class TestCacheService:
    """Тесты для CacheService"""
    
    def test_set_and_get(self, cache_service: CacheService):
        """Тест установки и получения значения"""
        key = "test_key"
        value = {"test": "data", "number": 123}
        
        # Устанавливаем значение
        cache_service.set(key, value, ttl=60, prefix="test")
        
        # Получаем значение
        result = cache_service.get(key, prefix="test")
        assert result == value
    
    def test_get_nonexistent_key(self, cache_service: CacheService):
        """Тест получения несуществующего ключа"""
        result = cache_service.get("nonexistent_key", prefix="test")
        assert result is None
    
    def test_delete(self, cache_service: CacheService):
        """Тест удаления ключа"""
        key = "test_key"
        value = {"test": "data"}
        
        # Устанавливаем значение
        cache_service.set(key, value, ttl=60, prefix="test")
        
        # Проверяем, что значение есть
        assert cache_service.get(key, prefix="test") == value
        
        # Удаляем значение
        cache_service.delete(key, prefix="test")
        
        # Проверяем, что значение удалено
        assert cache_service.get(key, prefix="test") is None
    
    def test_ttl_expiration(self, cache_service: CacheService):
        """Тест истечения TTL"""
        key = "test_key"
        value = {"test": "data"}
        
        # Устанавливаем значение с коротким TTL
        cache_service.set(key, value, ttl=1, prefix="test")
        
        # Проверяем, что значение есть
        assert cache_service.get(key, prefix="test") == value
        
        # Ждем истечения TTL
        time.sleep(2)
        
        # Проверяем, что значение истекло
        result = cache_service.get(key, prefix="test")
        assert result is None
    
    def test_delete_pattern(self, cache_service: CacheService):
        """Тест удаления по паттерну"""
        # Устанавливаем несколько ключей
        cache_service.set("key1", {"data": 1}, ttl=60, prefix="test")
        cache_service.set("key2", {"data": 2}, ttl=60, prefix="test")
        cache_service.set("other_key", {"data": 3}, ttl=60, prefix="test")
        
        # Удаляем по паттерну (паттерн должен быть без префикса, префикс указывается отдельно)
        cache_service.delete_pattern("key*", prefix="test")
        
        # Проверяем, что ключи удалены
        assert cache_service.get("key1", prefix="test") is None
        assert cache_service.get("key2", prefix="test") is None
        # other_key должен остаться
        assert cache_service.get("other_key", prefix="test") is not None
    
    def test_get_stats(self, cache_service: CacheService):
        """Тест получения статистики"""
        stats = cache_service.get_stats()
        # Проверяем реальные поля, которые возвращает get_stats
        assert "available" in stats
        assert stats["available"] is True
        assert "keyspace_hits" in stats
        assert "keyspace_misses" in stats
        assert isinstance(stats["keyspace_hits"], (int, type(None)))
        assert isinstance(stats["keyspace_misses"], (int, type(None)))


class TestCacheDecorator:
    """Тесты для декоратора @cached"""
    
    def test_cached_decorator(self, cache_service: CacheService):
        """Тест декоратора кэширования"""
        from app.services.cache_service import cached
        call_count = 0
        
        @cached(ttl=60, prefix="test")
        def test_function(param1: str, param2: int = 10):
            nonlocal call_count
            call_count += 1
            return {"result": f"{param1}_{param2}", "count": call_count}
        
        # Первый вызов - должен выполниться функция
        result1 = test_function("test", 20)
        assert call_count == 1
        assert result1["result"] == "test_20"
        
        # Второй вызов с теми же параметрами - должен вернуться из кэша
        result2 = test_function("test", 20)
        assert call_count == 1  # Функция не должна вызваться снова
        assert result2 == result1
        
        # Третий вызов с другими параметрами - должен выполниться функция
        result3 = test_function("test", 30)
        assert call_count == 2
        assert result3["result"] == "test_30"

