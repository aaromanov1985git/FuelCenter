"""
Модуль для работы с базой данных
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import get_settings
from app.logger import logger

settings = get_settings()

# URL подключения к БД из конфигурации
# Приоритет: переменная окружения DATABASE_URL > значение из .env > значение по умолчанию
env_database_url = os.getenv("DATABASE_URL")
if env_database_url:
    DATABASE_URL = env_database_url
    logger.info("Используется DATABASE_URL из переменной окружения")
else:
    DATABASE_URL = settings.database_url
    logger.info("Используется DATABASE_URL из настроек (config.py или .env)")

# Логируем используемый URL (без пароля для безопасности)
# Извлекаем только часть после @ для безопасности
if "@" in DATABASE_URL:
    safe_url = DATABASE_URL.split("@")[-1]
else:
    safe_url = DATABASE_URL
logger.info(f"Подключение к БД: postgresql://***@{safe_url}")

# Проверяем, что имя базы данных правильное
# Извлекаем имя базы данных из URL (после последнего /)
try:
    # Формат: postgresql://user:password@host:port/database
    # Ищем последний / после @ (чтобы не перепутать с / в пути пользователя)
    if "@" in DATABASE_URL:
        db_name_part = DATABASE_URL.split("@")[-1]
        if "/" in db_name_part:
            db_name = db_name_part.split("/")[-1].split("?")[0]  # Убираем query параметры если есть
        else:
            db_name = None
    else:
        # Если нет @, ищем последний /
        if "/" in DATABASE_URL:
            db_name = DATABASE_URL.split("/")[-1].split("?")[0]
        else:
            db_name = None
    
    # Проверяем, что имя базы данных не равно имени пользователя
    if db_name and db_name == "gsm_user":
        logger.error(f"ОШИБКА: В DATABASE_URL указано неправильное имя базы данных 'gsm_user' вместо 'gsm_db'!")
        logger.error(f"Полный DATABASE_URL (без пароля): {DATABASE_URL.split('@')[0].split(':')[0]}://***@{DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else DATABASE_URL}")
        raise ValueError("Неправильное имя базы данных в DATABASE_URL. Должно быть 'gsm_db', а не 'gsm_user'")
    
    if db_name:
        logger.info(f"Имя базы данных в URL: {db_name}")
except Exception as e:
    logger.warning(f"Не удалось извлечь имя базы данных из URL для проверки: {e}")

# Финальная проверка DATABASE_URL перед созданием engine
if not DATABASE_URL or not DATABASE_URL.strip():
    raise ValueError("DATABASE_URL не может быть пустым")

# Убеждаемся, что в URL указано правильное имя базы данных
if "/gsm_db" not in DATABASE_URL and DATABASE_URL.endswith("/gsm_db") == False:
    # Проверяем, что имя базы данных не равно имени пользователя
    if DATABASE_URL.endswith("/gsm_user") or "/gsm_user" in DATABASE_URL.split("@")[-1].split("/")[-1]:
        logger.error(f"КРИТИЧЕСКАЯ ОШИБКА: DATABASE_URL содержит неправильное имя базы данных!")
        logger.error(f"DATABASE_URL (без пароля): {DATABASE_URL.split('@')[0].split(':')[0]}://***@{DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else DATABASE_URL}")
        raise ValueError("DATABASE_URL содержит неправильное имя базы данных 'gsm_user' вместо 'gsm_db'")

# Создаем engine с настройками пула соединений
# pool_pre_ping=True проверяет соединение перед использованием
# connect_args для явного указания параметров подключения
engine = create_engine(
    DATABASE_URL, 
    echo=False,
    pool_pre_ping=True,  # Проверяет соединение перед использованием
    pool_recycle=3600,   # Переиспользует соединения каждый час
    connect_args={
        "options": "-c search_path=public -c client_encoding=UTF8"  # Явно указываем схему и кодировку
    }
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """
    Получение сессии БД для dependency injection
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

