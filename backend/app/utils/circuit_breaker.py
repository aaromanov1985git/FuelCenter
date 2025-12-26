"""
Утилита для реализации Circuit Breaker паттерна
Защищает от каскадных сбоев при недоступности внешних сервисов
"""
from typing import Callable, Any, Optional
from datetime import datetime, timedelta
from enum import Enum
import asyncio
from app.logger import logger


class CircuitState(Enum):
    """Состояния Circuit Breaker"""
    CLOSED = "closed"  # Нормальная работа
    OPEN = "open"  # Разомкнут, запросы блокируются
    HALF_OPEN = "half_open"  # Тестовый режим, пропускает один запрос


class CircuitBreaker:
    """
    Circuit Breaker для защиты от каскадных сбоев
    
    Принцип работы:
    - CLOSED: Все запросы проходят. При ошибках увеличивается счетчик.
    - OPEN: Все запросы блокируются. Через recovery_timeout переходит в HALF_OPEN.
    - HALF_OPEN: Пропускает один запрос. При успехе -> CLOSED, при ошибке -> OPEN.
    """
    
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
        expected_exception: type = Exception,
        name: str = "circuit_breaker"
    ):
        """
        Инициализация Circuit Breaker
        
        Args:
            failure_threshold: Количество ошибок для перехода в OPEN
            recovery_timeout: Время в секундах до перехода из OPEN в HALF_OPEN
            expected_exception: Тип исключения, которое считается ошибкой
            name: Имя для логирования
        """
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception
        self.name = name
        
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time: Optional[datetime] = None
        self.last_success_time: Optional[datetime] = None
        self._lock = asyncio.Lock()
    
    async def call(self, func: Callable, *args, **kwargs) -> Any:
        """
        Выполнение функции через Circuit Breaker
        
        Args:
            func: Функция для выполнения
            *args, **kwargs: Аргументы функции
            
        Returns:
            Результат выполнения функции
            
        Raises:
            CircuitBreakerOpenError: Если circuit breaker в состоянии OPEN
            Исходное исключение: Если функция выбросила исключение
        """
        async with self._lock:
            # Проверяем состояние
            if self.state == CircuitState.OPEN:
                # Проверяем, прошло ли время восстановления
                if self.last_failure_time:
                    elapsed = (datetime.now() - self.last_failure_time).total_seconds()
                    if elapsed >= self.recovery_timeout:
                        logger.info(f"Circuit Breaker '{self.name}' переходит в HALF_OPEN", extra={
                            "name": self.name,
                            "elapsed_seconds": elapsed
                        })
                        self.state = CircuitState.HALF_OPEN
                        self.failure_count = 0
                    else:
                        raise CircuitBreakerOpenError(
                            f"Circuit Breaker '{self.name}' is OPEN. "
                            f"Retry after {self.recovery_timeout - int(elapsed)} seconds"
                        )
                else:
                    raise CircuitBreakerOpenError(f"Circuit Breaker '{self.name}' is OPEN")
            
            # Выполняем функцию
            try:
                if asyncio.iscoroutinefunction(func):
                    result = await func(*args, **kwargs)
                else:
                    result = func(*args, **kwargs)
                
                # Успешное выполнение
                await self._on_success()
                return result
                
            except self.expected_exception as e:
                # Ошибка
                await self._on_failure()
                raise
    
    async def _on_success(self):
        """Обработка успешного выполнения"""
        self.last_success_time = datetime.now()
        
        if self.state == CircuitState.HALF_OPEN:
            logger.info(f"Circuit Breaker '{self.name}' переходит в CLOSED после успешного запроса", extra={
                "name": self.name
            })
            self.state = CircuitState.CLOSED
            self.failure_count = 0
        elif self.state == CircuitState.CLOSED:
            # Сбрасываем счетчик ошибок при успехе
            if self.failure_count > 0:
                self.failure_count = 0
    
    async def _on_failure(self):
        """Обработка ошибки"""
        self.last_failure_time = datetime.now()
        self.failure_count += 1
        
        logger.warning(f"Circuit Breaker '{self.name}': ошибка #{self.failure_count}/{self.failure_threshold}", extra={
            "name": self.name,
            "failure_count": self.failure_count,
            "failure_threshold": self.failure_threshold,
            "state": self.state.value
        })
        
        if self.failure_count >= self.failure_threshold:
            if self.state != CircuitState.OPEN:
                logger.error(f"Circuit Breaker '{self.name}' переходит в OPEN после {self.failure_count} ошибок", extra={
                    "name": self.name,
                    "failure_count": self.failure_count,
                    "recovery_timeout": self.recovery_timeout
                })
                self.state = CircuitState.OPEN
        elif self.state == CircuitState.HALF_OPEN:
            # В HALF_OPEN любая ошибка возвращает в OPEN
            logger.error(f"Circuit Breaker '{self.name}' возвращается в OPEN из HALF_OPEN", extra={
                "name": self.name
            })
            self.state = CircuitState.OPEN
    
    def get_state(self) -> CircuitState:
        """Получить текущее состояние"""
        return self.state
    
    def reset(self):
        """Сброс Circuit Breaker в начальное состояние"""
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = None
        self.last_success_time = None
        logger.info(f"Circuit Breaker '{self.name}' сброшен", extra={"name": self.name})


class CircuitBreakerOpenError(Exception):
    """Исключение при попытке вызова через открытый Circuit Breaker"""
    pass


# Глобальные экземпляры Circuit Breaker для разных сервисов
_breakers: dict[str, CircuitBreaker] = {}


def get_circuit_breaker(name: str, **kwargs) -> CircuitBreaker:
    """
    Получить или создать Circuit Breaker по имени
    
    Args:
        name: Имя Circuit Breaker
        **kwargs: Параметры для создания (если не существует)
        
    Returns:
        Экземпляр CircuitBreaker
    """
    if name not in _breakers:
        _breakers[name] = CircuitBreaker(name=name, **kwargs)
    return _breakers[name]


def circuit_breaker(
    failure_threshold: int = 5,
    recovery_timeout: int = 60,
    expected_exception: type = Exception,
    name: Optional[str] = None
):
    """
    Декоратор для применения Circuit Breaker к функции
    
    Args:
        failure_threshold: Количество ошибок для перехода в OPEN
        recovery_timeout: Время в секундах до перехода из OPEN в HALF_OPEN
        expected_exception: Тип исключения, которое считается ошибкой
        name: Имя Circuit Breaker (по умолчанию имя функции)
        
    Example:
        @circuit_breaker(failure_threshold=5, recovery_timeout=60)
        async def call_external_api():
            ...
    """
    def decorator(func: Callable) -> Callable:
        breaker_name = name or f"{func.__module__}.{func.__name__}"
        breaker = get_circuit_breaker(
            breaker_name,
            failure_threshold=failure_threshold,
            recovery_timeout=recovery_timeout,
            expected_exception=expected_exception
        )
        
        async def async_wrapper(*args, **kwargs):
            return await breaker.call(func, *args, **kwargs)
        
        def sync_wrapper(*args, **kwargs):
            # Для синхронных функций создаем новый event loop или используем существующий
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # Если loop уже запущен, используем run_until_complete
                    return loop.run_until_complete(breaker.call(func, *args, **kwargs))
                else:
                    return loop.run_until_complete(breaker.call(func, *args, **kwargs))
            except RuntimeError:
                # Если нет event loop, создаем новый
                return asyncio.run(breaker.call(func, *args, **kwargs))
        
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator

