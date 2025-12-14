"""
Скрипт для проверки наличия таблиц логирования
"""
import sys
import os

# Добавляем путь к backend в sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import inspect, text
from app.database import engine
from app.logger import logger

def check_logging_tables():
    """Проверяет наличие таблиц логирования"""
    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        
        has_system_logs = 'system_logs' in tables
        has_user_action_logs = 'user_action_logs' in tables
        
        print("=" * 60)
        print("Проверка таблиц логирования")
        print("=" * 60)
        print(f"Таблица system_logs: {'[OK] Найдена' if has_system_logs else '[ERROR] Не найдена'}")
        print(f"Таблица user_action_logs: {'[OK] Найдена' if has_user_action_logs else '[ERROR] Не найдена'}")
        print("=" * 60)
        
        if not has_system_logs or not has_user_action_logs:
            print("\n[WARNING] ВНИМАНИЕ: Таблицы логирования не найдены!")
            print("Для создания таблиц выполните:")
            print("  cd backend")
            print("  alembic upgrade head")
            print("\nИли таблицы будут созданы автоматически при следующем запуске приложения")
            return False
        
        # Проверяем количество записей
        with engine.connect() as conn:
            if has_system_logs:
                result = conn.execute(text("SELECT COUNT(*) FROM system_logs"))
                count = result.scalar()
                print(f"\nЗаписей в system_logs: {count}")
            
            if has_user_action_logs:
                result = conn.execute(text("SELECT COUNT(*) FROM user_action_logs"))
                count = result.scalar()
                print(f"Записей в user_action_logs: {count}")
        
        print("\n[OK] Все таблицы логирования на месте!")
        return True
        
    except Exception as e:
        print(f"\n[ERROR] Ошибка при проверке: {e}")
        logger.error(f"Ошибка при проверке таблиц логирования: {e}", exc_info=True)
        return False

if __name__ == "__main__":
    check_logging_tables()
