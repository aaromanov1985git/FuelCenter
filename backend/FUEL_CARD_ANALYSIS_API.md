# API документация: Анализ топливных карт

## Обзор

Сервис анализа топливных карт предоставляет API для:
- Сопоставления транзакций по картам с фактическими заправками ТС
- Проверки геолокации ТС в момент заправки
- Выявления аномалий и несоответствий
- Получения статистики по аномалиям

## Базовый URL

```
/api/v1/fuel-card-analysis
```

## Эндпоинты

### 1. Анализ конкретной транзакции

**POST** `/analyze-transaction/{transaction_id}`

Анализирует конкретную транзакцию и возвращает результат анализа.

**Параметры пути:**
- `transaction_id` (int) - ID транзакции

**Query параметры:**
- `time_window_minutes` (int, optional) - Временное окно в минутах (по умолчанию 30)
- `quantity_tolerance_percent` (float, optional) - Допустимое отклонение количества в % (по умолчанию 5)
- `azs_radius_meters` (int, optional) - Радиус АЗС в метрах (по умолчанию 500)

**Пример запроса:**
```bash
POST /api/v1/fuel-card-analysis/analyze-transaction/123?time_window_minutes=30&quantity_tolerance_percent=5&azs_radius_meters=500
```

**Пример ответа:**
```json
{
  "id": 1,
  "transaction_id": 123,
  "refuel_id": 45,
  "fuel_card_id": 10,
  "vehicle_id": 5,
  "analysis_date": "2025-01-20T12:00:00",
  "match_status": "matched",
  "match_confidence": 95.0,
  "distance_to_azs": 150.5,
  "time_difference": 120,
  "quantity_difference": 0.5,
  "is_anomaly": false,
  "anomaly_type": null
}
```

### 2. Анализ транзакций по карте

**POST** `/analyze-card/{card_id}`

Анализирует все транзакции по указанной карте за период.

**Параметры пути:**
- `card_id` (int) - ID топливной карты

**Query параметры:**
- `date_from` (datetime, optional) - Начальная дата (по умолчанию - месяц назад)
- `date_to` (datetime, optional) - Конечная дата (по умолчанию - сейчас)

**Пример запроса:**
```bash
POST /api/v1/fuel-card-analysis/analyze-card/10?date_from=2025-01-01T00:00:00&date_to=2025-01-31T23:59:59
```

**Пример ответа:**
```json
[
  {
    "id": 1,
    "transaction_id": 123,
    "match_status": "matched",
    "match_confidence": 95.0,
    "is_anomaly": false
  },
  {
    "id": 2,
    "transaction_id": 124,
    "match_status": "no_refuel",
    "match_confidence": 20.0,
    "is_anomaly": true,
    "anomaly_type": "fuel_theft"
  }
]
```

### 3. Массовый анализ транзакций

**POST** `/analyze-period`

Массовый анализ транзакций за период с фильтрацией.

**Тело запроса:**
```json
{
  "date_from": "2025-01-01T00:00:00",
  "date_to": "2025-01-31T23:59:59",
  "card_ids": [1, 2, 3],
  "vehicle_ids": [1, 2, 3],
  "organization_ids": [1, 2, 3],
  "time_window_minutes": 30,
  "quantity_tolerance_percent": 5.0,
  "azs_radius_meters": 500
}
```

**Пример ответа:**
```json
{
  "statistics": {
    "total_transactions": 1000,
    "analyzed": 995,
    "errors": 5,
    "matched": 850,
    "no_refuel": 100,
    "location_mismatch": 30,
    "anomalies": 45,
    "anomaly_types": {
      "fuel_theft": 20,
      "card_misuse": 15,
      "data_error": 10
    }
  },
  "errors": [
    {
      "transaction_id": 123,
      "error": "Vehicle not found"
    }
  ]
}
```

### 4. Получение результатов анализа

**GET** `/results`

Получение сохраненных результатов анализа с фильтрацией.

**Query параметры:**
- `transaction_id` (int, optional) - ID транзакции
- `card_id` (int, optional) - ID карты
- `vehicle_id` (int, optional) - ID ТС
- `match_status` (string, optional) - Статус соответствия
- `is_anomaly` (bool, optional) - Флаг аномалии
- `date_from` (datetime, optional) - Начальная дата
- `date_to` (datetime, optional) - Конечная дата
- `skip` (int, default=0) - Количество пропущенных записей
- `limit` (int, default=100, max=1000) - Количество записей

**Пример запроса:**
```bash
GET /api/v1/fuel-card-analysis/results?is_anomaly=true&match_status=no_refuel&limit=50
```

**Пример ответа:**
```json
{
  "total": 45,
  "items": [
    {
      "id": 1,
      "transaction_id": 123,
      "match_status": "no_refuel",
      "is_anomaly": true,
      "anomaly_type": "fuel_theft"
    }
  ]
}
```

### 5. Статистика по аномалиям

**GET** `/anomalies/stats`

Получение статистики по аномалиям.

**Query параметры:**
- `date_from` (datetime, optional) - Начальная дата
- `date_to` (datetime, optional) - Конечная дата
- `organization_id` (int, optional) - ID организации
- `anomaly_type` (string, optional) - Тип аномалии

**Пример запроса:**
```bash
GET /api/v1/fuel-card-analysis/anomalies/stats?date_from=2025-01-01T00:00:00&date_to=2025-01-31T23:59:59
```

**Пример ответа:**
```json
{
  "total_anomalies": 45,
  "by_type": {
    "fuel_theft": 20,
    "card_misuse": 15,
    "data_error": 10
  },
  "by_status": {
    "no_refuel": 25,
    "location_mismatch": 15,
    "multiple_matches": 5
  },
  "date_from": "2025-01-01T00:00:00",
  "date_to": "2025-01-31T23:59:59"
}
```

### 6. Загрузка данных о заправках

**POST** `/refuels/upload`

Загрузка данных о заправках ТС.

**Тело запроса:**
```json
{
  "refuels": [
    {
      "vehicle_id": 1,
      "refuel_date": "2025-01-15T10:30:00",
      "fuel_type": "Дизельное топливо",
      "quantity": 50.5,
      "fuel_level_before": 20,
      "fuel_level_after": 80,
      "odometer_reading": 150000,
      "latitude": 55.7558,
      "longitude": 37.6173,
      "source_system": "GLONASS",
      "source_id": "refuel_12345",
      "location_accuracy": 10.0
    }
  ]
}
```

**Пример ответа:**
```json
{
  "created": 1,
  "errors": []
}
```

### 7. Загрузка данных о местоположениях

**POST** `/locations/upload`

Загрузка данных о местоположениях ТС.

**Тело запроса:**
```json
{
  "locations": [
    {
      "vehicle_id": 1,
      "timestamp": "2025-01-15T10:30:00",
      "latitude": 55.7558,
      "longitude": 37.6173,
      "speed": 60,
      "heading": 90,
      "accuracy": 10,
      "source": "GLONASS"
    }
  ]
}
```

**Пример ответа:**
```json
{
  "created": 1,
  "errors": []
}
```

## Статусы соответствия

- `matched` - найдено соответствие между транзакцией и заправкой
- `no_refuel` - нет данных о заправке
- `location_mismatch` - ТС не было в радиусе АЗС
- `quantity_mismatch` - несоответствие количества топлива
- `time_mismatch` - несоответствие времени
- `multiple_matches` - найдено несколько возможных соответствий

## Типы аномалий

- `fuel_theft` - возможная кража топлива
- `card_misuse` - неправильное использование карты
- `data_error` - ошибка в данных
- `equipment_failure` - сбой оборудования

## Примеры использования

### Пример 1: Анализ транзакции

```python
import requests

# Анализ конкретной транзакции
response = requests.post(
    "http://localhost:8000/api/v1/fuel-card-analysis/analyze-transaction/123",
    params={
        "time_window_minutes": 30,
        "quantity_tolerance_percent": 5,
        "azs_radius_meters": 500
    },
    headers={"Authorization": "Bearer YOUR_TOKEN"}
)

result = response.json()
print(f"Статус: {result['match_status']}")
print(f"Уверенность: {result['match_confidence']}%")
print(f"Аномалия: {result['is_anomaly']}")
```

### Пример 2: Массовый анализ

```python
import requests
from datetime import datetime

# Массовый анализ за период
response = requests.post(
    "http://localhost:8000/api/v1/fuel-card-analysis/analyze-period",
    json={
        "date_from": "2025-01-01T00:00:00",
        "date_to": "2025-01-31T23:59:59",
        "organization_ids": [1, 2, 3]
    },
    headers={"Authorization": "Bearer YOUR_TOKEN"}
)

stats = response.json()["statistics"]
print(f"Всего транзакций: {stats['total_transactions']}")
print(f"Проанализировано: {stats['analyzed']}")
print(f"Аномалий: {stats['anomalies']}")
```

### Пример 3: Загрузка данных о заправках

```python
import requests

# Загрузка данных о заправках
refuels_data = {
    "refuels": [
        {
            "vehicle_id": 1,
            "refuel_date": "2025-01-15T10:30:00",
            "fuel_type": "Дизельное топливо",
            "quantity": 50.5,
            "source_system": "GLONASS",
            "latitude": 55.7558,
            "longitude": 37.6173
        }
    ]
}

response = requests.post(
    "http://localhost:8000/api/v1/fuel-card-analysis/refuels/upload",
    json=refuels_data,
    headers={"Authorization": "Bearer YOUR_TOKEN"}
)

result = response.json()
print(f"Создано заправок: {result['created']}")
```

## Обработка ошибок

Все эндпоинты возвращают стандартные HTTP коды статуса:

- `200 OK` - успешный запрос
- `400 Bad Request` - неверные параметры запроса
- `404 Not Found` - ресурс не найден
- `500 Internal Server Error` - внутренняя ошибка сервера

В случае ошибки ответ содержит поле `detail` с описанием проблемы:

```json
{
  "detail": "Транзакция 123 не найдена"
}
```

## Настройки анализа

Параметры анализа можно настроить:

- **Временное окно** (`time_window_minutes`): по умолчанию ±30 минут
- **Допустимое отклонение количества** (`quantity_tolerance_percent`): по умолчанию ±5%
- **Радиус АЗС** (`azs_radius_meters`): по умолчанию 500 метров

Эти параметры можно передавать в каждом запросе анализа или настроить глобально в конфигурации системы.
