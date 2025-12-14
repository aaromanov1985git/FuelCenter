"""
Роутер для управления пользователями
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import (
    get_user_by_email,
    get_user_by_id,
    get_user_by_username,
    get_password_hash,
    require_admin,
)
from app.database import get_db
from app.logger import logger
from app.models import User
from app.schemas import UserCreate, UserListResponse, UserResponse, UserUpdate
from app.services.logging_service import logging_service

router = APIRouter(prefix="/api/v1/users", tags=["Пользователи"])


@router.get("", response_model=UserListResponse)
async def list_users(
    search: Optional[str] = Query(None, description="Поиск по имени или email"),
    skip: int = Query(0, ge=0, description="Смещение для пагинации"),
    limit: int = Query(100, ge=1, le=500, description="Количество записей"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Получение списка пользователей (только для администраторов)
    """
    query = db.query(User)

    if search:
        term = f"%{search.lower()}%"
        query = query.filter(
            (User.username.ilike(term)) |
            (User.email.ilike(term))
        )

    total = query.count()
    users = (
        query
        .order_by(User.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    # Преобразуем пользователей в UserResponse с organization_ids
    user_responses = []
    for user in users:
        user_dict = {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "is_active": user.is_active,
            "is_superuser": user.is_superuser,
            "created_at": user.created_at,
            "last_login": user.last_login,
            "organization_ids": [org.id for org in user.organizations]
        }
        user_responses.append(UserResponse(**user_dict))

    return {"total": total, "items": user_responses}


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Создание нового пользователя (только для администраторов)
    """
    if get_user_by_username(db, user_data.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким именем уже существует"
        )

    if get_user_by_email(db, user_data.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким email уже существует"
        )

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
        "Создан новый пользователь",
        extra={"user_id": new_user.id, "created_by": current_user.id, "role": new_user.role}
    )

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


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Обновление пользователя (роль, email, пароль, статус активности)
    """
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    # Запрещаем деактивировать или удалять самого себя
    if current_user.id == user.id and user_data.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя деактивировать собственную учетную запись"
        )

    if user_data.email and user_data.email != user.email:
        existing_email = get_user_by_email(db, user_data.email)
        if existing_email and existing_email.id != user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Пользователь с таким email уже существует"
            )
        user.email = user_data.email

    if user_data.role:
        user.role = user_data.role

    if user_data.is_active is not None:
        user.is_active = user_data.is_active

    if user_data.password:
        user.hashed_password = get_password_hash(user_data.password)

    db.commit()
    db.refresh(user)

    logger.info(
        "Обновлен пользователь",
        extra={"user_id": user.id, "updated_by": current_user.id, "changes": user_data.model_dump(exclude_none=True)}
    )
    
    # Логируем действие пользователя
    try:
        logging_service.log_user_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action_type="update",
            action_description=f"Обновлен пользователь: {user.username}",
            action_category="user",
            entity_type="User",
            entity_id=user.id,
            status="success",
            extra_data={"changes": user_data.model_dump(exclude_none=True)}
        )
    except Exception as e:
        logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)

    # Возвращаем UserResponse с organization_ids
    user_dict = {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
        "is_superuser": user.is_superuser,
        "created_at": user.created_at,
        "last_login": user.last_login,
        "organization_ids": [org.id for org in user.organizations]
    }
    return UserResponse(**user_dict)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Удаление пользователя (только для администраторов)
    """
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя удалить собственную учетную запись"
        )

    username_before_delete = user.username
    
    db.delete(user)
    db.commit()

    logger.info(
        "Пользователь удален",
        extra={"user_id": user_id, "deleted_by": current_user.id}
    )
    
    # Логируем действие пользователя
    try:
        logging_service.log_user_action(
            db=db,
            user_id=current_user.id,
            username=current_user.username,
            action_type="delete",
            action_description=f"Удален пользователь: {username_before_delete}",
            action_category="user",
            entity_type="User",
            entity_id=user_id,
            status="success"
        )
    except Exception as e:
        logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)

    return None

