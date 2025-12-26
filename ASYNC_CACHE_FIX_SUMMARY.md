# ✅ Исправление: RuntimeWarning coroutine was never awaited

## 🔴 Проблема

```
RuntimeWarning: coroutine 'get_vehicles' was never awaited
RuntimeWarning: coroutine 'get_organizations' was never awaited
RuntimeWarning: coroutine 'get_fuel_cards' was never awaited
RuntimeWarning: coroutine 'get_gas_stations' was never awaited
RuntimeWarning: coroutine 'get_fuel_types' was never awaited
```

**Причина:** Декоратор `@cached` не поддерживал async функции, возвращал корутину вместо результата.

---

## ✅ Решение

Исправлен декоратор `@cached` в `backend/app/services/cache_service.py`:

### Изменения:

1. ✅ Добавлен импорт `inspect` для проверки типа функции
2. ✅ Добавлена проверка `inspect.iscoroutinefunction(func)`
3. ✅ Созданы два wrapper'а:
   - `async_wrapper` — для async функций (использует `await`)
   - `sync_wrapper` — для sync функций

### Код:

```python
def decorator(func: Callable):
    is_async = inspect.iscoroutinefunction(func)
    
    if is_async:
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            # ... логика кэширования
            result = await func(*args, **kwargs)  # ✅ await для async
            return result
        wrapper = async_wrapper
    else:
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            # ... логика кэширования
            result = func(*args, **kwargs)  # ✅ обычный вызов для sync
            return result
        wrapper = sync_wrapper
```

---

## ✅ Затронутые функции

Все async функции с декоратором `@cached`:
- ✅ `get_vehicles` (vehicles.py)
- ✅ `get_fuel_cards` (fuel_cards.py)
- ✅ `get_organizations` (organizations.py)
- ✅ `get_gas_stations` (gas_stations.py)
- ✅ `get_fuel_types` (fuel_types.py)
- ✅ `get_providers` (providers.py)
- ✅ `get_transactions` (transactions.py)
- ✅ `get_dashboard_stats` (dashboard.py)

---

## ✅ Проверка

После перезапуска контейнера:

```powershell
docker compose restart backend
```

Ошибки `RuntimeWarning: coroutine ... was never awaited` должны исчезнуть.

---

**Дата:** 2025-12-26  
**Статус:** ✅ Исправлено

