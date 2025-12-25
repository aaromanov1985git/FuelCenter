import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.repositories.notification_repository import NotificationRepository

db = SessionLocal()
try:
    repo = NotificationRepository(db)
    
    notification = repo.create(
        user_id=1,
        title="Тестовое уведомление",
        message="Это тестовое сообщение",
        category="system",
        type="info"
    )
    
    print(f"Создано уведомление: ID={notification.id}, User={notification.user_id}, Title={notification.title}")
    
    # Проверяем, что оно в БД
    from app.models import Notification
    count = db.query(Notification).count()
    print(f"Всего уведомлений в БД: {count}")
    
    if notification.id:
        found = db.query(Notification).filter(Notification.id == notification.id).first()
        if found:
            print(f"Уведомление найдено в БД: ID={found.id}")
        else:
            print("ОШИБКА: Уведомление не найдено в БД после создания!")
finally:
    db.close()

