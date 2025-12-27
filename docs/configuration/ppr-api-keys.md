# Настройка API ключей для PPR API

## Обзор

PPR API поддерживает авторизацию через API ключи. Каждый провайдер может иметь свой уникальный API ключ. При обращении к API с конкретным ключом возвращаются **только транзакции этого провайдера**.

## Быстрая настройка

### 1. Откройте шаблон провайдера

В интерфейсе управления провайдерами:
- Выберите нужный провайдер
- Перейдите к шаблонам провайдера
- Создайте новый шаблон или отредактируйте существующий

### 2. Добавьте API ключ в connection_settings

В поле `connection_settings` (JSON) добавьте:

```json
{
  "api_key": "ваш_уникальный_ключ"
}
```

### 3. Сохраните шаблон

После сохранения API ключ будет доступен для использования.

## Подробная настройка

### Методы авторизации

API ППР поддерживает два метода авторизации:
1. **Bearer токен (JWT)** - для пользователей через `/api/ppr/login`
2. **API ключ** - для интеграции с 1С и внешними системами

### Где хранится API ключ

API ключ хранится в шаблоне провайдера в поле `connection_settings` в формате JSON.

### Варианты названий ключа

Система поддерживает следующие варианты названий ключа в JSON:
- `api_key` (рекомендуется)
- `api_token`
- `authorization_key`
- `key`
- `КлючАвторизации` (для совместимости с 1С)

Примеры:

```json
{
  "api_key": "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR"
}
```

или

```json
{
  "authorization_key": "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR",
  "base_url": "https://online.petrolplus.ru",
  "provider_type": "petrolplus"
}
```

## Генерация безопасного API ключа

### PowerShell (Windows)

```powershell
# Генерация случайного ключа длиной 32 символа
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
```

### Python

```python
import secrets
import string

# Генерация случайного ключа длиной 32 символа
alphabet = string.ascii_letters + string.digits
api_key = ''.join(secrets.choice(alphabet) for _ in range(32))
print(api_key)
```

### Linux/Mac

```bash
# Генерация случайного ключа
openssl rand -hex 16
```

## Использование API ключа

### API v2 (GET-запрос, рекомендуется)

```http
GET /api/public-api/v2/transactions?dateFrom=2025-12-01&dateTo=2025-12-31
Authorization: yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR
```

**Важно:** Ключ передается напрямую в заголовке `Authorization`, БЕЗ префикса "Bearer".

### API v1 (POST-запрос)

```json
POST /api/public-api/v1/transaction-list
Content-Type: application/json

{
  "token": "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR",
  "dateFrom": "2025-12-01",
  "dateTo": "2025-12-31",
  "format": "JSON"
}
```

### Интеграция с 1С

В форме настройки учетной записи ПЦ в 1С:

1. **Внешняя система:** ППР
2. **Адрес сервиса:** `https://your-server.com/api/public-api/v2` (ваш адрес сервера с HTTPS)
   - **Важно:** Используйте `https://` (не `http://`), так как 1С может обращаться только по HTTPS
   - Используйте оригинальный путь `/api/public-api/v2` для максимальной совместимости
3. **Ключ авторизации:** ваш API ключ

**Важно:**
- В поле "Логин" и "Пароль" можно оставить пустыми, так как используется только ключ авторизации
- Обязательно используйте HTTPS - 1С может обращаться только по защищенному соединению

## Как это работает

1. **API ключ хранится в настройках шаблона провайдера** в поле `connection_settings` в формате JSON
2. **При запросе к API** ключ проверяется, и определяется провайдер
3. **Транзакции фильтруются** строго по `provider_id`, соответствующему ключу

## Важные моменты

1. **Каждый ключ привязан к одному провайдеру** - при запросе возвращаются только транзакции этого провайдера
2. **Если ключ не найден** - возвращается ошибка 401 (Unauthorized)
3. **Если провайдер не определен для ключа** - возвращается ошибка 403 (Forbidden)
4. **Ключ должен быть уникальным** - один ключ не может быть привязан к нескольким провайдерам
5. **Автоматическое определение provider_id** - если в запросе не указан `provider_id`, используется провайдер из ключа

## Примеры настройки

### Провайдер "ППР"

```json
{
  "api_key": "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR",
  "base_url": "https://online.petrolplus.ru",
  "provider_type": "petrolplus"
}
```

### Другой провайдер

```json
{
  "api_key": "другой_уникальный_ключ_ABC123XYZ",
  "base_url": "https://api.another-provider.com",
  "provider_type": "custom"
}
```

## Проверка работы

### Тест через PowerShell

```powershell
$apiKey = "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR"
$headers = @{
    Authorization = $apiKey
}

# Проверка доступности
Invoke-RestMethod -Uri "https://your-server.com/api/ppr" -Method Get -Headers $headers

# Получение транзакций
$transactions = Invoke-RestMethod -Uri "https://your-server.com/api/ppr/transaction-list?provider_id=1&limit=5" -Method Get -Headers $headers
$transactions | ConvertTo-Json
```

### Проверка через curl

```bash
curl -X GET "https://your-server.com/api/public-api/v2/transactions?dateFrom=2025-12-01&dateTo=2025-12-31" \
  -H "Authorization: yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR"
```

## Безопасность

1. **Храните ключи в безопасности** - не передавайте их в открытом виде
2. **Используйте HTTPS** - все запросы должны идти через защищенное соединение
3. **Регулярно меняйте ключи** - обновляйте ключи при подозрении на компрометацию
4. **Ограничьте доступ** - выдавайте ключи только доверенным системам
5. **Хранение ключей:** Ключи хранятся в базе данных в зашифрованном виде (если включено шифрование)
6. **Логирование:** Все запросы с API ключами логируются
7. **Валидация:** Ключи проверяются при каждом запросе

## Устранение неполадок

### Ошибка 401: "Неверный токен авторизации или API ключ"

1. Проверьте, что ключ правильно сохранен в шаблоне провайдера
2. Убедитесь, что ключ передается в заголовке `Authorization` БЕЗ префикса "Bearer"
3. Проверьте, что шаблон провайдера активен (`is_active = true`)
4. Проверьте, что провайдер активен (`is_active = true`)
5. Убедитесь, что используется правильное название поля (`api_key`, `authorization_key` и т.д.)
6. Проверьте формат JSON в `connection_settings`

### Ошибка 403: "API ключ не привязан к провайдеру"

1. Убедитесь, что в `connection_settings` указан `api_key`
2. Проверьте, что шаблон привязан к провайдеру (`provider_id`)

### Возвращаются транзакции другого провайдера

1. Проверьте, что ключ привязан к правильному провайдеру
2. Убедитесь, что в базе данных транзакции имеют правильный `provider_id`

