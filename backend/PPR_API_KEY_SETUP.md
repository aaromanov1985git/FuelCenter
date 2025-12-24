# Настройка авторизации по API ключу для ППР

## Обзор

API ППР поддерживает два метода авторизации:
1. **Bearer токен (JWT)** - для пользователей через `/api/ppr/login`
2. **API ключ** - для интеграции с 1С (как в оригинальном ППР)

## Настройка API ключа

### Шаг 1: Создание шаблона провайдера с API ключом

API ключ должен быть сохранен в шаблоне провайдера в поле `connection_settings` в формате JSON.

#### Через веб-интерфейс:

1. Откройте раздел "Провайдеры" → "Шаблоны"
2. Создайте или отредактируйте шаблон провайдера
3. В поле "Настройки подключения" (connection_settings) укажите:
   ```json
   {
     "api_key": "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR"
   }
   ```

#### Через API:

```bash
POST /api/v1/templates
{
  "provider_id": 1,
  "name": "ППР УТТ",
  "connection_type": "api",
  "connection_settings": {
    "api_key": "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR"
  },
  "field_mapping": {}
}
```

### Шаг 2: Использование API ключа в 1С

В форме настройки учетной записи ПЦ в 1С:

1. **Внешняя система:** ППР
2. **Адрес сервиса:** `https://10.35.1.200/api/public-api/v2` (ваш адрес сервера с HTTPS и оригинальным путем ППР)
   - **Важно:** Используйте `https://` (не `http://`), так как 1С может обращаться только по HTTPS
3. **Ключ авторизации:** `yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR` (ваш API ключ)

**Важно:** 
- В поле "Логин" и "Пароль" можно оставить пустыми, так как используется только ключ авторизации
- Используйте оригинальный путь `/api/public-api/v2` для максимальной совместимости с модулем 1С
- **Обязательно используйте HTTPS** - 1С может обращаться только по защищенному соединению

## Формат запросов

### С API ключом (для 1С):

API поддерживает два варианта путей:

**Вариант 1: Упрощенный путь**
```http
GET /api/ppr/transaction-list?provider_id=1&date_from=2025-01-01&date_to=2025-01-31
Authorization: yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR
```

**Вариант 2: Оригинальный путь ППР (рекомендуется для 1С)**
```http
GET /api/public-api/v2/transactions?provider_id=1&date_from=2025-01-01&date_to=2025-01-31
Authorization: yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR
```

**Важно:** 
- Ключ передается напрямую в заголовке `Authorization`, БЕЗ префикса "Bearer"
- Для максимальной совместимости с 1С рекомендуется использовать оригинальные пути `/api/public-api/v2/...`

### С Bearer токеном (для пользователей):

```http
GET /api/ppr/transaction-list?provider_id=1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Проверка работы

### Тест через PowerShell:

```powershell
$apiKey = "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR"
$headers = @{
    Authorization = $apiKey
}

# Проверка доступности
Invoke-RestMethod -Uri "http://10.35.1.200:8000/api/ppr" -Method Get

# Получение транзакций
$transactions = Invoke-RestMethod -Uri "http://10.35.1.200:8000/api/ppr/transaction-list?provider_id=1&limit=5" -Method Get -Headers $headers
$transactions | ConvertTo-Json
```

### Тест через curl (если установлен):

```bash
# С API ключом
curl -X GET "http://10.35.1.200:8000/api/ppr/transaction-list?provider_id=1" \
  -H "Authorization: yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR"
```

## Варианты названий ключа в connection_settings

Система поддерживает следующие варианты названий ключа в JSON:
- `api_key`
- `api_token`
- `authorization_key`
- `key`
- `КлючАвторизации`

Примеры:

```json
{
  "api_key": "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR"
}
```

или

```json
{
  "authorization_key": "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR"
}
```

## Автоматическое определение provider_id

При авторизации по API ключу система автоматически определяет `provider_id` из шаблона, связанного с этим ключом. Это означает:

- Если в запросе не указан `provider_id`, используется провайдер из ключа
- Если указан `provider_id`, он должен соответствовать провайдеру ключа (или может быть любым, если ключ не привязан к конкретному провайдеру)

## Безопасность

1. **Хранение ключей:** Ключи хранятся в базе данных в зашифрованном виде (если включено шифрование)
2. **Логирование:** Все запросы с API ключами логируются
3. **Валидация:** Ключи проверяются при каждом запросе

## Устранение проблем

### Ошибка 401 "Неверный токен авторизации или API ключ"

1. Проверьте, что ключ правильно сохранен в шаблоне провайдера
2. Убедитесь, что ключ передается в заголовке `Authorization` БЕЗ префикса "Bearer"
3. Проверьте, что шаблон провайдера активен (`is_active = true`)

### Ключ не найден

1. Проверьте, что ключ сохранен в `connection_settings` шаблона
2. Убедитесь, что используется правильное название поля (`api_key`, `authorization_key` и т.д.)
3. Проверьте формат JSON в `connection_settings`

### Неправильный provider_id

1. Убедитесь, что шаблон с ключом связан с правильным провайдером
2. Проверьте, что провайдер активен

