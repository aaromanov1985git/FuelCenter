# Rate Limiting

## Описание

Реализована система rate limiting для защиты API от DDoS-атак и злоупотреблений с использованием библиотеки `slowapi`.

## Настройка

Rate limiting можно включить/выключить через переменную окружения `ENABLE_RATE_LIMIT`:

```bash
# Включить rate limiting (по умолчанию)
ENABLE_RATE_LIMIT=true

# Выключить rate limiting
ENABLE_RATE_LIMIT=false
```

## Лимиты

### По умолчанию
- **Лимит:** 100 запросов в минуту на endpoint
- **Настройка:** `RATE_LIMIT_DEFAULT=100/minute`

### Строгие лимиты (критичные endpoints)
- **Лимит:** 10 запросов в минуту на endpoint
- **Настройка:** `RATE_LIMIT_STRICT=10/minute`
- **Применяется к:**
  - `/api/v1/auth/login` - вход в систему
  - `/api/v1/auth/login-json` - вход в систему (JSON)
  - `/api/v1/transactions/upload` - загрузка файлов

## Конфигурация

Все настройки можно задать через переменные окружения в `.env` или `docker-compose.yml`:

```bash
# Включить/выключить rate limiting
ENABLE_RATE_LIMIT=true

# Лимит по умолчанию (100 запросов в минуту)
RATE_LIMIT_DEFAULT=100/minute

# Строгий лимит (10 запросов в минуту)
RATE_LIMIT_STRICT=10/minute
```

## Хранение данных

По умолчанию используется хранение в памяти (`memory://`). Для production рекомендуется использовать Redis:

```python
# В backend/app/middleware/rate_limit.py
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri="redis://localhost:6379/0"  # Redis вместо memory
)
```

## Идентификация клиентов

Rate limiting работает на основе IP-адреса клиента. Поддерживаются следующие заголовки:
- `X-Forwarded-For` - для работы за прокси/nginx (берется первый IP)
- `X-Real-IP` - альтернативный способ определения IP
- IP адрес клиента напрямую (если заголовки отсутствуют)

## Обработка ошибок

При превышении лимита возвращается ответ:
- **Статус:** `429 Too Many Requests`
- **Тело ответа:**
  ```json
  {
    "detail": "Превышен лимит запросов. Пожалуйста, попробуйте позже.",
    "error_code": "RATE_LIMIT_EXCEEDED",
    "retry_after": 60
  }
  ```
- **Заголовок:** `Retry-After` (количество секунд до следующего разрешенного запроса)

## Логирование

Все превышения лимита логируются с уровнем `WARNING`:
```python
logger.warning(
    "Превышен rate limit",
    extra={
        "path": request.url.path,
        "method": request.method,
        "client_ip": client_ip,
        "limit": str(exc.detail)
    }
)
```

## Применение лимитов к новым endpoints

Чтобы добавить rate limiting к новому endpoint:

```python
from app.middleware.rate_limit import limiter
from app.config import get_settings
from fastapi import Request

settings = get_settings()

@router.post("/your-endpoint")
@limiter.limit(settings.rate_limit_strict)  # или rate_limit_default
async def your_endpoint(request: Request, ...):
    # Ваш код
    pass
```

**Важно:** `request: Request` должен быть первым параметром после `self` (если это метод класса).

## Тестирование

Для тестирования rate limiting можно использовать `curl`:

```bash
# Тест обычного лимита
for i in {1..110}; do
  curl http://localhost:8000/api/v1/transactions/
done

# Тест строгого лимита
for i in {1..15}; do
  curl -X POST http://localhost:8000/api/v1/auth/login-json \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123"}'
done
```

После превышения лимита вы получите ответ `429 Too Many Requests`.

## Мониторинг

Рекомендуется мониторить:
- Количество ответов `429 Too Many Requests`
- IP-адреса, которые часто превышают лимиты
- Паттерны запросов для корректировки лимитов

## Рекомендации для production

1. **Используйте Redis** для распределенного хранения счетчиков
2. **Настройте разные лимиты** для разных типов пользователей (если есть система ролей)
3. **Добавьте whitelist** для доверенных IP-адресов
4. **Мониторьте метрики** через Prometheus/Grafana
5. **Настройте алерты** при аномальной активности

