# Пример выделения уведомлений в микросервис

Этот документ показывает, как можно выделить сервис уведомлений в отдельный микросервис, если понадобится.

## Структура микросервиса

```
notification-service/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI приложение
│   ├── config.py            # Конфигурация
│   ├── database.py          # Подключение к БД
│   ├── models.py            # Модели (Notification, NotificationSettings)
│   ├── schemas.py           # Pydantic схемы
│   ├── repositories/
│   │   └── notification_repository.py
│   ├── services/
│   │   └── notification_service.py  # Логика отправки
│   └── routers/
│       └── notifications.py  # API endpoints
├── Dockerfile
├── requirements.txt
└── alembic/                 # Миграции
```

## Клиент для основного сервиса

```python
# backend/app/services/notification_client.py
"""
Клиент для вызова микросервиса уведомлений
"""
import httpx
from typing import Optional, List, Dict, Any
from app.config import get_settings
from app.logger import logger

settings = get_settings()


class NotificationClient:
    """
    Клиент для отправки уведомлений через микросервис
    """
    
    def __init__(self):
        # URL микросервиса уведомлений (из переменных окружения)
        self.base_url = getattr(settings, 'NOTIFICATION_SERVICE_URL', 'http://notification-service:8001')
        self.timeout = 5.0
    
    async def send_notification(
        self,
        user_id: int,
        title: str,
        message: str,
        category: str = "system",
        notification_type: str = "info",
        channels: Optional[List[str]] = None,
        entity_type: Optional[str] = None,
        entity_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Отправка уведомления через микросервис
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/v1/notifications",
                    json={
                        "user_id": user_id,
                        "title": title,
                        "message": message,
                        "category": category,
                        "type": notification_type,
                        "channels": channels,
                        "entity_type": entity_type,
                        "entity_id": entity_id
                    }
                )
                response.raise_for_status()
                return response.json()
        except httpx.TimeoutException:
            logger.error("Notification service timeout", extra={"user_id": user_id})
            return {"error": "Notification service timeout"}
        except httpx.RequestError as e:
            logger.error(f"Notification service error: {e}", extra={"user_id": user_id})
            return {"error": f"Notification service error: {str(e)}"}
        except Exception as e:
            logger.error(f"Unexpected error calling notification service: {e}", exc_info=True)
            return {"error": str(e)}


# Синглтон клиента
_notification_client: Optional[NotificationClient] = None

def get_notification_client() -> NotificationClient:
    """
    Получить экземпляр клиента уведомлений
    """
    global _notification_client
    if _notification_client is None:
        _notification_client = NotificationClient()
    return _notification_client
```

## Использование в основном сервисе

```python
# В роутерах основного сервиса
from fastapi import BackgroundTasks
from app.services.notification_client import get_notification_client

@router.post("/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    ...
):
    # Основная логика
    result = process_file(...)
    
    # Асинхронная отправка через микросервис
    client = get_notification_client()
    background_tasks.add_task(
        client.send_notification,
        user_id=current_user.id,
        title="Файл загружен",
        message=f"Обработано транзакций: {result.count}",
        category="upload_events",
        notification_type="success"
    )
    
    return result
```

## Docker Compose для микросервиса

```yaml
# docker-compose.yml
services:
  # ... существующие сервисы ...
  
  notification-service:
    build:
      context: ./notification-service
      dockerfile: Dockerfile
    container_name: gsm_notification_service
    environment:
      DATABASE_URL: ${DATABASE_URL:-postgresql://gsm_user:gsm_password@db:5432/gsm_db}
      EMAIL_ENABLED: ${EMAIL_ENABLED:-false}
      TELEGRAM_ENABLED: ${TELEGRAM_ENABLED:-false}
      # ... другие настройки ...
    ports:
      - "8001:8001"
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - ./notification-service/app:/app/app
    command: uvicorn app.main:app --host 0.0.0.0 --port 8001
```

## Альтернатива: Message Queue (RabbitMQ/Redis)

Если нужна более надежная архитектура, можно использовать очередь сообщений:

```python
# Отправка в очередь
import json
from app.queues import notification_queue

@router.post("/upload")
async def upload_file(...):
    result = process_file(...)
    
    # Отправляем задачу в очередь
    await notification_queue.enqueue({
        "user_id": current_user.id,
        "title": "Файл загружен",
        "message": f"Обработано транзакций: {result.count}",
        "category": "upload_events",
        "type": "success"
    })
    
    return result
```

Микросервис уведомлений будет обрабатывать задачи из очереди.

## Когда это имеет смысл?

Выделяйте в микросервис только если:
- Объем уведомлений очень большой
- Нужно независимое масштабирование
- Команда достаточно большая
- Есть требования по изоляции

Для большинства случаев достаточно оставить в монолите с асинхронной обработкой.

