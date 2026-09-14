"""
Роутер резервуаров: остатки топлива на АЗС по данным уровнемеров Топаза
"""
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import require_admin, require_auth_if_enabled
from app.database import get_db
from app.models import Provider, ProviderTemplate, Tank, TankReading, TopazSyncState, Transaction, UploadEvent, User
from app.schemas import (
    TankOverviewResponse, TankReadingPoint, TankReadingsResponse, TankResponse, TankStation,
    TankStationFuel, TankUpdate, TopazSyncResult, TopazSyncStateResponse,
)
from app.services.topaz_sync_service import EVENT_ROW_OFFSET, SOURCE_SESSIONS, TopazSyncService, resolve_fuel_type
from app.utils.firebird_utils import get_firebird_service
from app.utils.json_utils import parse_template_json

router = APIRouter(prefix="/api/v1/tanks", tags=["tanks"])

# Замер старше этого считается устаревшим: КАЗС пишет замер раз в сутки на смене
STALE_AFTER_MINUTES = 36 * 60
# Ориентировочные границы плотности, кг/м3
PETROL_MAX_DENSITY = 790
DIESEL_MIN_DENSITY = 800


def _float(value) -> Optional[float]:
    if value is None:
        return None
    return float(value)


def _fuel_family(fuel: Optional[str]) -> Optional[str]:
    if not fuel:
        return None
    lowered = fuel.lower().replace(" ", "").replace("-", "")
    if "дт" in lowered or "диз" in lowered:
        return "diesel"
    if "аи" in lowered or "бенз" in lowered or "ai" in lowered:
        return "petrol"
    return None


def density_mismatch(fuel: Optional[str], density: Optional[float]) -> bool:
    """Плотность не соответствует виду топлива: признак ошибки привязки ёмкости или подписи."""
    if not density or density <= 0:
        return False
    family = _fuel_family(fuel)
    if family == "diesel":
        return density < DIESEL_MIN_DENSITY
    if family == "petrol":
        return density > PETROL_MAX_DENSITY
    return False


class _SourceClock:
    """Оценка текущего времени на часах сервера Топаза по данным последней синхронизации."""

    def __init__(self, states: List[TopazSyncState]):
        now = datetime.now()
        self._offsets: Dict[int, object] = {}
        for state in states:
            if state.source_clock and state.last_run_at:
                self._offsets[state.template_id] = state.source_clock - state.last_run_at
        self._now = now

    def now_for(self, template_id: int) -> datetime:
        offset = self._offsets.get(template_id)
        return self._now + offset if offset is not None else self._now

    def to_source(self, template_id: int, server_time: Optional[datetime]) -> Optional[datetime]:
        """Перевести время сервера GSM на часы сервера Топаза."""
        if server_time is None:
            return None
        offset = self._offsets.get(template_id)
        return server_time + offset if offset is not None else server_time


def _age_minutes(measured_at: Optional[datetime], source_now: datetime) -> Optional[int]:
    if measured_at is None:
        return None
    return max(0, int((source_now - measured_at).total_seconds() // 60))


def _tank_response(tank: Tank, mapping_by_template: Dict[int, dict], clock: _SourceClock) -> TankResponse:
    mapping = mapping_by_template.get(tank.template_id) or {}
    fuel_type = tank.fuel_type_override or resolve_fuel_type(tank.source_fuel, mapping)
    volume = _float(tank.last_volume)
    capacity = _float(tank.capacity_liters)
    density = _float(tank.last_density)
    age = _age_minutes(tank.last_measured_at, clock.now_for(tank.template_id))

    warnings: List[str] = []
    if tank.last_measured_at is None:
        warnings.append("no_readings")
    elif age is not None and age > STALE_AFTER_MINUTES:
        warnings.append("stale")
    if density_mismatch(fuel_type, density):
        warnings.append("density_mismatch")
    if not capacity:
        warnings.append("no_capacity")
    elif volume is not None and volume > capacity * 1.02:
        warnings.append("over_capacity")

    return TankResponse(
        id=tank.id,
        provider_id=tank.provider_id,
        provider_name=tank.provider.name if tank.provider else None,
        template_id=tank.template_id,
        gas_station_id=tank.gas_station_id,
        gas_station_name=tank.gas_station.name if tank.gas_station else None,
        azs_code=tank.azs_code,
        source_key=tank.source_key,
        tank_number=tank.tank_number,
        source_name=tank.source_name,
        source_fuel=tank.source_fuel,
        fuel_type=fuel_type,
        fuel_type_override=tank.fuel_type_override,
        capacity_liters=capacity,
        overflow_group=tank.overflow_group,
        is_active=bool(tank.is_active),
        last_measured_at=tank.last_measured_at,
        last_volume=volume,
        last_mass=_float(tank.last_mass),
        last_density=density,
        last_temperature=_float(tank.last_temperature),
        last_water=_float(tank.last_water),
        fill_percent=round(volume / capacity * 100, 1) if volume is not None and capacity else None,
        age_minutes=age,
        warnings=warnings,
    )


def _session_estimate(db: Session, items: List[TankResponse], fuel_type: Optional[str],
                      clock: _SourceClock, fills_loaded_at: Dict[int, datetime]) -> Optional[dict]:
    """
    Остаток вида топлива для источника «замеры смен» (OnlineTerminal).

    В течение дня Топаз пишет уровень только ёмкости, из которой отпускали, а ёмкости,
    соединённые переливом, перетекают друг в друга. Сумма последних замеров разных
    моментов поэтому врёт на объём перелива. Считаем от момента, когда замер есть
    у всех ёмкостей сразу (открытие смены), и вычитаем отпуск этого топлива с тех пор.
    """
    if not fuel_type or not items:
        return None
    tank_ids = [t.id for t in items]
    base_rows = (
        db.query(TankReading.tank_id, func.max(TankReading.measured_at))
        .filter(TankReading.tank_id.in_(tank_ids), TankReading.source_row_id < EVENT_ROW_OFFSET)
        .group_by(TankReading.tank_id)
        .all()
    )
    base_times = {tank_id: measured_at for tank_id, measured_at in base_rows}
    if len(base_times) != len(tank_ids) or len(set(base_times.values())) != 1:
        return None
    base_at = next(iter(base_times.values()))
    base_volume = sum(
        float(volume or 0) for (volume,) in db.query(TankReading.volume).filter(
            TankReading.tank_id.in_(tank_ids), TankReading.measured_at == base_at,
            TankReading.source_row_id < EVENT_ROW_OFFSET,
        )
    )
    first = items[0]
    dispensed = db.query(func.coalesce(func.sum(Transaction.quantity), 0)).filter(
        Transaction.provider_id == first.provider_id,
        Transaction.azs_number == first.azs_code,
        Transaction.product == fuel_type,
        Transaction.transaction_date >= base_at,
        Transaction.quantity > 0,
    ).scalar()
    loaded_at = clock.to_source(first.template_id, fills_loaded_at.get(first.template_id))
    return {
        "base_at": base_at,
        "base_volume": round(base_volume, 2),
        "dispensed": round(float(dispensed or 0), 2),
        "volume": round(base_volume - float(dispensed or 0), 2),
        "fills_loaded_at": loaded_at,
        "age": _age_minutes(loaded_at, clock.now_for(first.template_id)) if loaded_at else None,
    }


def _station_fuels(tanks: List[TankResponse], db: Optional[Session] = None, clock: Optional[_SourceClock] = None,
                   session_templates: frozenset = frozenset(),
                   fills_loaded_at: Optional[Dict[int, datetime]] = None) -> List[TankStationFuel]:
    groups: Dict[Optional[str], List[TankResponse]] = {}
    for tank in tanks:
        if tank.is_active:
            groups.setdefault(tank.fuel_type, []).append(tank)

    fuels: List[TankStationFuel] = []
    for fuel_type, items in groups.items():
        measured = [t for t in items if t.last_volume is not None]
        volume = sum(t.last_volume for t in measured)
        masses = [t.last_mass for t in measured if t.last_mass is not None]
        capacities = [t.capacity_liters for t in items]
        capacity = sum(capacities) if capacities and all(capacities) else None
        # Ёмкости обновляются неравномерно: OnlineTerminal пишет уровень только той,
        # из которой отпускали. Возраст суммы — по свежему замеру, отставание — отдельно.
        freshest = max((t.last_measured_at for t in measured), default=None)
        ages = [t.age_minutes for t in measured if t.age_minutes is not None]
        warnings = sorted({w for t in items for w in t.warnings if w not in ("no_capacity", "stale")})
        if capacity is None:
            warnings.append("no_capacity")

        estimate = None
        if db is not None and clock is not None and items[0].template_id in session_templates:
            estimate = _session_estimate(db, items, fuel_type, clock, fills_loaded_at or {})

        if estimate is not None:
            volume = estimate["volume"]
            age_minutes = estimate["age"]
            oldest_age_minutes = None
        else:
            age_minutes = min(ages) if ages else None
            oldest_age_minutes = max(ages) if ages else None
            if any("stale" in t.warnings for t in items):
                warnings.append("stale")

        fuels.append(TankStationFuel(
            fuel_type=fuel_type,
            volume=round(volume, 2),
            mass=round(sum(masses), 2) if masses and estimate is None else None,
            capacity_liters=capacity,
            fill_percent=round(volume / capacity * 100, 1) if capacity else None,
            tanks_count=len(items),
            measured_at=freshest,
            age_minutes=age_minutes,
            oldest_age_minutes=oldest_age_minutes,
            estimate_base_at=estimate["base_at"] if estimate else None,
            estimate_base_volume=estimate["base_volume"] if estimate else None,
            estimate_dispensed=estimate["dispensed"] if estimate else None,
            fills_loaded_at=estimate["fills_loaded_at"] if estimate else None,
            warnings=sorted(set(warnings)),
        ))
    fuels.sort(key=lambda f: (f.fuel_type or ""))
    return fuels


def _mapping_by_template(db: Session, template_ids) -> Dict[int, dict]:
    result: Dict[int, dict] = {}
    if not template_ids:
        return result
    for template in db.query(ProviderTemplate).filter(ProviderTemplate.id.in_(list(template_ids))):
        mapping = parse_template_json(template.fuel_type_mapping, decrypt_passwords=False) or {}
        result[template.id] = mapping if isinstance(mapping, dict) else {}
    return result


def _sync_states(db: Session) -> List[TopazSyncStateResponse]:
    rows = (
        db.query(TopazSyncState, ProviderTemplate, Provider)
        .join(ProviderTemplate, ProviderTemplate.id == TopazSyncState.template_id)
        .outerjoin(Provider, Provider.id == ProviderTemplate.provider_id)
        .order_by(TopazSyncState.template_id)
        .all()
    )
    return [
        TopazSyncStateResponse(
            template_id=state.template_id,
            template_name=template.name,
            provider_id=template.provider_id,
            provider_name=provider.name if provider else None,
            source_kind=state.source_kind,
            last_run_at=state.last_run_at,
            last_success_at=state.last_success_at,
            last_status=state.last_status,
            last_error=state.last_error,
            tanks_count=state.tanks_count,
            readings_added=state.readings_added,
            limits_count=state.limits_count,
        )
        for state, template, provider in rows
    ]


@router.get("", response_model=TankOverviewResponse)
def get_tank_overview(
    provider_id: Optional[int] = Query(None, description="Фильтр по провайдеру"),
    include_inactive: bool = Query(True, description="Показывать ёмкости, исключённые из остатков"),
    db: Session = Depends(get_db),
    _: Optional[User] = Depends(require_auth_if_enabled),
):
    """Остатки топлива по АЗС: ёмкости с последним замером и суммы по видам топлива."""
    query = db.query(Tank).options(joinedload(Tank.provider), joinedload(Tank.gas_station))
    if provider_id:
        query = query.filter(Tank.provider_id == provider_id)
    if not include_inactive:
        query = query.filter(Tank.is_active == True)  # noqa: E712
    tanks = query.order_by(Tank.provider_id, Tank.azs_code, Tank.tank_number, Tank.id).all()

    states = db.query(TopazSyncState).all()
    clock = _SourceClock(states)
    session_templates = frozenset(s.template_id for s in states if s.source_kind == SOURCE_SESSIONS)
    fills_loaded_at = {
        template_id: loaded_at
        for template_id, loaded_at in db.query(UploadEvent.template_id, func.max(UploadEvent.created_at))
        .filter(UploadEvent.template_id.in_(list(session_templates)), UploadEvent.status == "success")
        .group_by(UploadEvent.template_id)
    } if session_templates else {}
    mappings = _mapping_by_template(db, {t.template_id for t in tanks})
    responses = [_tank_response(tank, mappings, clock) for tank in tanks]

    stations: Dict[tuple, List[TankResponse]] = {}
    for item in responses:
        stations.setdefault((item.provider_id, item.azs_code), []).append(item)
    station_places = {tank.gas_station_id: tank.gas_station for tank in tanks if tank.gas_station is not None}

    return TankOverviewResponse(
        stations=[
            TankStation(
                azs_code=azs_code,
                provider_id=prov_id,
                provider_name=items[0].provider_name,
                gas_station_id=items[0].gas_station_id,
                gas_station_name=items[0].gas_station_name,
                location=getattr(station_places.get(items[0].gas_station_id), "location", None),
                settlement=getattr(station_places.get(items[0].gas_station_id), "settlement", None),
                region=getattr(station_places.get(items[0].gas_station_id), "region", None),
                fuels=_station_fuels(items, db, clock, session_templates, fills_loaded_at),
                tanks=items,
            )
            for (prov_id, azs_code), items in stations.items()
        ],
        total_tanks=len(responses),
        sync=_sync_states(db),
    )


@router.get("/{tank_id}/readings", response_model=TankReadingsResponse)
def get_tank_readings(
    tank_id: int,
    date_from: Optional[datetime] = Query(None, description="С (ISO)"),
    date_to: Optional[datetime] = Query(None, description="По (ISO)"),
    limit: int = Query(2000, ge=1, le=10000),
    db: Session = Depends(get_db),
    _: Optional[User] = Depends(require_auth_if_enabled),
):
    """История замеров резервуара, по возрастанию времени."""
    if not db.query(Tank.id).filter(Tank.id == tank_id).first():
        raise HTTPException(status_code=404, detail="Резервуар не найден")
    query = db.query(TankReading).filter(TankReading.tank_id == tank_id)
    if date_from:
        query = query.filter(TankReading.measured_at >= date_from)
    if date_to:
        query = query.filter(TankReading.measured_at <= date_to)
    total = query.count()
    # При переполнении берём самые свежие замеры
    rows = query.order_by(TankReading.measured_at.desc()).limit(limit).all()
    rows.reverse()
    return TankReadingsResponse(
        tank_id=tank_id,
        total=total,
        items=[
            TankReadingPoint(
                measured_at=row.measured_at,
                volume=_float(row.volume),
                mass=_float(row.mass),
                density=_float(row.density),
                temperature=_float(row.temperature),
                water=_float(row.water),
            )
            for row in rows
        ],
    )


@router.patch("/{tank_id}", response_model=TankResponse)
def update_tank(
    tank_id: int,
    payload: TankUpdate,
    db: Session = Depends(get_db),
    _: Optional[User] = Depends(require_admin),
):
    """Изменить вместимость, вид топлива, группу перелива или участие ёмкости в остатках."""
    tank = db.query(Tank).options(joinedload(Tank.provider), joinedload(Tank.gas_station)).filter(Tank.id == tank_id).first()
    if tank is None:
        raise HTTPException(status_code=404, detail="Резервуар не найден")

    changes = payload.model_dump(exclude_unset=True)
    if "capacity_liters" in changes:
        value = changes["capacity_liters"]
        tank.capacity_liters = Decimal(str(value)) if value else None
    for field in ("fuel_type_override", "overflow_group"):
        if field in changes:
            value = changes[field]
            setattr(tank, field, value.strip() if isinstance(value, str) and value.strip() else None)
    if changes.get("is_active") is not None:
        tank.is_active = changes["is_active"]
    db.commit()
    db.refresh(tank)

    clock = _SourceClock(db.query(TopazSyncState).all())
    return _tank_response(tank, _mapping_by_template(db, {tank.template_id}), clock)


@router.post("/sync", response_model=List[TopazSyncResult])
def sync_tanks(
    template_id: Optional[int] = Query(None, description="Только этот шаблон"),
    db: Session = Depends(get_db),
    _: Optional[User] = Depends(require_admin),
):
    """Прочитать резервуары и лимиты из Топаза сейчас, не дожидаясь расписания."""
    firebird_service_class = get_firebird_service()
    service = TopazSyncService(db, firebird_service_class)
    if template_id is None:
        return service.sync_all()
    template = db.query(ProviderTemplate).filter(
        ProviderTemplate.id == template_id, ProviderTemplate.connection_type == "firebird"
    ).first()
    if template is None:
        raise HTTPException(status_code=404, detail="Шаблон с подключением к Firebird не найден")
    return [service.sync_template(template)]
