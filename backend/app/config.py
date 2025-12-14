"""
Конфигурация приложения с использованием pydantic-settings
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List, Optional
from functools import lru_cache
import os


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
    secret_key: str = "your-secret-key-here-change-in-production"
    
    # Ключ для шифрования чувствительных данных (пароли Firebird, API ключи)
    # Если не указан, используется secret_key
    encryption_key: Optional[str] = None
    
    # Настройки JWT
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 30
    
    # Настройки администратора по умолчанию (для первого запуска)
    admin_username: str = "admin"
    admin_password: str = "admin123"
    admin_email: str = "admin@example.com"
    
    # Включить/выключить аутентификацию (по умолчанию выключена для обратной совместимости)
    enable_auth: bool = False
    
    # Настройки Rate Limiting
    enable_rate_limit: bool = True  # Включить rate limiting
    rate_limit_default: str = "100/minute"  # Лимит по умолчанию (100 запросов в минуту)
    rate_limit_strict: str = "10/minute"  # Строгий лимит для критичных endpoints (загрузка файлов, аутентификация)
    
    # Версия API
    api_version: str = "1.0.0"
    
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


@lru_cache()
def get_settings() -> Settings:
    """
    Получение настроек приложения (singleton через lru_cache)
    """
    return Settings()
