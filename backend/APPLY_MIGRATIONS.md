# Инструкция по применению миграций

## Вариант 1: Использование PowerShell скрипта (рекомендуется)

```powershell
cd C:\curWork\GSM\backend
.\apply_migrations.ps1
```

Скрипт автоматически:
- Проверит наличие виртуального окружения
- Создаст его, если нужно
- Установит зависимости
- Применит все миграции

## Вариант 2: Ручное создание виртуального окружения

```powershell
cd C:\curWork\GSM\backend

# Создать виртуальное окружение
python -m venv venv

# Активировать виртуальное окружение
.\venv\Scripts\Activate.ps1

# Установить зависимости
pip install -r requirements.txt

# Применить миграции
alembic upgrade head
```

## Вариант 3: Использование Python скрипта напрямую

Если Python установлен глобально и зависимости установлены:

```powershell
cd C:\curWork\GSM\backend
python scripts\migrate.py
```

## Вариант 4: Если используется Docker

Миграции применяются автоматически при запуске контейнера (если `AUTO_MIGRATE=true`).

Для ручного применения:

```powershell
docker exec -it gsm_backend alembic upgrade head
```

## Проверка текущей версии миграций

После применения миграций можно проверить текущую версию:

```powershell
# В активированном виртуальном окружении
alembic current

# Или через Python
python -c "from alembic.config import Config; from alembic import command; import os; cfg = Config(os.path.join('alembic.ini')); print(command.current(cfg))"
```

## Список миграций, которые должны быть применены:

1. `20250131_000000` - Удаление organization_id из gas_stations
2. `20250131_000001` - Добавление provider_id в gas_stations, удаление organization_id из fuel_cards
3. `20251214_000000` - Добавление координат (latitude, longitude) в gas_stations

## Если возникают ошибки:

1. **Ошибка подключения к БД**: Проверьте, что база данных запущена и доступна
2. **Ошибка "relation does not exist"**: Возможно, нужно применить более ранние миграции
3. **Ошибка "duplicate key"**: Возможно, миграция уже применена частично

Для отката миграции:
```powershell
alembic downgrade -1
```
