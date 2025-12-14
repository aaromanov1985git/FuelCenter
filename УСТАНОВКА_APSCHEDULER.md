# Установка APScheduler

## Проблема

Ошибка: `ModuleNotFoundError: No module named 'apscheduler'`

## Решение

Пакет `apscheduler` уже указан в `backend/requirements.txt`, но контейнер нужно пересобрать, чтобы установить зависимости.

### Вариант 1: Пересборка контейнера (рекомендуется)

```bash
# Остановите контейнеры
docker-compose down

# Пересоберите контейнер backend с установкой всех зависимостей
docker-compose build --no-cache backend

# Запустите контейнеры
docker-compose up -d
```

### Вариант 2: Установка пакета в запущенный контейнер (временное решение)

```bash
# Войдите в контейнер
docker-compose exec backend pip install apscheduler==3.10.4

# Перезапустите контейнер
docker-compose restart backend
```

### Вариант 3: Проверка установки

После пересборки проверьте, что пакет установлен:

```bash
docker-compose exec backend pip list | grep apscheduler
```

Должно показать:
```
apscheduler 3.10.4
```

## Проверка после установки

После пересборки контейнера проверьте логи:

```bash
docker-compose logs backend | grep -i "планировщик\|scheduler"
```

Должны появиться логи:
- "Планировщик задач автоматической загрузки запущен"
- "Расписания автоматической загрузки загружены"

## Примечание

В `requirements.txt` пакет указан как `apscheduler==3.10.4` (с маленькой буквы), что является правильным именем для установки через pip.
