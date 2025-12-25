"""
Сервис для фиксации событий загрузок
"""
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from app.models import UploadEvent
from app.logger import logger


class UploadEventService:
    """
    Упрощенный сервис для записи событий загрузок
    """

    def __init__(self, db: Session):
        self.db = db

    def log_event(
        self,
        *,
        source_type: str,
        status: str,
        is_scheduled: bool = False,
        file_name: Optional[str] = None,
        provider_id: Optional[int] = None,
        template_id: Optional[int] = None,
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        transactions_total: int = 0,
        transactions_created: int = 0,
        transactions_skipped: int = 0,
        transactions_failed: int = 0,
        duration_ms: Optional[int] = None,
        message: Optional[str] = None,
    ) -> UploadEvent:
        """
        Создает запись о событии загрузки и уведомление для пользователя
        """
        try:
            event = UploadEvent(
                source_type=source_type,
                status=status,
                is_scheduled=is_scheduled,
                file_name=file_name,
                provider_id=provider_id,
                template_id=template_id,
                user_id=user_id,
                username=username,
                transactions_total=transactions_total or 0,
                transactions_created=transactions_created or 0,
                transactions_skipped=transactions_skipped or 0,
                transactions_failed=transactions_failed or 0,
                duration_ms=duration_ms,
                message=message,
            )

            self.db.add(event)
            self.db.commit()
            self.db.refresh(event)
            
            logger.debug("Событие загрузки успешно записано в журнал", extra={
                "event_id": event.id,
                "source_type": source_type,
                "status": status,
                "template_id": template_id
            })
            
            # Создаем уведомление для пользователя, если указан user_id
            if user_id:
                try:
                    from app.services.notification_service import NotificationService
                    notification_service = NotificationService(self.db)
                    
                    # Определяем тип и категорию уведомления
                    if status == "failed":
                        notification_type = "error"
                        category = "errors"
                        title = f"Ошибка загрузки: {file_name or 'файл'}"
                    elif status == "partial":
                        notification_type = "warning"
                        category = "upload_events"
                        title = f"Частичная загрузка: {file_name or 'файл'}"
                    else:  # success
                        notification_type = "success"
                        category = "upload_events"
                        title = f"Загрузка завершена: {file_name or 'файл'}"
                    
                    # Формируем сообщение
                    notification_message = f"Файл: {file_name or 'неизвестно'}\n"
                    notification_message += f"Транзакций: создано {transactions_created}, пропущено {transactions_skipped}"
                    if transactions_failed > 0:
                        notification_message += f", ошибок {transactions_failed}"
                    if message:
                        notification_message += f"\n{message}"
                    
                    # Отправляем уведомление (только in-app, с force=True для обязательной доставки)
                    notification_service.send_notification(
                        user_id=user_id,
                        title=title,
                        message=notification_message,
                        category=category,
                        notification_type=notification_type,
                        channels=["in_app"],  # Только in-app уведомления
                        entity_type="UploadEvent",
                        entity_id=event.id,
                        force=True  # Обязательное уведомление, игнорирует настройки пользователя
                    )
                    logger.debug(f"Уведомление создано для события загрузки {event.id}", extra={
                        "event_id": event.id,
                        "user_id": user_id,
                        "category": category
                    })
                except Exception as notif_error:
                    # Не прерываем основной процесс, если уведомление не удалось создать
                    logger.warning(f"Не удалось создать уведомление для события загрузки {event.id}: {notif_error}", exc_info=True)
            
            return event
        except Exception as exc:
            # Делаем rollback при ошибке
            try:
                self.db.rollback()
            except Exception as rollback_error:
                logger.error("Ошибка при откате транзакции при логировании события", extra={
                    "rollback_error": str(rollback_error),
                    "original_error": str(exc)
                }, exc_info=True)
            
            logger.error(
                "Не удалось записать событие загрузки в журнал",
                extra={
                    "error": str(exc),
                    "error_type": type(exc).__name__,
                    "source_type": source_type,
                    "status": status,
                    "file_name": file_name,
                    "provider_id": provider_id,
                    "template_id": template_id,
                    "user_id": user_id,
                },
                exc_info=True,
            )
            # Не прерываем основной поток — возвращаем псевдообъект
            return UploadEvent(
                source_type=source_type,
                status=status,
                is_scheduled=is_scheduled,
                file_name=file_name,
                provider_id=provider_id,
                template_id=template_id,
                user_id=user_id,
                username=username,
                transactions_total=transactions_total or 0,
                transactions_created=transactions_created or 0,
                transactions_skipped=transactions_skipped or 0,
                transactions_failed=transactions_failed or 0,
                duration_ms=duration_ms,
                message=message,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
