# Применение миграции для уведомлений

Миграция для таблиц уведомлений уже создана: `20250201_000000_add_notifications_tables.py`

## Варианты применения миграции

### Вариант 1: Автоматическое применение (если AUTO_MIGRATE=true)

Если в `.env` установлено `AUTO_MIGRATE=true` (по умолчанию), миграции применятся автоматически при запуске сервера.

Просто перезапустите сервер:
```bash
# Если используете Docker
docker-compose restart backend

# Или локально
uvicorn app.main:app --reload
```

### Вариант 2: Через Docker Compose

```bash
docker-compose exec backend alembic upgrade head
```

### Вариант 3: Локально через виртуальное окружение

1. Активируйте виртуальное окружение:
```powershell
# Windows PowerShell
.\venv\Scripts\Activate.ps1

# или CMD
venv\Scripts\activate.bat
```

2. Примените миграцию:
```bash
alembic upgrade head
```

### Вариант 4: Через Python скрипт

Создайте файл `apply_notification_migration.py`:

```python
from alembic.config import Config
from alembic import command
import os

# Получаем путь к alembic.ini
alembic_ini = os.path.join(os.path.dirname(__file__), 'alembic.ini')
cfg = Config(alembic_ini)

# Применяем миграции
command.upgrade(cfg, "head")
```

Запустите:
```bash
python apply_notification_migration.py
```

### Вариант 5: Через SQL напрямую (если другие варианты не работают)

Если ничего не помогает, можно выполнить SQL напрямую в БД. Смотрите файл миграции:
`backend/alembic/versions/20250201_000000_add_notifications_tables.py`

## Проверка применения миграции

После применения миграции проверьте, что таблицы созданы:

```sql
-- Проверка таблицы настроек уведомлений
SELECT * FROM notification_settings LIMIT 1;

-- Проверка таблицы уведомлений
SELECT * FROM notifications LIMIT 1;
```

Или через Python:
```python
from app.database import engine
from sqlalchemy import inspect

inspector = inspect(engine)
tables = inspector.get_table_names()
print("notification_settings" in tables)  # Должно быть True
print("notifications" in tables)  # Должно быть True
```

