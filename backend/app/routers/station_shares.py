"""
Общие ссылки на просмотр АЗС без входа в GSM.

Администратор создаёт ссылку на одну АЗС: какие разделы открыты и до какого момента.
Получатель по секретному токену видит только эту АЗС и только открытые разделы;
провайдер и АЗС всегда берутся из ссылки, а не из параметров запроса.
"""
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session, joinedload

from app.auth import require_admin
from app.config import get_settings
from app.database import get_db
from app.middleware.rate_limit import limiter
from app.models import GasStation, Provider, StationShare, Tank, User
from app.routers.card_limits import build_limits_response
from app.routers.fill_reports import build_fills_detail, build_fills_export, build_fills_summary
from app.routers.tanks import build_tank_overview, readings_for_tank
from app.schemas import (
    CardLimitListResponse, FillsByCardResponse, FillsDetailResponse, PublicShareInfo, StationShareCreate,
    StationShareResponse, TankOverviewResponse, TankReadingsResponse,
)

settings = get_settings()

router = APIRouter(prefix="/api/v1/station-shares", tags=["station-shares"])
public_router = APIRouter(prefix="/api/v1/public/shares", tags=["station-shares"])

PUBLIC_RATE_LIMIT = "120/minute"
MAX_EXPIRY_DAYS = 365


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _as_utc(value: Optional[datetime]) -> Optional[datetime]:
    """В базе время хранится без пояса в UTC; наружу отдаём с явным UTC."""
    return value.replace(tzinfo=timezone.utc) if value is not None else None


def _status(share: StationShare, now: datetime) -> str:
    if share.revoked_at is not None:
        return "revoked"
    if share.expires_at <= now:
        return "expired"
    return "active"


def _share_response(share: StationShare, now: datetime) -> StationShareResponse:
    return StationShareResponse(
        id=share.id,
        token=share.token,
        url_path=f"/share/{share.token}",
        provider_id=share.provider_id,
        provider_name=share.provider.name if share.provider else None,
        azs_code=share.azs_code,
        note=share.note,
        show_tanks=share.show_tanks,
        show_fills=share.show_fills,
        show_limits=share.show_limits,
        expires_at=_as_utc(share.expires_at),
        revoked_at=_as_utc(share.revoked_at),
        created_at=_as_utc(share.created_at),
        created_by_name=share.created_by_name,
        open_count=share.open_count or 0,
        last_opened_at=_as_utc(share.last_opened_at),
        status=_status(share, now),
    )


# ------------------------------------------------------------------ администратор

@router.post("", response_model=StationShareResponse, status_code=201)
def create_share(
    payload: StationShareCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin),
):
    """Создать ссылку на просмотр АЗС. Токен показывается в ответе и в списке ссылок."""
    azs_code = payload.azs_code.strip()
    if not db.query(Tank.id).filter(Tank.provider_id == payload.provider_id, Tank.azs_code == azs_code).first():
        raise HTTPException(status_code=404, detail="АЗС с резервуарами Топаза не найдена")

    now = _utcnow()
    if payload.expires_in_days is not None:
        expires_at = now + timedelta(days=payload.expires_in_days)
    else:
        expires_at = payload.expires_at
        if expires_at.tzinfo is not None:
            expires_at = expires_at.astimezone(timezone.utc).replace(tzinfo=None)
    if expires_at <= now:
        raise HTTPException(status_code=400, detail="Срок действия должен быть в будущем")
    if expires_at > now + timedelta(days=MAX_EXPIRY_DAYS):
        raise HTTPException(status_code=400, detail=f"Срок действия — не больше {MAX_EXPIRY_DAYS} дней")

    share = StationShare(
        token=secrets.token_urlsafe(32),
        provider_id=payload.provider_id,
        azs_code=azs_code,
        note=(payload.note or "").strip() or None,
        show_tanks=payload.show_tanks,
        show_fills=payload.show_fills,
        show_limits=payload.show_limits,
        expires_at=expires_at,
        created_by_id=current_user.id if current_user else None,
        created_by_name=current_user.username if current_user else None,
        open_count=0,
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return _share_response(share, now)


@router.get("", response_model=List[StationShareResponse])
def list_shares(
    provider_id: Optional[int] = Query(None),
    azs_code: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: Optional[User] = Depends(require_admin),
):
    """Ссылки на АЗС, новые первыми."""
    query = db.query(StationShare).options(joinedload(StationShare.provider))
    if provider_id:
        query = query.filter(StationShare.provider_id == provider_id)
    if azs_code:
        query = query.filter(StationShare.azs_code == azs_code)
    now = _utcnow()
    return [_share_response(share, now) for share in query.order_by(StationShare.id.desc()).limit(200)]


@router.delete("/{share_id}", response_model=StationShareResponse)
def revoke_share(
    share_id: int,
    db: Session = Depends(get_db),
    _: Optional[User] = Depends(require_admin),
):
    """Отозвать ссылку: она сразу перестаёт открываться."""
    share = db.query(StationShare).options(joinedload(StationShare.provider)).filter(StationShare.id == share_id).first()
    if share is None:
        raise HTTPException(status_code=404, detail="Ссылка не найдена")
    if share.revoked_at is None:
        share.revoked_at = _utcnow()
        db.commit()
        db.refresh(share)
    return _share_response(share, _utcnow())


# ------------------------------------------------------------------ получатель

def _active_share(db: Session, token: str, section: Optional[str] = None) -> StationShare:
    """Ссылка по токену; 404 — нет или отозвана, 410 — срок истёк, 403 — раздел не открыт."""
    share = db.query(StationShare).options(joinedload(StationShare.provider)).filter(StationShare.token == token).first()
    if share is None or share.revoked_at is not None:
        raise HTTPException(status_code=404, detail="Ссылка не найдена или отозвана")
    if share.expires_at <= _utcnow():
        raise HTTPException(status_code=410, detail="Срок действия ссылки истёк")
    if section is not None and not getattr(share, section):
        raise HTTPException(status_code=403, detail="Этот раздел по ссылке не открыт")
    return share


@public_router.get("/{token}", response_model=PublicShareInfo)
@limiter.limit(PUBLIC_RATE_LIMIT)
def public_share_info(request: Request, token: str, db: Session = Depends(get_db)):
    """Что открыто по ссылке. Каждое открытие учитывается в счётчике."""
    share = _active_share(db, token)
    share.open_count = (share.open_count or 0) + 1
    share.last_opened_at = _utcnow()
    db.commit()

    station = db.query(GasStation).join(Tank, Tank.gas_station_id == GasStation.id).filter(
        Tank.provider_id == share.provider_id, Tank.azs_code == share.azs_code
    ).first()
    return PublicShareInfo(
        azs_code=share.azs_code,
        provider_name=share.provider.name if share.provider else None,
        gas_station_name=station.name if station else None,
        location=station.location if station else None,
        settlement=station.settlement if station else None,
        region=station.region if station else None,
        show_tanks=share.show_tanks,
        show_fills=share.show_fills,
        show_limits=share.show_limits,
        expires_at=_as_utc(share.expires_at),
    )


@public_router.get("/{token}/tanks", response_model=TankOverviewResponse)
@limiter.limit(PUBLIC_RATE_LIMIT)
def public_tanks(request: Request, token: str, db: Session = Depends(get_db)):
    share = _active_share(db, token, "show_tanks")
    return build_tank_overview(db, provider_id=share.provider_id, azs_code=share.azs_code,
                               include_inactive=False, with_sync=False)


@public_router.get("/{token}/tanks/{tank_id}/readings", response_model=TankReadingsResponse)
@limiter.limit(PUBLIC_RATE_LIMIT)
def public_tank_readings(
    request: Request,
    token: str,
    tank_id: int,
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    limit: int = Query(2000, ge=1, le=10000),
    db: Session = Depends(get_db),
):
    share = _active_share(db, token, "show_tanks")
    tank = db.query(Tank.id).filter(
        Tank.id == tank_id, Tank.provider_id == share.provider_id, Tank.azs_code == share.azs_code,
        Tank.is_active == True,  # noqa: E712
    ).first()
    if tank is None:
        raise HTTPException(status_code=404, detail="Резервуар не найден")
    return readings_for_tank(db, tank_id, date_from, date_to, limit)


@public_router.get("/{token}/fills-by-card", response_model=FillsByCardResponse)
@limiter.limit(PUBLIC_RATE_LIMIT)
def public_fills_summary(
    request: Request,
    token: str,
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    fuel_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    at_limit_only: bool = Query(False),
    db: Session = Depends(get_db),
):
    share = _active_share(db, token, "show_fills")
    return build_fills_summary(db, date_from=date_from, date_to=date_to, provider_id=None, azs_number=None,
                               fuel_type=fuel_type, search=search, at_limit_only=at_limit_only,
                               provider_scope=share.provider_id, azs_scope=share.azs_code)


@public_router.get("/{token}/fills", response_model=FillsDetailResponse)
@limiter.limit(PUBLIC_RATE_LIMIT)
def public_fills_detail(
    request: Request,
    token: str,
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    card_number: Optional[str] = Query(None),
    fuel_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(5000, ge=1, le=20000),
    db: Session = Depends(get_db),
):
    share = _active_share(db, token, "show_fills")
    return build_fills_detail(db, date_from=date_from, date_to=date_to, provider_id=None, card_number=card_number,
                              azs_number=None, fuel_type=fuel_type, search=search, limit=limit,
                              provider_scope=share.provider_id, azs_scope=share.azs_code)


@public_router.get("/{token}/fills-by-card/export")
@limiter.limit(PUBLIC_RATE_LIMIT)
def public_fills_export(
    request: Request,
    token: str,
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    card_number: Optional[str] = Query(None),
    fuel_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    at_limit_only: bool = Query(False),
    db: Session = Depends(get_db),
):
    share = _active_share(db, token, "show_fills")
    return build_fills_export(db, date_from=date_from, date_to=date_to, provider_id=None, card_number=card_number,
                              azs_number=None, fuel_type=fuel_type, search=search, at_limit_only=at_limit_only,
                              provider_scope=share.provider_id, azs_scope=share.azs_code)


@public_router.get("/{token}/card-limits", response_model=CardLimitListResponse)
@limiter.limit(PUBLIC_RATE_LIMIT)
def public_card_limits(
    request: Request,
    token: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    search: Optional[str] = Query(None),
    fuel_type: Optional[str] = Query(None),
    only_enabled: bool = Query(True),
    near_limit: bool = Query(False),
    db: Session = Depends(get_db),
):
    share = _active_share(db, token, "show_limits")
    return build_limits_response(db, page=page, limit=limit, search=search, fuel_type=fuel_type,
                                 only_enabled=only_enabled, near_limit=near_limit, provider_scope=share.provider_id)
