"""
Скрипт для применения миграций БД
"""
import sys
import os

# Добавляем путь к приложению
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from alembic.config import Config
from alembic import command
from app.config import get_settings
from app.logger import logger


def run_migrations():
    """
    Применение всех миграций к БД
    """
    try:
        alembic_cfg = Config(os.path.join(os.path.dirname(__file__), '..', 'alembic.ini'))
        command.upgrade(alembic_cfg, "head")
        logger.info("Миграции БД успешно применены")
    except Exception as e:
        logger.error(f"Ошибка при применении миграций: {e}", extra={"error": str(e)}, exc_info=True)
        raise


if __name__ == "__main__":
    run_migrations()
