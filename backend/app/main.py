"""
Главный модуль FastAPI приложения
"""
from fastapi import FastAPI, Depends, Request, status
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
from app.config import get_settings

settings = get_settings()

# Импортируем роутеры
from app.routers import (
    transactions,
    vehicles,
    fuel_cards,
    gas_stations,
    providers,
    templates,
    dashboard,
    upload_period_lock,
    upload_events,
    auth,
    users
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

app = FastAPI(
    title="GSM Converter API",
    description="API для конвертации и хранения транзакций ГСМ",
    version=settings.api_version
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
    """
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
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": f"Внутренняя ошибка сервера: {str(exc)}"
        }
    )


# Настройка CORS из конфигурации
allowed_origins = settings.get_allowed_origins_list()

# Добавляем middleware для логирования запросов
app.add_middleware(LoggingMiddleware)

# Настройка Rate Limiting
setup_rate_limiting(app)

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
app.include_router(providers.router)
app.include_router(templates.router)
app.include_router(dashboard.router)
app.include_router(upload_period_lock.router)
app.include_router(upload_events.router)
app.include_router(users.router)


@app.on_event("startup")
async def startup_event():
    """
    Инициализация при старте приложения
    Создание начальных данных (провайдер "РП-газпром")
    """
    from sqlalchemy.orm import Session
    from sqlalchemy import text
    logger.info("Запуск приложения: инициализация начальных данных")
    
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
    except Exception as e:
        logger.error(f"Ошибка при инициализации: {e}", extra={"error": str(e)}, exc_info=True)
        db.rollback()
    finally:
        db.close()
        logger.info("Инициализация завершена")


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