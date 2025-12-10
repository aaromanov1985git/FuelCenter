"""
Rate Limiting middleware для защиты от DDoS и злоупотреблений
"""
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request, status
from fastapi.responses import JSONResponse
from app.config import get_settings
from app.logger import logger

settings = get_settings()

# Инициализация Limiter
# Используем IP адрес клиента для идентификации
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[settings.rate_limit_default] if settings.enable_rate_limit else [],
    storage_uri="memory://",  # Хранилище в памяти (можно заменить на Redis для распределенной системы)
    headers_enabled=True  # Добавляем заголовки с информацией о лимитах
)


def get_rate_limit_key(request: Request) -> str:
    """
    Получение ключа для rate limiting
    
    Приоритет:
    1. IP адрес из заголовка X-Forwarded-For (если за прокси)
    2. IP адрес клиента напрямую
    
    Args:
        request: FastAPI Request объект
        
    Returns:
        str: IP адрес клиента
    """
    # Проверяем заголовок X-Forwarded-For (для работы за прокси/nginx)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Берем первый IP (клиент) из списка
        client_ip = forwarded_for.split(",")[0].strip()
        return client_ip
    
    # Проверяем заголовок X-Real-IP (альтернативный способ)
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    
    # Используем стандартный способ получения IP
    return get_remote_address(request)


def setup_rate_limiting(app):
    """
    Настройка rate limiting для приложения
    
    Args:
        app: FastAPI приложение
    """
    if not settings.enable_rate_limit:
        logger.info("Rate limiting отключен")
        return
    
    # Добавляем limiter к приложению
    app.state.limiter = limiter
    
    # Переопределяем key_func для поддержки X-Forwarded-For
    limiter.key_func = get_rate_limit_key
    
    # Обработчик превышения лимита
    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
        """
        Обработчик превышения rate limit
        
        Args:
            request: FastAPI Request
            exc: Исключение RateLimitExceeded
            
        Returns:
            JSONResponse: Ответ с ошибкой 429
        """
        client_ip = get_rate_limit_key(request)
        
        logger.warning(
            "Превышен rate limit",
            extra={
                "path": request.url.path,
                "method": request.method,
                "client_ip": client_ip,
                "limit": str(exc.detail)
            }
        )
        
        # Получаем информацию о лимите из заголовков
        retry_after = getattr(exc, "retry_after", None)
        
        response = JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "detail": "Превышен лимит запросов. Пожалуйста, попробуйте позже.",
                "error_code": "RATE_LIMIT_EXCEEDED",
                "retry_after": retry_after
            }
        )
        
        # Добавляем заголовки для информации о лимите
        if retry_after:
            response.headers["Retry-After"] = str(retry_after)
        
        return response
    
    logger.info(
        "Rate limiting включен",
        extra={
            "default_limit": settings.rate_limit_default,
            "strict_limit": settings.rate_limit_strict
        }
    )

