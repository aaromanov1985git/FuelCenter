# ✅ Исправление декоратора @cached для async функций

**Проблема:** 
```
RuntimeWarning: coroutine 'get_vehicles' was never awaited
```

**Причина:** Декоратор `@cached` не поддерживал async функции, возвращал корутину вместо результата.

---

## ✅ РЕШЕНИЕ

Исправлен декоратор `@cached` в `backend/app/services/cache_service.py`:

### До:
```python
def decorator(func: Callable):
    @wraps(func)
    def wrapper(*args, **kwargs):
        # ... синхронная логика
        result = func(*args, **kwargs)  # ❌ Не работает для async
        return result
```

### После:
```python
def decorator(func: Callable):
    is_async = inspect.iscoroutinefunction(func)
    
    if is_async:
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            # ... async логика
            result = await func(*args, **kwargs)  # ✅ Правильно для async
            return result
        wrapper = async_wrapper
    else:
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            # ... sync логика
            result = func(*args, **kwargs)  # ✅ Правильно для sync
            return result
        wrapper = sync_wrapper
```

---

## ✅ ИЗМЕНЕНИЯ

1. ✅ Добавлен импорт `inspect` для проверки типа функции
2. ✅ Добавлена проверка `inspect.iscoroutinefunction(func)`
3. ✅ Созданы два wrapper'а: `async_wrapper` и `sync_wrapper`
4. ✅ Async wrapper использует `await` для вызова функции

---

## ✅ ПРОВЕРКА

После перезапуска контейнера ошибки `RuntimeWarning: coroutine ... was never awaited` должны исчезнуть.

**Команда для перезапуска:**
```powershell
docker compose restart backend
```

---

**Дата:** 2025-12-26  
**Статус:** ✅ Исправлено

