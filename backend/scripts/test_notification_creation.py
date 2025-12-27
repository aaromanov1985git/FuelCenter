"""
Скрипт для тестирования создания уведомлений
"""
import sys
import os

# Добавляем путь к backend в sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import User, Notification, UploadEvent
from app.services.notification_service import NotificationService
from app.services.upload_event_service import UploadEventService
from app.logger import logger

def test_notification_creation():
    """Тестирует создание уведомлений"""
    db: Session = SessionLocal()
    try:
        # Получаем первого пользователя
        user = db.query(User).first()
        if not user:
            print("[ERROR] Пользователи не найдены в базе данных")
            return
        
        print(f"[INFO] Найден пользователь: id={user.id}, username={user.username}")
        
        # Проверяем последние события загрузки
        recent_events = db.query(UploadEvent).order_by(UploadEvent.created_at.desc()).limit(5).all()
        print(f"\n[INFO] Найдено {len(recent_events)} последних событий загрузки:")
        for event in recent_events:
            print(f"  - Event ID: {event.id}, user_id: {event.user_id}, status: {event.status}, created_at: {event.created_at}")
        
        # Проверяем уведомления для пользователя
        notifications = db.query(Notification).filter(
            Notification.user_id == user.id
        ).order_by(Notification.created_at.desc()).limit(10).all()
        
        print(f"\n[INFO] Найдено {len(notifications)} уведомлений для пользователя {user.id}:")
        for notif in notifications:
            print(f"  - Notification ID: {notif.id}, title: {notif.title}, category: {notif.category}, created_at: {notif.created_at}")
        
        # Тестируем создание уведомления напрямую
        print(f"\n[INFO] Тестируем создание уведомления для user_id={user.id}...")
        notification_service = NotificationService(db)
        
        result = notification_service.send_notification(
            user_id=user.id,
            title="Тестовое уведомление",
            message="Это тестовое уведомление для проверки системы",
            category="system",
            notification_type="info",
            channels=["in_app"],
            force=True
        )
        
        print(f"[INFO] Результат создания уведомления: {result}")
        
        # Проверяем, создалось ли уведомление
        new_notification = db.query(Notification).filter(
            Notification.user_id == user.id,
            Notification.title == "Тестовое уведомление"
        ).order_by(Notification.created_at.desc()).first()
        
        if new_notification:
            print(f"[SUCCESS] Уведомление успешно создано! ID: {new_notification.id}")
        else:
            print(f"[ERROR] Уведомление не было создано!")
        
    except Exception as e:
        print(f"[ERROR] Ошибка при тестировании: {e}")
        logger.error(f"Ошибка при тестировании создания уведомлений: {e}", exc_info=True)
    finally:
        db.close()

if __name__ == "__main__":
    test_notification_creation()

