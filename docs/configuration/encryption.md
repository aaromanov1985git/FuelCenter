# Шифрование чувствительных данных

## Обзор

Система автоматически шифрует чувствительные данные (пароли Firebird, API ключи) перед сохранением в базу данных.

## Что шифруется

- **Пароли Firebird** в `connection_settings` шаблонов провайдеров
- **API ключи и токены** в `connection_settings` (если поддерживается в будущем)

## Как это работает

1. **При сохранении:**
   - Пароли автоматически шифруются через `serialize_template_json()`
   - Зашифрованные пароли сохраняются с префиксом `encrypted:`

2. **При чтении:**
   - Пароли автоматически расшифровываются через `parse_template_json()`
   - Расшифровка происходит только для использования в коде (подключение к БД)

3. **В API ответах:**
   - Пароли **никогда** не возвращаются в ответах API
   - При возврате `connection_settings` поле `password` удаляется

## Настройка

### Генерация ключа шифрования

По умолчанию используется `SECRET_KEY` для шифрования. Для большей безопасности можно использовать отдельный ключ:

```bash
# В .env файле
ENCRYPTION_KEY=your-very-secret-encryption-key-change-in-production
```

Если `ENCRYPTION_KEY` не указан, используется `SECRET_KEY`.

### Генерация безопасного ключа

**Windows (PowerShell):**
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | % {[char]$_})
```

**Linux/Mac:**
```bash
openssl rand -hex 32
```

**Python:**
```python
import secrets
print(secrets.token_urlsafe(32))
```

## Миграция существующих паролей

Если у вас уже есть незашифрованные пароли в БД, выполните миграцию:

```bash
cd backend
python -m scripts.encrypt_existing_passwords
```

Скрипт:
- Найдет все шаблоны с `connection_settings`
- Зашифрует незашифрованные пароли
- Пропустит уже зашифрованные пароли
- Покажет статистику выполнения

## Использование в коде

### Автоматическое шифрование

Используйте стандартные функции - шифрование происходит автоматически:

```python
from app.utils import serialize_template_json, parse_template_json

# При сохранении - автоматически шифруется
connection_settings = {
    "host": "localhost",
    "database": "/path/to/db.fdb",
    "user": "SYSDBA",
    "password": "masterkey"  # Будет автоматически зашифрован
}
json_string = serialize_template_json(connection_settings)

# При чтении - автоматически расшифровывается
settings = parse_template_json(json_string)
# settings["password"] теперь содержит расшифрованный пароль
```

### Ручное управление

Если нужно управлять шифрованием вручную:

```python
from app.utils.encryption import (
    encrypt_password,
    decrypt_password,
    encrypt_connection_settings,
    decrypt_connection_settings
)

# Шифрование отдельного пароля
encrypted = encrypt_password("my-password")
# Результат: "encrypted:gAAAAABh..."

# Расшифровка
decrypted = decrypt_password(encrypted)
# Результат: "my-password"

# Шифрование/расшифровка connection_settings
encrypted_settings = encrypt_connection_settings(settings)
decrypted_settings = decrypt_connection_settings(encrypted_settings)
```

## Безопасность

⚠️ **Важные замечания:**

1. **Ключ шифрования:**
   - Никогда не коммитьте ключ в git
   - Используйте разные ключи для разных окружений
   - Храните ключ в переменных окружения или секретных хранилищах

2. **Обратная совместимость:**
   - Система автоматически определяет зашифрованные пароли (префикс `encrypted:`)
   - Незашифрованные пароли работают, но будут зашифрованы при следующем сохранении

3. **Пароли в API:**
   - Пароли **никогда** не возвращаются в ответах API
   - Используются только для подключения к внешним системам

4. **Логирование:**
   - Пароли не попадают в логи (фильтруются перед логированием)

## Алгоритм шифрования

- **Алгоритм:** Fernet (AES-128 в режиме CBC)
- **Библиотека:** `cryptography.fernet`
- **Производная ключа:** PBKDF2-HMAC-SHA256 (100,000 итераций)
- **Префикс:** `encrypted:` для идентификации зашифрованных данных

## Примеры

### Сохранение шаблона с зашифрованным паролем

```python
from app.utils import serialize_template_json

# Создание шаблона
template = ProviderTemplate(
    name="Firebird Template",
    connection_type="firebird",
    connection_settings=serialize_template_json({
        "host": "localhost",
        "database": "/path/to/db.fdb",
        "user": "SYSDBA",
        "password": "masterkey"  # Автоматически зашифруется
    })
)
```

### Использование расшифрованного пароля

```python
from app.utils import parse_template_json

# Чтение шаблона
template = db.query(ProviderTemplate).first()
settings = parse_template_json(template.connection_settings)

# settings["password"] содержит расшифрованный пароль
# Используйте его для подключения к Firebird
firebird_service.connect(settings)
```

## Устранение неполадок

### Ошибка расшифровки

Если пароль не удалось расшифровать:
1. Проверьте, что `ENCRYPTION_KEY` или `SECRET_KEY` тот же, что использовался при шифровании
2. Проверьте формат пароля (должен начинаться с `encrypted:`)
3. Проверьте логи на наличие ошибок

### Миграция не работает

Если миграция не находит пароли для шифрования:
1. Проверьте, что шаблоны существуют в БД
2. Проверьте, что `connection_settings` содержит поле `password`
3. Запустите скрипт с повышенным уровнем логирования

## Дополнительная информация

- См. `backend/app/utils/encryption.py` для реализации
- См. `backend/scripts/encrypt_existing_passwords.py` для скрипта миграции
- См. `backend/ENV_SETUP.md` для настройки переменных окружения

