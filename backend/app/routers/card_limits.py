"""
Роутер лимитов топливных карт (данные Топаза, только чтение)
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.auth import require_auth_if_enabled
from app.database import get_db
from app.models import CardLimit, User
from app.schemas import CardLimitListResponse, CardLimitResponse, CardLimitStats
from app.services.topaz_sync_service import LIMIT_TYPE_FORBIDDEN

router = APIRouter(prefix="/api/v1/card-limits", tags=["card-limits"])

NEAR_LIMIT_SHARE = 0.9


def _limit_response(limit: CardLimit) -> CardLimitResponse:
    limit_liters = float(limit.limit_liters) if limit.limit_liters is not None else None
    used = float(limit.used_liters) if limit.used_liters is not None else None
    remaining = None
    used_percent = None
    if limit_liters and used is not None:
        remaining = round(max(limit_liters - used, 0.0), 2)
        used_percent = round(used / limit_liters * 100, 1)
    return CardLimitResponse(
        id=limit.id,
        provider_id=limit.provider_id,
        provider_name=limit.provider.name if limit.provider else None,
        card_code=limit.card_code,
        card_name=limit.card_name,
        card_enabled=bool(limit.card_enabled),
        source_fuel=limit.source_fuel,
        fuel_type=limit.fuel_type,
        limit_type_id=limit.limit_type_id,
        limit_type_name=limit.limit_type_name,
        limit_liters=limit_liters,
        period=limit.period,
        period_start=limit.period_start,
        used_liters=used,
        remaining_liters=remaining,
        used_percent=used_percent,
        synced_at=limit.synced_at,
    )


@router.get("", response_model=CardLimitListResponse)
def list_card_limits(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    search: Optional[str] = Query(None, description="Поиск по названию или коду карты"),
    provider_id: Optional[int] = Query(None),
    fuel_type: Optional[str] = Query(None),
    limit_type_id: Optional[int] = Query(None),
    only_enabled: bool = Query(True, description="Только включённые карты"),
    near_limit: bool = Query(False, description="Только выбравшие 90 % лимита и больше"),
    db: Session = Depends(get_db),
    _: Optional[User] = Depends(require_auth_if_enabled),
):
    """Лимиты карт с расходом в текущем периоде. Сортировка: сначала самые израсходованные."""
    query = db.query(CardLimit)
    if provider_id:
        query = query.filter(CardLimit.provider_id == provider_id)

    stats_rows = query.with_entities(
        CardLimit.card_enabled, CardLimit.limit_type_id, CardLimit.limit_liters, CardLimit.used_liters
    ).all()
    stats = CardLimitStats(
        total=len(stats_rows),
        enabled=sum(1 for row in stats_rows if row.card_enabled),
        near_limit=sum(
            1 for row in stats_rows
            if row.card_enabled and row.limit_liters and row.used_liters is not None
            and float(row.used_liters) >= float(row.limit_liters) * NEAR_LIMIT_SHARE
        ),
        exhausted=sum(
            1 for row in stats_rows
            if row.card_enabled and row.limit_liters and row.used_liters is not None
            and float(row.used_liters) >= float(row.limit_liters)
        ),
        forbidden=sum(1 for row in stats_rows if row.limit_type_id == LIMIT_TYPE_FORBIDDEN),
        without_period=sum(
            1 for row in stats_rows
            if row.card_enabled and (row.limit_type_id or 0) == 0 and row.limit_liters
        ),
    )

    if only_enabled:
        query = query.filter(CardLimit.card_enabled == True)  # noqa: E712
    if fuel_type:
        query = query.filter(CardLimit.fuel_type == fuel_type)
    if limit_type_id is not None:
        query = query.filter(CardLimit.limit_type_id == limit_type_id)
    if search:
        like_expr = f"%{search.strip()}%"
        query = query.filter(or_(CardLimit.card_name.ilike(like_expr), CardLimit.card_code.ilike(like_expr)))
    if near_limit:
        query = query.filter(
            CardLimit.limit_liters > 0,
            CardLimit.used_liters >= CardLimit.limit_liters * NEAR_LIMIT_SHARE,
        )

    total = query.count()
    usage_share = func.coalesce(CardLimit.used_liters, 0) / func.nullif(CardLimit.limit_liters, 0)
    rows = (
        query.options(joinedload(CardLimit.provider))
        .order_by(func.coalesce(usage_share, -1).desc(), CardLimit.card_name, CardLimit.fuel_type)
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    synced_at = db.query(func.max(CardLimit.synced_at)).scalar()
    return CardLimitListResponse(
        total=total,
        items=[_limit_response(row) for row in rows],
        stats=stats,
        synced_at=synced_at,
    )
