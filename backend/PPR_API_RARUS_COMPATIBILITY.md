# Совместимость с зашифрованным модулем РАРУСППР

## Статус интеграции

✅ **Интеграция работает!** Загрузка данных из нашего API в модуль РАРУСППР успешно выполняется.

## Важная информация

Модуль **РАРУСППР** в 1С ERP зашифрован и не может быть изменен. Это означает:

- ✅ Наш API должен полностью соответствовать формату оригинального PPR API
- ✅ Все изменения для совместимости делаются на стороне нашего API
- ✅ Формат ответа должен быть идентичен оригинальному PPR API

## Текущая реализация

### Поддерживаемые эндпоинты

1. **GET** `/api/public-api/v2/transactions`
   - Параметры: `dateFrom`, `dateTo`, `format=json`
   - Авторизация: API ключ в заголовке `Authorization`
   - Формат ответа: JSON с полем `transactions`

2. **GET** `/api/public-api/v2/cards`
   - Авторизация: API ключ в заголовке `Authorization`
   - Формат ответа: JSON с полем `cards` или `items`

### Формат ответа для транзакций

Модуль РАРУСППР ожидает следующий формат:

```json
{
  "transactions": [
    {
      "date": "2025-12-01T10:30:00",
      "cardNum": "1234567890123456",
      "TypeID": 1,
      "fuel": "Дизельное топливо",
      "quantity": 50.5,
      "price": 45.50,
      "amount": 2297.75,
      "address": "ул. Примерная, д. 1, Москва, Московская область",
      "stateNumber": "А123БВ777"
    }
  ]
}
```

**Поля транзакции:**
- `date` (string) - Дата в формате ISO 8601
- `cardNum` (string) - Номер карты
- `TypeID` (integer) - Тип операции:
  - `1` = "Заправка"
  - `0` = "Возврат"
- `fuel` (string) - Вид топлива (Топливо)
- `quantity` (number) - Количество
- `price` (number) - Цена
- `amount` (number) - Сумма
- `address` (string) - Адрес АЗС
- `stateNumber` (string) - Государственный номер ТС

### Авторизация

Модуль использует API ключ в заголовке `Authorization`:
```
Authorization: yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR
```

**Важно:** Ключ передается без префикса "Bearer".

## Настройка в 1С

В форме настройки учетной записи ПЦ:

1. **Внешняя система:** ППР
2. **Адрес сервиса:** `http://10.35.1.200:8000/api/public-api/v2`
3. **Ключ авторизации:** `yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR` (ваш API ключ)

## Проверка совместимости

### Что работает:

✅ Загрузка транзакций за период  
✅ Авторизация по API ключу  
✅ Парсинг JSON ответа  
✅ Обработка массива `transactions`  
✅ Извлечение полей `date`, `cardNum`, `TypeID`

### Что может потребоваться:

Если модуль ожидает дополнительные поля в транзакциях, их можно добавить в метод `_convert_transaction_to_english_format` в файле `backend/app/services/ppr_api_service.py`.

## Добавление дополнительных полей

Если модуль РАРУСППР требует дополнительные поля, обновите метод преобразования:

```python
def _convert_transaction_to_english_format(self, transaction: Transaction) -> Dict[str, Any]:
    структура_english = {
        "date": transaction.transaction_date.isoformat() if transaction.transaction_date else "",
        "cardNum": str(transaction.card_number) if transaction.card_number else "",
        "TypeID": 1 if transaction.operation_type != "Возврат" else 0,
        # Добавьте дополнительные поля здесь, если требуется
        # "amount": float(transaction.amount) if transaction.amount else 0.0,
        # "quantity": float(transaction.quantity) if transaction.quantity else 0.0,
    }
    return структура_english
```

## Логирование

Все запросы от модуля РАРУСППР логируются в системе. Для просмотра логов:

1. Проверьте логи приложения
2. Ищите записи с `auth_type: "api_key"` и `provider_name`
3. Проверяйте формат ответа в логах

## Устранение проблем

### Проблема: Модуль не получает данные

1. Проверьте, что API ключ правильно сохранен в шаблоне провайдера
2. Убедитесь, что в базе есть транзакции за указанный период
3. Проверьте логи API на наличие ошибок

### Проблема: Неправильный формат данных

1. Проверьте формат поля `date` (должен быть ISO 8601)
2. Убедитесь, что `cardNum` - строка
3. Проверьте, что `TypeID` - число (1 или 0)

### Проблема: Ошибка авторизации

1. Проверьте правильность API ключа в шаблоне провайдера
2. Убедитесь, что ключ передается без префикса "Bearer"
3. Проверьте, что шаблон провайдера активен

## Тестирование

Для тестирования совместимости используйте:

```powershell
$apiKey = "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR"
$headers = @{
    Authorization = $apiKey
    Content-Type = "application/json"
}

$url = "http://10.35.1.200:8000/api/public-api/v2/transactions?dateFrom=2025-12-01&dateTo=2025-12-22&format=json"
$response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers

# Проверка структуры
$response.transactions.Count
$response.transactions[0] | ConvertTo-Json
```

## Заключение

Интеграция с зашифрованным модулем РАРУСППР работает через наш эмулированный PPR API. Все изменения для обеспечения совместимости выполняются на стороне нашего API, что позволяет работать с модулем без его модификации.

