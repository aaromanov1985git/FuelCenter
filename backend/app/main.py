"""
Главный модуль FastAPI приложения
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Request, status, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect
import os
from app.database import get_db, engine, Base
from app.logger import logger
from app.middleware import LoggingMiddleware
from app.middleware.rate_limit import setup_rate_limiting
from app.middleware.prometheus_metrics import setup_prometheus
from app.config import get_settings

settings = get_settings()

# Импортируем роутеры
from app.routers import (
    transactions,
    vehicles,
    fuel_cards,
    gas_stations,
    fuel_types,
    providers,
    templates,
    dashboard,
    upload_period_lock,
    upload_events,
    auth,
    users,
    organizations,
    logs,
    normalization_settings,
    card_info_schedules,
    fuel_card_analysis,
    onec_integration,
    ppr_api,
    notifications,
    system_settings,
    backup,
    health
)

from app.models import Provider, User
from app.auth import get_password_hash

# Применяем миграции БД при старте (если БД доступна)
# В production рекомендуется применять миграции отдельно через alembic upgrade head
# Для отключения автоматических миграций установите AUTO_MIGRATE=false в .env
auto_migrate = os.getenv("AUTO_MIGRATE", "true").lower() == "true"

if auto_migrate:
    try:
        from alembic.config import Config
        from alembic import command
        import os as os_module
        
        # Путь к alembic.ini относительно корня backend
        alembic_ini_path = os_module.path.join(os_module.path.dirname(__file__), '..', 'alembic.ini')
        if not os_module.path.exists(alembic_ini_path):
            logger.info("Файл alembic.ini не найден, пропускаем миграции Alembic")
            raise FileNotFoundError(f"alembic.ini not found at {alembic_ini_path}")
        alembic_cfg = Config(alembic_ini_path)
        command.upgrade(alembic_cfg, "head")
        logger.info("Миграции БД успешно применены", extra={"auto_migrate": True})
    except Exception as e:
        logger.warning(
            f"Не удалось применить миграции при старте: {e}", 
            extra={"error": str(e), "auto_migrate": True}
        )
        logger.info("Попытка создать таблицы через create_all (fallback)")
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("Таблицы базы данных созданы через create_all (fallback)")
        except Exception as create_error:
            logger.error(
                f"Не удалось создать таблицы: {create_error}",
                extra={"error": str(create_error)},
                exc_info=True
            )
else:
    logger.info("Автоматическое применение миграций отключено (AUTO_MIGRATE=false)")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Управление жизненным циклом приложения (startup и shutdown)
    Заменяет устаревшие @app.on_event("startup") и @app.on_event("shutdown")
    """
    # Startup
    from sqlalchemy.orm import Session
    from sqlalchemy import text
    from app.services.logging_service import logging_service
    
    logger.info("Запуск приложения: инициализация начальных данных", extra={
        "event_type": "system",
        "event_category": "startup"
    })
    
    # Тестовое логирование для проверки работы системы логирования
    db = next(get_db())
    try:
        # Проверяем, существуют ли таблицы логов
        from sqlalchemy import inspect
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        
        if 'system_logs' not in tables or 'user_action_logs' not in tables:
            logger.warning("Таблицы логов не найдены. Необходимо применить миграцию: alembic upgrade head")
        else:
            # Создаем тестовый лог
            logging_service.log_system_event(
                db=db,
                level="INFO",
                message="Приложение запущено",
                module="main",
                function="lifespan",
                event_type="system",
                event_category="startup",
                extra_data={"version": settings.api_version}
            )
            logger.info("Тестовый системный лог успешно создан")
    except Exception as e:
        logger.error(f"Ошибка при создании тестового системного лога: {e}", exc_info=True)
        # Проверяем, может быть таблицы не существуют
        try:
            from sqlalchemy import inspect, text
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            if 'system_logs' not in tables:
                logger.error("Таблица system_logs не существует. Примените миграцию: alembic upgrade head")
        except Exception as check_error:
            logger.error(f"Не удалось проверить наличие таблиц: {check_error}")
    finally:
        db.close()
    
    # Запускаем планировщик автоматической загрузки
    logger.info("Начало инициализации планировщика", extra={
        "event_type": "scheduler",
        "event_category": "startup"
    })
    try:
        from app.services.scheduler_service import SchedulerService
        scheduler = SchedulerService.get_instance()
        scheduler.start()
        
        # Получаем информацию о запланированных задачах
        jobs_info = scheduler.get_scheduled_jobs()
        logger.info("Планировщик автоматической загрузки инициализирован", extra={
            "event_type": "scheduler",
            "event_category": "startup",
            "scheduled_jobs_count": jobs_info.get("total", 0),
            "scheduler_running": scheduler._scheduler.running if scheduler._scheduler else False
        })
        
        # Логируем детали запланированных задач
        if jobs_info.get("total", 0) > 0:
            for job in jobs_info.get("jobs", []):
                logger.info("Запланированная задача", extra={
                    "event_type": "scheduler",
                    "event_category": "startup",
                    "job_id": job.get("id"),
                    "next_run_time": job.get("next_run_time"),
                    "trigger": job.get("trigger")
                })
        else:
            logger.warning("Не найдено запланированных задач автоматической загрузки", extra={
                "event_type": "scheduler",
                "event_category": "startup"
            })
    except Exception as e:
        logger.error(f"Ошибка при инициализации планировщика: {e}", extra={
            "error": str(e),
            "error_type": type(e).__name__,
            "event_type": "scheduler",
            "event_category": "startup"
        }, exc_info=True)
        
        # Логируем ошибку через logging_service если возможно
        try:
            db = next(get_db())
            try:
                logging_service.log_system_event(
                    db=db,
                    level="ERROR",
                    message=f"Критическая ошибка при инициализации планировщика: {str(e)}",
                    module="main",
                    function="lifespan",
                    event_type="scheduler",
                    event_category="startup",
                    extra_data={"error": str(e), "error_type": type(e).__name__},
                    exception=e
                )
            finally:
                db.close()
        except Exception as log_error:
            logger.error(f"Не удалось записать системный лог ошибки планировщика: {log_error}", exc_info=True)
    
    # Создаем базу данных gsm_user, если она не существует
    # Это нужно для устранения ошибок в логах PostgreSQL
    try:
        # Подключаемся к postgres для создания базы данных
        from urllib.parse import urlparse
        parsed_url = urlparse(settings.database_url if not os.getenv("DATABASE_URL") else os.getenv("DATABASE_URL"))
        postgres_url = f"{parsed_url.scheme}://{parsed_url.username}:{parsed_url.password}@{parsed_url.hostname}:{parsed_url.port or 5432}/postgres"
        
        from sqlalchemy import create_engine
        postgres_engine = create_engine(postgres_url, isolation_level="AUTOCOMMIT")
        with postgres_engine.connect() as conn:
            result = conn.execute(text("SELECT 1 FROM pg_database WHERE datname = 'gsm_user'"))
            if result.fetchone() is None:
                conn.execute(text("CREATE DATABASE gsm_user WITH OWNER = gsm_user"))
                logger.info("Создана база данных gsm_user для устранения ошибок в логах")
        postgres_engine.dispose()
    except Exception as e:
        logger.warning(f"Не удалось создать базу данных gsm_user: {e}", extra={"error": str(e)})
    
    db = next(get_db())
    try:
        # Проверяем и добавляем недостающие колонки (fallback к ручным миграциям)
        inspector = inspect(engine)
        columns_provider_templates = [col["name"] for col in inspector.get_columns("provider_templates")]
        columns_fuel_cards = [col["name"] for col in inspector.get_columns("fuel_cards")]

        if "fuel_type_mapping" not in columns_provider_templates:
            try:
                db.execute(text("ALTER TABLE provider_templates ADD COLUMN IF NOT EXISTS fuel_type_mapping TEXT"))
                db.commit()
                logger.info("Добавлена колонка fuel_type_mapping в provider_templates (fallback)")
            except Exception as e:
                db.rollback()
                logger.warning("Не удалось добавить колонку fuel_type_mapping (возможно, уже существует или нет прав)", extra={"error": str(e)})

        if "is_blocked" not in columns_fuel_cards:
            try:
                db.execute(text("ALTER TABLE fuel_cards ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE"))
                db.commit()
                logger.info("Добавлена колонка is_blocked в fuel_cards (fallback)")
            except Exception as e:
                db.rollback()
                logger.warning("Не удалось добавить колонку is_blocked (возможно, уже существует или нет прав)", extra={"error": str(e)})

        # Проверяем наличие таблицы gas_stations и колонки gas_station_id в transactions
        try:
            columns_transactions = [col["name"] for col in inspector.get_columns("transactions")]
            
            # Проверяем наличие колонки gas_station_id в transactions
            if "gas_station_id" not in columns_transactions:
                try:
                    db.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gas_station_id INTEGER"))
                    db.commit()
                    logger.info("Добавлена колонка gas_station_id в transactions (fallback)")
                except Exception as e:
                    db.rollback()
                    logger.warning("Не удалось добавить колонку gas_station_id (возможно, уже существует или нет прав)", extra={"error": str(e)})
            
            # Проверяем наличие таблицы gas_stations
            if "gas_stations" not in inspector.get_table_names():
                try:
                    db.execute(text("""
                        CREATE TABLE IF NOT EXISTS gas_stations (
                            id SERIAL PRIMARY KEY,
                            original_name VARCHAR(200) NOT NULL,
                            azs_number VARCHAR(50),
                            location VARCHAR(500),
                            region VARCHAR(200),
                            settlement VARCHAR(200),
                            is_validated VARCHAR(10) DEFAULT 'pending',
                            validation_errors VARCHAR(500),
                            created_at TIMESTAMP DEFAULT NOW(),
                            updated_at TIMESTAMP DEFAULT NOW()
                        )
                    """))
                    db.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_gas_station_original ON gas_stations(original_name)"))
                    db.execute(text("CREATE INDEX IF NOT EXISTS ix_gas_stations_id ON gas_stations(id)"))
                    db.execute(text("CREATE INDEX IF NOT EXISTS ix_gas_stations_original_name ON gas_stations(original_name)"))
                    db.execute(text("CREATE INDEX IF NOT EXISTS ix_gas_stations_azs_number ON gas_stations(azs_number)"))
                    db.commit()
                    logger.info("Создана таблица gas_stations (fallback)")
                except Exception as e:
                    db.rollback()
                    logger.warning("Не удалось создать таблицу gas_stations (возможно, уже существует или нет прав)", extra={"error": str(e)})
            else:
                # Если таблица существует, проверяем наличие индекса для gas_station_id в transactions
                try:
                    indexes = [idx["name"] for idx in inspector.get_indexes("transactions")]
                    if "ix_transactions_gas_station_id" not in indexes:
                        db.execute(text("CREATE INDEX IF NOT EXISTS ix_transactions_gas_station_id ON transactions(gas_station_id)"))
                        db.commit()
                        logger.info("Создан индекс ix_transactions_gas_station_id (fallback)")
                except Exception as e:
                    db.rollback()
                    logger.warning("Не удалось создать индекс для gas_station_id (возможно, уже существует)", extra={"error": str(e)})
        except Exception as e:
            logger.warning("Ошибка при проверке таблицы gas_stations и колонки gas_station_id", extra={"error": str(e)})

        # Проверяем, существует ли провайдер "РП-газпром"
        provider = db.query(Provider).filter(Provider.code == "RP-GAZPROM").first()
        if not provider:
            provider = Provider(
                name="РП-газпром",
                code="RP-GAZPROM",
                is_active=True
            )
            db.add(provider)
            db.commit()
            logger.info("Создан провайдер по умолчанию", extra={"provider_code": "RP-GAZPROM", "provider_name": "РП-газпром"})
        else:
            logger.debug("Провайдер по умолчанию уже существует", extra={"provider_code": "RP-GAZPROM"})
        
        # Создаем администратора по умолчанию, если его нет
        admin_username = os.getenv("ADMIN_USERNAME", "admin")
        admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
        admin_email = os.getenv("ADMIN_EMAIL", "admin@example.com")
        
        admin_user = db.query(User).filter(User.username == admin_username).first()
        if not admin_user:
            hashed_password = get_password_hash(admin_password)
            admin_user = User(
                username=admin_username,
                email=admin_email,
                hashed_password=hashed_password,
                role="admin",
                is_active=True,
                is_superuser=True
            )
            db.add(admin_user)
            db.commit()
            logger.info(
                f"Создан администратор по умолчанию: {admin_username}",
                extra={"username": admin_username, "email": admin_email}
            )
        else:
            logger.debug("Администратор по умолчанию уже существует", extra={"username": admin_username})
        
        # Логируем завершение инициализации
        try:
            logging_service.log_system_event(
                db=db,
                level="INFO",
                message="Инициализация приложения завершена",
                module="main",
                function="lifespan",
                event_type="system",
                event_category="startup",
                extra_data={"status": "success"}
            )
        except Exception as e:
            logger.warning(f"Не удалось записать системный лог завершения инициализации: {e}", exc_info=True)
    except Exception as e:
        logger.error(f"Ошибка при инициализации: {e}", extra={"error": str(e)}, exc_info=True)
        db.rollback()
        
        # Логируем ошибку инициализации
        try:
            logging_service.log_system_event(
                db=db,
                level="ERROR",
                message=f"Ошибка при инициализации приложения: {str(e)}",
                module="main",
                function="lifespan",
                event_type="system",
                event_category="startup",
                extra_data={"error": str(e)},
                exception=e
            )
        except Exception as log_error:
            logger.error(f"Не удалось записать системный лог ошибки: {log_error}", exc_info=True)
    finally:
        db.close()
        logger.info("Инициализация завершена")
    
    yield  # Приложение работает
    
    # Shutdown
    try:
        from app.services.scheduler_service import SchedulerService
        scheduler = SchedulerService.get_instance()
        scheduler.shutdown()
        logger.info("Планировщик автоматической загрузки остановлен")
    except Exception as e:
        logger.error(f"Ошибка при остановке планировщика: {e}", extra={"error": str(e)}, exc_info=True)


app = FastAPI(
    title="GSM Converter API",
    description="""
## 🚗 Система управления транзакциями ГСМ

API для конвертации, хранения и анализа транзакций горюче-смазочных материалов.

### Основные возможности

* **Транзакции** - CRUD операции с транзакциями ГСМ
* **Топливные карты** - Управление топливными картами
* **Провайдеры** - Интеграция с поставщиками топлива
* **Шаблоны** - Настраиваемые шаблоны импорта данных
* **Отчёты** - Аналитика и статистика
* **Уведомления** - Push, Email, Telegram оповещения

### Аутентификация

API использует JWT токены. Получите токен через `/api/v1/auth/login` или `/api/v1/auth/login-secure`.

Для запросов используйте заголовок:
```
Authorization: Bearer <token>
```

Или httpOnly cookie (при использовании `/login-secure`).

### Rate Limiting

* Стандартные endpoints: **500 запросов/минуту**
* Auth endpoints: **50 запросов/минуту**

### Мониторинг

* `/metrics` - Prometheus метрики
* `/health` - Health checks
* `/health/live` - Liveness probe
* `/health/ready` - Readiness probe
* `/health/startup` - Startup probe
* `/docs` - Swagger UI (эта страница)
* `/redoc` - ReDoc документация

### Кэширование

API использует Redis для кэширования данных:
* Справочники (vehicles, fuel_cards, gas_stations, fuel_types, organizations) - TTL 5 минут
* Транзакции - TTL 2 минуты
* Статистика дашборда - TTL 1 минута
* Провайдеры - TTL 5 минут

Кэш автоматически инвалидируется при изменениях данных.

### Надежность

* **Retry механизм**: Автоматические повторы при временных ошибках (3 попытки)
* **Circuit Breaker**: Защита от каскадных сбоев при недоступности внешних API
* **Rate Limiting**: Защита от перегрузки (Redis-based)

### Коды ответов

* `200` - Успешный запрос
* `201` - Ресурс создан
* `400` - Ошибка валидации
* `401` - Не авторизован
* `403` - Доступ запрещен
* `404` - Ресурс не найден
* `422` - Ошибка валидации данных
* `429` - Превышен лимит запросов
* `500` - Внутренняя ошибка сервера
    """,
    version=settings.api_version,
    lifespan=lifespan,
    openapi_tags=[
        {"name": "Auth", "description": "Аутентификация и авторизация. JWT токены, httpOnly cookies."},
        {"name": "Users", "description": "Управление пользователями. CRUD операции, роли, права доступа."},
        {"name": "Transactions", "description": "Операции с транзакциями ГСМ. Загрузка, просмотр, фильтрация, экспорт."},
        {"name": "Vehicles", "description": "Управление транспортными средствами. Справочник ТС с валидацией."},
        {"name": "Fuel Cards", "description": "Управление топливными картами. Назначение, блокировка, слияние."},
        {"name": "Gas Stations", "description": "Справочник АЗС. Валидация, импорт, экспорт."},
        {"name": "Fuel Types", "description": "Типы топлива. Нормализация, статистика по транзакциям."},
        {"name": "Providers", "description": "Поставщики топлива. Интеграция с внешними API провайдеров."},
        {"name": "Templates", "description": "Шаблоны импорта данных. Настройка маппинга полей для Excel/Firebird/API."},
        {"name": "Dashboard", "description": "Статистика и аналитика. Сводные данные, графики, отчеты."},
        {"name": "Notifications", "description": "Уведомления. Push, Email, Telegram. Настройки пользователя."},
        {"name": "Organizations", "description": "Организации. Мультитенантность, назначение пользователей."},
        {"name": "Logs", "description": "Системные логи. Просмотр логов системы и действий пользователей."},
        {"name": "Backup", "description": "Резервное копирование. Создание и управление бэкапами БД."},
        {"name": "Health", "description": "Мониторинг состояния. Health checks для Kubernetes/Docker."},
        {"name": "System", "description": "Системные настройки. Email, Telegram, общие параметры."},
        {"name": "PPR API", "description": "Эмуляция API ППР для интеграции с 1С. Совместимость с оригинальным API."},
        {"name": "1C Integration", "description": "Интеграция с 1С ERP. Формат данных для модуля уатЗагрузкаПЦ."},
        {"name": "fuel-card-analysis", "description": "Анализ топливных карт. Выявление аномалий, статистика."},
    ],
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    contact={
        "name": "GSM Converter Support",
        "email": "support@example.com",
    },
    license_info={
        "name": "MIT",
        "url": "https://opensource.org/licenses/MIT",
    }
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Обработчик ошибок валидации Pydantic для детального логирования
    """
    errors = exc.errors()
    error_details = []
    for error in errors:
        error_details.append({
            "loc": error["loc"],
            "msg": error["msg"],
            "type": error["type"]
        })
    
    # Пытаемся получить тело запроса для логирования
    body = None
    try:
        if request.method in ["POST", "PUT", "PATCH"]:
            body_bytes = await request.body()
            body = body_bytes.decode('utf-8') if body_bytes else None
    except Exception:
        pass
    
    logger.error("Ошибка валидации запроса", extra={
        "path": request.url.path,
        "method": request.method,
        "errors": error_details,
        "body": body
    })
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": error_details
        }
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Глобальный обработчик исключений для логирования всех ошибок
    Скрывает внутренние детали ошибок от клиента для безопасности
    """
    from sqlalchemy.exc import SQLAlchemyError, DatabaseError
    from pydantic import ValidationError
    import httpx
    
    # Проверяем, не является ли это ошибкой валидации Pydantic
    # Если это ошибка валидации ответа, но путь указывает на успешную загрузку,
    # возвращаем успешный ответ с предупреждением
    if isinstance(exc, ValidationError):
        # Проверяем, не связана ли ошибка с загрузкой транзакций
        if "/load-from-api" in request.url.path or "/upload" in request.url.path:
            logger.warning(
                f"Ошибка валидации ответа при загрузке: {type(exc).__name__}: {str(exc)}",
                extra={
                    "path": request.url.path,
                    "method": request.method,
                    "error_type": type(exc).__name__,
                    "error_message": str(exc),
                    "validation_errors": exc.errors() if hasattr(exc, 'errors') else None
                },
                exc_info=True
            )
            # Возвращаем успешный ответ с предупреждением
            # Если транзакции были созданы, операция считается успешной
            return JSONResponse(
                status_code=200,
                content={
                    "message": "Загрузка завершена с предупреждениями. Проверьте логи для деталей.",
                    "transactions_created": 0,  # Не знаем точное количество в глобальном обработчике
                    "transactions_skipped": 0,
                    "file_name": "unknown",
                    "validation_warnings": [f"Ошибка валидации ответа: {str(exc)[:200]}"]
                }
            )
    
    # Логируем полную информацию об ошибке
    logger.error(
        f"Необработанное исключение: {type(exc).__name__}: {str(exc)}",
        extra={
            "path": request.url.path,
            "method": request.method,
            "error_type": type(exc).__name__,
            "error_message": str(exc)
        },
        exc_info=True
    )
    
    # Определяем безопасное сообщение для клиента
    # Не раскрываем внутренние детали БД или системных ошибок
    if isinstance(exc, (SQLAlchemyError, DatabaseError)):
        # Ошибки БД - не раскрываем детали
        client_message = "Ошибка базы данных. Обратитесь к администратору."
    elif isinstance(exc, ValueError):
        # Ошибки валидации - показываем сообщение (особенно важно для ошибок API)
        client_message = str(exc)
    elif isinstance(exc, PermissionError):
        # Ошибки доступа
        client_message = "Недостаточно прав для выполнения операции."
    elif isinstance(exc, (httpx.HTTPStatusError, httpx.RequestError)):
        # Ошибки HTTP запросов к внешним API - показываем детали
        error_msg = str(exc)
        if hasattr(exc, 'response') and hasattr(exc.response, 'status_code'):
            error_msg = f"Ошибка HTTP {exc.response.status_code}: {error_msg}"
        client_message = f"Ошибка подключения к API: {error_msg}"
    elif "API" in str(type(exc).__name__) or "api" in str(exc).lower() or "gpn" in str(exc).lower() or "gazprom" in str(exc).lower():
        # Ошибки, связанные с API - показываем детали
        client_message = str(exc)
    else:
        # Остальные ошибки - общее сообщение, но логируем детали
        client_message = "Внутренняя ошибка сервера. Обратитесь к администратору."
        # Для ошибок при загрузке через API показываем больше деталей
        if "/load-from-api" in request.url.path or "/upload" in request.url.path:
            # Показываем тип ошибки и часть сообщения для диагностики
            error_type = type(exc).__name__
            error_msg = str(exc)
            if error_msg:
                # Показываем первые 200 символов сообщения об ошибке
                client_message = f"Ошибка при загрузке данных: {error_type}: {error_msg[:200]}"
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": client_message
        }
    )


# Настройка CORS из конфигурации
allowed_origins = settings.get_allowed_origins_list()

# Добавляем middleware для логирования запросов
app.add_middleware(LoggingMiddleware)

# Настройка Rate Limiting
setup_rate_limiting(app)

# Настройка Prometheus метрик
setup_prometheus(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Подключаем роутеры
app.include_router(auth.router)
app.include_router(transactions.router)
app.include_router(vehicles.router)
app.include_router(fuel_cards.router)
app.include_router(gas_stations.router)
app.include_router(fuel_types.router)
app.include_router(providers.router)
app.include_router(templates.router)
app.include_router(dashboard.router)
app.include_router(upload_period_lock.router)
app.include_router(upload_events.router)
app.include_router(users.router)
app.include_router(organizations.router)
app.include_router(logs.router)
app.include_router(normalization_settings.router)
app.include_router(card_info_schedules.router)
app.include_router(fuel_card_analysis.router)
app.include_router(onec_integration.router)
app.include_router(ppr_api.router)
app.include_router(ppr_api.router_public_api)
# API ППР v1 отвечает по двум адресам, и оба нужны:
#   /public-api/v1/...      — путь настоящего ППР (online.petrolplus.ru), его
#                             подставляет 1С, когда в настройках указан только хост;
#   /api/public-api/v1/...  — путь из docs/api/ppr-api-v1-migration.md, по которому
#                             написан код 1С ЕРП; он же работает за любым прокси,
#                             который пробрасывает на backend только /api.
# Алиас скрыт из схемы, иначе в OpenAPI дублируются operationId.
app.include_router(ppr_api.router_public_api_v1)
app.include_router(ppr_api.router_public_api_v1, prefix="/api", include_in_schema=False)
app.include_router(notifications.router)
app.include_router(system_settings.router)
app.include_router(backup.router)
app.include_router(health.router)



@app.get("/")
async def root():
    """
    Корневой endpoint
    """
    return {"message": "GSM Converter API", "version": settings.api_version}


@app.get("/health")
async def health_check(db: Session = Depends(get_db)):
    """
    Проверка здоровья API с проверкой подключения к БД
    """
    try:
        # Проверяем подключение к БД
        db.execute(text("SELECT 1"))
        db_status = "healthy"
    except Exception as e:
        db_status = "unhealthy"
    
    return {
        "status": "healthy" if db_status == "healthy" else "degraded",
        "database": db_status,
        "version": settings.api_version
    }


@app.get("/api/v1/config")
async def get_config():
    """
    Получение настроек приложения (публичный endpoint)
    Возвращает информацию о том, включена ли аутентификация
    """
    try:
        return {
            "enable_auth": settings.enable_auth,
            "version": settings.api_version
        }
    except Exception as e:
        logger.error("Ошибка при получении конфигурации", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка получения конфигурации: {str(e)}")