# Диагностика проблем с PPR API

## Проблема: Не видно обращений к API

Если после изменений перестали приходить запросы от 1С, выполните следующие шаги диагностики:

### Шаг 1: Проверка доступности API

```powershell
# Проверка корневого эндпоинта
$apiKey = "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR"
$headers = @{
    Authorization = $apiKey
    Content-Type = "application/json"
}

# HTTP (если еще не настроен HTTPS)
$url = "http://10.35.1.200:8000/api/public-api/v2"
Invoke-RestMethod -Uri $url -Method Get -Headers $headers

# HTTPS (если настроен)
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}
$url = "https://10.35.1.200/api/public-api/v2"
Invoke-RestMethod -Uri $url -Method Get -Headers $headers
```

### Шаг 2: Проверка логов приложения

Проверьте логи FastAPI приложения:

```powershell
# Если используете Docker
docker logs gsm_backend --tail 100

# Если запускаете напрямую
# Логи должны быть в консоли или в файле логов
```

Ищите записи с:
- `"PPR API: Входящий запрос"`
- `"PPR API: Запрос к корневому эндпоинту"`
- `"PPR API: Запрос транзакций"`

### Шаг 3: Проверка работы эндпоинта транзакций

```powershell
$apiKey = "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR"
$headers = @{
    Authorization = $apiKey
    Content-Type = "application/json"
}

# Тест получения транзакций
$url = "http://10.35.1.200:8000/api/public-api/v2/transactions?dateFrom=2025-12-01&dateTo=2025-12-22&format=json"
try {
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers
    Write-Host "✓ Запрос успешен" -ForegroundColor Green
    Write-Host "Найдено транзакций: $($response.transactions.Count)" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 3
} catch {
    Write-Host "✗ Ошибка: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Ответ сервера: $responseBody" -ForegroundColor Red
    }
}
```

### Шаг 4: Проверка авторизации

```powershell
# Проверка авторизации по API ключу
$apiKey = "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR"
$headers = @{
    Authorization = $apiKey
}

$url = "http://10.35.1.200:8000/api/public-api/v2/transactions?limit=1"
$response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ErrorAction Stop
Write-Host "Авторизация успешна" -ForegroundColor Green
```

### Шаг 5: Проверка настроек в 1С

Убедитесь, что в 1С правильно настроен адрес:

1. **Адрес сервиса:** `http://10.35.1.200:8000/api/public-api/v2` (или `https://...` если настроен HTTPS)
2. **Ключ авторизации:** `yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR`
3. **Функция ВыполнитьHTTPЗапросППР** использует правильный URL

### Шаг 6: Проверка работы сервера

```powershell
# Проверка, что сервер запущен
Test-NetConnection -ComputerName 10.35.1.200 -Port 8000

# Проверка через curl (если установлен)
curl http://10.35.1.200:8000/api/public-api/v2
```

### Шаг 7: Проверка изменений в коде

Возможные причины отсутствия запросов:

1. **Изменения в формате ответа** - проверьте, что формат соответствует ожиданиям модуля
2. **Ошибки авторизации** - проверьте логи на наличие ошибок 401
3. **Проблемы с HTTPS** - если переключились на HTTPS, убедитесь, что сертификат настроен правильно
4. **Изменения в роутинге** - проверьте, что эндпоинты доступны

### Шаг 8: Включение подробного логирования

Добавлено логирование всех входящих запросов в функцию `verify_ppr_auth`. Теперь в логах должны быть записи:

```
PPR API: Входящий запрос
  method: GET
  url: http://10.35.1.200:8000/api/public-api/v2/transactions?...
  path: /api/public-api/v2/transactions
  client_host: <IP адрес>
```

### Шаг 9: Проверка через веб-интерфейс

Откройте в браузере:
- `http://10.35.1.200:8000/api/public-api/v2` - должен вернуть JSON с информацией об API
- `http://10.35.1.200:8000/docs` - документация API

### Шаг 10: Проверка базы данных

Убедитесь, что:
1. API ключ сохранен в шаблоне провайдера
2. Шаблон провайдера активен (`is_active = true`)
3. В базе есть транзакции за указанный период

## Частые проблемы

### Проблема: Запросы не доходят до API

**Возможные причины:**
1. Сервер не запущен
2. Неправильный URL в 1С
3. Проблемы с сетью/файрволом
4. Ошибки в функции `ВыполнитьHTTPЗапросППР`

**Решение:**
1. Проверьте логи сервера
2. Проверьте доступность сервера из сети 1С
3. Проверьте правильность URL в настройках 1С

### Проблема: Ошибка 401 (Unauthorized)

**Возможные причины:**
1. Неправильный API ключ
2. Ключ не сохранен в шаблоне провайдера
3. Неправильный формат заголовка Authorization

**Решение:**
1. Проверьте, что ключ правильно сохранен в `connection_settings` шаблона
2. Убедитесь, что ключ передается без префикса "Bearer"
3. Проверьте логи авторизации

### Проблема: Ошибка 404 (Not Found)

**Возможные причины:**
1. Неправильный путь к эндпоинту
2. Роутер не подключен в main.py

**Решение:**
1. Проверьте, что используется путь `/api/public-api/v2/transactions`
2. Убедитесь, что `router_public_api` подключен в `main.py`

## Восстановление работоспособности

Если после изменений API перестал работать:

1. **Откатите изменения** до последней рабочей версии
2. **Проверьте логи** на наличие ошибок
3. **Проверьте доступность** эндпоинтов
4. **Постепенно применяйте изменения** по одному, проверяя работу после каждого

## Контакты для диагностики

Если проблема не решается:
1. Проверьте логи приложения
2. Проверьте логи Nginx (если используется)
3. Проверьте логи Windows (Event Viewer)
4. Соберите информацию о запросах из 1С

