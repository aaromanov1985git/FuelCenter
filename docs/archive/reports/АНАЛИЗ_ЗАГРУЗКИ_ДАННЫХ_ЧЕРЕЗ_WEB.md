# Анализ загрузки данных через Web

## Обзор архитектуры

Система поддерживает загрузку данных через веб-сервисы провайдеров с использованием двух типов подключения:
- **XML API** - для провайдеров, использующих XML-протокол (например, СНК-ЛК)
- **JSON API** - для провайдеров, использующих REST API с JWT токенами

## Компоненты системы

### 1. Backend компоненты

#### WebAdapter (`backend/app/services/api_provider_service.py`)

Основной адаптер для работы с веб-сервисами. Поддерживает два режима авторизации:

**XML API авторизация:**
- Используется при наличии параметров `xml_api_key`, `xml_api_signature` или `xml_api_certificate`
- Авторизация через XML запросы согласно спецификации СНК API
- Хеширование пароля: `sha1(salt + password)`
- Endpoint для авторизации: определяется автоматически или задается в `xml_api_endpoint`

**JSON API авторизация:**
- Используется по умолчанию, если XML API параметры не указаны
- Авторизация через `/api/auth/login` с получением JWT токена
- Требует предварительного запроса к странице `/login` для получения cookies и CSRF токенов

#### ApiProviderService

Сервис-оркестратор, который:
- Создает адаптер на основе шаблона провайдера
- Управляет процессом загрузки транзакций
- Преобразует данные в стандартный формат системы

#### Endpoint загрузки (`backend/app/routers/transactions.py`)

**POST `/api/v1/transactions/load-from-api`**

Параметры:
- `template_id` - ID шаблона с типом подключения 'api' или 'web'
- `date_from` - Начальная дата периода (YYYY-MM-DD)
- `date_to` - Конечная дата периода (YYYY-MM-DD)
- `card_numbers` - Список номеров карт через запятую (опционально)

### 2. Frontend компоненты

#### API утилита (`src/utils/api.js`)

**authFetch** - функция для выполнения авторизованных запросов:
- Автоматически добавляет Bearer токен из localStorage
- Обрабатывает ошибки 401 (Unauthorized) с автоматическим выходом
- Нормализует URL для работы с прокси Vite в dev режиме

#### Компоненты загрузки

- `src/components/TemplateEditor.jsx` - загрузка полей из веб-сервиса
- `src/App.jsx` - загрузка транзакций для отображения в таблице

## Процесс загрузки данных

### Этап 1: Авторизация

#### XML API авторизация

```python
# 1. Определение хеша пароля (приоритет):
#    - Если есть xml_api_signature → используется готовый хеш
#    - Если есть xml_api_salt → вычисляется sha1(salt + password)
#    - Иначе → используется пароль как есть (не рекомендуется)

# 2. Парсинг ключа для извлечения COD_AZS
#    Формат ключа: "i#188;t#0;k#545"
#    где i#188 - COD_AZS = 188

# 3. Создание XML запроса авторизации
xml_request = _create_xml_auth_request(
    login=username,
    password_hash=password_hash,
    cod_azs=cod_azs
)

# 4. Отправка запроса на endpoint
#    Пробуются варианты:
#    - base_url (корневой)
#    - base_url/api
#    - base_url/xml
#    - base_url/sncapi/
#    - Кастомный xml_api_endpoint
```

#### JSON API авторизация

```python
# 1. Предварительный запрос к /login для получения cookies и CSRF токена
login_page_response = await client.get(f"{base_url}/login")

# 2. Извлечение CSRF токена из HTML (если есть)
csrf_token = extract_csrf_token(html_content)

# 3. Отправка POST запроса на /api/auth/login
response = await client.post(
    f"{base_url}/api/auth/login",
    json={
        'username': username,
        'password': password,
        'isAdminLogin': False
    },
    headers={
        'X-CSRF-TOKEN': csrf_token,
        'Origin': base_url,
        'Referer': f"{base_url}/login",
        ...
    }
)

# 4. Получение accessToken из ответа
access_token = response.json().get('accessToken')
```

### Этап 2: Получение списка карт

#### XML API с сертификатом
- Список карт не может быть получен автоматически
- Необходимо указывать номера карт вручную в параметре `card_numbers`

#### JSON API
```python
cards = await adapter._get_json("/api/cards")
# Возвращает список номеров карт
```

### Этап 3: Загрузка транзакций

#### XML API с сертификатом

```python
# 1. Создание XML запроса для получения транзакций
xml_request = _create_xml_sale_request(
    card_numbers=card_numbers,  # Может быть несколько карт
    date_from=date_from,
    date_to=date_to,
    certificate=xml_api_certificate,
    pos_code=xml_api_pos_code  # Опционально
)

# 2. Отправка запроса на endpoint
#    Формат: BASE_URL/sncapi/sale
response = await client.post(
    f"{base_url}/sncapi/sale",
    content=xml_request.encode('utf-8'),
    headers={"Content-Type": "text/xml; charset=utf-8"}
)

# 3. Парсинг XML ответа
#    Ищутся все элементы <Sale> в ответе
#    Извлекаются поля: CardNumber, TransactionDatetime, ResourceName, Volume, ShopCost, и др.

# 4. Преобразование в стандартный формат
standard_transaction = {
    "card_number": ...,
    "transaction_date": ...,
    "product": ...,
    "volume": ...,
    "amount": ...,
    "azs_number": ...,
    ...
}
```

#### JSON API

```python
# Пока не реализовано - endpoint для транзакций не найден
# Метод fetch_card_transactions возвращает пустой список
```

### Этап 4: Сохранение в БД

```python
# 1. Применение маппинга видов топлива (если указан в шаблоне)
if fuel_type_mapping:
    for transaction in transactions_data:
        raw_fuel = transaction["product"]
        mapped = _match_fuel(raw_fuel, fuel_type_mapping)
        if mapped:
            transaction["product"] = mapped

# 2. Батчевая обработка транзакций
batch_processor = TransactionBatchProcessor(db)
created_count, skipped_count, warnings = batch_processor.create_transactions(
    transactions_data
)
```

## Потоки данных

### Поток 1: Ручная загрузка через UI

```
Пользователь → TemplateEditor.jsx
    ↓
POST /api/v1/templates/{id}/api-fields
    ↓
Backend: get_api_fields()
    ↓
WebAdapter.get_transaction_fields()
    ↓
Возврат списка полей
```

### Поток 2: Загрузка транзакций

```
Пользователь → UI (кнопка "Загрузить")
    ↓
POST /api/v1/transactions/load-from-api?template_id=X&date_from=...&date_to=...
    ↓
Backend: load_from_api()
    ↓
ApiProviderService.fetch_transactions()
    ↓
WebAdapter (async context manager)
    ├─→ _authenticate() [XML или JSON]
    ├─→ list_cards() [если не указаны]
    └─→ _fetch_transactions_xml_api() или fetch_card_transactions()
    ↓
Преобразование в стандартный формат
    ↓
TransactionBatchProcessor.create_transactions()
    ↓
Сохранение в БД
    ↓
Возврат результата пользователю
```

### Поток 3: Отображение транзакций

```
Пользователь → App.jsx
    ↓
loadTransactions()
    ↓
GET /api/v1/transactions?skip=...&limit=...&sort_by=...
    ↓
Backend: get_transactions()
    ↓
Запрос к БД с фильтрами
    ↓
Возврат данных
    ↓
Отображение в таблице
```

## Проблемы и ограничения

### 1. Ошибка 403 Forbidden (JSON API)

**Проблема:** При попытке авторизации через JSON API возникает ошибка 403 Forbidden.

**Причины:**
- Защита от ботов (требуется выполнение JavaScript)
- Проверка специфичных заголовков
- CSRF защита с динамическими токенами
- Блокировка по IP или User-Agent

**Реализованные попытки решения:**
- ✅ Имитация заголовков браузера
- ✅ Предварительный запрос к `/login` для cookies
- ✅ Извлечение CSRF токенов из HTML
- ✅ Альтернативные подходы (прямой запрос, form-data)

**Рекомендации:**
- Использовать XML API с сертификатом (если доступен)
- Или использовать Playwright для полной имитации браузера

### 2. Отсутствие endpoint для транзакций (JSON API)

**Проблема:** Метод `fetch_card_transactions` для JSON API возвращает пустой список, так как endpoint не найден.

**Текущее состояние:**
```python
async def fetch_card_transactions(...):
    # Для JSON API пробуем стандартный endpoint
    try:
        cards = await self._get_json("/api/cards")
        # Если есть endpoint для транзакций, используем его
        # Пока возвращаем пустой список, так как endpoint не найден
        logger.warning("API endpoint для транзакций не найден (JSON API)")
        return []
```

**Решение:**
- Найти правильный endpoint в документации API
- Или реализовать веб-скрапинг для получения данных

### 3. Список карт для XML API с сертификатом

**Проблема:** Для XML API с сертификатом список карт не может быть получен автоматически.

**Решение:**
- Указывать номера карт вручную в параметре `card_numbers` при вызове API
- Или хранить список карт в настройках шаблона

## Настройки подключения

### XML API

```json
{
  "base_url": "http://example.com",
  "username": "user",
  "password": "pass",
  "use_xml_api": true,
  "xml_api_key": "i#188;t#0;k#545",
  "xml_api_signature": "545.1AFB41693CD79C72796D7B56F2D727B8B343BF17",
  "xml_api_salt": "salt_value",
  "xml_api_cod_azs": 188,
  "xml_api_endpoint": "/sncapi/",
  "xml_api_certificate": "1.4703FECF75257F2E915",
  "xml_api_pos_code": 23
}
```

### JSON API

```json
{
  "base_url": "http://example.com:8080",
  "username": "user",
  "password": "pass",
  "currency": "RUB"
}
```

## Логирование

Система использует детальное логирование для диагностики:

```python
logger.info("=== НАЧАЛО XML API АВТОРИЗАЦИИ ===", extra={
    "base_url": self.base_url,
    "username": self.username,
    "use_xml_api": self.use_xml_api,
    "has_key": bool(self.xml_api_key),
    "has_signature": bool(self.xml_api_signature),
    ...
})
```

Логи включают:
- Параметры запросов (без паролей)
- Заголовки HTTP
- Cookies
- Размеры ответов
- Ошибки с полным контекстом

## Рекомендации по улучшению

1. **Добавить поддержку refresh токенов** для JSON API
2. **Реализовать кэширование** списка карт
3. **Добавить retry механизм** для временных ошибок сети
4. **Улучшить обработку ошибок** с более понятными сообщениями
5. **Добавить метрики производительности** (время загрузки, количество транзакций)
6. **Реализовать прогресс-бар** для длительных операций загрузки
7. **Добавить валидацию** параметров подключения перед использованием

## Заключение

Система загрузки данных через web поддерживает два типа подключения:
- **XML API** - полностью реализован и работает с сертификатом
- **JSON API** - частично реализован, требует доработки endpoint для транзакций

Основные проблемы:
- Ошибка 403 Forbidden для JSON API (требует использования XML API или Playwright)
- Отсутствие endpoint для получения транзакций через JSON API

Рекомендуется использовать XML API с сертификатом для стабильной работы.
