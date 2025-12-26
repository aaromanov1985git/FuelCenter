"""
Роутер для управления уведомлениями
"""
from typing import Optional
import json
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import require_auth_if_enabled
from app.database import get_db
from app.logger import logger
from app.models import User
from app.schemas import (
    NotificationCreate,
    NotificationListResponse,
    NotificationResponse,
    NotificationSettingsResponse,
    NotificationSettingsUpdate,
    NotificationMarkReadRequest,
    NotificationMarkReadResponse,
    PushSubscriptionRequest,
    NotificationCategories
)
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/api/v1/notifications", tags=["Уведомления"])


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    skip: int = Query(0, ge=0, description="Смещение для пагинации"),
    limit: int = Query(100, ge=1, le=500, description="Количество записей"),
    is_read: Optional[bool] = Query(None, description="Фильтр по статусу прочтения"),
    category: Optional[str] = Query(None, description="Фильтр по категории"),
    notification_type: Optional[str] = Query(None, description="Фильтр по типу уведомления"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Получение списка уведомлений текущего пользователя
    """
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется аутентификация"
        )
    
    service = NotificationService(db)
    notifications, total, unread_count = service.get_notifications(
        user_id=current_user.id,
        skip=skip,
        limit=limit,
        is_read=is_read,
        category=category,
        notification_type=notification_type
    )
    
    # Преобразуем в NotificationResponse
    items = []
    for notif in notifications:
        items.append(NotificationResponse(**notif))
    
    return {
        "total": total,
        "items": items,
        "unread_count": unread_count
    }


@router.post("/mark-read", response_model=NotificationMarkReadResponse)
async def mark_notifications_read(
    request: NotificationMarkReadRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Отметка уведомлений как прочитанных
    """
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется аутентификация"
        )
    
    service = NotificationService(db)
    marked_count = service.mark_as_read(
        user_id=current_user.id,
        notification_ids=request.notification_ids
    )
    
    return {"marked_count": marked_count}


@router.get("/settings", response_model=NotificationSettingsResponse)
async def get_notification_settings(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Получение настроек уведомлений текущего пользователя
    """
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется аутентификация"
        )
    
    service = NotificationService(db)
    # get_or_create_settings всегда возвращает настройки (создает, если не существуют)
    try:
        settings = service.get_settings(current_user.id)
    except Exception as e:
        logger.error(f"Ошибка при получении настроек для user_id={current_user.id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении настроек: {str(e)}"
        )
    
    if not settings:
        # Это не должно произойти, но на всякий случай создадим настройки
        logger.warning(f"Настройки уведомлений не найдены для пользователя {current_user.id}, пытаемся создать")
        # Попробуем создать через репозиторий напрямую
        from app.repositories.notification_repository import NotificationRepository
        repo = NotificationRepository(db)
        try:
            settings = repo.get_or_create_settings(current_user.id)
        except Exception as e:
            logger.error(f"Ошибка при создании настроек для user_id={current_user.id}: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Ошибка при создании настроек: {str(e)}"
            )
        
        if not settings:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Не удалось создать настройки уведомлений"
            )
    
    # Парсим категории - убеждаемся, что все значения bool
    categories = {
        "upload_events": True,
        "errors": True,
        "system": False,
        "transactions": False
    }
    if settings.categories:
        try:
            categories_dict = json.loads(settings.categories) if isinstance(settings.categories, str) else settings.categories
            if categories_dict and isinstance(categories_dict, dict):
                # Объединяем с дефолтными значениями, преобразуя все значения в bool
                for key, value in categories_dict.items():
                    if key in categories:
                        categories[key] = bool(value)
        except Exception as e:
            logger.warning(f"Ошибка парсинга categories: {e}")
            # Используем дефолтные значения
    
    # Парсим push_subscription
    push_subscription = None
    if settings.push_subscription:
        try:
            push_subscription = json.loads(settings.push_subscription) if isinstance(settings.push_subscription, str) else settings.push_subscription
        except:
            push_subscription = None
    
    try:
        # Убеждаемся, что все поля правильно установлены
        # Проверяем, что created_at не None
        if settings.created_at is None:
            logger.warning(f"created_at is None для settings id={settings.id}, используем текущее время")
            from datetime import datetime, timezone
            created_at = datetime.now(timezone.utc)
        else:
            created_at = settings.created_at
            
        response_data = {
            "id": settings.id,
            "user_id": settings.user_id,
            "email_enabled": bool(settings.email_enabled) if settings.email_enabled is not None else True,
            "telegram_enabled": bool(settings.telegram_enabled) if settings.telegram_enabled is not None else False,
            "push_enabled": bool(settings.push_enabled) if settings.push_enabled is not None else True,
            "in_app_enabled": bool(settings.in_app_enabled) if settings.in_app_enabled is not None else True,
            "telegram_chat_id": settings.telegram_chat_id,
            "telegram_username": settings.telegram_username,
            "push_subscription": push_subscription,
            "categories": categories,
            "created_at": created_at,
            "updated_at": settings.updated_at
        }
        logger.debug(f"Создаем NotificationSettingsResponse для user_id={settings.user_id}, categories={categories}")
        response_obj = NotificationSettingsResponse(**response_data)
        logger.debug(f"NotificationSettingsResponse успешно создан, id={response_obj.id}")
        return response_obj
    except Exception as e:
        from pydantic import ValidationError
        logger.error(f"Ошибка при создании ответа NotificationSettingsResponse: {e}", exc_info=True)
        logger.error(f"Данные settings: id={settings.id}, user_id={settings.user_id}, categories={categories}, push_subscription={push_subscription}, created_at={settings.created_at}, updated_at={settings.updated_at}")
        # Попробуем вернуть ошибку с деталями валидации
        if isinstance(e, ValidationError):
            errors = e.errors()
            logger.error(f"Ошибки валидации Pydantic: {errors}")
            error_details = [{"loc": err.get("loc"), "msg": err.get("msg"), "type": err.get("type")} for err in errors]
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=error_details
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при формировании ответа: {str(e)}"
        )


@router.put("/settings", response_model=NotificationSettingsResponse)
async def update_notification_settings(
    settings_data: NotificationSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Обновление настроек уведомлений текущего пользователя
    """
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется аутентификация"
        )
    
    service = NotificationService(db)
    
    # Подготавливаем данные для обновления
    update_data = {}
    
    if settings_data.email_enabled is not None:
        update_data["email_enabled"] = settings_data.email_enabled
    if settings_data.telegram_enabled is not None:
        update_data["telegram_enabled"] = settings_data.telegram_enabled
    if settings_data.push_enabled is not None:
        update_data["push_enabled"] = settings_data.push_enabled
    if settings_data.in_app_enabled is not None:
        update_data["in_app_enabled"] = settings_data.in_app_enabled
    if settings_data.telegram_chat_id is not None:
        update_data["telegram_chat_id"] = settings_data.telegram_chat_id
    if settings_data.telegram_username is not None:
        update_data["telegram_username"] = settings_data.telegram_username
    if settings_data.push_subscription is not None:
        update_data["push_subscription"] = json.dumps(settings_data.push_subscription) if isinstance(settings_data.push_subscription, dict) else settings_data.push_subscription
    if settings_data.categories is not None:
        # categories приходит как dict[str, bool] с фронтенда, сериализуем в JSON
        update_data["categories"] = json.dumps(settings_data.categories)
    
    try:
        settings = service.update_settings(current_user.id, **update_data)
    except Exception as e:
        logger.error(f"Ошибка при обновлении настроек для user_id={current_user.id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при обновлении настроек: {str(e)}"
        )
    
    if not settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Настройки уведомлений не найдены"
        )
    
    # Парсим категории и push_subscription для ответа
    categories = {
        "upload_events": True,
        "errors": True,
        "system": False,
        "transactions": False
    }
    if settings.categories:
        try:
            categories_dict = json.loads(settings.categories) if isinstance(settings.categories, str) else settings.categories
            if categories_dict and isinstance(categories_dict, dict):
                for key, value in categories_dict.items():
                    if key in categories:
                        categories[key] = bool(value)
        except Exception as e:
            logger.warning(f"Ошибка парсинга categories: {e}")
    
    push_subscription = None
    if settings.push_subscription:
        try:
            push_subscription = json.loads(settings.push_subscription) if isinstance(settings.push_subscription, str) else settings.push_subscription
        except:
            push_subscription = None
    
    try:
        # Убеждаемся, что все поля правильно установлены
        # Проверяем, что created_at не None
        if settings.created_at is None:
            logger.warning(f"created_at is None для settings id={settings.id}, используем текущее время")
            from datetime import datetime, timezone
            created_at = datetime.now(timezone.utc)
        else:
            created_at = settings.created_at
            
        response_data = {
            "id": settings.id,
            "user_id": settings.user_id,
            "email_enabled": bool(settings.email_enabled) if settings.email_enabled is not None else True,
            "telegram_enabled": bool(settings.telegram_enabled) if settings.telegram_enabled is not None else False,
            "push_enabled": bool(settings.push_enabled) if settings.push_enabled is not None else True,
            "in_app_enabled": bool(settings.in_app_enabled) if settings.in_app_enabled is not None else True,
            "telegram_chat_id": settings.telegram_chat_id,
            "telegram_username": settings.telegram_username,
            "push_subscription": push_subscription,
            "categories": categories,
            "created_at": created_at,
            "updated_at": settings.updated_at
        }
        logger.debug(f"Создаем NotificationSettingsResponse для user_id={settings.user_id}, categories={categories}")
        response_obj = NotificationSettingsResponse(**response_data)
        logger.debug(f"NotificationSettingsResponse успешно создан, id={response_obj.id}")
        return response_obj
    except Exception as e:
        from pydantic import ValidationError
        logger.error(f"Ошибка при создании ответа NotificationSettingsResponse: {e}", exc_info=True)
        logger.error(f"Данные settings: id={settings.id}, user_id={settings.user_id}, categories={categories}, push_subscription={push_subscription}, created_at={settings.created_at}, updated_at={settings.updated_at}")
        if isinstance(e, ValidationError):
            errors = e.errors()
            logger.error(f"Ошибки валидации Pydantic: {errors}")
            error_details = [{"loc": err.get("loc"), "msg": err.get("msg"), "type": err.get("type")} for err in errors]
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=error_details
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при формировании ответа: {str(e)}"
        )


@router.post("/push-subscription", status_code=status.HTTP_200_OK)
async def register_push_subscription(
    request: PushSubscriptionRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Регистрация подписки на push-уведомления
    """
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется аутентификация"
        )
    
    service = NotificationService(db)
    
    # Обновляем настройки с push-подпиской
    subscription_json = json.dumps(request.subscription)
    settings = service.update_settings(
        current_user.id,
        push_subscription=subscription_json,
        push_enabled=True
    )
    
    if not settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Настройки уведомлений не найдены"
        )
    
    return {"message": "Push subscription registered successfully"}


@router.get("/{notification_id}", response_model=NotificationResponse)
async def get_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Получение уведомления по ID
    """
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется аутентификация"
        )
    
    from app.repositories.notification_repository import NotificationRepository
    
    repo = NotificationRepository(db)
    notification = repo.get_by_id(notification_id)
    
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Уведомление не найдено"
        )
    
    if notification.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к этому уведомлению"
        )
    
    # Парсим delivery_status
    delivery_status = None
    if notification.delivery_status:
        try:
            delivery_status = json.loads(notification.delivery_status) if isinstance(notification.delivery_status, str) else notification.delivery_status
        except:
            delivery_status = None
    
    return NotificationResponse(
        id=notification.id,
        user_id=notification.user_id,
        title=notification.title,
        message=notification.message,
        category=notification.category,
        type=notification.type,
        is_read=notification.is_read,
        read_at=notification.read_at,
        created_at=notification.created_at,
        entity_type=notification.entity_type,
        entity_id=notification.entity_id,
        delivery_status=delivery_status
    )


@router.post("", response_model=NotificationResponse, status_code=status.HTTP_201_CREATED)
async def create_notification(
    notification_data: NotificationCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Создание нового уведомления (для текущего пользователя или указанного)
    """
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется аутентификация"
        )
    
    # Определяем ID пользователя-получателя
    user_id = notification_data.user_id if notification_data.user_id else current_user.id
    
    # Проверяем права доступа
    if user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет прав для создания уведомлений для других пользователей"
        )
    
    service = NotificationService(db)
    result = service.send_notification(
        user_id=user_id,
        title=notification_data.title,
        message=notification_data.message,
        category=notification_data.category or "system",
        notification_type=notification_data.type or "info",
        channels=notification_data.channels,
        entity_type=notification_data.entity_type,
        entity_id=notification_data.entity_id,
        force=notification_data.force
    )
    
    if "error" in result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result["error"]
        )
    
    # Получаем созданное уведомление
    from app.repositories.notification_repository import NotificationRepository
    repo = NotificationRepository(db)
    
    # Находим последнее созданное уведомление для пользователя
    notifications, _ = repo.get_all(
        user_id=user_id,
        skip=0,
        limit=1,
        category=notification_data.category or "system"
    )
    
    if notifications:
        notification = notifications[0]
        delivery_status = None
        if notification.delivery_status:
            try:
                delivery_status = json.loads(notification.delivery_status) if isinstance(notification.delivery_status, str) else notification.delivery_status
            except:
                delivery_status = None
        
        return NotificationResponse(
            id=notification.id,
            user_id=notification.user_id,
            title=notification.title,
            message=notification.message,
            category=notification.category,
            type=notification.type,
            is_read=notification.is_read,
            read_at=notification.read_at,
            created_at=notification.created_at,
            entity_type=notification.entity_type,
            entity_id=notification.entity_id,
            delivery_status=delivery_status
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Уведомление было отправлено, но не удалось получить его данные"
        )


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Удаление уведомления
    """
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется аутентификация"
        )
    
    from app.repositories.notification_repository import NotificationRepository
    
    repo = NotificationRepository(db)
    success = repo.delete(notification_id, current_user.id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Уведомление не найдено"
        )
    
    return None


@router.post("/webhook/alertmanager", status_code=status.HTTP_200_OK)
async def alertmanager_webhook(
    request: dict,
    db: Session = Depends(get_db)
):
    """
    Webhook endpoint для получения алертов от Prometheus AlertManager
    
    Формат запроса от AlertManager:
    {
        "version": "4",
        "groupKey": "...",
        "status": "firing|resolved",
        "receiver": "...",
        "groupLabels": {...},
        "commonLabels": {...},
        "commonAnnotations": {...},
        "externalURL": "...",
        "alerts": [
            {
                "status": "firing|resolved",
                "labels": {...},
                "annotations": {...},
                "startsAt": "2023-...",
                "endsAt": "2023-...",
                "generatorURL": "..."
            }
        ]
    }
    """
    try:
        alerts = request.get("alerts", [])
        status = request.get("status", "unknown")
        receiver = request.get("receiver", "default")
        
        logger.info(
            f"Получен webhook от AlertManager",
            extra={
                "status": status,
                "receiver": receiver,
                "alerts_count": len(alerts),
                "group_key": request.get("groupKey")
            }
        )
        
        # Создаем уведомления для всех админов
        from app.models import User
        from app.services.notification_service import NotificationService
        
        admin_users = db.query(User).filter(
            User.role == "admin",
            User.is_active == True
        ).all()
        
        service = NotificationService(db)
        
        for alert in alerts:
            alert_status = alert.get("status", "unknown")
            labels = alert.get("labels", {})
            annotations = alert.get("annotations", {})
            alertname = labels.get("alertname", "Unknown Alert")
            severity = labels.get("severity", "warning")
            
            title = annotations.get("summary", alertname)
            message = annotations.get("description", f"Alert: {alertname}")
            
            # Добавляем детали из labels
            if labels:
                message += f"\n\nДетали:\n"
                for key, value in labels.items():
                    if key not in ["alertname", "severity"]:
                        message += f"- {key}: {value}\n"
            
            # Отправляем уведомление всем админам
            for admin in admin_users:
                try:
                    service.send_notification(
                        user_id=admin.id,
                        title=f"[{severity.upper()}] {title}",
                        message=message,
                        category="system",
                        notification_type="error" if severity == "critical" else "warning",
                        channels=["in_app"],
                        entity_type="alert",
                        entity_id=alertname
                    )
                    logger.debug(
                        f"Уведомление отправлено админу {admin.username}",
                        extra={"alertname": alertname, "severity": severity}
                    )
                except Exception as e:
                    logger.error(
                        f"Ошибка при отправке уведомления админу {admin.username}",
                        extra={"error": str(e), "alertname": alertname},
                        exc_info=True
                    )
        
        return {"status": "ok", "processed": len(alerts)}
        
    except Exception as e:
        logger.error(
            "Ошибка при обработке webhook от AlertManager",
            extra={"error": str(e), "request_data": request},
            exc_info=True
        )
        # Возвращаем 200 OK, чтобы AlertManager не повторял запрос
        return {"status": "error", "message": str(e)}
