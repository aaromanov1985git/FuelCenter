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
from app.middleware.cookie_auth import (
    set_access_token_cookie,
    delete_auth_cookies,
    ACCESS_TOKEN_COOKIE_NAME
)
from app.config import get_settings
from app.services.logging_service import logging_service

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
    
    # Логируем создание пользователя
    try:
        logging_service.log_user_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action_type="create",
            action_description=f"Создан новый пользователь: {new_user.username}",
            action_category="auth",
            entity_type="User",
            entity_id=new_user.id,
            status="success"
        )
    except Exception as e:
        logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    # Возвращаем UserResponse с organization_ids
    user_dict = {
        "id": new_user.id,
        "username": new_user.username,
        "email": new_user.email,
        "role": new_user.role,
        "is_active": new_user.is_active,
        "is_superuser": new_user.is_superuser,
        "created_at": new_user.created_at,
        "last_login": new_user.last_login,
        "organization_ids": [org.id for org in new_user.organizations]
    }
    return UserResponse(**user_dict)


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
        # Логируем неудачную попытку входа
        try:
            client_ip = request.client.host if request.client else None
            user_agent = request.headers.get("user-agent")
            logging_service.log_user_action(
                db=db,
                user_id=None,
                username=form_data.username,
                action_type="login",
                action_description=f"Неудачная попытка входа: {form_data.username}",
                action_category="auth",
                ip_address=client_ip,
                user_agent=user_agent,
                request_method=request.method,
                request_path=request.url.path,
                status="failed",
                error_message="Неверное имя пользователя или пароль"
            )
        except Exception as e:
            logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
        
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
    
    # Логируем успешный вход
    try:
        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        logging_service.log_user_action(
            db=db,
            user_id=user.id,
            username=user.username,
            action_type="login",
            action_description=f"Успешный вход пользователя: {user.username}",
            action_category="auth",
            ip_address=client_ip,
            user_agent=user_agent,
            request_method=request.method,
            request_path=request.url.path,
            status="success"
        )
    except Exception as e:
        logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    # Создаем уведомление о входе
    try:
        from app.services.notification_service import NotificationService
        notification_service = NotificationService(db)
        
        # Определяем IP адрес для сообщения
        ip_info = f"IP: {client_ip}" if client_ip else ""
        location_info = f"С {client_ip}" if client_ip else "С нового устройства"
        
        notification_service.send_notification(
            user_id=user.id,
            title="Успешный вход в систему",
            message=f"Вы успешно вошли в систему.\n{location_info}",
            category="system",
            notification_type="success",
            channels=["in_app"],
            force=True  # Обязательное уведомление о входе
        )
        logger.debug(f"Уведомление о входе создано для пользователя {user.id}")
    except Exception as e:
        # Не прерываем процесс входа, если уведомление не удалось создать
        logger.warning(f"Не удалось создать уведомление о входе для пользователя {user.id}: {e}", exc_info=True)
    
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
        # Логируем неудачную попытку входа
        try:
            client_ip = request.client.host if request.client else None
            user_agent = request.headers.get("user-agent")
            logging_service.log_user_action(
                db=db,
                user_id=None,
                username=login_data.username,
                action_type="login",
                action_description=f"Неудачная попытка входа: {login_data.username}",
                action_category="auth",
                ip_address=client_ip,
                user_agent=user_agent,
                request_method=request.method,
                request_path=request.url.path,
                status="failed",
                error_message="Неверное имя пользователя или пароль"
            )
        except Exception as e:
            logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
        
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
    
    # Логируем успешный вход
    try:
        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        logging_service.log_user_action(
            db=db,
            user_id=user.id,
            username=user.username,
            action_type="login",
            action_description=f"Успешный вход пользователя: {user.username}",
            action_category="auth",
            ip_address=client_ip,
            user_agent=user_agent,
            request_method=request.method,
            request_path=request.url.path,
            status="success"
        )
    except Exception as e:
        logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    # Создаем уведомление о входе
    try:
        from app.services.notification_service import NotificationService
        notification_service = NotificationService(db)
        
        # Определяем IP адрес для сообщения
        ip_info = f"IP: {client_ip}" if client_ip else ""
        location_info = f"С {client_ip}" if client_ip else "С нового устройства"
        
        notification_service.send_notification(
            user_id=user.id,
            title="Успешный вход в систему",
            message=f"Вы успешно вошли в систему.\n{location_info}",
            category="system",
            notification_type="success",
            channels=["in_app"],
            force=True  # Обязательное уведомление о входе
        )
        logger.debug(f"Уведомление о входе создано для пользователя {user.id}")
    except Exception as e:
        # Не прерываем процесс входа, если уведомление не удалось создать
        logger.warning(f"Не удалось создать уведомление о входе для пользователя {user.id}: {e}", exc_info=True)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }


@router.post("/login-secure", response_model=Token)
@limiter.limit(settings.rate_limit_strict)
async def login_secure(
    request: Request,
    response: Response,
    login_data: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    Безопасный вход в систему с httpOnly cookies
    
    Токен устанавливается в httpOnly cookie, защищенную от XSS атак.
    Рекомендуется для веб-браузеров.
    
    Args:
        login_data: Данные для входа (username, password)
        db: Сессия базы данных
        response: FastAPI Response для установки cookie
        
    Returns:
        Информация о токене (без самого токена, так как он в cookie)
        
    Raises:
        HTTPException: Если неверные учетные данные
    """
    logger.info(f"Получен запрос на безопасный вход: username={login_data.username}")
    
    try:
        user = authenticate_user(db, login_data.username, login_data.password)
    except Exception as e:
        logger.error(f"Ошибка при аутентификации пользователя {login_data.username}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Внутренняя ошибка сервера"
        )
    
    if not user:
        logger.warning(
            f"Неудачная попытка входа: {login_data.username}",
            extra={"username": login_data.username}
        )
        # Логируем неудачную попытку входа
        try:
            client_ip = request.client.host if request.client else None
            user_agent = request.headers.get("user-agent")
            logging_service.log_user_action(
                db=db,
                user_id=None,
                username=login_data.username,
                action_type="login",
                action_description=f"Неудачная попытка входа (secure): {login_data.username}",
                action_category="auth",
                ip_address=client_ip,
                user_agent=user_agent,
                request_method=request.method,
                request_path=request.url.path,
                status="failed",
                error_message="Неверное имя пользователя или пароль"
            )
        except Exception as e:
            logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
        
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
    
    # Устанавливаем токен в httpOnly cookie
    set_access_token_cookie(response, access_token, ACCESS_TOKEN_EXPIRE_MINUTES)
    
    logger.info(
        f"Успешный безопасный вход пользователя: {user.username}",
        extra={"user_id": user.id, "role": user.role}
    )
    
    # Логируем успешный вход
    try:
        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        logging_service.log_user_action(
            db=db,
            user_id=user.id,
            username=user.username,
            action_type="login",
            action_description=f"Успешный вход пользователя (secure): {user.username}",
            action_category="auth",
            ip_address=client_ip,
            user_agent=user_agent,
            request_method=request.method,
            request_path=request.url.path,
            status="success"
        )
    except Exception as e:
        logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    # Создаем уведомление о входе
    try:
        from app.services.notification_service import NotificationService
        notification_service = NotificationService(db)
        
        # Определяем IP адрес для сообщения
        ip_info = f"IP: {client_ip}" if client_ip else ""
        location_info = f"С {client_ip}" if client_ip else "С нового устройства"
        
        notification_service.send_notification(
            user_id=user.id,
            title="Успешный вход в систему",
            message=f"Вы успешно вошли в систему.\n{location_info}",
            category="system",
            notification_type="success",
            channels=["in_app"],
            force=True  # Обязательное уведомление о входе
        )
        logger.debug(f"Уведомление о входе создано для пользователя {user.id}")
    except Exception as e:
        # Не прерываем процесс входа, если уведомление не удалось создать
        logger.warning(f"Не удалось создать уведомление о входе для пользователя {user.id}: {e}", exc_info=True)
    
    # Возвращаем токен и в cookie (для браузеров) и в body (для fallback/мобильных)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Выход пользователя из системы
    Удаляет auth cookies если они были установлены
    """
    try:
        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        
        # Логируем выход пользователя
        logging_service.log_user_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action_type="logout",
            action_description=f"Выход пользователя: {current_user.username}",
            action_category="auth",
            ip_address=client_ip,
            user_agent=user_agent,
            request_method=request.method,
            request_path=request.url.path,
            status="success"
        )
    except Exception as e:
        logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
    
    # Удаляем auth cookies
    delete_auth_cookies(response)
    
    return {"message": "Выход выполнен успешно"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Получение информации о текущем пользователе
    
    Args:
        current_user: Текущий пользователь
        db: Сессия базы данных (для загрузки организаций)
        
    Returns:
        Информация о пользователе с organization_ids
    """
    # Обновляем связи организаций
    db.refresh(current_user, ['organizations'])
    
    # Возвращаем UserResponse с organization_ids
    user_dict = {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role,
        "is_active": current_user.is_active,
        "is_superuser": current_user.is_superuser,
        "created_at": current_user.created_at,
        "last_login": current_user.last_login,
        "organization_ids": [org.id for org in current_user.organizations]
    }
    return UserResponse(**user_dict)

