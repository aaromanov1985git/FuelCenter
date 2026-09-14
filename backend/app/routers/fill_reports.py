"""
Отчёты по заправкам на основе загруженных транзакций
"""
from datetime import date, datetime, time, timedelta
from typing import Dict, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import require_auth_if_enabled
from app.database import get_db
from app.models import CardLimit, Provider, Transaction, User
from app.schemas import FillsByCardItem, FillsByCardResponse, FillsByCardTotals
from app.services.topaz_sync_service import LIMIT_TYPE_DAY

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])

MAX_PERIOD_DAYS = 93
AT_LIMIT_SHARE = 0.9


def _card_key(value: Optional[str]) -> str:
    return (value or "").strip().lower()


@router.get("/fills-by-card", response_model=FillsByCardResponse)
def fills_by_card(
    date_from: Optional[date] = Query(None, description="С (по умолчанию — 30 дней назад)"),
    date_to: Optional[date] = Query(None, description="По (по умолчанию — сегодня)"),
    provider_id: Optional[int] = Query(None),
    azs_number: Optional[str] = Query(None),
    fuel_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None, description="Поиск по карте"),
    at_limit_only: bool = Query(False, description="Только карты, которые упирались в суточный лимит"),
    db: Session = Depends(get_db),
    _: Optional[User] = Depends(require_auth_if_enabled),
):
    """Заправки по картам за период: литры, дни с заправками, максимум в сутки и сравнение с суточным лимитом."""
    date_to = date_to or date.today()
    date_from = date_from or (date_to - timedelta(days=29))
    if date_from > date_to:
        raise HTTPException(status_code=400, detail="Дата «с» позже даты «по»")
    if (date_to - date_from).days + 1 > MAX_PERIOD_DAYS:
        raise HTTPException(status_code=400, detail=f"Период не больше {MAX_PERIOD_DAYS} дней")

    day = func.date(Transaction.transaction_date)
    query = db.query(
        Transaction.provider_id,
        Transaction.card_number,
        Transaction.product,
        day.label("day"),
        func.count(Transaction.id).label("fills"),
        func.sum(Transaction.quantity).label("liters"),
        func.min(Transaction.transaction_date).label("first_fill"),
        func.max(Transaction.transaction_date).label("last_fill"),
    ).filter(
        Transaction.transaction_date >= datetime.combine(date_from, time.min),
        Transaction.transaction_date <= datetime.combine(date_to, time.max),
        Transaction.quantity > 0,
    )
    if provider_id:
        query = query.filter(Transaction.provider_id == provider_id)
    if azs_number:
        query = query.filter(Transaction.azs_number == azs_number)
    if fuel_type:
        query = query.filter(Transaction.product == fuel_type)
    if search:
        query = query.filter(Transaction.card_number.ilike(f"%{search.strip()}%"))
    daily_rows = query.group_by(Transaction.provider_id, Transaction.card_number, Transaction.product, day).all()

    azs_query = db.query(Transaction.provider_id, Transaction.card_number, Transaction.product, Transaction.azs_number).filter(
        Transaction.transaction_date >= datetime.combine(date_from, time.min),
        Transaction.transaction_date <= datetime.combine(date_to, time.max),
        Transaction.quantity > 0,
    )
    if provider_id:
        azs_query = azs_query.filter(Transaction.provider_id == provider_id)
    azs_by_key: Dict[Tuple, set] = {}
    for prov, card, product, azs in azs_query.distinct().all():
        if azs:
            azs_by_key.setdefault((prov, card, product), set()).add(azs)

    daily_limits: Dict[Tuple, float] = {}
    for prov, card_name, fuel, limit_liters in db.query(
        CardLimit.provider_id, CardLimit.card_name, CardLimit.fuel_type, CardLimit.limit_liters
    ).filter(CardLimit.limit_type_id == LIMIT_TYPE_DAY, CardLimit.limit_liters > 0):
        daily_limits[(prov, _card_key(card_name), fuel)] = float(limit_liters)

    providers = {pid: name for pid, name in db.query(Provider.id, Provider.name)}

    aggregated: Dict[Tuple, dict] = {}
    for row in daily_rows:
        key = (row.provider_id, row.card_number, row.product)
        entry = aggregated.setdefault(key, {
            "fills": 0, "liters": 0.0, "days": 0, "max_daily": 0.0,
            "first": None, "last": None, "daily": [],
        })
        liters = float(row.liters or 0)
        entry["fills"] += int(row.fills or 0)
        entry["liters"] += liters
        entry["days"] += 1
        entry["max_daily"] = max(entry["max_daily"], liters)
        entry["daily"].append(liters)
        entry["first"] = row.first_fill if entry["first"] is None else min(entry["first"], row.first_fill)
        entry["last"] = row.last_fill if entry["last"] is None else max(entry["last"], row.last_fill)

    items = []
    for (prov, card, product), entry in aggregated.items():
        daily_limit = daily_limits.get((prov, _card_key(card), product))
        days_at_limit = None
        if daily_limit:
            days_at_limit = sum(1 for liters in entry["daily"] if liters >= daily_limit * AT_LIMIT_SHARE)
        if at_limit_only and not days_at_limit:
            continue
        items.append(FillsByCardItem(
            provider_id=prov,
            provider_name=providers.get(prov),
            card_number=card,
            fuel_type=product,
            fills_count=entry["fills"],
            liters=round(entry["liters"], 2),
            days_with_fills=entry["days"],
            max_daily_liters=round(entry["max_daily"], 2),
            avg_daily_liters=round(entry["liters"] / entry["days"], 2) if entry["days"] else 0.0,
            first_fill=entry["first"],
            last_fill=entry["last"],
            azs_numbers=sorted(azs_by_key.get((prov, card, product), set())),
            daily_limit=daily_limit,
            days_at_limit=days_at_limit,
        ))
    items.sort(key=lambda item: (-(item.days_at_limit or 0), -item.liters))

    return FillsByCardResponse(
        date_from=date_from,
        date_to=date_to,
        total=len(items),
        items=items,
        totals=FillsByCardTotals(
            cards=len({(item.provider_id, item.card_number) for item in items}),
            fills_count=sum(item.fills_count for item in items),
            liters=round(sum(item.liters for item in items), 2),
        ),
    )
