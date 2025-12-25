#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Скрипт для применения миграции уведомлений
"""
import sys
import os
from pathlib import Path

# Добавляем путь к приложению
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

try:
    from alembic.config import Config
    from alembic import command
    
    # Получаем путь к alembic.ini
    alembic_ini_path = backend_path / "alembic.ini"
    
    if not alembic_ini_path.exists():
        print(f"Ошибка: файл {alembic_ini_path} не найден")
        sys.exit(1)
    
    print(f"Применение миграций из {alembic_ini_path}...")
    
    # Создаем конфигурацию Alembic
    cfg = Config(str(alembic_ini_path))
    
    # Применяем все миграции до head
    command.upgrade(cfg, "head")
    
    print("✓ Миграции успешно применены!")
    
except ImportError as e:
    print(f"Ошибка импорта: {e}")
    print("Убедитесь, что alembic установлен: pip install alembic")
    sys.exit(1)
except Exception as e:
    print(f"Ошибка при применении миграций: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

