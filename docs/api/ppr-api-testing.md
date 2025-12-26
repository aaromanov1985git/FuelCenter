# Тестирование PPR API без curl

## Проверка доступности API

### 1. Через браузер

Откройте в браузере:
```
http://10.35.1.200:8000/api/ppr
```

Должен вернуться JSON с информацией о доступных эндпоинтах.

### 2. Через PowerShell (Windows)

#### Проверка доступности:
```powershell
Invoke-RestMethod -Uri "http://10.35.1.200:8000/api/ppr" -Method Get
```

#### Получение токена:
```powershell
$body = @{
    username = "admin"
    password = "admin123"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://10.35.1.200:8000/api/ppr/login" -Method Post -Body $body -ContentType "application/json"

$token = $response.token
Write-Host "Token: $token"
```

#### Использование токена для получения транзакций:
```powershell
$headers = @{
    Authorization = "Bearer $token"
}

$response = Invoke-RestMethod -Uri "http://10.35.1.200:8000/api/ppr/transaction-list?provider_id=1" -Method Get -Headers $headers

$response | ConvertTo-Json -Depth 10
```

#### Полный скрипт для тестирования:
```powershell
# Настройки
$baseUrl = "http://10.35.1.200:8000/api/ppr"
$username = "admin"
$password = "admin123"

# 1. Проверка доступности
Write-Host "Проверка доступности API..." -ForegroundColor Green
try {
    $health = Invoke-RestMethod -Uri "$baseUrl" -Method Get
    Write-Host "API доступен!" -ForegroundColor Green
    $health | ConvertTo-Json
} catch {
    Write-Host "Ошибка: $_" -ForegroundColor Red
    exit
}

# 2. Получение токена
Write-Host "`nПолучение токена..." -ForegroundColor Green
$loginBody = @{
    username = $username
    password = $password
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.token
    Write-Host "Токен получен: $($token.Substring(0, 20))..." -ForegroundColor Green
} catch {
    Write-Host "Ошибка авторизации: $_" -ForegroundColor Red
    exit
}

# 3. Получение транзакций
Write-Host "`nПолучение транзакций..." -ForegroundColor Green
$headers = @{
    Authorization = "Bearer $token"
}

try {
    $transactions = Invoke-RestMethod -Uri "$baseUrl/transaction-list?provider_id=1&limit=10" -Method Get -Headers $headers
    Write-Host "Получено транзакций: $($transactions.total)" -ForegroundColor Green
    $transactions | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Ошибка получения транзакций: $_" -ForegroundColor Red
}

# 4. Получение карт
Write-Host "`nПолучение карт..." -ForegroundColor Green
try {
    $cards = Invoke-RestMethod -Uri "$baseUrl/card-list?limit=10" -Method Get -Headers $headers
    Write-Host "Получено карт: $($cards.total)" -ForegroundColor Green
    $cards | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Ошибка получения карт: $_" -ForegroundColor Red
}
```

### 3. Через Python скрипт

Создайте файл `test_ppr_api.py`:

```python
import requests
import json

# Настройки
BASE_URL = "http://10.35.1.200:8000/api/ppr"
USERNAME = "admin"
PASSWORD = "admin123"

# 1. Проверка доступности
print("Проверка доступности API...")
try:
    response = requests.get(f"{BASE_URL}")
    print(f"API доступен! Статус: {response.status_code}")
    print(json.dumps(response.json(), indent=2, ensure_ascii=False))
except Exception as e:
    print(f"Ошибка: {e}")
    exit(1)

# 2. Получение токена
print("\nПолучение токена...")
login_data = {
    "username": USERNAME,
    "password": PASSWORD
}

try:
    response = requests.post(f"{BASE_URL}/login", json=login_data)
    response.raise_for_status()
    data = response.json()
    token = data.get("token")
    print(f"Токен получен: {token[:20]}...")
except Exception as e:
    print(f"Ошибка авторизации: {e}")
    exit(1)

# 3. Получение транзакций
print("\nПолучение транзакций...")
headers = {
    "Authorization": f"Bearer {token}"
}

try:
    response = requests.get(
        f"{BASE_URL}/transaction-list",
        params={"provider_id": 1, "limit": 10},
        headers=headers
    )
    response.raise_for_status()
    data = response.json()
    print(f"Получено транзакций: {data.get('total', 0)}")
    print(json.dumps(data, indent=2, ensure_ascii=False))
except Exception as e:
    print(f"Ошибка получения транзакций: {e}")

# 4. Получение карт
print("\nПолучение карт...")
try:
    response = requests.get(
        f"{BASE_URL}/card-list",
        params={"limit": 10},
        headers=headers
    )
    response.raise_for_status()
    data = response.json()
    print(f"Получено карт: {data.get('total', 0)}")
    print(json.dumps(data, indent=2, ensure_ascii=False))
except Exception as e:
    print(f"Ошибка получения карт: {e}")
```

Запустите:
```bash
python test_ppr_api.py
```

### 4. Через Postman

1. **Создайте новый запрос:**
   - Method: `GET`
   - URL: `http://10.35.1.200:8000/api/ppr`
   - Нажмите "Send"

2. **Получение токена:**
   - Method: `POST`
   - URL: `http://10.35.1.200:8000/api/ppr/login`
   - Body → raw → JSON:
     ```json
     {
       "username": "admin",
       "password": "admin123"
     }
     ```
   - Нажмите "Send"
   - Скопируйте токен из ответа

3. **Использование токена:**
   - Method: `GET`
   - URL: `http://10.35.1.200:8000/api/ppr/transaction-list?provider_id=1`
   - Headers:
     - Key: `Authorization`
     - Value: `Bearer <ваш_токен>`
   - Нажмите "Send"

### 5. Через онлайн инструменты

Используйте онлайн HTTP клиенты:
- https://httpie.io/app (Web версия)
- https://reqbin.com/
- https://hoppscotch.io/

## Устранение проблем

### Ошибка 404 "Not Found"

1. **Проверьте, что сервер запущен:**
   ```powershell
   # Проверка доступности сервера
   Test-NetConnection -ComputerName 10.35.1.200 -Port 8000
   ```

2. **Проверьте правильность URL:**
   - Должен быть: `http://10.35.1.200:8000/api/ppr`
   - НЕ: `http://10.35.1.200:8000/api/ppr/` (слеш в конце)

3. **Проверьте, что роутер подключен:**
   - Убедитесь, что в `backend/app/main.py` есть строка:
     ```python
     app.include_router(ppr_api.router)
     ```

4. **Проверьте логи сервера:**
   - Посмотрите логи FastAPI для ошибок

### Ошибка 401 "Unauthorized"

- Проверьте правильность логина и пароля
- Убедитесь, что пользователь активен в системе
- Проверьте, что токен не истек (действителен 30 минут)

### Ошибка 500 "Internal Server Error"

- Проверьте логи сервера
- Убедитесь, что база данных доступна
- Проверьте настройки подключения к БД

## Быстрая проверка через браузер

Просто откройте в браузере:
```
http://10.35.1.200:8000/api/ppr
```

Если API работает, вы увидите JSON с информацией о доступных эндпоинтах.

## Почему транзакций 0?

Если вы получили `"total": 0` при запросе транзакций, это означает:

1. **В базе данных нет транзакций** для указанного провайдера или периода
2. **Нужно загрузить данные** через веб-интерфейс или API загрузки файлов

### Как проверить список провайдеров:

```powershell
# Получите токен (как в примере выше)
$token = "ваш_токен"

# Получите список провайдеров
$headers = @{Authorization="Bearer $token"}
$providers = Invoke-RestMethod -Uri "http://10.35.1.200:8000/api/ppr/providers" -Method Get -Headers $headers
$providers | ConvertTo-Json
```

Это покажет доступные провайдеры и их ID для использования в запросах транзакций.

### Как загрузить данные:

1. **Через веб-интерфейс:**
   - Откройте `http://10.35.1.200:8000` в браузере
   - Загрузите Excel файл с транзакциями через интерфейс

2. **Через API загрузки:**
   - Используйте endpoint `/api/v1/transactions/upload` для загрузки файлов

3. **Через автоматическую загрузку:**
   - Настройте автоматическую загрузку через шаблоны провайдеров

