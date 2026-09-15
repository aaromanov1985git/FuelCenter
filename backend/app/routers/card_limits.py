"""
Роутер лимитов топливных карт (данные Топаза, только чтение)
"""
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import require_auth_if_enabled
from app.database import get_db
from app.models import CardLimit, User
from app.schemas import CardLimitListResponse, CardLimitResponse, CardLimitStats, TopazProviderOption
from app.services.topaz_sync_service import LIMIT_TYPE_FORBIDDEN, topaz_providers

router = APIRouter(prefix="/api/v1/card-limits", tags=["card-limits"])

NEAR_LIMIT_SHARE = 0.9


def _group_limits(rows: List[CardLimit]) -> List[CardLimitResponse]:
    """
    Схлопнуть одинаковые лимиты одной карты по одному виду топлива.

    В Топазе дизель заводят несколькими кодами (ДТ1, ДТ2, ДТ3) и ставят на каждый
    одинаковый лимит, а отпуск идёт по одному из них. После нормализации это один
    лимит «ДТ», поэтому расход по кодам складывается.
    """
    groups: Dict[Tuple, List[CardLimit]] = {}
    for row in rows:
        key = (
            row.template_id,
            row.source_card_id,
            row.fuel_type or row.source_fuel,
            row.limit_type_id,
            float(row.limit_liters) if row.limit_liters is not None else None,
        )
        groups.setdefault(key, []).append(row)

    items: List[CardLimitResponse] = []
    for members in groups.values():
        first = min(members, key=lambda r: r.id)
        limit_liters = float(first.limit_liters) if first.limit_liters is not None else None
        used_values = [float(r.used_liters) for r in members if r.used_liters is not None]
        used = round(sum(used_values), 2) if used_values else None
        remaining = None
        used_percent = None
        if limit_liters and used is not None:
            remaining = round(max(limit_liters - used, 0.0), 2)
            used_percent = round(used / limit_liters * 100, 1)
        source_fuels = sorted({r.source_fuel for r in members if r.source_fuel})
        items.append(CardLimitResponse(
            id=first.id,
            provider_id=first.provider_id,
            provider_name=first.provider.name if first.provider else None,
            card_code=first.card_code,
            card_name=first.card_name,
            card_enabled=bool(first.card_enabled),
            source_fuel=", ".join(source_fuels) if source_fuels else None,
            fuel_type=first.fuel_type,
            limit_type_id=first.limit_type_id,
            limit_type_name=first.limit_type_name,
            limit_liters=limit_liters,
            period=first.period,
            period_start=first.period_start,
            used_liters=used,
            remaining_liters=remaining,
            used_percent=used_percent,
            synced_at=max((r.synced_at for r in members if r.synced_at), default=None),
        ))
    return items


def _is_near(item: CardLimitResponse, share: float) -> bool:
    return bool(item.limit_liters) and item.used_liters is not None and item.used_liters >= item.limit_liters * share


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
    return build_limits_response(
        db, page=page, limit=limit, search=search, provider_id=provider_id, fuel_type=fuel_type,
        limit_type_id=limit_type_id, only_enabled=only_enabled, near_limit=near_limit,
    )


def build_limits_response(db: Session, *, page: int = 1, limit: int = 50, search: Optional[str] = None,
                          provider_id: Optional[int] = None, fuel_type: Optional[str] = None,
                          limit_type_id: Optional[int] = None, only_enabled: bool = True, near_limit: bool = False,
                          provider_scope: Optional[int] = None) -> CardLimitListResponse:
    """
    Лимиты с фильтрами. provider_scope жёстко ограничивает провайдера (общая ссылка на АЗС):
    фильтр provider_id внутри области не может её расширить.
    """
    if provider_scope is not None:
        provider_id = provider_scope
    query = db.query(CardLimit).options(joinedload(CardLimit.provider))
    if provider_scope is not None:
        query = query.filter(CardLimit.provider_id == provider_scope)
    all_rows = query.all()
    fuel_types = sorted({row.fuel_type for row in all_rows if row.fuel_type})
    grouped = _group_limits([row for row in all_rows if not provider_id or row.provider_id == provider_id])

    stats = CardLimitStats(
        total=len(grouped),
        enabled=sum(1 for item in grouped if item.card_enabled),
        near_limit=sum(1 for item in grouped if item.card_enabled and _is_near(item, NEAR_LIMIT_SHARE)),
        exhausted=sum(1 for item in grouped if item.card_enabled and _is_near(item, 1.0)),
        forbidden=sum(1 for item in grouped if item.limit_type_id == LIMIT_TYPE_FORBIDDEN),
        without_period=sum(
            1 for item in grouped if item.card_enabled and (item.limit_type_id or 0) == 0 and item.limit_liters
        ),
    )

    needle = search.strip().lower() if search and search.strip() else None
    items = [
        item for item in grouped
        if (not only_enabled or item.card_enabled)
        and (not fuel_type or item.fuel_type == fuel_type)
        and (limit_type_id is None or item.limit_type_id == limit_type_id)
        and (not near_limit or _is_near(item, NEAR_LIMIT_SHARE))
        and (not needle or needle in (item.card_name or "").lower() or needle in (item.card_code or "").lower())
    ]
    items.sort(key=lambda item: (
        -(item.used_percent if item.used_percent is not None else -1),
        item.card_name or "",
        item.fuel_type or "",
    ))

    synced_query = db.query(func.max(CardLimit.synced_at))
    if provider_scope is not None:
        synced_query = synced_query.filter(CardLimit.provider_id == provider_scope)
    synced_at: Optional[datetime] = synced_query.scalar()
    providers = [
        TopazProviderOption(id=pid, name=name) for pid, name in topaz_providers(db)
        if provider_scope is None or pid == provider_scope
    ]
    start = (page - 1) * limit
    return CardLimitListResponse(
        total=len(items),
        items=items[start:start + limit],
        stats=stats,
        synced_at=synced_at,
        providers=providers,
        fuel_types=fuel_types,
    )
