"""
Alembic environment для миграций БД
"""
from logging.config import fileConfig
from sqlalchemy import engine_from_config
from sqlalchemy import pool
from alembic import context
import sys
import os

# Добавляем путь к приложению
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# Импортируем конфигурацию и модели
from app.config import get_settings
from app.database import Base, engine
from app.models import (
    Transaction, Vehicle, Provider, ProviderTemplate, 
    FuelCard, UploadPeriodLock, User, GasStation, NormalizationSettings, CardInfoSchedule,
    VehicleRefuel, VehicleLocation, FuelCardAnalysisResult, Notification, NotificationSettings,
    Tank, TankReading, CardLimit, TopazSyncState, StationShare
)

# Конфигурация Alembic
config = context.config

# Получаем URL БД из конфигурации приложения
# Приоритет: переменная окружения DATABASE_URL > значение из настроек
settings = get_settings()
database_url = os.getenv("DATABASE_URL") or settings.database_url
config.set_main_option('sqlalchemy.url', database_url)

# Настройка логирования
if config.config_file_name is not None:
    # Не глушить логгеры приложения: env.py выполняется при старте из main.py,
    # и fileConfig по умолчанию отключает все уже созданные логгеры (gsm_converter)
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# Метаданные для автогенерации миграций
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """
    Запуск миграций в offline режиме
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Запуск миграций в online режиме
    Используем существующий engine из app.database
    """
    with engine.connect() as connection:
        context.configure(
            connection=connection, 
            target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
