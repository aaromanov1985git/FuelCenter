"""
Роутер для просмотра логов системы и действий пользователей
"""
from typing import Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc

from app.auth import require_admin, get_current_user
from app.services.logging_service import logging_service
from app.database import get_db
from app.logger import logger
from app.models import SystemLog, UserActionLog, User
from app.schemas import (
    SystemLogListResponse,
    SystemLogResponse,
    UserActionLogListResponse,
    UserActionLogResponse
)

router = APIRouter(prefix="/api/v1/logs", tags=["Логи"])


@router.get("/test", response_model=SystemLogListResponse)
async def test_logs(
    db: Session = Depends(get_db)
):
    """
    Тестовый endpoint для проверки работы логирования (без авторизации)
    """
    logger.info("Тестовый запрос логов (без авторизации)")
    
    query = db.query(SystemLog)
    total = query.count()
    logs = query.order_by(desc(SystemLog.created_at)).limit(10).all()
    
    logger.info(f"Тест: найдено {total} логов, возвращаем {len(logs)}")
    
    return SystemLogListResponse(total=total, items=logs)


@router.get("/system", response_model=SystemLogListResponse)
async def list_system_logs(
    level: Optional[str] = Query(None, description="Фильтр по уровню (DEBUG, INFO, WARNING, ERROR, CRITICAL)"),
    event_type: Optional[str] = Query(None, description="Фильтр по типу события"),
    event_category: Optional[str] = Query(None, description="Фильтр по категории события"),
    search: Optional[str] = Query(None, description="Поиск по сообщению"),
    date_from: Optional[datetime] = Query(None, description="Начальная дата (ISO format)"),
    date_to: Optional[datetime] = Query(None, description="Конечная дата (ISO format)"),
    skip: int = Query(0, ge=0, description="Смещение для пагинации"),
    limit: int = Query(100, ge=1, le=1000, description="Количество записей"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Получение списка системных логов (только для администраторов)
    """
    if current_user:
        logger.info(f"Запрос системных логов от пользователя {current_user.username} (ID: {current_user.id})")
    else:
        logger.info("Запрос системных логов (аутентификация отключена)")
    
    query = db.query(SystemLog)
    
    # Фильтры
    if level:
        query = query.filter(SystemLog.level == level.upper())
    
    if event_type:
        query = query.filter(SystemLog.event_type == event_type)
    
    if event_category:
        query = query.filter(SystemLog.event_category == event_category)
    
    if search:
        term = f"%{search.lower()}%"
        query = query.filter(SystemLog.message.ilike(term))
    
    if date_from:
        query = query.filter(SystemLog.created_at >= date_from)
    
    if date_to:
        query = query.filter(SystemLog.created_at <= date_to)
    
    # Если не указаны даты, показываем все логи (без ограничения по дате)
    # Можно раскомментировать для ограничения:
    # if not date_from and not date_to:
    #     date_from_default = datetime.utcnow() - timedelta(days=30)
    #     query = query.filter(SystemLog.created_at >= date_from_default)
    
    total = query.count()
    logger.info(f"Найдено системных логов: {total} (skip={skip}, limit={limit})")
    
    logs = (
        query
        .order_by(desc(SystemLog.created_at))
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    logger.info(f"Возвращаем {len(logs)} системных логов")
    
    # Проверяем, что данные сериализуются правильно
    try:
        response = SystemLogListResponse(total=total, items=logs)
        logger.debug(f"Ответ сформирован: total={response.total}, items_count={len(response.items)}")
        return response
    except Exception as e:
        logger.error(f"Ошибка при формировании ответа: {e}", exc_info=True)
        # Возвращаем пустой ответ в случае ошибки
        return SystemLogListResponse(total=0, items=[])


@router.get("/system/{log_id}", response_model=SystemLogResponse)
async def get_system_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Получение детальной информации о системном логе (только для администраторов)
    """
    log = db.query(SystemLog).filter(SystemLog.id == log_id).first()
    
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Лог не найден"
        )
    
    return log


@router.get("/user-actions", response_model=UserActionLogListResponse)
async def list_user_action_logs(
    user_id: Optional[int] = Query(None, description="Фильтр по ID пользователя"),
    username: Optional[str] = Query(None, description="Фильтр по имени пользователя"),
    action_type: Optional[str] = Query(None, description="Фильтр по типу действия"),
    action_category: Optional[str] = Query(None, description="Фильтр по категории действия"),
    entity_type: Optional[str] = Query(None, description="Фильтр по типу сущности"),
    status_filter: Optional[str] = Query(None, alias="status", description="Фильтр по статусу"),
    search: Optional[str] = Query(None, description="Поиск по описанию действия"),
    date_from: Optional[datetime] = Query(None, description="Начальная дата (ISO format)"),
    date_to: Optional[datetime] = Query(None, description="Конечная дата (ISO format)"),
    skip: int = Query(0, ge=0, description="Смещение для пагинации"),
    limit: int = Query(100, ge=1, le=1000, description="Количество записей"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Получение списка логов действий пользователей (только для администраторов)
    """
    if current_user:
        logger.info(f"Запрос логов действий пользователей от администратора {current_user.username} (ID: {current_user.id})")
    else:
        logger.info("Запрос логов действий пользователей (аутентификация отключена)")
    
    query = db.query(UserActionLog)
    
    # Фильтры
    if user_id:
        query = query.filter(UserActionLog.user_id == user_id)
    
    if username:
        query = query.filter(UserActionLog.username.ilike(f"%{username}%"))
    
    if action_type:
        query = query.filter(UserActionLog.action_type == action_type)
    
    if action_category:
        query = query.filter(UserActionLog.action_category == action_category)
    
    if entity_type:
        query = query.filter(UserActionLog.entity_type == entity_type)
    
    if status_filter:
        query = query.filter(UserActionLog.status == status_filter)
    
    if search:
        term = f"%{search.lower()}%"
        query = query.filter(UserActionLog.action_description.ilike(term))
    
    if date_from:
        query = query.filter(UserActionLog.created_at >= date_from)
    
    if date_to:
        query = query.filter(UserActionLog.created_at <= date_to)
    
    # Если не указаны даты, показываем все логи (без ограничения по дате)
    # Можно раскомментировать для ограничения:
    # if not date_from and not date_to:
    #     date_from_default = datetime.utcnow() - timedelta(days=30)
    #     query = query.filter(UserActionLog.created_at >= date_from_default)
    
    total = query.count()
    logs = (
        query
        .order_by(desc(UserActionLog.created_at))
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    return UserActionLogListResponse(total=total, items=logs)


@router.get("/user-actions/{log_id}", response_model=UserActionLogResponse)
async def get_user_action_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Получение детальной информации о логе действия пользователя (только для администраторов)
    """
    log = db.query(UserActionLog).filter(UserActionLog.id == log_id).first()
    
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Лог не найден"
        )
    
    return log


@router.get("/my-actions", response_model=UserActionLogListResponse)
async def list_my_action_logs(
    action_type: Optional[str] = Query(None, description="Фильтр по типу действия"),
    action_category: Optional[str] = Query(None, description="Фильтр по категории действия"),
    entity_type: Optional[str] = Query(None, description="Фильтр по типу сущности"),
    status_filter: Optional[str] = Query(None, alias="status", description="Фильтр по статусу"),
    search: Optional[str] = Query(None, description="Поиск по описанию действия"),
    date_from: Optional[datetime] = Query(None, description="Начальная дата (ISO format)"),
    date_to: Optional[datetime] = Query(None, description="Конечная дата (ISO format)"),
    skip: int = Query(0, ge=0, description="Смещение для пагинации"),
    limit: int = Query(100, ge=1, le=1000, description="Количество записей"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Получение списка собственных действий пользователя
    """
    query = db.query(UserActionLog).filter(UserActionLog.user_id == current_user.id)
    
    # Фильтры
    if action_type:
        query = query.filter(UserActionLog.action_type == action_type)
    
    if action_category:
        query = query.filter(UserActionLog.action_category == action_category)
    
    if entity_type:
        query = query.filter(UserActionLog.entity_type == entity_type)
    
    if status_filter:
        query = query.filter(UserActionLog.status == status_filter)
    
    if search:
        term = f"%{search.lower()}%"
        query = query.filter(UserActionLog.action_description.ilike(term))
    
    if date_from:
        query = query.filter(UserActionLog.created_at >= date_from)
    
    if date_to:
        query = query.filter(UserActionLog.created_at <= date_to)
    
    # Если не указаны даты, показываем все логи (без ограничения по дате)
    # Можно раскомментировать для ограничения:
    # if not date_from and not date_to:
    #     date_from_default = datetime.utcnow() - timedelta(days=30)
    #     query = query.filter(UserActionLog.created_at >= date_from_default)
    
    total = query.count()
    logs = (
        query
        .order_by(desc(UserActionLog.created_at))
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    return UserActionLogListResponse(total=total, items=logs)


@router.delete("/system", status_code=status.HTTP_204_NO_CONTENT)
async def delete_old_system_logs(
    days: int = Query(90, ge=1, le=365, description="Удалить логи старше указанного количества дней"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Удаление старых системных логов (только для администраторов)
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    deleted_count = db.query(SystemLog).filter(SystemLog.created_at < cutoff_date).delete()
    db.commit()
    
    logger.info(f"Удалено {deleted_count} старых системных логов (старше {days} дней)")
    
    return None


@router.delete("/user-actions", status_code=status.HTTP_204_NO_CONTENT)
async def delete_old_user_action_logs(
    days: int = Query(90, ge=1, le=365, description="Удалить логи старше указанного количества дней"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Удаление старых логов действий пользователей (только для администраторов)
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    deleted_count = db.query(UserActionLog).filter(UserActionLog.created_at < cutoff_date).delete()
    db.commit()
    
    logger.info(f"Удалено {deleted_count} старых логов действий пользователей (старше {days} дней)")
    
    return None


@router.delete("/system/clear")
async def clear_all_system_logs(
    confirm: Optional[str] = Query(None, description="Подтверждение удаления всех системных логов"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Очистка всех системных логов из базы данных
    """
    confirm_bool = confirm and confirm.lower() in ("true", "1", "yes")
    
    if not confirm_bool:
        raise HTTPException(
            status_code=400, 
            detail="Для очистки всех системных логов необходимо установить параметр confirm=true"
        )
    
    try:
        total_count = db.query(SystemLog).count()
        db.query(SystemLog).delete()
        db.commit()
        
        # Логируем действие пользователя (в данном случае запись в UserActionLog все равно останется)
        if current_user:
            try:
                logging_service.log_user_action(
                    db=db,
                    user_id=current_user.id,
                    username=current_user.username,
                    action_type="clear",
                    action_description=f"Очищены все системные логи ({total_count} записей)",
                    action_category="system_log",
                    entity_type="SystemLog",
                    entity_id=None,
                    status="success",
                    extra_data={"deleted_count": total_count}
                )
            except Exception as e:
                logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
        
        logger.info(f"Очищены все системные логи", extra={"deleted_count": total_count})
        
        return {
            "message": f"Все системные логи успешно удалены",
            "deleted_count": total_count
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Ошибка при очистке системных логов", extra={"error": str(e)}, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка при очистке системных логов: {str(e)}")


@router.delete("/user-actions/clear")
async def clear_all_user_action_logs(
    confirm: Optional[str] = Query(None, description="Подтверждение удаления всех логов действий пользователей"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Очистка всех логов действий пользователей из базы данных
    """
    confirm_bool = confirm and confirm.lower() in ("true", "1", "yes")
    
    if not confirm_bool:
        raise HTTPException(
            status_code=400, 
            detail="Для очистки всех логов действий пользователей необходимо установить параметр confirm=true"
        )
    
    try:
        total_count = db.query(UserActionLog).count()
        db.query(UserActionLog).delete()
        db.commit()
        
        # После очистки логируем действие (если логирование еще работает)
        if current_user:
            try:
                logging_service.log_user_action(
                    db=db,
                    user_id=current_user.id,
                    username=current_user.username,
                    action_type="clear",
                    action_description=f"Очищены все логи действий пользователей ({total_count} записей)",
                    action_category="user_action_log",
                    entity_type="UserActionLog",
                    entity_id=None,
                    status="success",
                    extra_data={"deleted_count": total_count}
                )
            except Exception as e:
                logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
        
        logger.info(f"Очищены все логи действий пользователей", extra={"deleted_count": total_count})
        
        return {
            "message": f"Все логи действий пользователей успешно удалены",
            "deleted_count": total_count
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Ошибка при очистке логов действий пользователей", extra={"error": str(e)}, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка при очистке логов действий пользователей: {str(e)}")
