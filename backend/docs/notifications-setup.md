# Настройка сервиса уведомлений

Сервис уведомлений поддерживает отправку уведомлений через несколько каналов:
- **Email** (почта)
- **Telegram** (через Telegram Bot API)
- **Push-уведомления** (Web Push API)
- **In-app уведомления** (внутри системы)

## Настройка

### 1. Применение миграций

Примените миграцию для создания таблиц уведомлений:

```bash
cd backend
alembic upgrade head
```

### 2. Настройка Email уведомлений

Добавьте в `.env` файл или переменные окружения:

```env
EMAIL_ENABLED=true
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=your-email@gmail.com
EMAIL_SMTP_PASSWORD=your-app-password
EMAIL_FROM_ADDRESS=noreply@example.com
EMAIL_FROM_NAME="GSM Converter"
EMAIL_USE_TLS=true
```

### 3. Настройка Telegram уведомлений

1. Создайте бота через [@BotFather](https://t.me/BotFather) в Telegram
2. Получите токен бота
3. Добавьте в `.env`:

```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=your-bot-token-here
```

4. Пользователь должен запустить бота в Telegram и отправить команду `/start`
5. Получить chat_id можно через API: `https://api.telegram.org/bot<TOKEN>/getUpdates`
6. Указать chat_id в настройках уведомлений через API

### 4. Настройка Push-уведомлений

Push-уведомления требуют дополнительной настройки на фронтенде с использованием Web Push API.

## API Endpoints

### Получение списка уведомлений

```http
GET /api/v1/notifications
```

Параметры:
- `skip` - смещение для пагинации
- `limit` - количество записей (по умолчанию 100)
- `is_read` - фильтр по статусу прочтения (true/false)
- `category` - фильтр по категории
- `notification_type` - фильтр по типу (info, success, warning, error)

### Получение уведомления по ID

```http
GET /api/v1/notifications/{notification_id}
```

### Создание уведомления

```http
POST /api/v1/notifications
Content-Type: application/json

{
  "title": "Заголовок уведомления",
  "message": "Текст уведомления",
  "category": "system",
  "type": "info",
  "channels": ["email", "telegram", "push", "in_app"]
}
```

### Отметка уведомлений как прочитанных

```http
POST /api/v1/notifications/mark-read
Content-Type: application/json

{
  "notification_ids": [1, 2, 3]  // опционально, если не указано - помечаются все
}
```

### Получение настроек уведомлений

```http
GET /api/v1/notifications/settings
```

### Обновление настроек уведомлений

```http
PUT /api/v1/notifications/settings
Content-Type: application/json

{
  "email_enabled": true,
  "telegram_enabled": true,
  "telegram_chat_id": "123456789",
  "telegram_username": "username",
  "push_enabled": true,
  "in_app_enabled": true,
  "categories": {
    "upload_events": true,
    "errors": true,
    "system": false,
    "transactions": true
  }
}
```

### Регистрация подписки на Push-уведомления

```http
POST /api/v1/notifications/push-subscription
Content-Type: application/json

{
  "subscription": {
    "endpoint": "https://...",
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  }
}
```

### Удаление уведомления

```http
DELETE /api/v1/notifications/{notification_id}
```

## Использование в коде

### Отправка уведомления через сервис

```python
from app.services.notification_service import NotificationService

# В функции или методе
service = NotificationService(db)
result = service.send_notification(
    user_id=user.id,
    title="Заголовок",
    message="Текст уведомления",
    category="system",
    notification_type="info",
    channels=["email", "telegram", "in_app"]  # опционально
)
```

### Категории уведомлений

- `system` - системные уведомления
- `upload_events` - уведомления о загрузках
- `errors` - уведомления об ошибках
- `transactions` - уведомления о транзакциях

### Типы уведомлений

- `info` - информационное
- `success` - успешное выполнение
- `warning` - предупреждение
- `error` - ошибка

## Примеры интеграции

### Отправка уведомления при загрузке файла

```python
from app.services.notification_service import NotificationService

service = NotificationService(db)
service.send_notification(
    user_id=current_user.id,
    title="Файл загружен",
    message=f"Файл {filename} успешно обработан. Создано транзакций: {count}",
    category="upload_events",
    notification_type="success",
    entity_type="UploadEvent",
    entity_id=upload_event.id
)
```

### Отправка уведомления об ошибке

```python
service.send_notification(
    user_id=current_user.id,
    title="Ошибка при загрузке",
    message=f"Не удалось загрузить файл {filename}: {error_message}",
    category="errors",
    notification_type="error",
    entity_type="UploadEvent",
    entity_id=upload_event.id
)
```

## Примечания

- Push-уведомления требуют дополнительной настройки на фронтенде (Service Worker, Web Push API)
- Для Telegram уведомлений пользователь должен сначала запустить бота и получить chat_id
- Email уведомления требуют правильной настройки SMTP сервера
- In-app уведомления всегда сохраняются в базе данных, даже если другие каналы не доступны

