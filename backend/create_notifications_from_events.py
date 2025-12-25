"""
Скрипт для создания уведомлений из существующих событий загрузки
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models import UploadEvent
from app.services.notification_service import NotificationService
from app.logger import logger

def create_notifications_from_events():
    """
    Создает уведомления для существующих событий загрузки, у которых есть user_id
    """
    db = SessionLocal()
    try:
        # Получаем все события с user_id, для которых еще нет уведомлений
        events = db.query(UploadEvent).filter(
            UploadEvent.user_id.isnot(None)
        ).order_by(UploadEvent.created_at.desc()).all()
        
        logger.info(f"Найдено {len(events)} событий загрузки с user_id")
        
        notification_service = NotificationService(db)
        created_count = 0
        skipped_count = 0
        
        for event in events:
            try:
                # Пропускаем проверку - создаем уведомления для всех событий
                # (скрипт можно запускать несколько раз, дубликаты будут пропущены при создании)
                
                # Определяем тип и категорию уведомления
                if event.status == "failed":
                    notification_type = "error"
                    category = "errors"
                    title = f"Ошибка загрузки: {event.file_name or 'файл'}"
                elif event.status == "partial":
                    notification_type = "warning"
                    category = "upload_events"
                    title = f"Частичная загрузка: {event.file_name or 'файл'}"
                else:  # success
                    notification_type = "success"
                    category = "upload_events"
                    title = f"Загрузка завершена: {event.file_name or 'файл'}"
                
                # Формируем сообщение
                notification_message = f"Файл: {event.file_name or 'неизвестно'}\n"
                notification_message += f"Транзакций: создано {event.transactions_created}, пропущено {event.transactions_skipped}"
                if event.transactions_failed > 0:
                    notification_message += f", ошибок {event.transactions_failed}"
                if event.message:
                    notification_message += f"\n{event.message}"
                
                # Отправляем уведомление (только in-app)
                try:
                    result = notification_service.send_notification(
                        user_id=event.user_id,
                        title=title,
                        message=notification_message,
                        category=category,
                        notification_type=notification_type,
                        channels=["in_app"],
                        entity_type="UploadEvent",
                        entity_id=event.id
                    )
                    
                    logger.info(f"Результат создания уведомления для события {event.id}: {result}")
                    
                    # Проверяем результат
                    if "error" in result:
                        logger.warning(f"Ошибка при создании уведомления для события {event.id}: {result.get('error')}")
                    elif result.get("success") or "delivery_status" in result:
                        # Проверяем, действительно ли создано уведомление
                        from app.models import Notification
                        check_notif = db.query(Notification).filter(
                            Notification.entity_type == "UploadEvent",
                            Notification.entity_id == event.id,
                            Notification.user_id == event.user_id
                        ).first()
                        if check_notif:
                            created_count += 1
                            logger.info(f"Уведомление успешно создано для события {event.id}, user_id={event.user_id}, notification_id={check_notif.id}")
                            if created_count % 10 == 0:
                                logger.info(f"Создано {created_count} уведомлений...")
                        else:
                            logger.error(f"ОШИБКА: Результат успешный, но уведомление не найдено в БД для события {event.id}")
                    else:
                        logger.warning(f"Неожиданный результат для события {event.id}: {result}")
                except Exception as send_error:
                    logger.error(f"Исключение при создании уведомления для события {event.id}: {send_error}", exc_info=True)
                    db.rollback()
            except Exception as e:
                logger.error(f"Ошибка при создании уведомления для события {event.id}: {e}", exc_info=True)
        
        logger.info(f"Создание уведомлений завершено. Создано: {created_count}, Пропущено (уже существуют): {skipped_count}")
        return created_count, skipped_count
        
    except Exception as e:
        logger.error(f"Ошибка при создании уведомлений из событий: {e}", exc_info=True)
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("Создание уведомлений из существующих событий загрузки...")
    created, skipped = create_notifications_from_events()
    print(f"Готово! Создано: {created}, Пропущено: {skipped}")

