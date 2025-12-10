"""
Модуль аутентификации и авторизации
"""
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request
from starlette.requests import Request as StarletteRequest
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.config import get_settings
from app.logger import logger
from typing import Optional

settings = get_settings()

# Контекст для хеширования паролей
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 схема для получения токена из заголовка Authorization
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login-json")

# Настройки JWT
SECRET_KEY = settings.secret_key
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Проверка пароля
    
    Args:
        plain_password: Обычный пароль
        hashed_password: Хешированный пароль
        
    Returns:
        True если пароль верный, иначе False
    """
    try:
        # Используем прямой вызов bcrypt из-за проблем совместимости с passlib
        import bcrypt
        result = bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
        logger.debug(f"Проверка пароля через bcrypt: {result}")
        return result
    except Exception as e:
        logger.warning(f"Ошибка при проверке пароля через bcrypt: {e}", exc_info=True)
        # Fallback на passlib если bcrypt не работает
        try:
            result = pwd_context.verify(plain_password, hashed_password)
            logger.debug(f"Проверка пароля через passlib: {result}")
            return result
        except Exception as e2:
            logger.error(f"Ошибка при проверке пароля через passlib: {e2}", exc_info=True)
            return False


def get_password_hash(password: str) -> str:
    """
    Хеширование пароля
    
    Args:
        password: Обычный пароль
        
    Returns:
        Хешированный пароль
    """
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Создание JWT токена
    
    Args:
        data: Данные для включения в токен
        expires_delta: Время жизни токена
        
    Returns:
        JWT токен
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    return encoded_jwt


def get_user_by_username(db: Session, username: str) -> Optional[User]:
    """
    Получение пользователя по имени пользователя
    
    Args:
        db: Сессия базы данных
        username: Имя пользователя
        
    Returns:
        Пользователь или None
    """
    return db.query(User).filter(User.username == username).first()


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """
    Получение пользователя по email
    
    Args:
        db: Сессия базы данных
        email: Email адрес
        
    Returns:
        Пользователь или None
    """
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    """
    Получение пользователя по ID
    
    Args:
        db: Сессия базы данных
        user_id: ID пользователя
        
    Returns:
        Пользователь или None
    """
    return db.query(User).filter(User.id == user_id).first()


def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    """
    Аутентификация пользователя
    
    Args:
        db: Сессия базы данных
        username: Имя пользователя
        password: Пароль
        
    Returns:
        Пользователь если аутентификация успешна, иначе None
    """
    try:
        user = get_user_by_username(db, username)
        logger.debug(f"Пользователь найден: {user is not None}, username: {username}")
        
        if not user:
            logger.debug(f"Пользователь {username} не найден")
            return None
        
        logger.debug(f"Проверка пароля для пользователя {username}")
        password_valid = verify_password(password, user.hashed_password)
        logger.debug(f"Результат проверки пароля: {password_valid}")
        
        if not password_valid:
            logger.warning(f"Неверный пароль для пользователя {username}")
            return None
        
        if not user.is_active:
            logger.warning(f"Пользователь {username} неактивен")
            return None
        
        # Обновляем дату последнего входа
        user.last_login = datetime.utcnow()
        db.commit()
        logger.info(f"Успешная аутентификация пользователя {username}")
        
        return user
    except Exception as e:
        logger.error(f"Ошибка при аутентификации пользователя {username}: {e}", exc_info=True)
        raise


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    Получение текущего пользователя из JWT токена
    
    Args:
        token: JWT токен
        db: Сессия базы данных
        
    Returns:
        Текущий пользователь
        
    Raises:
        HTTPException: Если токен невалидный или пользователь не найден
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось подтвердить учетные данные",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = get_user_by_username(db, username=username)
    
    if user is None:
        raise credentials_exception
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Пользователь неактивен"
        )
    
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Получение активного пользователя
    
    Args:
        current_user: Текущий пользователь
        
    Returns:
        Активный пользователь
        
    Raises:
        HTTPException: Если пользователь неактивен
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Пользователь неактивен"
        )
    return current_user


def require_role(required_role: str):
    """
    Декоратор для проверки роли пользователя
    
    Args:
        required_role: Требуемая роль
        
    Returns:
        Зависимость для проверки роли
    """
    async def role_checker(current_user: User = Depends(get_current_active_user)) -> User:
        if current_user.role != required_role and not current_user.is_superuser:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Требуется роль: {required_role}"
            )
        return current_user
    
    return role_checker


def require_admin(current_user: User = Depends(get_current_active_user)) -> User:
    """
    Проверка, что пользователь является администратором
    
    Args:
        current_user: Текущий пользователь
        
    Returns:
        Пользователь-администратор
        
    Raises:
        HTTPException: Если пользователь не администратор
    """
    if current_user.role != "admin" and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Требуются права администратора"
        )
    return current_user


async def _get_optional_token() -> Optional[str]:
    """
    Внутренняя функция для получения токена из заголовка Authorization, если аутентификация включена
    """
    if not settings.enable_auth:
        return None
    
    # Используем oauth2_scheme только если аутентификация включена
    # Но мы не можем использовать условный Depends, поэтому используем другой подход
    # Создаем функцию, которая всегда пытается получить токен, но возвращает None при ошибке
    try:
        # Используем Request для получения токена напрямую
        from fastapi import Request
        from starlette.requests import Request as StarletteRequest
        
        # Но мы не можем получить Request здесь без Depends
        # Поэтому возвращаем None и обрабатываем это в optional_auth_with_token
        return None
    except:
        return None


# Создаем две версии функции в зависимости от настроек
if settings.enable_auth:
    async def _get_token_from_header(token: str = Depends(oauth2_scheme)) -> Optional[str]:
        return token
else:
    async def _get_token_from_header() -> Optional[str]:
        return None


async def optional_auth_with_token(
    token: Optional[str] = Depends(_get_token_from_header),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """
    Опциональная аутентификация с токеном (возвращает пользователя, если аутентификация включена и токен валидный)
    
    Args:
        token: JWT токен (опционально)
        db: Сессия базы данных
        
    Returns:
        Пользователь или None, если аутентификация выключена
    """
    if not settings.enable_auth:
        return None
    
    if token is None:
        return None
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        
        if username is None:
            return None
        
        user = get_user_by_username(db, username=username)
        
        if user is None or not user.is_active:
            return None
        
        return user
    except JWTError:
        return None


def require_auth_if_enabled(
    current_user: Optional[User] = Depends(optional_auth_with_token)
) -> Optional[User]:
    """
    Требует аутентификацию, если она включена в настройках
    
    Args:
        current_user: Текущий пользователь (опционально)
        
    Returns:
        Пользователь или None
        
    Raises:
        HTTPException: Если аутентификация включена, но пользователь не авторизован
    """
    if settings.enable_auth:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Требуется аутентификация",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return current_user
    return None
