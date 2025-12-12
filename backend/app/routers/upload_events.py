"""
Роутер для истории загрузок (ручных и регламентных)
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func, case

from app.database import get_db
from app.models import UploadEvent, Provider, ProviderTemplate, User
from app.schemas import UploadEventListResponse, UploadEventResponse, UploadEventStats
from app.auth import require_auth_if_enabled
from app.logger import logger


router = APIRouter(prefix="/api/v1/upload-events", tags=["upload-events"])


def _parse_date(value: Optional[str], end_of_day: bool = False) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
        if end_of_day:
            return parsed.replace(hour=23, minute=59, second=59, microsecond=999000)
        return parsed.replace(hour=0, minute=0, second=0, microsecond=0)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Неверный формат даты: {value}")


@router.get("", response_model=UploadEventListResponse)
async def list_upload_events(
    page: int = Query(1, ge=1, description="Номер страницы"),
    limit: int = Query(50, ge=1, le=200, description="Размер страницы"),
    search: Optional[str] = Query(None, description="Поиск по файлу, пользователю, сообщению"),
    provider_id: Optional[int] = Query(None, description="Фильтр по провайдеру"),
    source_type: Optional[str] = Query(None, description="manual | auto"),
    status: Optional[str] = Query(None, description="success | failed | partial"),
    is_scheduled: Optional[bool] = Query(None, description="Только регламентные/только ручные"),
    date_from: Optional[str] = Query(None, description="Дата с (ISO)"),
    date_to: Optional[str] = Query(None, description="Дата по (ISO)"),
    db: Session = Depends(get_db),
    _: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Получить историю загрузок с фильтрами и пагинацией
    """
    base_query = db.query(UploadEvent).join(Provider, UploadEvent.provider_id == Provider.id, isouter=True).join(
        ProviderTemplate, UploadEvent.template_id == ProviderTemplate.id, isouter=True
    )

    if provider_id:
        base_query = base_query.filter(UploadEvent.provider_id == provider_id)
    if source_type:
        base_query = base_query.filter(UploadEvent.source_type == source_type)
    if status:
        base_query = base_query.filter(UploadEvent.status == status)
    if is_scheduled is not None:
        base_query = base_query.filter(UploadEvent.is_scheduled == is_scheduled)

    start_date = _parse_date(date_from) if date_from else None
    end_date = _parse_date(date_to, end_of_day=True) if date_to else None
    if start_date and end_date:
        base_query = base_query.filter(and_(UploadEvent.created_at >= start_date, UploadEvent.created_at <= end_date))
    elif start_date:
        base_query = base_query.filter(UploadEvent.created_at >= start_date)
    elif end_date:
        base_query = base_query.filter(UploadEvent.created_at <= end_date)

    if search:
        like_expr = f"%{search}%"
        base_query = base_query.filter(
            or_(
                UploadEvent.file_name.ilike(like_expr),
                UploadEvent.username.ilike(like_expr),
                UploadEvent.message.ilike(like_expr),
                Provider.name.ilike(like_expr),
                ProviderTemplate.name.ilike(like_expr),
            )
        )

    total = base_query.count()

    stats_row = base_query.with_entities(
        func.count(UploadEvent.id),
        func.coalesce(func.sum(UploadEvent.transactions_total), 0),
        func.coalesce(func.sum(UploadEvent.transactions_created), 0),
        func.coalesce(func.sum(UploadEvent.transactions_skipped), 0),
        func.coalesce(func.sum(UploadEvent.transactions_failed), 0),
        func.coalesce(func.sum(case((UploadEvent.status == "failed", 1), else_=0)), 0),
        func.coalesce(func.sum(case((UploadEvent.is_scheduled == True, 1), else_=0)), 0),
    ).first()

    events = (
        base_query.order_by(UploadEvent.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    items: list[UploadEventResponse] = []
    for event in events:
        items.append(
            UploadEventResponse(
                id=event.id,
                created_at=event.created_at,
                updated_at=event.updated_at,
                source_type=event.source_type,
                status=event.status,
                is_scheduled=bool(event.is_scheduled),
                file_name=event.file_name,
                provider_id=event.provider_id,
                provider_name=event.provider.name if event.provider else None,
                template_id=event.template_id,
                template_name=event.template.name if event.template else None,
                user_id=event.user_id,
                username=event.username,
                transactions_total=event.transactions_total or 0,
                transactions_created=event.transactions_created or 0,
                transactions_skipped=event.transactions_skipped or 0,
                transactions_failed=event.transactions_failed or 0,
                duration_ms=event.duration_ms,
                message=event.message,
            )
        )

    stats = UploadEventStats(
        total_events=int(stats_row[0] or 0),
        total_records=int(stats_row[1] or 0),
        total_created=int(stats_row[2] or 0),
        total_skipped=int(stats_row[3] or 0),
        total_failed=int(stats_row[4] or 0),
        failed_events=int(stats_row[5] or 0),
        scheduled_events=int(stats_row[6] or 0),
    )

    logger.debug(
        "Загружена история событий",
        extra={"page": page, "limit": limit, "total": total, "filters": {"provider_id": provider_id, "source_type": source_type}},
    )

    return UploadEventListResponse(
        total=total,
        items=items,
        stats=stats,
    )
