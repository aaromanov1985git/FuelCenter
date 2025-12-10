"""
Роутер для аутентификации и авторизации
"""
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import (
    UserCreate,
    UserResponse,
    Token,
    LoginRequest
)
from app.auth import (
    authenticate_user,
    get_password_hash,
    create_access_token,
    get_user_by_username,
    get_user_by_email,
    get_current_active_user,
    require_admin,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
from app.logger import logger
from app.middleware.rate_limit import limiter
from app.config import get_settings

settings = get_settings()

router = APIRouter(prefix="/api/v1/auth", tags=["Аутентификация"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Регистрация нового пользователя (только для администраторов)
    
    Args:
        user_data: Данные нового пользователя
        db: Сессия базы данных
        current_user: Текущий пользователь (должен быть администратором)
        
    Returns:
        Созданный пользователь
        
    Raises:
        HTTPException: Если пользователь с таким username или email уже существует
    """
    # Проверяем, что пользователь с таким username не существует
    if get_user_by_username(db, user_data.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким именем уже существует"
        )
    
    # Проверяем, что пользователь с таким email не существует
    if get_user_by_email(db, user_data.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким email уже существует"
        )
    
    # Создаем нового пользователя
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
        role=user_data.role or "user",
        is_active=True
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    logger.info(
        f"Создан новый пользователь: {new_user.username}",
        extra={"user_id": new_user.id, "role": new_user.role, "created_by": current_user.id}
    )
    
    return new_user


@router.post("/login", response_model=Token)
@limiter.limit(settings.rate_limit_strict)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Вход в систему (OAuth2 password flow)
    
    Args:
        form_data: Данные формы (username, password)
        db: Сессия базы данных
        
    Returns:
        JWT токен доступа
        
    Raises:
        HTTPException: Если неверные учетные данные
    """
    user = authenticate_user(db, form_data.username, form_data.password)
    
    if not user:
        logger.warning(
            f"Неудачная попытка входа: {form_data.username}",
            extra={"username": form_data.username}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверное имя пользователя или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "user_id": user.id, "role": user.role},
        expires_delta=access_token_expires
    )
    
    logger.info(
        f"Успешный вход пользователя: {user.username}",
        extra={"user_id": user.id, "role": user.role}
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }


@router.post("/login-json", response_model=Token)
@limiter.limit(settings.rate_limit_strict)
async def login_json(
    request: Request,
    login_data: LoginRequest,
    db: Session = Depends(get_db),
    response: Response = None
):
    """
    Вход в систему (JSON формат)
    
    Args:
        login_data: Данные для входа (username, password)
        db: Сессия базы данных
        
    Returns:
        JWT токен доступа
        
    Raises:
        HTTPException: Если неверные учетные данные
    """
    logger.info(f"Получен запрос на вход: username={login_data.username}")
    logger.debug(f"Данные запроса: username={login_data.username}, password_length={len(login_data.password) if login_data.password else 0}")
    try:
        logger.debug(f"Начинаем аутентификацию пользователя {login_data.username}")
        user = authenticate_user(db, login_data.username, login_data.password)
        logger.debug(f"Результат аутентификации: user={user is not None}")
    except Exception as e:
        logger.error(f"Ошибка при аутентификации пользователя {login_data.username}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Внутренняя ошибка сервера: {str(e)}"
        )
    
    if not user:
        logger.warning(
            f"Неудачная попытка входа: {login_data.username}",
            extra={"username": login_data.username}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверное имя пользователя или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "user_id": user.id, "role": user.role},
        expires_delta=access_token_expires
    )
    
    logger.info(
        f"Успешный вход пользователя: {user.username}",
        extra={"user_id": user.id, "role": user.role}
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user)
):
    """
    Получение информации о текущем пользователе
    
    Args:
        current_user: Текущий пользователь
        
    Returns:
        Информация о пользователе
    """
    return current_user

