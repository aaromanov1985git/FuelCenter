# Настройка подключения к API Газпром-нефть (GPN Opti-24)

## Описание

Добавлена поддержка интеграции с API Газпром-нефть (GPN Opti-24) для получения списка карт и транзакций по договору.

## Тип подключения "api" с provider_type="gpn"

Для подключения к API Газпром-нефть используется тип подключения `api` с указанием `provider_type: "gpn"`, `"gazprom-neft"` или `"gazpromneft"`.

## Требования

- API ключ (api_key)
- Логин и пароль из Личного кабинета Газпром-нефть
- Доступ к API (https://api.opti-24.ru)

## Настройка шаблона провайдера

### Параметры подключения (connection_settings)

Для типа подключения `api` с `provider_type: "gpn"` необходимо указать следующие параметры в JSON формате:

```json
{
  "provider_type": "gpn",
  "base_url": "https://api.opti-24.ru",
  "api_key": "GPN.3ce7b860ece5758d1d27c7f8b4796ea79b33927e.630c2bc76676191bd6e94222d9acaaf56bc0a750",
  "login": "demo",
  "password": "auto-generated-pas58-save-it",
  "currency": "RUB"
}
```

### Параметры:

- **provider_type** (обязательный) - Тип провайдера: `"gpn"`, `"gazprom-neft"` или `"gazpromneft"`
- **base_url** (опциональный) - Базовый URL API (по умолчанию `"https://api.opti-24.ru"`)
- **api_key** (обязательный) - API ключ для авторизации
- **login** (обязательный) - Логин из Личного кабинета Газпром-нефть
- **password** (обязательный) - Пароль из Личного кабинета Газпром-нефть (исходный пароль, не хеш!)
- **currency** (опциональный) - Валюта по умолчанию (по умолчанию `"RUB"`)

### Пример создания шаблона через API

```bash
POST /api/templates
{
  "provider_id": 1,
  "name": "Газпром-нефть API",
  "description": "Подключение к API Газпром-нефть",
  "connection_type": "api",
  "connection_settings": {
    "provider_type": "gpn",
    "base_url": "https://api.opti-24.ru",
    "api_key": "GPN.3ce7b860ece5758d1d27c7f8b4796ea79b33927e.630c2bc76676191bd6e94222d9acaaf56bc0a750",
    "login": "demo",
    "password": "auto-generated-pas58-save-it",
    "currency": "RUB"
  },
  "field_mapping": {
    "timestamp": "Дата",
    "card_number": "Номер карты",
    "sum": "Сумма",
    "volume": "Объем",
    "product_category_name": "Вид топлива",
    "azs_id": "Номер АЗС",
    "azs_name": "Название АЗС",
    "azs_address": "Адрес"
  }
}
```

### 2. Тестирование подключения

```bash
POST /api/templates/test-api-connection?connection_type=api
{
  "provider_type": "gpn",
  "base_url": "https://api.opti-24.ru",
  "api_key": "GPN.3ce7b860ece5758d1d27c7f8b4796ea79b33927e.630c2bc76676191bd6e94222d9acaaf56bc0a750",
  "login": "demo",
  "password": "auto-generated-pas58-save-it"
}
```

### 3. Загрузка транзакций

```bash
POST /api/transactions/load-from-api?template_id=1&date_from=2025-11-01&date_to=2025-11-30
```

Можно указать конкретные карты (опционально):

```bash
POST /api/transactions/load-from-api?template_id=1&date_from=2025-11-01&date_to=2025-11-30&card_numbers=7005830007328081,7005830007328082
```

⚠️ **Ограничение**: Период не может превышать 1 месяц (31 день). При превышении будет возвращена ошибка.

## Доступные методы API

### 1. Авторизация

**Метод**: `authUser`  
**Endpoint**: `/vip/v1/authUser`  
**Параметры**:
- `login` - логин
- `password` - SHA512 хеш пароля

**Ответ**:
```json
{
  "status": {
    "code": 200,
    "message": "OK"
  },
  "data": {
    "session_id": "...",
    "contracts": [
      {
        "id": "...",
        "name": "..."
      }
    ]
  }
}
```

### 2. Получение списка карт

**Метод**: `GET /vip/v2/cards`  
**Параметры**:
- `contract_id` - ID договора (из ответа авторизации)
- `number` (опционально) - номер карты для фильтрации

**Заголовки**:
- `api_key` - API ключ
- `session_id` - ID сессии (из ответа авторизации)

### 3. Получение транзакций

**Метод**: `GET /vip/v2/transactions`  
**Параметры**:
- `date_from` - начальная дата (формат: YYYY-MM-DD)
- `date_to` - конечная дата (формат: YYYY-MM-DD)

**Заголовки**:
- `api_key` - API ключ
- `session_id` - ID сессии
- `contract_id` - ID договора

**Ограничения**:
- Период не может превышать 1 месяц (31 день)

## Формат данных транзакций

API возвращает транзакции в следующем формате:

```json
{
  "status": {
    "code": 200,
    "message": "OK"
  },
  "data": {
    "result": [
      {
        "timestamp": "2025-11-15T10:30:00",
        "card_number": "7005830007328081",
        "sum": 1500.00,
        "volume": 30.5,
        "price": 49.18,
        "currency": "RUR",
        "product_category_id": 1,
        "product_category_name": "Дизельное топливо",
        "azs_id": 12345,
        "azs_name": "АЗС №12345",
        "azs_address": "г. Москва, ул. Ленина, д. 1"
      }
    ]
  }
}
```

## Маппинг полей

При создании шаблона необходимо указать маппинг полей API на поля системы:

| Поле API | Описание | Поле системы |
|----------|----------|--------------|
| `timestamp` | Дата и время транзакции | `Дата` |
| `card_number` | Номер карты | `Номер карты` |
| `sum` | Сумма транзакции | `Сумма` |
| `volume` | Объем топлива | `Объем` |
| `price` | Цена за литр | `Цена` |
| `currency` | Валюта | `Валюта` |
| `product_category_name` | Вид топлива | `Вид топлива` |
| `azs_id` | ID АЗС | `Номер АЗС` |
| `azs_name` | Название АЗС | `Название АЗС` |
| `azs_address` | Адрес АЗС | `Адрес` |

## Особенности реализации

1. **Авторизация**: Пароль автоматически хешируется с помощью SHA512 перед отправкой
2. **Сессия**: После авторизации сохраняется `session_id` и `contract_id` для последующих запросов
3. **Загрузка транзакций**: Все транзакции по договору загружаются одним запросом, затем фильтруются по указанным картам (если указаны)
4. **Ограничение периода**: Период загрузки не может превышать 1 месяц (31 день)

## Демо-стенд

Для тестирования используется демо-стенд:
- URL: `https://api.opti-24.ru`
- Логин: ваш логин из Личного кабинета Газпром-нефть
- Пароль: ваш пароль из Личного кабинета Газпром-нефть
- API ключ: ваш API ключ из Личного кабинета Газпром-нефть

Документация API: https://api.opti-24.ru/docs

## Обработка ошибок

При возникновении ошибок API возвращает ответ в формате:

```json
{
  "status": {
    "code": 400,
    "message": "Описание ошибки"
  }
}
```

Возможные коды ошибок:
- `200` - Успешно
- `400` - Ошибка запроса
- `401` - Ошибка авторизации
- `403` - Доступ запрещен
- `404` - Ресурс не найден
- `500` - Внутренняя ошибка сервера

## Пример использования

```python
from app.services.api_provider_service import ApiProviderService
from app.models import ProviderTemplate

# Создание адаптера
api_service = ApiProviderService(db)
adapter = api_service.create_adapter(template)

# Работа с адаптером
async with adapter:
    # Получение списка карт
    cards = await adapter.list_cards()
    
    # Получение транзакций
    from datetime import date, timedelta
    date_to = date.today()
    date_from = date_to - timedelta(days=7)
    transactions = await adapter.fetch_card_transactions("", date_from, date_to)
    
    # Получение информации по карте
    card_info = await adapter.get_card_info("7005830007328081")
```

