# Аутентификация и авторизация

## Обзор

Система аутентификации и авторизации реализована с использованием JWT токенов и OAuth2 password flow.

## Возможности

- ✅ JWT токены для аутентификации
- ✅ OAuth2 password flow
- ✅ Роли пользователей (admin, user, viewer)
- ✅ Хеширование паролей (bcrypt)
- ✅ Опциональная защита endpoints (можно включить/выключить)

## Настройка

### 1. Включение аутентификации

По умолчанию аутентификация **выключена** для обратной совместимости. Чтобы включить:

```bash
# В .env файле или переменных окружения
ENABLE_AUTH=true
SECRET_KEY=your-very-secret-key-change-in-production
```

### 2. Создание первого администратора

При первом запуске автоматически создается администратор:

- **Username:** `admin` (или из переменной `ADMIN_USERNAME`)
- **Password:** `admin123` (или из переменной `ADMIN_PASSWORD`)
- **Email:** `admin@example.com` (или из переменной `ADMIN_EMAIL`)

**⚠️ ВАЖНО:** Смените пароль администратора после первого входа!

### 3. Настройка через переменные окружения

```bash
# Включение аутентификации
ENABLE_AUTH=true

# Секретный ключ для JWT (обязательно изменить в production!)
SECRET_KEY=your-very-secret-key-change-in-production

# Настройки администратора по умолчанию
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_EMAIL=admin@example.com

# Время жизни токена (в минутах)
JWT_EXPIRE_MINUTES=30
```

## API Endpoints

### Регистрация (только для администраторов)

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "username": "newuser",
  "email": "user@example.com",
  "password": "securepassword123",
  "role": "user"
}
```

### Вход (OAuth2 password flow)

```http
POST /api/v1/auth/login
Content-Type: application/x-www-form-urlencoded

username=admin&password=admin123
```

### Вход (JSON формат)

```http
POST /api/v1/auth/login-json
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

**Ответ:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 1800
}
```

### Получение информации о текущем пользователе

```http
GET /api/v1/auth/me
Authorization: Bearer <access_token>
```

## Использование токена

После получения токена, добавляйте его в заголовок `Authorization`:

```http
Authorization: Bearer <access_token>
```

## Роли пользователей

- **admin** - Полный доступ ко всем операциям
- **user** - Стандартный пользователь
- **viewer** - Только просмотр (в разработке)

## Защита endpoints

Для защиты endpoints используйте зависимости из `app.auth`:

```python
from app.auth import get_current_active_user, require_admin
from app.models import User

@router.get("/protected")
async def protected_endpoint(
    current_user: User = Depends(get_current_active_user)
):
    """Требует аутентификации"""
    return {"message": f"Hello, {current_user.username}!"}

@router.delete("/admin-only")
async def admin_endpoint(
    current_user: User = Depends(require_admin)
):
    """Требует роль admin"""
    return {"message": "Admin only"}
```

## Миграции базы данных

Таблица `users` создается автоматически при применении миграций:

```bash
cd backend
alembic upgrade head
```

Или миграции применяются автоматически при старте приложения (если `AUTO_MIGRATE=true`).

## Безопасность

1. **Секретный ключ:** Обязательно измените `SECRET_KEY` в production!
2. **Пароли:** Хранятся в хешированном виде (bcrypt)
3. **Токены:** JWT токены имеют срок действия (по умолчанию 30 минут)
4. **HTTPS:** Используйте HTTPS в production для защиты токенов

## Примеры использования

### Python (requests)

```python
import requests

# Вход
response = requests.post(
    "http://localhost:8000/api/v1/auth/login-json",
    json={"username": "admin", "password": "admin123"}
)
token = response.json()["access_token"]

# Защищенный запрос
headers = {"Authorization": f"Bearer {token}"}
response = requests.get(
    "http://localhost:8000/api/v1/auth/me",
    headers=headers
)
print(response.json())
```

### JavaScript (fetch)

```javascript
// Вход
const loginResponse = await fetch('http://localhost:8000/api/v1/auth/login-json', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' })
});
const { access_token } = await loginResponse.json();

// Защищенный запрос
const response = await fetch('http://localhost:8000/api/v1/auth/me', {
  headers: { 'Authorization': `Bearer ${access_token}` }
});
const user = await response.json();
```

## Отключение аутентификации

Если нужно временно отключить аутентификацию:

```bash
ENABLE_AUTH=false
```

Все endpoints будут доступны без токена.

