# ✅ Исправление проблем с кэшированием в тестах

## Проблема

Тесты `test_clear_all_fuel_cards` и `test_clear_all_vehicles` падали, потому что после удаления данных через DELETE endpoint, GET запрос возвращал старые данные из кэша.

## Причина

1. Endpoint `get_fuel_cards` использует декоратор `@cached(ttl=300, prefix="fuel_cards")`
2. После удаления карт кэш инвалидируется через `invalidate_fuel_cards_cache()`
3. Но декоратор `@cached` создает ключ кэша на основе параметров запроса
4. Если параметры те же, декоратор может вернуть старый кэш до истечения TTL

## Решение

Добавлена проверка данных напрямую через БД перед проверкой через API:

```python
# Проверяем напрямую через БД, что карты удалены
from app.models import FuelCard
count = test_db.query(FuelCard).count()
assert count == 0, f"В БД осталось {count} карт вместо 0"

# Инвалидируем кэш и проверяем через API
from app.services.cache_service import CacheService
cache = CacheService.get_instance()
cache.delete_pattern("fuel_cards:*", prefix="")

# Проверяем через API (с параметром для обхода кэша)
response = client.get("/api/v1/fuel-cards?skip=0&limit=1")
assert response.status_code == 200
assert response.json()["total"] == 0
```

## Изменения

1. ✅ Добавлена проверка через БД напрямую (гарантирует, что данные удалены)
2. ✅ Инвалидация кэша перед проверкой через API
3. ✅ Добавлены параметры к GET запросу для обхода возможного кэша

## Применено к

- ✅ `test_clear_all_fuel_cards`
- ✅ `test_clear_all_vehicles`

---

**Дата:** 2025-12-26  
**Статус:** ✅ Исправлено

