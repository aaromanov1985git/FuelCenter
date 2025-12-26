"""
Тесты для модуля шифрования чувствительных данных
"""
import pytest
from app.utils.encryption import (
    encrypt_connection_settings,
    decrypt_connection_settings,
    encrypt_password,
    decrypt_password
)


class TestPasswordEncryption:
    """Тесты для шифрования паролей"""
    
    def test_encrypt_password(self):
        """Тест шифрования пароля"""
        password = "test_password_123"
        encrypted = encrypt_password(password)
        
        assert encrypted != password
        assert encrypted.startswith("encrypted:")
        assert len(encrypted) > len(password)
    
    def test_decrypt_password(self):
        """Тест расшифровки пароля"""
        password = "test_password_123"
        encrypted = encrypt_password(password)
        decrypted = decrypt_password(encrypted)
        
        assert decrypted == password
    
    def test_encrypt_empty_password(self):
        """Тест шифрования пустого пароля"""
        encrypted = encrypt_password("")
        assert encrypted == ""
    
    def test_decrypt_unencrypted_password(self):
        """Тест расшифровки незашифрованного пароля (обратная совместимость)"""
        password = "plain_password"
        decrypted = decrypt_password(password)
        assert decrypted == password


class TestConnectionSettingsEncryption:
    """Тесты для шифрования настроек подключения"""
    
    def test_encrypt_connection_settings_password(self):
        """Тест шифрования пароля в настройках подключения"""
        settings = {
            "host": "localhost",
            "database": "test_db",
            "user": "test_user",
            "password": "test_password"
        }
        encrypted = encrypt_connection_settings(settings)
        
        assert encrypted["host"] == settings["host"]
        assert encrypted["database"] == settings["database"]
        assert encrypted["user"] == settings["user"]
        assert encrypted["password"] != settings["password"]
        assert encrypted["password"].startswith("encrypted:")
    
    def test_encrypt_connection_settings_api_token(self):
        """Тест шифрования API токена в настройках подключения"""
        settings = {
            "base_url": "https://api.example.com",
            "api_token": "secret_token_123"
        }
        encrypted = encrypt_connection_settings(settings)
        
        assert encrypted["base_url"] == settings["base_url"]
        assert encrypted["api_token"] != settings["api_token"]
        assert encrypted["api_token"].startswith("encrypted:")
    
    def test_encrypt_connection_settings_api_key(self):
        """Тест шифрования API ключа в настройках подключения"""
        settings = {
            "base_url": "https://api.example.com",
            "api_key": "secret_key_456"
        }
        encrypted = encrypt_connection_settings(settings)
        
        assert encrypted["base_url"] == settings["base_url"]
        assert encrypted["api_key"] != settings["api_key"]
        assert encrypted["api_key"].startswith("encrypted:")
    
    def test_encrypt_connection_settings_multiple_sensitive_fields(self):
        """Тест шифрования нескольких чувствительных полей"""
        settings = {
            "host": "localhost",
            "password": "test_password",
            "api_token": "test_token",
            "api_key": "test_key",
            "xml_api_key": "test_xml_key"
        }
        encrypted = encrypt_connection_settings(settings)
        
        assert encrypted["host"] == settings["host"]
        assert encrypted["password"].startswith("encrypted:")
        assert encrypted["api_token"].startswith("encrypted:")
        assert encrypted["api_key"].startswith("encrypted:")
        assert encrypted["xml_api_key"].startswith("encrypted:")
    
    def test_encrypt_connection_settings_already_encrypted(self):
        """Тест что уже зашифрованные значения не шифруются повторно"""
        settings = {
            "password": "encrypted:already_encrypted_value"
        }
        encrypted = encrypt_connection_settings(settings)
        
        assert encrypted["password"] == settings["password"]
    
    def test_decrypt_connection_settings(self):
        """Тест расшифровки настроек подключения"""
        original_settings = {
            "host": "localhost",
            "password": "test_password",
            "api_token": "test_token"
        }
        encrypted = encrypt_connection_settings(original_settings)
        decrypted = decrypt_connection_settings(encrypted)
        
        assert decrypted["host"] == original_settings["host"]
        assert decrypted["password"] == original_settings["password"]
        assert decrypted["api_token"] == original_settings["api_token"]
    
    def test_decrypt_connection_settings_empty(self):
        """Тест расшифровки пустых настроек"""
        assert decrypt_connection_settings(None) is None
        assert decrypt_connection_settings({}) == {}
    
    def test_encrypt_decrypt_roundtrip(self):
        """Тест полного цикла шифрование-расшифровка"""
        original_settings = {
            "host": "localhost",
            "database": "test_db",
            "user": "test_user",
            "password": "test_password",
            "api_token": "test_token",
            "api_key": "test_key",
            "xml_api_key": "test_xml_key",
            "xml_api_signature": "test_signature",
            "certificate": "test_certificate"
        }
        
        encrypted = encrypt_connection_settings(original_settings)
        decrypted = decrypt_connection_settings(encrypted)
        
        assert decrypted == original_settings

