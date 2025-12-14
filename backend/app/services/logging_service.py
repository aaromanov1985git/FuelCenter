"""
Сервис для логирования системных событий и действий пользователей
"""
from typing import Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from app.models import SystemLog, UserActionLog
from app.logger import logger
import json
import traceback


class LoggingService:
    """
    Сервис для записи логов в базу данных
    """
    
    @staticmethod
    def log_system_event(
        db: Session,
        level: str,
        message: str,
        module: Optional[str] = None,
        function: Optional[str] = None,
        line_number: Optional[int] = None,
        event_type: Optional[str] = None,
        event_category: Optional[str] = None,
        extra_data: Optional[Dict[str, Any]] = None,
        exception: Optional[Exception] = None
    ) -> SystemLog:
        """
        Логирование системного события
        
        Args:
            db: Сессия базы данных
            level: Уровень логирования (DEBUG, INFO, WARNING, ERROR, CRITICAL)
            message: Сообщение лога
            module: Модуль, где произошло событие
            function: Функция, где произошло событие
            line_number: Номер строки кода
            event_type: Тип события (request, database, service, scheduler, etc.)
            event_category: Категория события (auth, upload, transaction, etc.)
            extra_data: Дополнительные данные
            exception: Исключение (если есть)
        
        Returns:
            Созданная запись SystemLog
        """
        try:
            # Подготавливаем данные для записи
            extra_data_json = None
            if extra_data:
                try:
                    extra_data_json = json.dumps(extra_data, ensure_ascii=False, default=str)
                except Exception:
                    extra_data_json = str(extra_data)
            
            exception_type = None
            exception_message = None
            stack_trace = None
            
            if exception:
                exception_type = type(exception).__name__
                exception_message = str(exception)
                stack_trace = traceback.format_exc()
            
            # Создаем запись лога
            log_entry = SystemLog(
                level=level.upper(),
                message=message,
                module=module,
                function=function,
                line_number=line_number,
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
            db.refresh(log_entry)
            
            # Также логируем в стандартный logger для консоли
            log_method = getattr(logger, level.lower(), logger.info)
            log_method(message, extra=extra_data)
            
            return log_entry
            
        except Exception as e:
            # Если не удалось записать в БД, логируем в консоль
            logger.error(f"Ошибка при записи системного лога в БД: {e}", exc_info=True)
            db.rollback()
            raise
    
    @staticmethod
    def log_user_action(
        db: Session,
        user_id: Optional[int],
        username: Optional[str],
        action_type: str,
        action_description: str,
        action_category: Optional[str] = None,
        entity_type: Optional[str] = None,
        entity_id: Optional[int] = None,
        request_data: Optional[Dict[str, Any]] = None,
        response_data: Optional[Dict[str, Any]] = None,
        changes: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        request_method: Optional[str] = None,
        request_path: Optional[str] = None,
        status: str = "success",
        error_message: Optional[str] = None
    ) -> UserActionLog:
        """
        Логирование действия пользователя
        
        Args:
            db: Сессия базы данных
            user_id: ID пользователя
            username: Имя пользователя
            action_type: Тип действия (login, logout, create, update, delete, view, export, etc.)
            action_description: Описание действия
            action_category: Категория действия (auth, transaction, vehicle, organization, etc.)
            entity_type: Тип сущности (Transaction, Vehicle, Organization, etc.)
            entity_id: ID сущности
            request_data: Данные запроса
            response_data: Данные ответа
            changes: Изменения (для update операций)
            ip_address: IP адрес пользователя
            user_agent: User-Agent браузера
            request_method: HTTP метод
            request_path: Путь запроса
            status: Статус действия (success, failed, partial)
            error_message: Сообщение об ошибке
        
        Returns:
            Созданная запись UserActionLog
        """
        try:
            # Подготавливаем JSON данные
            request_data_json = None
            if request_data:
                try:
                    request_data_json = json.dumps(request_data, ensure_ascii=False, default=str)
                except Exception:
                    request_data_json = str(request_data)
            
            response_data_json = None
            if response_data:
                try:
                    response_data_json = json.dumps(response_data, ensure_ascii=False, default=str)
                except Exception:
                    response_data_json = str(response_data)
            
            changes_json = None
            if changes:
                try:
                    changes_json = json.dumps(changes, ensure_ascii=False, default=str)
                except Exception:
                    changes_json = str(changes)
            
            # Создаем запись лога
            log_entry = UserActionLog(
                user_id=user_id,
                username=username,
                action_type=action_type,
                action_category=action_category,
                action_description=action_description,
                entity_type=entity_type,
                entity_id=entity_id,
                request_data=request_data_json,
                response_data=response_data_json,
                changes=changes_json,
                ip_address=ip_address,
                user_agent=user_agent,
                request_method=request_method,
                request_path=request_path,
                status=status,
                error_message=error_message,
                created_at=datetime.utcnow()
            )
            
            db.add(log_entry)
            db.commit()
            db.refresh(log_entry)
            
            # Также логируем в стандартный logger
            logger.info(
                f"Действие пользователя: {action_type} - {action_description}",
                extra={
                    "user_id": user_id,
                    "username": username,
                    "action_type": action_type,
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "status": status
                }
            )
            
            return log_entry
            
        except Exception as e:
            # Если не удалось записать в БД, логируем в консоль
            logger.error(f"Ошибка при записи лога действия пользователя в БД: {e}", exc_info=True)
            db.rollback()
            raise


# Создаем экземпляр сервиса
logging_service = LoggingService()
