"""
Скрипт резервного копирования базы данных PostgreSQL
Поддерживает локальные бэкапы и ротацию старых копий
"""
import os
import subprocess
import gzip
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
import logging

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class DatabaseBackup:
    """Класс для управления бэкапами PostgreSQL"""
    
    def __init__(
        self,
        db_host: str = "db",
        db_port: int = 5432,
        db_name: str = "gsm_db",
        db_user: str = "gsm_user",
        db_password: str = "gsm_password",
        backup_dir: str = "/app/backups",
        retention_days: int = 7,
        compress: bool = True
    ):
        self.db_host = db_host
        self.db_port = db_port
        self.db_name = db_name
        self.db_user = db_user
        self.db_password = db_password
        self.backup_dir = Path(backup_dir)
        self.retention_days = retention_days
        self.compress = compress
        
        # Создаём директорию для бэкапов
        self.backup_dir.mkdir(parents=True, exist_ok=True)
    
    def create_backup(self) -> Optional[Path]:
        """
        Создаёт бэкап базы данных
        
        Returns:
            Path к созданному файлу бэкапа или None при ошибке
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"gsm_backup_{timestamp}.sql"
        backup_path = self.backup_dir / backup_filename
        
        logger.info(f"Начало создания бэкапа: {backup_path}")
        
        # Установка переменной окружения для пароля
        env = os.environ.copy()
        env["PGPASSWORD"] = self.db_password
        
        try:
            # Выполнение pg_dump
            result = subprocess.run(
                [
                    "pg_dump",
                    "-h", self.db_host,
                    "-p", str(self.db_port),
                    "-U", self.db_user,
                    "-d", self.db_name,
                    "-F", "p",  # plain text format
                    "--no-owner",
                    "--no-privileges",
                    "-f", str(backup_path)
                ],
                env=env,
                capture_output=True,
                text=True,
                timeout=600  # 10 минут таймаут
            )
            
            if result.returncode != 0:
                logger.error(f"Ошибка pg_dump: {result.stderr}")
                return None
            
            logger.info(f"Бэкап создан: {backup_path}")
            
            # Сжатие бэкапа
            if self.compress:
                compressed_path = self._compress_backup(backup_path)
                if compressed_path:
                    backup_path.unlink()  # Удаляем несжатый файл
                    return compressed_path
            
            return backup_path
            
        except subprocess.TimeoutExpired:
            logger.error("Таймаут при создании бэкапа")
            return None
        except FileNotFoundError:
            logger.error("pg_dump не найден. Убедитесь, что PostgreSQL клиент установлен")
            return None
        except Exception as e:
            logger.error(f"Ошибка при создании бэкапа: {e}")
            return None
    
    def _compress_backup(self, backup_path: Path) -> Optional[Path]:
        """Сжимает файл бэкапа с помощью gzip"""
        compressed_path = backup_path.with_suffix('.sql.gz')
        
        try:
            with open(backup_path, 'rb') as f_in:
                with gzip.open(compressed_path, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
            
            logger.info(f"Бэкап сжат: {compressed_path}")
            return compressed_path
        except Exception as e:
            logger.error(f"Ошибка при сжатии бэкапа: {e}")
            return None
    
    def cleanup_old_backups(self) -> int:
        """
        Удаляет бэкапы старше retention_days дней
        
        Returns:
            Количество удалённых файлов
        """
        cutoff_date = datetime.now() - timedelta(days=self.retention_days)
        deleted_count = 0
        
        for backup_file in self.backup_dir.glob("gsm_backup_*.sql*"):
            try:
                # Извлекаем дату из имени файла
                filename = backup_file.stem.replace('.sql', '')
                date_str = filename.replace('gsm_backup_', '')[:8]
                file_date = datetime.strptime(date_str, "%Y%m%d")
                
                if file_date < cutoff_date:
                    backup_file.unlink()
                    logger.info(f"Удалён старый бэкап: {backup_file}")
                    deleted_count += 1
            except (ValueError, IndexError):
                logger.warning(f"Не удалось определить дату файла: {backup_file}")
                continue
        
        if deleted_count > 0:
            logger.info(f"Удалено старых бэкапов: {deleted_count}")
        
        return deleted_count
    
    def list_backups(self) -> list:
        """Возвращает список всех бэкапов с информацией"""
        backups = []
        
        for backup_file in sorted(self.backup_dir.glob("gsm_backup_*.sql*"), reverse=True):
            stat = backup_file.stat()
            backups.append({
                "filename": backup_file.name,
                "path": str(backup_file),
                "size_mb": round(stat.st_size / (1024 * 1024), 2),
                "created": datetime.fromtimestamp(stat.st_mtime).isoformat()
            })
        
        return backups
    
    def restore_backup(self, backup_path: str) -> bool:
        """
        Восстанавливает базу данных из бэкапа
        
        Args:
            backup_path: Путь к файлу бэкапа
            
        Returns:
            True если восстановление успешно
        """
        backup_file = Path(backup_path)
        
        if not backup_file.exists():
            logger.error(f"Файл бэкапа не найден: {backup_path}")
            return False
        
        logger.info(f"Начало восстановления из: {backup_path}")
        
        # Если файл сжат, распаковываем
        if backup_file.suffix == '.gz':
            temp_file = backup_file.with_suffix('')
            with gzip.open(backup_file, 'rb') as f_in:
                with open(temp_file, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
            restore_file = temp_file
        else:
            restore_file = backup_file
        
        env = os.environ.copy()
        env["PGPASSWORD"] = self.db_password
        
        try:
            result = subprocess.run(
                [
                    "psql",
                    "-h", self.db_host,
                    "-p", str(self.db_port),
                    "-U", self.db_user,
                    "-d", self.db_name,
                    "-f", str(restore_file)
                ],
                env=env,
                capture_output=True,
                text=True,
                timeout=1800  # 30 минут таймаут
            )
            
            # Удаляем временный распакованный файл
            if backup_file.suffix == '.gz' and restore_file.exists():
                restore_file.unlink()
            
            if result.returncode != 0:
                logger.error(f"Ошибка psql: {result.stderr}")
                return False
            
            logger.info("Восстановление завершено успешно")
            return True
            
        except Exception as e:
            logger.error(f"Ошибка при восстановлении: {e}")
            return False


def run_backup():
    """Запуск бэкапа с параметрами из переменных окружения"""
    backup = DatabaseBackup(
        db_host=os.getenv("POSTGRES_HOST", "db"),
        db_port=int(os.getenv("POSTGRES_PORT", "5432")),
        db_name=os.getenv("POSTGRES_DB", "gsm_db"),
        db_user=os.getenv("POSTGRES_USER", "gsm_user"),
        db_password=os.getenv("POSTGRES_PASSWORD", "gsm_password"),
        backup_dir=os.getenv("BACKUP_DIR", "/app/backups"),
        retention_days=int(os.getenv("BACKUP_RETENTION_DAYS", "7")),
        compress=os.getenv("BACKUP_COMPRESS", "true").lower() == "true"
    )
    
    # Создаём бэкап
    backup_path = backup.create_backup()
    
    if backup_path:
        logger.info(f"Бэкап успешно создан: {backup_path}")
        
        # Очищаем старые бэкапы
        backup.cleanup_old_backups()
        
        # Показываем список бэкапов
        backups = backup.list_backups()
        logger.info(f"Всего бэкапов: {len(backups)}")
        for b in backups[:5]:  # Показываем последние 5
            logger.info(f"  - {b['filename']} ({b['size_mb']} MB)")
    else:
        logger.error("Ошибка создания бэкапа")
        exit(1)


if __name__ == "__main__":
    run_backup()

