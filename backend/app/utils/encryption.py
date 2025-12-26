"""
Модуль для шифрования чувствительных данных
Использует Fernet (симметричное шифрование на базе AES-128 в режиме CBC)
"""
import base64
import os
from typing import Optional, Dict, Any

# Опциональный импорт cryptography
try:
    from cryptography.fernet import Fernet
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    CRYPTOGRAPHY_AVAILABLE = True
except ImportError as e:
    CRYPTOGRAPHY_AVAILABLE = False
    Fernet = None
    hashes = None
    PBKDF2HMAC = None
    _import_error = e

from app.config import get_settings
from app.logger import logger

settings = get_settings()

# Проверяем доступность cryptography при импорте модуля
if not CRYPTOGRAPHY_AVAILABLE:
    logger.error(
        "Модуль cryptography не установлен. Установите его командой: pip install cryptography==41.0.7",
        extra={"import_error": str(_import_error) if '_import_error' in globals() else "Unknown"}
    )
    raise ImportError(
        "Модуль cryptography не установлен. "
        "Это критическая зависимость для работы приложения (шифрование паролей, JWT). "
        "Установите его командой: pip install cryptography==41.0.7"
    ) from (_import_error if '_import_error' in globals() else None)


def get_encryption_key() -> bytes:
    """
    Получение ключа шифрования из настроек или генерация нового
    
    Returns:
        bytes: Ключ шифрования Fernet
    """
    # Получаем секретный ключ из настроек (используем ENCRYPTION_KEY или SECRET_KEY для JWT)
    secret_key = os.getenv("ENCRYPTION_KEY") or settings.encryption_key or settings.secret_key
    
    # Генерируем ключ Fernet из секретного ключа
    # Используем PBKDF2 для получения ключа фиксированной длины из произвольной строки
    # ВАЖНО: Используем уникальную соль на основе секретного ключа для безопасности
    # Это предотвращает rainbow table атаки, сохраняя консистентность ключа
    # Соль генерируется детерминированно из секретного ключа, но не является фиксированной константой
    salt_source = (secret_key + "gsm_converter_salt_2025").encode()
    # Используем SHA256 для генерации соли фиксированной длины из секретного ключа
    salt = hashes.Hash(hashes.SHA256())
    salt.update(salt_source)
    salt_bytes = salt.finalize()[:16]  # Берем первые 16 байт для соли
    
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt_bytes,
        iterations=100000,
    )
    
    key = base64.urlsafe_b64encode(kdf.derive(secret_key.encode()))
    return key


# Инициализация Fernet с ключом
_fernet: Optional[Fernet] = None


def get_fernet() -> Fernet:
    """
    Получение экземпляра Fernet для шифрования
    
    Returns:
        Fernet: Экземпляр Fernet
    """
    global _fernet
    if _fernet is None:
        key = get_encryption_key()
        _fernet = Fernet(key)
    return _fernet


def encrypt_password(password: str) -> str:
    """
    Шифрование пароля
    
    Args:
        password: Обычный пароль
        
    Returns:
        str: Зашифрованный пароль (base64 строка с префиксом "encrypted:")
    """
    if not password:
        return password
    
    try:
        fernet = get_fernet()
        encrypted = fernet.encrypt(password.encode())
        # Возвращаем зашифрованную строку с префиксом для идентификации
        return f"encrypted:{encrypted.decode()}"
    except Exception as e:
        logger.error("Ошибка шифрования пароля", extra={"error": str(e)}, exc_info=True)
        raise ValueError(f"Не удалось зашифровать пароль: {str(e)}") from e


def decrypt_password(encrypted_password: str) -> str:
    """
    Расшифровка пароля
    
    Args:
        encrypted_password: Зашифрованный пароль (может быть с префиксом "encrypted:" или без)
        
    Returns:
        str: Расшифрованный пароль
    """
    if not encrypted_password:
        return encrypted_password
    
    # Если пароль уже не зашифрован, возвращаем как есть (обратная совместимость)
    if not encrypted_password.startswith("encrypted:"):
        return encrypted_password
    
    try:
        # Удаляем префикс "encrypted:"
        encrypted = encrypted_password.replace("encrypted:", "", 1)
        
        fernet = get_fernet()
        decrypted = fernet.decrypt(encrypted.encode())
        return decrypted.decode()
    except Exception as e:
        logger.error("Ошибка расшифровки пароля", extra={"error": str(e)}, exc_info=True)
        # Если не удалось расшифровать, возвращаем как есть (для обратной совместимости)
        # В production это должно быть ошибкой
        logger.warning("Не удалось расшифровать пароль, используется как есть", extra={"error": str(e)})
        return encrypted_password


def encrypt_connection_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    """
    Шифрование пароля в настройках подключения
    
    Args:
        settings: Настройки подключения (содержит поле "password")
        
    Returns:
        Dict: Настройки подключения с зашифрованным паролем
    """
    if not settings or not isinstance(settings, dict):
        return settings
    
    encrypted_settings = settings.copy()
    
    # Шифруем пароль, если он есть
    if "password" in encrypted_settings and encrypted_settings["password"]:
        password = encrypted_settings["password"]
        # Проверяем, не зашифрован ли уже пароль
        if not password.startswith("encrypted:"):
            encrypted_settings["password"] = encrypt_password(password)
    
    return encrypted_settings


def decrypt_connection_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    """
    Расшифровка пароля в настройках подключения
    
    Args:
        settings: Настройки подключения (содержит поле "password" в зашифрованном виде)
        
    Returns:
        Dict: Настройки подключения с расшифрованным паролем
    """
    if not settings or not isinstance(settings, dict):
        return settings
    
    decrypted_settings = settings.copy()
    
    # Расшифровываем пароль, если он есть
    if "password" in decrypted_settings and decrypted_settings["password"]:
        encrypted_password = decrypted_settings["password"]
        decrypted_settings["password"] = decrypt_password(encrypted_password)
    
    return decrypted_settings


# Общие функции для шифрования любых значений
def encrypt_value(value: str) -> str:
    """
    Шифрование произвольного значения
    
    Args:
        value: Значение для шифрования
        
    Returns:
        str: Зашифрованное значение (base64 строка с префиксом "encrypted:")
    """
    return encrypt_password(value)


def decrypt_value(encrypted_value: str) -> str:
    """
    Расшифровка произвольного значения
    
    Args:
        encrypted_value: Зашифрованное значение
        
    Returns:
        str: Расшифрованное значение
    """
    return decrypt_password(encrypted_value)
