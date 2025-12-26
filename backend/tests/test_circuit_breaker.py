"""
Unit тесты для Circuit Breaker
"""
import pytest
import asyncio
from app.utils.circuit_breaker import (
    CircuitBreaker,
    CircuitState,
    CircuitBreakerOpenError,
    get_circuit_breaker
)


class TestCircuitBreaker:
    """Тесты для CircuitBreaker"""
    
    @pytest.fixture
    def circuit_breaker(self):
        """Создание CircuitBreaker для тестов"""
        return CircuitBreaker(
            failure_threshold=3,
            recovery_timeout=5,
            expected_exception=Exception,
            name="test_breaker"
        )
    
    @pytest.mark.asyncio
    async def test_closed_state_success(self, circuit_breaker: CircuitBreaker):
        """Тест успешного выполнения в состоянии CLOSED"""
        async def success_func():
            return "success"
        
        result = await circuit_breaker.call(success_func)
        assert result == "success"
        assert circuit_breaker.get_state() == CircuitState.CLOSED
        assert circuit_breaker.failure_count == 0
    
    @pytest.mark.asyncio
    async def test_closed_state_failure(self, circuit_breaker: CircuitBreaker):
        """Тест ошибки в состоянии CLOSED"""
        async def fail_func():
            raise Exception("Test error")
        
        with pytest.raises(Exception, match="Test error"):
            await circuit_breaker.call(fail_func)
        
        assert circuit_breaker.failure_count == 1
        assert circuit_breaker.get_state() == CircuitState.CLOSED
    
    @pytest.mark.asyncio
    async def test_transition_to_open(self, circuit_breaker: CircuitBreaker):
        """Тест перехода в состояние OPEN после нескольких ошибок"""
        async def fail_func():
            raise Exception("Test error")
        
        # Вызываем функцию несколько раз, чтобы достичь failure_threshold
        for _ in range(3):
            with pytest.raises(Exception):
                await circuit_breaker.call(fail_func)
        
        assert circuit_breaker.get_state() == CircuitState.OPEN
        assert circuit_breaker.failure_count >= 3
    
    @pytest.mark.asyncio
    async def test_open_state_blocks_requests(self, circuit_breaker: CircuitBreaker):
        """Тест блокировки запросов в состоянии OPEN"""
        # Переводим в состояние OPEN
        circuit_breaker.state = CircuitState.OPEN
        circuit_breaker.failure_count = 3
        
        async def any_func():
            return "should not execute"
        
        with pytest.raises(CircuitBreakerOpenError):
            await circuit_breaker.call(any_func)
    
    @pytest.mark.asyncio
    async def test_half_open_success(self, circuit_breaker: CircuitBreaker):
        """Тест успешного выполнения в состоянии HALF_OPEN"""
        # Переводим в состояние HALF_OPEN
        circuit_breaker.state = CircuitState.HALF_OPEN
        circuit_breaker.failure_count = 0
        
        async def success_func():
            return "success"
        
        result = await circuit_breaker.call(success_func)
        assert result == "success"
        # После успеха должен перейти в CLOSED
        assert circuit_breaker.get_state() == CircuitState.CLOSED
    
    @pytest.mark.asyncio
    async def test_half_open_failure(self, circuit_breaker: CircuitBreaker):
        """Тест ошибки в состоянии HALF_OPEN"""
        # Переводим в состояние HALF_OPEN
        circuit_breaker.state = CircuitState.HALF_OPEN
        circuit_breaker.failure_count = 0
        
        async def fail_func():
            raise Exception("Test error")
        
        with pytest.raises(Exception):
            await circuit_breaker.call(fail_func)
        
        # После ошибки должен вернуться в OPEN
        assert circuit_breaker.get_state() == CircuitState.OPEN
    
    def test_reset(self, circuit_breaker: CircuitBreaker):
        """Тест сброса CircuitBreaker"""
        # Устанавливаем состояние
        circuit_breaker.state = CircuitState.OPEN
        circuit_breaker.failure_count = 5
        
        # Сбрасываем
        circuit_breaker.reset()
        
        assert circuit_breaker.get_state() == CircuitState.CLOSED
        assert circuit_breaker.failure_count == 0
        assert circuit_breaker.last_failure_time is None


class TestGetCircuitBreaker:
    """Тесты для функции get_circuit_breaker"""
    
    def test_get_circuit_breaker_singleton(self):
        """Тест, что get_circuit_breaker возвращает один и тот же экземпляр"""
        breaker1 = get_circuit_breaker("test_name")
        breaker2 = get_circuit_breaker("test_name")
        
        assert breaker1 is breaker2
    
    def test_get_circuit_breaker_different_names(self):
        """Тест, что разные имена возвращают разные экземпляры"""
        breaker1 = get_circuit_breaker("name1")
        breaker2 = get_circuit_breaker("name2")
        
        assert breaker1 is not breaker2

