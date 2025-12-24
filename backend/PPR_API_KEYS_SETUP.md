# Настройка API ключей для провайдеров в PPR API

## Обзор

Каждый провайдер может иметь свой уникальный API ключ для доступа к PPR API. При обращении к API с конкретным ключом возвращаются **только транзакции этого провайдера**.

## Как это работает

1. **API ключ хранится в настройках шаблона провайдера** в поле `connection_settings` в формате JSON
2. **При запросе к API** ключ проверяется, и определяется провайдер
3. **Транзакции фильтруются** строго по `provider_id`, соответствующему ключу

## Настройка API ключа для провайдера

### Шаг 1: Создание или редактирование шаблона провайдера

1. Откройте интерфейс управления провайдерами
2. Выберите нужный провайдер
3. Перейдите к шаблонам провайдера
4. Создайте новый шаблон или отредактируйте существующий

### Шаг 2: Настройка connection_settings

В поле `connection_settings` (JSON) добавьте API ключ. Поддерживаются следующие варианты названий поля:

```json
{
  "api_key": "ваш_уникальный_ключ_для_провайдера",
  "base_url": "https://api.example.com",
  "provider_type": "petrolplus"
}
```

Или можно использовать альтернативные названия:
- `api_key`
- `api_token`
- `authorization_key`
- `key`
- `КлючАвторизации` (для совместимости)

### Пример настройки для провайдера "ППР"

```json
{
  "api_key": "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR",
  "base_url": "https://online.petrolplus.ru",
  "provider_type": "petrolplus"
}
```

### Пример настройки для другого провайдера

```json
{
  "api_key": "другой_уникальный_ключ_ABC123XYZ",
  "base_url": "https://api.another-provider.com",
  "provider_type": "custom"
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

### API v1 (POST-запрос)

```json
POST /public-api/v1/transaction-list
Content-Type: application/json

{
  "token": "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR",
  "dateFrom": "2025-12-01",
  "dateTo": "2025-12-31",
  "format": "JSON"
}
```

### API v2 (GET-запрос)

```
GET /api/public-api/v2/transactions?dateFrom=2025-12-01&dateTo=2025-12-31
Authorization: yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR
```

## Важные моменты

1. **Каждый ключ привязан к одному провайдеру** - при запросе возвращаются только транзакции этого провайдера
2. **Если ключ не найден** - возвращается ошибка 401 (Unauthorized)
3. **Если провайдер не определен для ключа** - возвращается ошибка 403 (Forbidden)
4. **Ключ должен быть уникальным** - один ключ не может быть привязан к нескольким провайдерам

## Проверка работы

### Тест через PowerShell

```powershell
$uri = "https://your-server.com/public-api/v1/transaction-list"

$body = @{
    token    = "ваш_api_ключ"
    dateFrom = "2025-12-01"
    dateTo   = "2025-12-31"
    format   = "JSON"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri $uri -Method Post -Body $body -ContentType "application/json"
$response.'array-list' | Format-List
```

### Проверка через curl

```bash
curl -X POST "https://your-server.com/public-api/v1/transaction-list" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "ваш_api_ключ",
    "dateFrom": "2025-12-01",
    "dateTo": "2025-12-31",
    "format": "JSON"
  }'
```

## Безопасность

1. **Храните ключи в безопасности** - не передавайте их в открытом виде
2. **Используйте HTTPS** - все запросы должны идти через защищенное соединение
3. **Регулярно меняйте ключи** - обновляйте ключи при подозрении на компрометацию
4. **Ограничьте доступ** - выдавайте ключи только доверенным системам

## Устранение неполадок

### Ошибка 401: "Неверный токен авторизации"

- Проверьте, что ключ правильно указан в `connection_settings` шаблона
- Убедитесь, что шаблон активен (`is_active = true`)
- Проверьте, что провайдер активен (`is_active = true`)

### Ошибка 403: "API ключ не привязан к провайдеру"

- Убедитесь, что в `connection_settings` указан `api_key`
- Проверьте, что шаблон привязан к провайдеру (`provider_id`)

### Возвращаются транзакции другого провайдера

- Проверьте, что ключ привязан к правильному провайдеру
- Убедитесь, что в базе данных транзакции имеют правильный `provider_id`

## Примеры для разных провайдеров

### Провайдер 1 (ID: 3)

```json
{
  "api_key": "key_for_provider_3_ABC123",
  "base_url": "https://provider1.example.com"
}
```

### Провайдер 2 (ID: 5)

```json
{
  "api_key": "key_for_provider_5_XYZ789",
  "base_url": "https://provider2.example.com"
}
```

При запросе с ключом `key_for_provider_3_ABC123` будут возвращены только транзакции провайдера с ID=3.

При запросе с ключом `key_for_provider_5_XYZ789` будут возвращены только транзакции провайдера с ID=5.

