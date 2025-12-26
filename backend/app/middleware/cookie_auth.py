"""
Middleware для cookie-based аутентификации
Поддерживает httpOnly cookies для безопасного хранения JWT токенов
"""
from datetime import timedelta
from fastapi import Request, Response
from fastapi.security import OAuth2PasswordBearer
from typing import Optional
from app.config import get_settings
from app.logger import logger

settings = get_settings()

# Имя cookie для токена
ACCESS_TOKEN_COOKIE_NAME = "gsm_access_token"
REFRESH_TOKEN_COOKIE_NAME = "gsm_refresh_token"

# Настройки cookie зависят от окружения
IS_PRODUCTION = settings.environment.lower() == "production"

# COOKIE_SECURE определяется отдельной переменной или автоматически
# Это позволяет тестировать production конфигурацию локально без HTTPS
import os
COOKIE_SECURE_OVERRIDE = os.getenv("COOKIE_SECURE", "").lower()
if COOKIE_SECURE_OVERRIDE == "true":
    COOKIE_SECURE = True
elif COOKIE_SECURE_OVERRIDE == "false":
    COOKIE_SECURE = False
else:
    # По умолчанию: secure только если HTTPS (проверяем по порту или явно в production + не localhost)
    # Для локальной разработки всегда false
    COOKIE_SECURE = False  # Временно отключаем для отладки
    # TODO: в реальном production включить через COOKIE_SECURE=true
COOKIE_HTTPONLY = True  # Защита от XSS - всегда включено
COOKIE_SAMESITE = "lax"  # Защита от CSRF
COOKIE_PATH = "/"
COOKIE_DOMAIN = None  # Использовать текущий домен


def set_access_token_cookie(
    response: Response,
    token: str,
    expires_minutes: Optional[int] = None
) -> None:
    """
    Установка access token в httpOnly cookie
    
    Args:
        response: FastAPI Response объект
        token: JWT токен
        expires_minutes: Время жизни cookie в минутах
    """
    if expires_minutes is None:
        expires_minutes = settings.jwt_expire_minutes
    
    logger.debug(f"Setting access token cookie: secure={COOKIE_SECURE}, samesite={COOKIE_SAMESITE}, httponly={COOKIE_HTTPONLY}")
    
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE_NAME,
        value=token,
        max_age=expires_minutes * 60,  # в секундах
        expires=expires_minutes * 60,
        path=COOKIE_PATH,
        domain=COOKIE_DOMAIN,
        secure=COOKIE_SECURE,
        httponly=COOKIE_HTTPONLY,
        samesite=COOKIE_SAMESITE
    )


def set_refresh_token_cookie(
    response: Response,
    token: str,
    expires_days: int = 7
) -> None:
    """
    Установка refresh token в httpOnly cookie
    
    Args:
        response: FastAPI Response объект
        token: JWT refresh токен
        expires_days: Время жизни cookie в днях
    """
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        value=token,
        max_age=expires_days * 24 * 60 * 60,  # в секундах
        expires=expires_days * 24 * 60 * 60,
        path=COOKIE_PATH,
        domain=COOKIE_DOMAIN,
        secure=COOKIE_SECURE,
        httponly=COOKIE_HTTPONLY,
        samesite=COOKIE_SAMESITE
    )


def delete_auth_cookies(response: Response) -> None:
    """
    Удаление всех auth cookies (для logout)
    
    Args:
        response: FastAPI Response объект
    """
    response.delete_cookie(
        key=ACCESS_TOKEN_COOKIE_NAME,
        path=COOKIE_PATH,
        domain=COOKIE_DOMAIN
    )
    response.delete_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        path=COOKIE_PATH,
        domain=COOKIE_DOMAIN
    )


def get_token_from_cookie(request: Request) -> Optional[str]:
    """
    Извлечение токена из cookie
    
    Args:
        request: FastAPI Request объект
    
    Returns:
        JWT токен или None
    """
    token = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)
    if token:
        logger.info(f"[COOKIE] Found access token in cookie (length: {len(token)})")
    else:
        # Логируем все cookies для отладки (без значений)
        cookie_names = list(request.cookies.keys())
        cookie_header = request.headers.get("cookie", "NO COOKIE HEADER")
        logger.info(f"[COOKIE] No access token. Available cookies: {cookie_names}, Cookie header: {cookie_header[:100] if len(cookie_header) > 100 else cookie_header}")
    return token


def get_refresh_token_from_cookie(request: Request) -> Optional[str]:
    """
    Извлечение refresh токена из cookie
    
    Args:
        request: FastAPI Request объект
    
    Returns:
        JWT refresh токен или None
    """
    return request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)


def get_token_from_request(request: Request) -> Optional[str]:
    """
    Извлечение токена из cookie ИЛИ заголовка Authorization
    (для обратной совместимости с мобильными клиентами)
    
    Приоритет: Cookie > Authorization Header
    
    Args:
        request: FastAPI Request объект
    
    Returns:
        JWT токен или None
    """
    # Сначала проверяем cookie
    token = get_token_from_cookie(request)
    if token:
        return token
    
    # Fallback на заголовок Authorization
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:]  # Убираем "Bearer "
    
    return None

