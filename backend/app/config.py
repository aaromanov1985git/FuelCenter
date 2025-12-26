"""
Конфигурация приложения с использованием pydantic-settings
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, model_validator
from typing import List, Optional
from functools import lru_cache
import os
import secrets


# Небезопасные значения по умолчанию (используются только для development)
_INSECURE_DEFAULT_SECRET = "your-secret-key-here-change-in-production"
_INSECURE_DEFAULT_PASSWORD = "admin123"


class Settings(BaseSettings):
    """
    Настройки приложения
    Все значения могут быть переопределены через переменные окружения
    """
    # База данных
    # По умолчанию для локальной разработки
    # В Docker будет переопределено через переменную окружения DATABASE_URL
    database_url: str = "postgresql://gsm_user:gsm_password@localhost:5432/gsm_db"
    
    # CORS настройки (строка с разделителем запятая)
    # Включает localhost для разработки и внешний домен для production
    allowed_origins: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173,http://defectively-nimble-rattail.cloudpub.ru,https://defectively-nimble-rattail.cloudpub.ru"
    
    # Настройки приложения
    debug: bool = False
    environment: str = "development"
    log_level: str = "INFO"
    
    # Настройки загрузки файлов
    max_upload_size: int = 52428800  # 50MB в байтах
    
    # Секретный ключ для JWT
    # КРИТИЧНО: В production ОБЯЗАТЕЛЬНО установите через переменную окружения SECRET_KEY
    # Пример генерации: python -c "import secrets; print(secrets.token_urlsafe(64))"
    secret_key: str = _INSECURE_DEFAULT_SECRET
    
    # Ключ для шифрования чувствительных данных (пароли Firebird, API ключи)
    # Если не указан, используется secret_key
    encryption_key: Optional[str] = None
    
    # Настройки JWT
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 30
    
    # Настройки администратора по умолчанию (для первого запуска)
    # КРИТИЧНО: В production ОБЯЗАТЕЛЬНО установите через переменные окружения!
    # ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_EMAIL
    admin_username: str = "admin"
    admin_password: str = _INSECURE_DEFAULT_PASSWORD
    admin_email: str = "admin@example.com"
    
    @model_validator(mode='after')
    def validate_production_security(self) -> 'Settings':
        """
        Валидация критических настроек безопасности для production
        Блокирует запуск с небезопасными значениями в production
        """
        if self.environment.lower() == "production":
            errors = []
            
            # Проверяем SECRET_KEY
            if self.secret_key == _INSECURE_DEFAULT_SECRET:
                errors.append(
                    "SECRET_KEY: Используется небезопасное значение по умолчанию. "
                    "Установите переменную окружения SECRET_KEY с безопасным ключом. "
                    "Сгенерируйте: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
                )
            elif len(self.secret_key) < 32:
                errors.append(
                    f"SECRET_KEY: Ключ слишком короткий ({len(self.secret_key)} символов). "
                    "Минимальная длина: 32 символа"
                )
            
            # Проверяем ADMIN_PASSWORD
            if self.admin_password == _INSECURE_DEFAULT_PASSWORD:
                errors.append(
                    "ADMIN_PASSWORD: Используется небезопасный пароль по умолчанию 'admin123'. "
                    "Установите переменную окружения ADMIN_PASSWORD с надёжным паролем"
                )
            elif len(self.admin_password) < 8:
                errors.append(
                    f"ADMIN_PASSWORD: Пароль слишком короткий ({len(self.admin_password)} символов). "
                    "Минимальная длина: 8 символов"
                )
            
            # Проверяем ENCRYPTION_KEY если используется
            if self.encryption_key and len(self.encryption_key) < 32:
                errors.append(
                    f"ENCRYPTION_KEY: Ключ шифрования слишком короткий. "
                    "Минимальная длина: 32 символа"
                )
            
            if errors:
                error_msg = "\n\n🔴 КРИТИЧЕСКИЕ ОШИБКИ БЕЗОПАСНОСТИ (production):\n\n" + \
                           "\n\n".join(f"  {i+1}. {e}" for i, e in enumerate(errors)) + \
                           "\n\n⚠️  Приложение не может быть запущено в production с небезопасными настройками.\n"
                raise ValueError(error_msg)
        
        return self
    
    # Включить/выключить аутентификацию (по умолчанию включена для безопасности)
    # Для отключения установите ENABLE_AUTH=false в переменных окружения
    enable_auth: bool = True
    
    # Настройки Rate Limiting
    enable_rate_limit: bool = True  # Включить rate limiting
    rate_limit_default: str = "100/minute"  # Лимит по умолчанию (100 запросов в минуту)
    rate_limit_strict: str = "10/minute"  # Строгий лимит для критичных endpoints (загрузка файлов, аутентификация)
    
    # Версия API
    api_version: str = "1.0.0"
    
    # Настройки уведомлений - Email
    email_enabled: bool = False
    email_smtp_host: Optional[str] = None
    email_smtp_port: int = 587
    email_smtp_user: Optional[str] = None
    email_smtp_password: Optional[str] = None
    email_from_address: Optional[str] = None
    email_from_name: str = "GSM Converter"
    email_use_tls: bool = True
    
    # Настройки уведомлений - Telegram
    telegram_enabled: bool = False
    telegram_bot_token: Optional[str] = None
    
    # Настройки уведомлений - Push
    push_enabled: bool = True
    push_vapid_public_key: Optional[str] = None
    push_vapid_private_key: Optional[str] = None
    push_vapid_subject: Optional[str] = None
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        env_prefix="",
        # Приоритет переменных окружения над .env файлом
        env_ignore_empty=True
    )
    
    def get_allowed_origins_list(self) -> List[str]:
        """
        Получение списка разрешенных источников из строки
        """
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


def generate_secure_secret(length: int = 64) -> str:
    """
    Генерация криптографически безопасного секретного ключа
    
    Использование:
        python -c "from app.config import generate_secure_secret; print(generate_secure_secret())"
    
    Args:
        length: Длина ключа в символах (по умолчанию 64)
    
    Returns:
        Безопасный URL-safe ключ
    """
    return secrets.token_urlsafe(length)


def generate_secure_password(length: int = 16) -> str:
    """
    Генерация безопасного пароля
    
    Args:
        length: Длина пароля (по умолчанию 16)
    
    Returns:
        Безопасный пароль
    """
    import string
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return ''.join(secrets.choice(alphabet) for _ in range(length))


@lru_cache()
def get_settings() -> Settings:
    """
    Получение настроек приложения (singleton через lru_cache)
    """
    settings = Settings()
    
    # Предупреждение в development режиме о небезопасных настройках
    if settings.environment.lower() != "production":
        import sys
        warnings = []
        
        if settings.secret_key == _INSECURE_DEFAULT_SECRET:
            warnings.append("SECRET_KEY использует небезопасное значение по умолчанию")
        
        if settings.admin_password == _INSECURE_DEFAULT_PASSWORD:
            warnings.append("ADMIN_PASSWORD использует небезопасный пароль 'admin123'")
        
        if warnings:
            print("\n" + "=" * 60, file=sys.stderr)
            print("⚠️  ПРЕДУПРЕЖДЕНИЕ БЕЗОПАСНОСТИ (development)", file=sys.stderr)
            print("=" * 60, file=sys.stderr)
            for w in warnings:
                print(f"  • {w}", file=sys.stderr)
            print("\nДля production установите переменные окружения:", file=sys.stderr)
            print(f"  SECRET_KEY={generate_secure_secret()}", file=sys.stderr)
            print(f"  ADMIN_PASSWORD={generate_secure_password()}", file=sys.stderr)
            print("  ENVIRONMENT=production", file=sys.stderr)
            print("=" * 60 + "\n", file=sys.stderr)
    
    return settings
