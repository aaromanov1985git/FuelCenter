"""
Сервис уведомлений
Поддерживает отправку уведомлений через различные каналы:
- Email
- Telegram
- Push-уведомления
- In-app уведомления (в системе)
"""
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from datetime import datetime
import json
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import httpx
from app.repositories.notification_repository import NotificationRepository
from app.models import Notification, NotificationSettings, User
from app.logger import logger
from app.config import get_settings

settings = get_settings()


class NotificationChannel:
    """
    Базовый класс для канала уведомлений
    """
    
    def send(self, user: User, title: str, message: str, notification_type: str = "info", **kwargs) -> Dict[str, Any]:
        """
        Отправка уведомления через канал
        
        Returns:
            dict: {"status": "sent" | "failed", "error": "..."}
        """
        raise NotImplementedError


class EmailChannel(NotificationChannel):
    """
    Канал уведомлений через Email
    """
    
    def __init__(self):
        self.enabled = settings.email_enabled
        self.smtp_host = settings.email_smtp_host
        self.smtp_port = settings.email_smtp_port
        self.smtp_user = settings.email_smtp_user
        self.smtp_password = settings.email_smtp_password
        self.from_address = settings.email_from_address
        self.from_name = settings.email_from_name
        self.use_tls = settings.email_use_tls
    
    def send(self, user: User, title: str, message: str, notification_type: str = "info", **kwargs) -> Dict[str, Any]:
        """
        Отправка уведомления по email
        """
        if not self.enabled:
            return {"status": "disabled", "error": "Email notifications are disabled"}
        
        if not user.email:
            return {"status": "failed", "error": "User email is not set"}
        
        if not all([self.smtp_host, self.smtp_user, self.from_address]):
            return {"status": "failed", "error": "Email configuration is incomplete"}
        
        try:
            # Создаем сообщение
            msg = MIMEMultipart('alternative')
            msg['Subject'] = title
            msg['From'] = f"{self.from_name} <{self.from_address}>"
            msg['To'] = user.email
            
            # Текстовая версия
            text_part = MIMEText(message, 'plain', 'utf-8')
            msg.attach(text_part)
            
            # HTML версия (базовая)
            html_message = f"""
            <html>
                <body>
                    <h2>{title}</h2>
                    <p>{message.replace(chr(10), '<br>')}</p>
                </body>
            </html>
            """
            html_part = MIMEText(html_message, 'html', 'utf-8')
            msg.attach(html_part)
            
            # Отправка
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                if self.use_tls:
                    server.starttls()
                if self.smtp_user and self.smtp_password:
                    server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)
            
            logger.info(f"Email notification sent to {user.email}", extra={
                "user_id": user.id,
                "notification_type": notification_type
            })
            
            return {"status": "sent"}
        
        except Exception as e:
            error_msg = f"Failed to send email: {str(e)}"
            logger.error(error_msg, extra={
                "user_id": user.id,
                "error": str(e)
            }, exc_info=True)
            return {"status": "failed", "error": error_msg}


class TelegramChannel(NotificationChannel):
    """
    Канал уведомлений через Telegram Bot API
    """
    
    def __init__(self):
        self.enabled = settings.telegram_enabled
        self.bot_token = settings.telegram_bot_token
        self.api_url = f"https://api.telegram.org/bot{self.bot_token}" if self.bot_token else None
    
    def send(self, user: User, title: str, message: str, notification_type: str = "info", **kwargs) -> Dict[str, Any]:
        """
        Отправка уведомления в Telegram
        """
        if not self.enabled:
            return {"status": "disabled", "error": "Telegram notifications are disabled"}
        
        if not self.api_url:
            return {"status": "failed", "error": "Telegram bot token is not configured"}
        
        # Получаем chat_id из настроек пользователя
        settings_repo = NotificationRepository(kwargs.get('db'))
        if not settings_repo:
            return {"status": "failed", "error": "Database session required"}
        
        user_settings = settings_repo.get_settings_by_user_id(user.id)
        if not user_settings or not user_settings.telegram_enabled:
            return {"status": "disabled", "error": "Telegram notifications disabled for user"}
        
        chat_id = user_settings.telegram_chat_id
        if not chat_id:
            return {"status": "failed", "error": "Telegram chat_id is not set for user"}
        
        try:
            # Форматируем сообщение для Telegram
            telegram_message = f"*{title}*\n\n{message}"
            
            # Отправка через Telegram Bot API
            send_url = f"{self.api_url}/sendMessage"
            payload = {
                "chat_id": chat_id,
                "text": telegram_message,
                "parse_mode": "Markdown"
            }
            
            with httpx.Client(timeout=10.0) as client:
                response = client.post(send_url, json=payload)
                response.raise_for_status()
            
            logger.info(f"Telegram notification sent to user {user.id}", extra={
                "user_id": user.id,
                "notification_type": notification_type
            })
            
            return {"status": "sent"}
        
        except Exception as e:
            error_msg = f"Failed to send Telegram notification: {str(e)}"
            logger.error(error_msg, extra={
                "user_id": user.id,
                "error": str(e)
            }, exc_info=True)
            return {"status": "failed", "error": error_msg}


class PushChannel(NotificationChannel):
    """
    Канал уведомлений через Web Push API
    """
    
    def __init__(self):
        self.enabled = settings.push_enabled
        # В будущем здесь можно добавить pywebpush для Web Push API
    
    def send(self, user: User, title: str, message: str, notification_type: str = "info", **kwargs) -> Dict[str, Any]:
        """
        Отправка push-уведомления
        """
        if not self.enabled:
            return {"status": "disabled", "error": "Push notifications are disabled"}
        
        # Получаем подписку из настроек пользователя
        settings_repo = NotificationRepository(kwargs.get('db'))
        if not settings_repo:
            return {"status": "failed", "error": "Database session required"}
        
        user_settings = settings_repo.get_settings_by_user_id(user.id)
        if not user_settings or not user_settings.push_enabled:
            return {"status": "disabled", "error": "Push notifications disabled for user"}
        
        push_subscription = user_settings.push_subscription
        if not push_subscription:
            return {"status": "failed", "error": "Push subscription is not set for user"}
        
        try:
            # Парсим подписку
            subscription_data = json.loads(push_subscription) if isinstance(push_subscription, str) else push_subscription
            
            # Здесь должна быть реализация отправки через pywebpush
            # Для базовой реализации возвращаем статус "not_implemented"
            # В будущем можно добавить: from pywebpush import webpush
            
            logger.warning("Push notifications are not fully implemented yet", extra={
                "user_id": user.id
            })
            
            return {"status": "not_implemented", "error": "Push notifications are not fully implemented"}
        
        except Exception as e:
            error_msg = f"Failed to send push notification: {str(e)}"
            logger.error(error_msg, extra={
                "user_id": user.id,
                "error": str(e)
            }, exc_info=True)
            return {"status": "failed", "error": error_msg}


class InAppChannel(NotificationChannel):
    """
    Канал уведомлений внутри системы (in-app)
    """
    
    def send(self, user: User, title: str, message: str, notification_type: str = "info", **kwargs) -> Dict[str, Any]:
        """
        Сохранение уведомления в базе данных (in-app)
        """
        db: Session = kwargs.get('db')
        if not db:
            return {"status": "failed", "error": "Database session required"}
        
        notification_repo: NotificationRepository = kwargs.get('notification_repo')
        if not notification_repo:
            return {"status": "failed", "error": "Notification repository required"}
        
        category = kwargs.get('category', 'system')
        entity_type = kwargs.get('entity_type')
        entity_id = kwargs.get('entity_id')
        delivery_status = kwargs.get('delivery_status', {})
        
        try:
            notification = notification_repo.create(
                user_id=user.id,
                title=title,
                message=message,
                category=category,
                type=notification_type,
                entity_type=entity_type,
                entity_id=entity_id,
                delivery_status=json.dumps(delivery_status) if delivery_status else None
            )
            
            logger.info(f"In-app notification created for user {user.id}", extra={
                "user_id": user.id,
                "notification_id": notification.id,
                "notification_type": notification_type
            })
            
            return {"status": "sent", "notification_id": notification.id}
        
        except Exception as e:
            error_msg = f"Failed to create in-app notification: {str(e)}"
            logger.error(error_msg, extra={
                "user_id": user.id,
                "error": str(e)
            }, exc_info=True)
            return {"status": "failed", "error": error_msg}


class NotificationService:
    """
    Сервис для работы с уведомлениями
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.notification_repo = NotificationRepository(db)
        
        # Инициализируем каналы
        self.email_channel = EmailChannel()
        self.telegram_channel = TelegramChannel()
        self.push_channel = PushChannel()
        self.in_app_channel = InAppChannel()
    
    def send_notification(
        self,
        user_id: int,
        title: str,
        message: str,
        category: str = "system",
        notification_type: str = "info",
        channels: Optional[List[str]] = None,
        entity_type: Optional[str] = None,
        entity_id: Optional[int] = None,
        force: bool = False
    ) -> Dict[str, Any]:
        """
        Отправка уведомления пользователю через указанные каналы
        
        Args:
            user_id: ID пользователя
            title: Заголовок уведомления
            message: Текст уведомления
            category: Категория уведомления (system, upload_events, errors, transactions)
            notification_type: Тип уведомления (info, success, warning, error)
            channels: Список каналов для отправки (email, telegram, push, in_app)
                     Если не указан, используются настройки пользователя
            entity_type: Тип связанной сущности
            entity_id: ID связанной сущности
            force: Если True, игнорирует настройки пользователя и отправляет через все указанные каналы
        
        Returns:
            dict: Результат отправки с статусами по каналам
        """
        logger.debug(f"send_notification вызван", extra={
            "user_id": user_id,
            "title": title,
            "category": category,
            "notification_type": notification_type,
            "channels": channels,
            "force": force
        })
        
        # Получаем пользователя
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            logger.error(f"Пользователь с user_id={user_id} не найден в базе данных", extra={
                "user_id": user_id
            })
            return {"error": "User not found", "user_id": user_id}
        
        logger.debug(f"Пользователь найден: id={user.id}, username={user.username}", extra={
            "user_id": user.id,
            "username": user.username
        })
        
        # Получаем настройки пользователя
        user_settings = self.notification_repo.get_or_create_settings(user_id)
        logger.debug(f"Настройки уведомлений для пользователя {user_id}", extra={
            "user_id": user_id,
            "settings_id": user_settings.id if user_settings else None,
            "email_enabled": user_settings.email_enabled if user_settings else None,
            "telegram_enabled": user_settings.telegram_enabled if user_settings else None,
            "push_enabled": user_settings.push_enabled if user_settings else None,
            "in_app_enabled": user_settings.in_app_enabled if user_settings else None
        })
        
        logger.debug(f"Настройки пользователя {user_id}", extra={
            "user_id": user_id,
            "email_enabled": user_settings.email_enabled,
            "telegram_enabled": user_settings.telegram_enabled,
            "push_enabled": user_settings.push_enabled,
            "in_app_enabled": user_settings.in_app_enabled
        })
        
        # Определяем каналы для отправки
        if channels is None:
            channels = []
            if user_settings.email_enabled:
                channels.append("email")
            if user_settings.telegram_enabled and user_settings.telegram_chat_id:
                channels.append("telegram")
            if user_settings.push_enabled and user_settings.push_subscription:
                channels.append("push")
            if user_settings.in_app_enabled:
                channels.append("in_app")
        elif not force:
            # Проверяем настройки для каждого канала (если force=False)
            filtered_channels = []
            for channel in channels:
                if channel == "email" and user_settings.email_enabled:
                    filtered_channels.append(channel)
                elif channel == "telegram" and user_settings.telegram_enabled and user_settings.telegram_chat_id:
                    filtered_channels.append(channel)
                elif channel == "push" and user_settings.push_enabled and user_settings.push_subscription:
                    filtered_channels.append(channel)
                elif channel == "in_app" and user_settings.in_app_enabled:
                    filtered_channels.append(channel)
            original_channels_list = list(channels)  # Сохраняем оригинальный список
            channels = filtered_channels
            logger.debug(f"Каналы после фильтрации (force=False)", extra={
                "user_id": user_id,
                "original_channels": original_channels_list,
                "filtered_channels": filtered_channels
            })
        else:
            # Если force=True и channels указаны, используем их напрямую без фильтрации
            logger.debug(f"Используются каналы напрямую (force=True): {channels}", extra={
                "user_id": user_id,
                "channels": channels
            })
        
        # Результаты отправки по каналам
        delivery_status = {}
        
        # Отправка через каждый канал
        for channel_name in channels:
            logger.debug(f"Обработка канала {channel_name} для user_id={user_id}", extra={
                "user_id": user_id,
                "channel": channel_name
            })
            
            channel_map = {
                "email": self.email_channel,
                "telegram": self.telegram_channel,
                "push": self.push_channel,
                "in_app": self.in_app_channel
            }
            
            channel = channel_map.get(channel_name)
            if not channel:
                logger.warning(f"Неизвестный канал: {channel_name}", extra={
                    "user_id": user_id,
                    "channel": channel_name
                })
                delivery_status[channel_name] = "unknown_channel"
                continue
            
            # Подготавливаем аргументы для канала
            channel_kwargs = {
                "db": self.db,
                "notification_repo": self.notification_repo,
                "category": category,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "delivery_status": delivery_status
            }
            
            try:
                result = channel.send(
                    user=user,
                    title=title,
                    message=message,
                    notification_type=notification_type,
                    **channel_kwargs
                )
                
                delivery_status[channel_name] = result.get("status", "unknown")
                
                logger.info(f"Результат отправки через канал {channel_name}", extra={
                    "user_id": user_id,
                    "channel": channel_name,
                    "status": result.get("status", "unknown"),
                    "notification_id": result.get("notification_id")
                })
            except Exception as e:
                logger.error(f"Ошибка при отправке через канал {channel_name}", extra={
                    "user_id": user_id,
                    "channel": channel_name,
                    "error": str(e),
                    "error_type": type(e).__name__
                }, exc_info=True)
                delivery_status[channel_name] = "error"
        
        # Если force=True и in_app был запрошен, проверяем, что уведомление создано
        # ВАЖНО: При force=True уведомление должно создаваться независимо от настроек
        if force and "in_app" in channels:
            in_app_status = delivery_status.get("in_app")
            # Если in_app не был обработан или вернул ошибку, создаем принудительно
            # Также проверяем, что статус действительно "sent" (успешно создано)
            if in_app_status is None or in_app_status != "sent":
                logger.warning(f"Канал in_app был запрошен с force=True, но статус '{in_app_status}'. Создаем принудительно", extra={
                    "user_id": user_id,
                    "channels": channels,
                    "delivery_status": delivery_status,
                    "in_app_status": in_app_status
                })
                try:
                    result = self.in_app_channel.send(
                        user=user,
                        title=title,
                        message=message,
                        notification_type=notification_type,
                        db=self.db,
                        notification_repo=self.notification_repo,
                        category=category,
                        entity_type=entity_type,
                        entity_id=entity_id,
                        delivery_status=delivery_status
                    )
                    new_status = result.get("status", "unknown")
                    delivery_status["in_app"] = new_status
                    if new_status == "sent":
                        logger.info(f"In-app уведомление успешно создано принудительно (force=True)", extra={
                            "user_id": user_id,
                            "status": new_status,
                            "notification_id": result.get("notification_id")
                        })
                    else:
                        logger.error(f"In-app уведомление не создано принудительно. Статус: {new_status}", extra={
                            "user_id": user_id,
                            "status": new_status,
                            "error": result.get("error")
                        })
                except Exception as e:
                    logger.error(f"Ошибка при принудительном создании in-app уведомления", extra={
                        "user_id": user_id,
                        "error": str(e),
                        "error_type": type(e).__name__
                    }, exc_info=True)
                    delivery_status["in_app"] = "error"
        
        # Создаем in-app уведомление с полным статусом доставки (только если не было создано выше)
        if "in_app" not in delivery_status and not force:
            # Если in-app не был в списке, но он включен, все равно создаем запись
            if user_settings.in_app_enabled:
                logger.debug(f"Создание in-app уведомления (не было в списке каналов, но включено в настройках)", extra={
                    "user_id": user_id
                })
                try:
                    result = self.in_app_channel.send(
                        user=user,
                        title=title,
                        message=message,
                        notification_type=notification_type,
                        db=self.db,
                        notification_repo=self.notification_repo,
                        category=category,
                        entity_type=entity_type,
                        entity_id=entity_id,
                        delivery_status=delivery_status
                    )
                    delivery_status["in_app"] = result.get("status", "unknown")
                except Exception as e:
                    logger.error(f"Ошибка при создании in-app уведомления (fallback)", extra={
                        "user_id": user_id,
                        "error": str(e)
                    }, exc_info=True)
        
        logger.info(f"Завершение send_notification для user_id={user_id}", extra={
            "user_id": user_id,
            "delivery_status": delivery_status,
            "channels_used": channels
        })
        
        return {
            "success": True,
            "delivery_status": delivery_status,
            "channels_used": channels
        }
    
    def get_notifications(
        self,
        user_id: int,
        skip: int = 0,
        limit: int = 100,
        is_read: Optional[bool] = None,
        category: Optional[str] = None,
        notification_type: Optional[str] = None
    ) -> tuple[List[Dict[str, Any]], int, int]:
        """
        Получение списка уведомлений пользователя
        
        Returns:
            tuple: (список уведомлений, общее количество, количество непрочитанных)
        """
        notifications, total = self.notification_repo.get_all(
            user_id=user_id,
            skip=skip,
            limit=limit,
            is_read=is_read,
            category=category,
            type=notification_type
        )
        
        unread_count = self.notification_repo.get_unread_count(user_id)
        
        # Преобразуем в словари
        notifications_dict = []
        for notification in notifications:
            notification_dict = {
                "id": notification.id,
                "user_id": notification.user_id,
                "title": notification.title,
                "message": notification.message,
                "category": notification.category,
                "type": notification.type,
                "is_read": notification.is_read,
                "read_at": notification.read_at.isoformat() if notification.read_at else None,
                "created_at": notification.created_at.isoformat(),
                "entity_type": notification.entity_type,
                "entity_id": notification.entity_id
            }
            
            # Парсим delivery_status
            if notification.delivery_status:
                try:
                    notification_dict["delivery_status"] = json.loads(notification.delivery_status) if isinstance(notification.delivery_status, str) else notification.delivery_status
                except:
                    notification_dict["delivery_status"] = None
            else:
                notification_dict["delivery_status"] = None
            
            notifications_dict.append(notification_dict)
        
        return notifications_dict, total, unread_count
    
    def mark_as_read(self, user_id: int, notification_ids: Optional[List[int]] = None) -> int:
        """
        Отметка уведомлений как прочитанных
        """
        return self.notification_repo.mark_as_read(notification_ids, user_id)
    
    def get_settings(self, user_id: int) -> Optional[NotificationSettings]:
        """
        Получение настроек уведомлений пользователя
        """
        return self.notification_repo.get_or_create_settings(user_id)
    
    def update_settings(self, user_id: int, **kwargs) -> Optional[NotificationSettings]:
        """
        Обновление настроек уведомлений пользователя
        """
        return self.notification_repo.update_settings(user_id, **kwargs)

