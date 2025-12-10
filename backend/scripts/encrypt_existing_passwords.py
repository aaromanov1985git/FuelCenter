"""
Скрипт для шифрования существующих паролей в connection_settings
Запуск: python -m scripts.encrypt_existing_passwords
"""
import sys
import os
import json
from pathlib import Path

# Добавляем путь к приложению
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session
from app.database import get_db, engine
from app.models import ProviderTemplate
from app.utils import parse_template_json, serialize_template_json
from app.utils.encryption import encrypt_connection_settings
from app.logger import logger


def encrypt_all_passwords():
    """
    Шифрование всех незашифрованных паролей в connection_settings
    """
    db: Session = next(get_db())
    
    try:
        # Получаем все шаблоны с connection_settings
        templates = db.query(ProviderTemplate).filter(
            ProviderTemplate.connection_settings.isnot(None)
        ).all()
        
        encrypted_count = 0
        skipped_count = 0
        error_count = 0
        
        logger.info(f"Найдено шаблонов с connection_settings: {len(templates)}")
        
        for template in templates:
            try:
                # Парсим connection_settings (без расшифровки для проверки)
                connection_settings = parse_template_json(template.connection_settings, decrypt_passwords=False)
                
                if not connection_settings:
                    skipped_count += 1
                    continue
                
                # Проверяем, есть ли пароль и зашифрован ли он уже
                password = connection_settings.get("password")
                
                if not password:
                    skipped_count += 1
                    continue
                
                # Если пароль уже зашифрован, пропускаем
                if password.startswith("encrypted:"):
                    skipped_count += 1
                    logger.debug(f"Пароль уже зашифрован для шаблона ID={template.id}")
                    continue
                
                # Шифруем пароль
                logger.info(f"Шифрование пароля для шаблона ID={template.id}, name={template.name}")
                encrypted_settings = encrypt_connection_settings(connection_settings)
                
                # Сохраняем обратно в БД
                template.connection_settings = serialize_template_json(encrypted_settings, encrypt_passwords=False)
                db.commit()
                
                encrypted_count += 1
                logger.info(f"✓ Пароль зашифрован для шаблона ID={template.id}")
                
            except Exception as e:
                error_count += 1
                logger.error(
                    f"Ошибка при шифровании пароля для шаблона ID={template.id}",
                    extra={"error": str(e), "template_id": template.id},
                    exc_info=True
                )
                db.rollback()
        
        logger.info(
            "Миграция паролей завершена",
            extra={
                "encrypted": encrypted_count,
                "skipped": skipped_count,
                "errors": error_count,
                "total": len(templates)
            }
        )
        
        print(f"\n{'='*60}")
        print("Результаты миграции паролей:")
        print(f"  Зашифровано: {encrypted_count}")
        print(f"  Пропущено: {skipped_count}")
        print(f"  Ошибок: {error_count}")
        print(f"  Всего обработано: {len(templates)}")
        print(f"{'='*60}\n")
        
    except Exception as e:
        logger.error("Критическая ошибка при миграции паролей", extra={"error": str(e)}, exc_info=True)
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("Запуск миграции паролей...")
    print("Этот скрипт зашифрует все незашифрованные пароли в connection_settings")
    print()
    
    try:
        encrypt_all_passwords()
        print("✓ Миграция успешно завершена")
    except Exception as e:
        print(f"✗ Ошибка при выполнении миграции: {e}")
        sys.exit(1)

