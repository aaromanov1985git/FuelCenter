"""
Модуль для настройки структурированного логирования
"""
import logging
import sys
import json
from datetime import datetime
from typing import Any, Dict


class JSONFormatter(logging.Formatter):
    """
    Форматтер для логирования в JSON формате
    """
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        
        # Добавляем дополнительные поля если они есть
        if hasattr(record, "extra"):
            log_data.update(record.extra)
        
        # Добавляем информацию об исключении если есть
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        
        return json.dumps(log_data, ensure_ascii=False)


def setup_logging(log_level: str = None) -> logging.Logger:
    """
    Настройка логирования для приложения
    
    Args:
        log_level: Уровень логирования (DEBUG, INFO, WARNING, ERROR, CRITICAL)
                  По умолчанию берется из переменной окружения LOG_LEVEL или INFO
    
    Returns:
        Настроенный logger
    """
    import os
    
    # Получаем уровень логирования из переменных окружения или конфигурации
    from app.config import get_settings
    settings = get_settings()
    
    level = log_level or settings.log_level.upper()
    
    # Создаем logger
    logger = logging.getLogger("gsm_converter")
    logger.setLevel(getattr(logging, level, logging.INFO))
    
    # Убираем дублирование логов
    logger.propagate = False
    
    # Создаем handler для вывода в консоль
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, level, logging.INFO))
    
    # Используем JSON форматтер для структурированного логирования
    # В development можно использовать обычный форматтер для читаемости
    if settings.environment == "production":
        formatter = JSONFormatter()
    else:
        # В development используем более читаемый формат
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
    
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    return logger


# Создаем глобальный logger
logger = setup_logging()
