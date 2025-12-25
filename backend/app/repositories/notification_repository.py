"""
Репозиторий для работы с уведомлениями
"""
from sqlalchemy.orm import Session
from typing import Optional, List, Tuple
from datetime import datetime, timezone
import json
from app.models import Notification, NotificationSettings


class NotificationRepository:
    """
    Репозиторий для работы с уведомлениями
    Инкапсулирует логику доступа к данным
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    # ==================== NotificationSettings ====================
    
    def get_settings_by_user_id(self, user_id: int) -> Optional[NotificationSettings]:
        """
        Получение настроек уведомлений по ID пользователя
        """
        return self.db.query(NotificationSettings).filter(
            NotificationSettings.user_id == user_id
        ).first()
    
    def create_settings(self, user_id: int, **kwargs) -> NotificationSettings:
        """
        Создание настроек уведомлений
        """
        try:
            settings = NotificationSettings(user_id=user_id, **kwargs)
            self.db.add(settings)
            self.db.commit()
            self.db.refresh(settings)
            return settings
        except Exception as e:
            self.db.rollback()
            from app.logger import logger
            logger.error(f"Ошибка при создании настроек уведомлений для user_id={user_id}: {e}", exc_info=True)
            raise
    
    def update_settings(self, user_id: int, **kwargs) -> Optional[NotificationSettings]:
        """
        Обновление настроек уведомлений
        """
        settings = self.get_settings_by_user_id(user_id)
        if not settings:
            return None
        
        for key, value in kwargs.items():
            if hasattr(settings, key) and value is not None:
                setattr(settings, key, value)
        
        settings.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(settings)
        return settings
    
    def get_or_create_settings(self, user_id: int) -> NotificationSettings:
        """
        Получение или создание настроек уведомлений по умолчанию
        """
        from app.logger import logger
        try:
            settings = self.get_settings_by_user_id(user_id)
            if not settings:
                # Создаем настройки с дефолтными значениями категорий
                logger.info(f"Создаем настройки уведомлений для user_id={user_id}")
                default_categories = json.dumps({
                    "upload_events": True,
                    "errors": True,
                    "system": False,
                    "transactions": False
                })
                settings = self.create_settings(
                    user_id=user_id,
                    email_enabled=True,
                    telegram_enabled=False,
                    push_enabled=True,
                    in_app_enabled=True,
                    categories=default_categories
                )
                logger.info(f"Настройки уведомлений успешно созданы для user_id={user_id}, id={settings.id}")
            return settings
        except Exception as e:
            logger.error(f"Ошибка в get_or_create_settings для user_id={user_id}: {e}", exc_info=True)
            raise
    
    # ==================== Notification ====================
    
    def get_by_id(self, notification_id: int) -> Optional[Notification]:
        """
        Получение уведомления по ID
        """
        return self.db.query(Notification).filter(Notification.id == notification_id).first()
    
    def get_all(
        self,
        user_id: int,
        skip: int = 0,
        limit: int = 100,
        is_read: Optional[bool] = None,
        category: Optional[str] = None,
        type: Optional[str] = None
    ) -> Tuple[List[Notification], int]:
        """
        Получение списка уведомлений с фильтрацией
        
        Returns:
            tuple: (список уведомлений, общее количество)
        """
        query = self.db.query(Notification).filter(Notification.user_id == user_id)
        
        if is_read is not None:
            query = query.filter(Notification.is_read == is_read)
        
        if category:
            query = query.filter(Notification.category == category)
        
        if type:
            query = query.filter(Notification.type == type)
        
        total = query.count()
        notifications = query.order_by(Notification.created_at.desc()).offset(skip).limit(limit).all()
        
        return notifications, total
    
    def get_unread_count(self, user_id: int) -> int:
        """
        Получение количества непрочитанных уведомлений
        """
        return self.db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.is_read == False
        ).count()
    
    def create(self, **kwargs) -> Notification:
        """
        Создание уведомления
        """
        notification = Notification(**kwargs)
        self.db.add(notification)
        self.db.commit()
        self.db.refresh(notification)
        return notification
    
    def mark_as_read(self, notification_ids: Optional[List[int]], user_id: int) -> int:
        """
        Отметка уведомлений как прочитанных
        
        Args:
            notification_ids: Список ID уведомлений (если None, помечаются все непрочитанные пользователя)
            user_id: ID пользователя
        
        Returns:
            int: Количество помеченных уведомлений
        """
        query = self.db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.is_read == False
        )
        
        if notification_ids:
            query = query.filter(Notification.id.in_(notification_ids))
        
        updated_count = query.update({
            Notification.is_read: True,
            Notification.read_at: datetime.now(timezone.utc)
        }, synchronize_session=False)
        
        self.db.commit()
        return updated_count
    
    def delete(self, notification_id: int, user_id: int) -> bool:
        """
        Удаление уведомления (только для пользователя-владельца)
        """
        notification = self.db.query(Notification).filter(
            Notification.id == notification_id,
            Notification.user_id == user_id
        ).first()
        
        if not notification:
            return False
        
        self.db.delete(notification)
        self.db.commit()
        return True
    
    def delete_old(self, user_id: Optional[int] = None, days: int = 30) -> int:
        """
        Удаление старых прочитанных уведомлений
        
        Args:
            user_id: ID пользователя (если None, удаляются для всех)
            days: Количество дней (уведомления старше будут удалены)
        
        Returns:
            int: Количество удаленных уведомлений
        """
        from datetime import timedelta
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        query = self.db.query(Notification).filter(
            Notification.is_read == True,
            Notification.created_at < cutoff_date
        )
        
        if user_id:
            query = query.filter(Notification.user_id == user_id)
        
        count = query.count()
        query.delete(synchronize_session=False)
        self.db.commit()
        
        return count

