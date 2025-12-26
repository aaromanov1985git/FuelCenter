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
    Шифрование чувствительных данных в настройках подключения
    
    Шифрует следующие поля:
    - password: пароли для Firebird, веб-сервисов
    - api_token: токены API провайдеров
    - api_key: ключи API провайдеров
    - api_secret: секреты API провайдеров
    - xml_api_key: ключи XML API
    - xml_api_signature: подписи XML API
    - xml_api_salt: соли для XML API
    - certificate: сертификаты для XML API
    
    Args:
        settings: Настройки подключения
        
    Returns:
        Dict: Настройки подключения с зашифрованными чувствительными данными
    """
    if not settings or not isinstance(settings, dict):
        return settings
    
    encrypted_settings = settings.copy()
    
    # Список чувствительных полей для шифрования
    sensitive_fields = [
        "password",
        "api_token",
        "api_key",
        "api_secret",
        "xml_api_key",
        "xml_api_signature",
        "xml_api_salt",
        "certificate",
        "secret",
        "token"
    ]
    
    # Шифруем все чувствительные поля
    for field in sensitive_fields:
        if field in encrypted_settings and encrypted_settings[field]:
            value = encrypted_settings[field]
            # Проверяем, не зашифровано ли уже значение
            if isinstance(value, str) and not value.startswith("encrypted:"):
                encrypted_settings[field] = encrypt_password(value)
    
    return encrypted_settings


def decrypt_connection_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    """
    Расшифровка чувствительных данных в настройках подключения
    
    Расшифровывает все зашифрованные чувствительные поля:
    - password, api_token, api_key, api_secret, xml_api_key, xml_api_signature, xml_api_salt, certificate, secret, token
    
    Args:
        settings: Настройки подключения (содержит зашифрованные чувствительные данные)
        
    Returns:
        Dict: Настройки подключения с расшифрованными чувствительными данными
    """
    if not settings or not isinstance(settings, dict):
        return settings
    
    decrypted_settings = settings.copy()
    
    # Список чувствительных полей для расшифровки
    sensitive_fields = [
        "password",
        "api_token",
        "api_key",
        "api_secret",
        "xml_api_key",
        "xml_api_signature",
        "xml_api_salt",
        "certificate",
        "secret",
        "token"
    ]
    
    # Расшифровываем все чувствительные поля
    for field in sensitive_fields:
        if field in decrypted_settings and decrypted_settings[field]:
            encrypted_value = decrypted_settings[field]
            if isinstance(encrypted_value, str):
                decrypted_settings[field] = decrypt_password(encrypted_value)
    
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
