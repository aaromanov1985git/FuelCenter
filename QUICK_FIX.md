# ⚡ Быстрое исправление ошибки ModuleNotFoundError

## Проблема
```
ModuleNotFoundError: No module named 'tenacity'
```

## ✅ Решение (выберите один вариант)

### Вариант 1: Установить в запущенном контейнере (быстро)

```powershell
# Установить зависимости
docker exec gsm_backend pip install --no-cache-dir tenacity==8.2.3 circuitbreaker==2.0.0

# Перезапустить
docker compose restart backend
```

### Вариант 2: Пересобрать контейнер (правильно)

```powershell
# Остановить и пересобрать
docker compose down backend
docker compose build backend
docker compose up -d backend
```

---

## ✅ Проверка

После исправления проверьте:

```powershell
# Проверить логи
docker logs gsm_backend --tail 30

# Проверить, что модули установлены
docker exec gsm_backend python -c "import tenacity; import circuitbreaker; print('OK')"
```

---

**Примечание:** Зависимости уже добавлены в `backend/requirements.txt`, но контейнер нужно пересобрать для их установки.

