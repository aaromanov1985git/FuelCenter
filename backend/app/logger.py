"""
Модуль для настройки структурированного логирования
"""
import logging
import sys
import json
import traceback
from datetime import datetime
from typing import Any, Dict, Optional


class DatabaseLogHandler(logging.Handler):
    """
    Handler для сохранения логов в базу данных
    """
    
    def __init__(self, level=logging.NOTSET):
        super().__init__(level)
        self._db = None
    
    def emit(self, record: logging.LogRecord):
        """
        Сохраняет лог в базу данных
        """
        try:
            # Импортируем здесь, чтобы избежать циклических зависимостей
            from app.database import SessionLocal
            from app.models import SystemLog
            
            # Создаем новую сессию для каждого лога
            db = SessionLocal()
            try:
                # Извлекаем информацию из extra
                extra_data = {}
                event_type = None
                event_category = None
                
                if hasattr(record, 'extra') and record.extra:
                    extra_data = record.extra.copy()
                    event_type = extra_data.pop('event_type', None)
                    event_category = extra_data.pop('event_category', None)
                
                # Определяем event_type и event_category из имени логгера и модуля
                if not event_type:
                    if 'scheduler' in record.name.lower() or 'scheduler' in record.module.lower():
                        event_type = 'scheduler'
                    elif 'database' in record.name.lower() or 'database' in record.module.lower():
                        event_type = 'database'
                    elif 'service' in record.name.lower() or 'service' in record.module.lower():
                        event_type = 'service'
                    elif 'router' in record.name.lower() or 'router' in record.module.lower():
                        event_type = 'request'
                    else:
                        event_type = 'system'
                
                if not event_category:
                    if 'auth' in record.name.lower() or 'auth' in record.module.lower():
                        event_category = 'auth'
                    elif 'upload' in record.name.lower() or 'upload' in record.module.lower():
                        event_category = 'upload'
                    elif 'transaction' in record.name.lower() or 'transaction' in record.module.lower():
                        event_category = 'transaction'
                    elif 'template' in record.name.lower() or 'template' in record.module.lower():
                        event_category = 'template'
                    else:
                        event_category = 'general'
                
                # Обрабатываем информацию об исключении
                exception_type = None
                exception_message = None
                stack_trace = None
                
                if record.exc_info:
                    exc_type, exc_value, exc_traceback = record.exc_info
                    exception_type = exc_type.__name__ if exc_type else None
                    exception_message = str(exc_value) if exc_value else None
                    stack_trace = ''.join(traceback.format_exception(*record.exc_info))
                
                # Формируем extra_data в JSON
                extra_data_json = None
                if extra_data:
                    try:
                        extra_data_json = json.dumps(extra_data, ensure_ascii=False, default=str)
                    except Exception:
                        extra_data_json = str(extra_data)
                
                # Создаем запись в БД
                log_entry = SystemLog(
                    level=record.levelname,
                    message=record.getMessage(),
                    module=record.module,
                    function=record.funcName,
                    line_number=record.lineno,
                    event_type=event_type,
                    event_category=event_category,
                    extra_data=extra_data_json,
                    exception_type=exception_type,
                    exception_message=exception_message,
                    stack_trace=stack_trace,
                    created_at=datetime.utcnow()
                )
                
                db.add(log_entry)
                db.commit()
            except Exception as e:
                # Не логируем ошибки логирования, чтобы избежать рекурсии
                db.rollback()
                # Выводим в stderr для отладки
                print(f"Ошибка сохранения лога в БД: {e}", file=sys.stderr)
            finally:
                db.close()
        except Exception:
            # Игнорируем все ошибки при сохранении логов, чтобы не нарушить работу приложения
            pass


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
    
    # Добавляем DatabaseHandler для сохранения логов в БД
    # Сохраняем только WARNING и выше, чтобы не перегружать БД
    try:
        db_handler = DatabaseLogHandler(level=logging.WARNING)
        db_handler.setLevel(logging.WARNING)
        logger.addHandler(db_handler)
    except Exception as e:
        # Если не удалось создать DatabaseHandler (например, БД еще не инициализирована),
        # продолжаем работу без него
        print(f"Не удалось создать DatabaseHandler для логов: {e}", file=sys.stderr)
    
    return logger


# Создаем глобальный logger
logger = setup_logging()
