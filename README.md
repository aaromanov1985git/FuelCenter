# Конвертер ГСМ → Шаблон ЮПМ Газпром

Веб-приложение для конвертации данных ГСМ из различных форматов в структуру шаблона ЮПМ Газпром с хранением в базе данных.

## Архитектура

- **Frontend**: React + Vite
- **Backend**: FastAPI
- **База данных**: PostgreSQL
- **Контейнеризация**: Docker Compose

## Быстрый старт

### Вариант 1: Docker Compose (рекомендуется)

1. Убедитесь, что установлены Docker и Docker Compose

2. Запустите все сервисы:
```bash
docker-compose up -d
```

3. Откройте браузер:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API документация: http://localhost:8000/docs

4. Остановка:
```bash
docker-compose down
```

### Вариант 2: Локальная разработка

#### Backend

1. Перейдите в директорию backend:
```bash
cd backend
```

2. Создайте виртуальное окружение:
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

3. Установите зависимости:
```bash
pip install -r requirements.txt
```

4. Создайте файл `.env` на основе `.env.example`:
```bash
cp .env.example .env
```

5. Убедитесь, что PostgreSQL запущен и создайте БД:
```sql
CREATE DATABASE gsm_db;
CREATE USER gsm_user WITH PASSWORD 'gsm_password';
GRANT ALL PRIVILEGES ON DATABASE gsm_db TO gsm_user;
```

6. Запустите backend:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend

1. Установите зависимости:
```bash
npm install
```

2. Запустите dev-сервер:
```bash
npm run dev
```

3. Откройте http://localhost:3000

## Использование

1. Нажмите "Выберите файл" и загрузите файл Excel с данными ГСМ
2. Файл будет обработан на сервере и данные сохранены в БД
3. Просмотрите транзакции в таблице
4. Используйте фильтры для поиска по номеру карты, АЗС или товару
5. Нажмите "Скачать Excel" для экспорта всех данных

## Поддержка Firebird Database

Приложение поддерживает загрузку данных из базы данных Firebird (FDB). Для работы с Firebird необходимо:

1. Установить клиентскую библиотеку Firebird (fbclient)
2. Установить Python библиотеку fdb (уже включена в requirements.txt)

**Подробные инструкции по установке клиентской библиотеки Firebird:** см. [`docs/setup/firebird.md`](docs/setup/firebird.md)

### Быстрая установка (Windows)

1. Скачайте и установите Firebird с https://firebirdsql.org/en/downloads/
2. Добавьте папку с `fbclient.dll` в переменную окружения PATH
3. Перезапустите backend приложение

При возникновении ошибки "The location of Firebird Client Library could not be determined" следуйте инструкциям в [`docs/setup/firebird.md`](docs/setup/firebird.md).

## Миграции Базы Данных

Проект использует Alembic для управления миграциями БД. Подробная документация в [`docs/setup/migrations.md`](docs/setup/migrations.md).

### Быстрый старт с миграциями

```bash
cd backend

# Создать начальную миграцию (если еще не создана)
alembic revision --autogenerate -m "Initial migration"

# Применить миграции
alembic upgrade head
```

Миграции применяются автоматически при старте приложения. Для отключения установите `AUTO_MIGRATE=false` в `.env`.

## API Endpoints

- `POST /api/transactions/upload` - Загрузка Excel файла
- `GET /api/transactions` - Получение списка транзакций (с пагинацией и фильтрами)
- `GET /api/transactions/{id}` - Получение транзакции по ID
- `DELETE /api/transactions/{id}` - Удаление транзакции
- `GET /api/transactions/stats/summary` - Статистика по транзакциям

Полная документация API доступна по адресу: http://localhost:8000/docs

## Маппинг полей

- **Пользователь** → **Закреплена за**
- **Номер карты** → **№ карты**
- **КАЗС** → **Номер АЗС** (извлекается номер из "контроллер КАЗС14" → "АЗС №14")
- **Дата** → **Дата и время** (формат dd/mm/yy hh:mm)
- **Кол-во (л.)** → **Кол-во**
- **Вид топлива** → **Товар / услуга** (нормализация: "Бензин АИ-92" → "АИ-92")

## Документация

Вся документация проекта организована в директории [`docs/`](docs/):

- **[Установка и настройка](docs/setup/)** - инструкции по установке и первоначальной настройке
- **[API и интеграции](docs/api/)** - документация по API и интеграциям с внешними системами
- **[Конфигурация](docs/configuration/)** - настройка безопасности, HTTPS, провайдеров
- **[Деплой и операции](docs/deployment/)** - инструкции по развертыванию и мониторингу
- **[Разработка](docs/development/)** - архитектура, стандарты кодирования

Полный индекс документации: [`docs/README.md`](docs/README.md)

## Структура проекта

```
GSM/
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py       # Главный модуль FastAPI
│   │   ├── database.py   # Подключение к БД
│   │   ├── models.py     # Модели SQLAlchemy
│   │   ├── schemas.py    # Pydantic схемы
│   │   └── services.py   # Бизнес-логика
│   ├── docs/             # Backend-специфичная документация
│   ├── Dockerfile
│   └── requirements.txt
├── docs/                 # Документация проекта
│   ├── setup/            # Установка и настройка
│   ├── api/              # API документация
│   ├── configuration/    # Конфигурация
│   ├── deployment/       # Деплой
│   ├── development/      # Разработка
│   └── archive/          # Устаревшая документация
├── src/                  # React frontend
│   ├── App.jsx
│   ├── App.css
│   ├── main.jsx
│   └── index.css
├── docker-compose.yml    # Docker Compose конфигурация
├── package.json
├── vite.config.js
├── TODO.md               # Глобальная система задач
├── TECHDEBT.md           # Технический долг
└── README.md
```

## Технологии

- **Frontend**: React 18, Vite, XLSX (SheetJS)
- **Backend**: FastAPI, SQLAlchemy, PostgreSQL, Pandas, OpenPyXL
- **Infrastructure**: Docker, Docker Compose
