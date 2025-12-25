"""
Хелпер для асинхронной отправки уведомлений
Можно использовать в роутерах для неблокирующей отправки
"""
from typing import Optional, List
from sqlalchemy.orm import Session
from app.services.notification_service import NotificationService


def send_notification_async(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    category: str = "system",
    notification_type: str = "info",
    channels: Optional[List[str]] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    force: bool = False
):
    """
    Синхронная обертка для отправки уведомлений
    Можно использовать в BackgroundTasks от FastAPI
    
    Пример использования:
        from fastapi import BackgroundTasks
        
        @router.post("/upload")
        async def upload_file(
            background_tasks: BackgroundTasks,
            db: Session = Depends(get_db),
            ...
        ):
            # Основная логика
            result = process_file(...)
            
            # Асинхронная отправка уведомления (не блокирует ответ)
            background_tasks.add_task(
                send_notification_async,
                db=db,
                user_id=current_user.id,
                title="Файл загружен",
                message=f"Обработано транзакций: {result.count}",
                category="upload_events",
                notification_type="success"
            )
            
            return result
    """
    try:
        service = NotificationService(db)
        service.send_notification(
            user_id=user_id,
            title=title,
            message=message,
            category=category,
            notification_type=notification_type,
            channels=channels,
            entity_type=entity_type,
            entity_id=entity_id,
            force=force
        )
    except Exception as e:
        # Логируем ошибку, но не падаем
        from app.logger import logger
        logger.error(f"Failed to send notification asynchronously: {e}", exc_info=True)

