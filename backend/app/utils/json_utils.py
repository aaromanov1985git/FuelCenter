"""
Утилиты для работы с JSON
"""
import json
from typing import Any, Dict, Optional
from app.utils.encryption import encrypt_connection_settings, decrypt_connection_settings


def parse_template_json(json_data: Optional[Any], decrypt_passwords: bool = True) -> Optional[Dict]:
    """
    Парсинг JSON данных из шаблона провайдера
    
    Обрабатывает как строки JSON, так и уже распарсенные словари
    Автоматически расшифровывает пароли в connection_settings
    
    Args:
        json_data: JSON данные (строка или словарь)
        decrypt_passwords: Расшифровывать ли пароли (по умолчанию True)
    
    Returns:
        Optional[Dict]: Распарсенный словарь или None
    """
    if json_data is None:
        return None
    
    parsed_data = None
    
    if isinstance(json_data, dict):
        parsed_data = json_data
    elif isinstance(json_data, str):
        try:
            parsed_data = json.loads(json_data)
        except json.JSONDecodeError:
            return None
    else:
        return None
    
    # Расшифровываем пароль в connection_settings, если нужно
    if decrypt_passwords and parsed_data and isinstance(parsed_data, dict):
        # Проверяем, что это connection_settings (содержит поля для Firebird или API)
        if "password" in parsed_data or "host" in parsed_data or "database" in parsed_data:
            parsed_data = decrypt_connection_settings(parsed_data)
    
    return parsed_data


def serialize_template_json(data: Optional[Dict], encrypt_passwords: bool = True) -> Optional[str]:
    """
    Сериализация данных в JSON строку для сохранения в БД
    Автоматически шифрует пароли в connection_settings
    
    Args:
        data: Словарь для сериализации
        encrypt_passwords: Шифровать ли пароли (по умолчанию True)
    
    Returns:
        Optional[str]: JSON строка или None
    """
    if data is None:
        return None
    
    if isinstance(data, str):
        return data
    
    # Шифруем пароль в connection_settings, если нужно
    data_to_serialize = data
    if encrypt_passwords and isinstance(data, dict):
        # Проверяем, что это connection_settings (содержит поля для Firebird или API)
        if "password" in data or "host" in data or "database" in data:
            data_to_serialize = encrypt_connection_settings(data)
    
    return json.dumps(data_to_serialize, ensure_ascii=False)

