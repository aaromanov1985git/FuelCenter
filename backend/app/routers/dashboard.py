"""
Роутер для дашборда и статистики
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from typing import Optional
from datetime import datetime, timedelta
from app.database import get_db
from app.logger import logger
from app.models import Transaction, Provider, Vehicle

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/stats")
async def get_dashboard_stats(
    period: Optional[str] = Query("month", description="Период: day, month, year"),
    db: Session = Depends(get_db)
):
    """
    Получение детализированной статистики для дашборда
    """
    # Определяем период
    now = datetime.now()
    if period == "day":
        # Статистика по дням за последние 30 дней
        start_date = now - timedelta(days=30)
        group_by = [
            extract('year', Transaction.transaction_date).label('year'),
            extract('month', Transaction.transaction_date).label('month'),
            extract('day', Transaction.transaction_date).label('day')
        ]
        def date_format(r):
            day_val = int(r.day) if hasattr(r, 'day') and r.day else 0
            month_val = int(r.month) if hasattr(r, 'month') and r.month else 0
            year_val = int(r.year) if hasattr(r, 'year') and r.year else 0
            return f"{day_val:02d}.{month_val:02d}.{year_val}"
    elif period == "month":
        # Статистика по месяцам за последний год
        start_date = now - timedelta(days=365)
        group_by = [
            extract('year', Transaction.transaction_date).label('year'),
            extract('month', Transaction.transaction_date).label('month')
        ]
        def date_format(r):
            month_val = int(r.month) if hasattr(r, 'month') and r.month else 0
            year_val = int(r.year) if hasattr(r, 'year') and r.year else 0
            return f"{month_val:02d}.{year_val}"
    else:  # year
        # Статистика по годам
        start_date = datetime(2020, 1, 1)
        group_by = [extract('year', Transaction.transaction_date).label('year')]
        def date_format(r):
            year_val = int(r.year) if hasattr(r, 'year') and r.year else 0
            return str(year_val)
    
    # Статистика по периодам
    period_stats = db.query(
        *group_by,
        func.count(Transaction.id).label('count'),
        func.sum(Transaction.quantity).label('quantity')
    ).filter(
        Transaction.transaction_date >= start_date
    ).group_by(*group_by).order_by(*group_by).all()
    
    period_data = []
    for stat in period_stats:
        try:
            period_data.append({
                "period": date_format(stat),
                "count": stat.count,
                "quantity": float(stat.quantity) if stat.quantity else 0
            })
        except Exception as e:
            # Пропускаем записи с ошибками форматирования
            continue
    
    # Топ лидеры по количеству
    top_by_quantity = db.query(
        Transaction.card_number,
        Transaction.vehicle,
        func.sum(Transaction.quantity).label('total_quantity'),
        func.count(Transaction.id).label('count')
    ).filter(
        Transaction.transaction_date >= start_date,
        Transaction.card_number.isnot(None)
    ).group_by(
        Transaction.card_number,
        Transaction.vehicle
    ).order_by(
        func.sum(Transaction.quantity).desc()
    ).limit(10).all()
    
    leaders = []
    for leader in top_by_quantity:
        leaders.append({
            "card_number": leader.card_number,
            "vehicle": leader.vehicle or "Не указано",
            "quantity": float(leader.total_quantity) if leader.total_quantity else 0,
            "count": leader.count
        })
    
    # Топ по количеству транзакций
    top_by_count = db.query(
        Transaction.card_number,
        Transaction.vehicle,
        func.count(Transaction.id).label('count'),
        func.sum(Transaction.quantity).label('total_quantity')
    ).filter(
        Transaction.transaction_date >= start_date,
        Transaction.card_number.isnot(None)
    ).group_by(
        Transaction.card_number,
        Transaction.vehicle
    ).order_by(
        func.count(Transaction.id).desc()
    ).limit(10).all()
    
    top_transactions = []
    for top in top_by_count:
        top_transactions.append({
            "card_number": top.card_number,
            "vehicle": top.vehicle or "Не указано",
            "count": top.count,
            "quantity": float(top.total_quantity) if top.total_quantity else 0
        })
    
    # Статистика по товарам
    products = db.query(
        Transaction.product,
        func.sum(Transaction.quantity).label('quantity'),
        func.count(Transaction.id).label('count')
    ).filter(
        Transaction.transaction_date >= start_date,
        Transaction.product.isnot(None)
    ).group_by(Transaction.product).order_by(
        func.sum(Transaction.quantity).desc()
    ).all()
    
    products_stats = []
    for prod in products:
        products_stats.append({
            "product": prod.product,
            "quantity": float(prod.quantity) if prod.quantity else 0,
            "count": prod.count
        })
    
    # Статистика по провайдерам
    providers_stats = db.query(
        Provider.id,
        Provider.name,
        func.sum(Transaction.quantity).label('quantity'),
        func.count(Transaction.id).label('count')
    ).join(
        Transaction, Transaction.provider_id == Provider.id, isouter=False
    ).filter(
        Transaction.transaction_date >= start_date,
        Transaction.provider_id.isnot(None)
    ).group_by(
        Provider.id,
        Provider.name
    ).order_by(
        func.sum(Transaction.quantity).desc()
    ).all()
    
    providers_data = []
    for prov in providers_stats:
        providers_data.append({
            "provider_id": prov.id,
            "provider_name": prov.name,
            "quantity": float(prov.quantity) if prov.quantity else 0,
            "count": prov.count
        })
    
    # Статистика по периодам в разрезе провайдеров
    period_providers_stats = db.query(
        *group_by,
        Provider.id,
        Provider.name,
        func.count(Transaction.id).label('count'),
        func.sum(Transaction.quantity).label('quantity')
    ).join(
        Provider, Transaction.provider_id == Provider.id, isouter=False
    ).filter(
        Transaction.transaction_date >= start_date,
        Transaction.provider_id.isnot(None)
    ).group_by(
        *group_by,
        Provider.id,
        Provider.name
    ).order_by(
        *group_by,
        Provider.name
    ).all()
    
    period_providers_data = {}
    for stat in period_providers_stats:
        try:
            period_key = date_format(stat)
            provider_name = stat.name
            
            if period_key not in period_providers_data:
                period_providers_data[period_key] = {}
            
            if provider_name not in period_providers_data[period_key]:
                period_providers_data[period_key][provider_name] = {
                    "quantity": 0,
                    "count": 0
                }
            
            period_providers_data[period_key][provider_name]["quantity"] += float(stat.quantity) if stat.quantity else 0
            period_providers_data[period_key][provider_name]["count"] += stat.count
        except Exception as e:
            # Пропускаем записи с ошибками форматирования
            continue
    
    logger.debug("Статистика дашборда загружена", extra={"period": period})
    
    return {
        "period": period,
        "period_data": period_data,
        "leaders_by_quantity": leaders,
        "leaders_by_count": top_transactions,
        "products": products_stats,
        "providers": providers_data,
        "period_providers": period_providers_data
    }


@router.get("/errors-warnings")
async def get_errors_warnings_stats(
    db: Session = Depends(get_db)
):
    """
    Получение статистики по ошибкам и предупреждениям
    """
    # Статистика по транспортным средствам
    vehicles_invalid = db.query(func.count(Vehicle.id)).filter(
        Vehicle.is_validated == "invalid"
    ).scalar() or 0
    
    vehicles_pending = db.query(func.count(Vehicle.id)).filter(
        Vehicle.is_validated == "pending"
    ).scalar() or 0
    
    vehicles_valid = db.query(func.count(Vehicle.id)).filter(
        Vehicle.is_validated == "valid"
    ).scalar() or 0
    
    # Транзакции с проблемными транспортными средствами
    # Транзакции, где транспортное средство имеет статус invalid или pending
    transactions_with_errors = db.query(
        func.count(Transaction.id)
    ).join(
        Vehicle, Transaction.vehicle == Vehicle.original_name, isouter=False
    ).filter(
        Vehicle.is_validated.in_(["invalid", "pending"])
    ).scalar() or 0
    
    # Топ транспортных средств с ошибками
    top_vehicles_with_errors = db.query(
        Vehicle.original_name,
        Vehicle.is_validated,
        Vehicle.validation_errors,
        func.count(Transaction.id).label('transaction_count')
    ).join(
        Transaction, Transaction.vehicle == Vehicle.original_name, isouter=True
    ).filter(
        Vehicle.is_validated == "invalid"
    ).group_by(
        Vehicle.id,
        Vehicle.original_name,
        Vehicle.is_validated,
        Vehicle.validation_errors
    ).order_by(
        func.count(Transaction.id).desc()
    ).limit(10).all()
    
    vehicles_errors_list = []
    for veh in top_vehicles_with_errors:
        vehicles_errors_list.append({
            "vehicle": veh.original_name,
            "status": veh.is_validated,
            "errors": veh.validation_errors or "Ошибки валидации",
            "transaction_count": veh.transaction_count
        })
    
    # Топ транспортных средств, требующих проверки
    top_vehicles_pending = db.query(
        Vehicle.original_name,
        Vehicle.is_validated,
        func.count(Transaction.id).label('transaction_count')
    ).join(
        Transaction, Transaction.vehicle == Vehicle.original_name, isouter=True
    ).filter(
        Vehicle.is_validated == "pending"
    ).group_by(
        Vehicle.id,
        Vehicle.original_name,
        Vehicle.is_validated
    ).order_by(
        func.count(Transaction.id).desc()
    ).limit(10).all()
    
    vehicles_pending_list = []
    for veh in top_vehicles_pending:
        vehicles_pending_list.append({
            "vehicle": veh.original_name,
            "status": veh.is_validated,
            "transaction_count": veh.transaction_count
        })
    
    logger.debug("Статистика по ошибкам и предупреждениям загружена")
    
    return {
        "vehicles": {
            "invalid": vehicles_invalid,
            "pending": vehicles_pending,
            "valid": vehicles_valid,
            "total": vehicles_invalid + vehicles_pending + vehicles_valid
        },
        "transactions_with_errors": transactions_with_errors,
        "top_vehicles_with_errors": vehicles_errors_list,
        "top_vehicles_pending": vehicles_pending_list
    }


@router.get("/vehicles")
async def get_vehicles_dashboard(
    db: Session = Depends(get_db)
):
    """
    Получение детальной статистики по транспортным средствам для дашборда
    """
    # Общая статистика
    total_vehicles = db.query(func.count(Vehicle.id)).scalar() or 0
    
    vehicles_invalid = db.query(func.count(Vehicle.id)).filter(
        Vehicle.is_validated == "invalid"
    ).scalar() or 0
    
    vehicles_pending = db.query(func.count(Vehicle.id)).filter(
        Vehicle.is_validated == "pending"
    ).scalar() or 0
    
    vehicles_valid = db.query(func.count(Vehicle.id)).filter(
        Vehicle.is_validated == "valid"
    ).scalar() or 0
    
    # ТС без гаражного номера
    vehicles_without_garage = db.query(func.count(Vehicle.id)).filter(
        (Vehicle.garage_number.is_(None)) | (Vehicle.garage_number == "")
    ).scalar() or 0
    
    # ТС без госномера
    vehicles_without_license = db.query(func.count(Vehicle.id)).filter(
        (Vehicle.license_plate.is_(None)) | (Vehicle.license_plate == "")
    ).scalar() or 0
    
    # ТС без обоих номеров
    vehicles_without_both = db.query(func.count(Vehicle.id)).filter(
        ((Vehicle.garage_number.is_(None)) | (Vehicle.garage_number == "")) &
        ((Vehicle.license_plate.is_(None)) | (Vehicle.license_plate == ""))
    ).scalar() or 0
    
    # ТС с транзакциями
    vehicles_with_transactions = db.query(
        func.count(func.distinct(Transaction.vehicle))
    ).join(
        Vehicle, Transaction.vehicle == Vehicle.original_name, isouter=False
    ).scalar() or 0
    
    # ТС без транзакций
    vehicles_without_transactions = total_vehicles - vehicles_with_transactions
    
    # Топ ТС по количеству транзакций
    top_vehicles_by_transactions = db.query(
        Vehicle.original_name,
        Vehicle.garage_number,
        Vehicle.license_plate,
        Vehicle.is_validated,
        func.count(Transaction.id).label('transaction_count'),
        func.sum(Transaction.quantity).label('total_quantity')
    ).join(
        Transaction, Transaction.vehicle == Vehicle.original_name, isouter=False
    ).group_by(
        Vehicle.id,
        Vehicle.original_name,
        Vehicle.garage_number,
        Vehicle.license_plate,
        Vehicle.is_validated
    ).order_by(
        func.count(Transaction.id).desc()
    ).limit(20).all()
    
    top_vehicles_list = []
    for veh in top_vehicles_by_transactions:
        top_vehicles_list.append({
            "vehicle": veh.original_name,
            "garage_number": veh.garage_number or "—",
            "license_plate": veh.license_plate or "—",
            "status": veh.is_validated,
            "transaction_count": veh.transaction_count,
            "total_quantity": float(veh.total_quantity) if veh.total_quantity else 0
        })
    
    # ТС с предупреждениями (pending) и их детали
    vehicles_pending_details = db.query(
        Vehicle.original_name,
        Vehicle.garage_number,
        Vehicle.license_plate,
        Vehicle.is_validated,
        func.count(Transaction.id).label('transaction_count')
    ).join(
        Transaction, Transaction.vehicle == Vehicle.original_name, isouter=True
    ).filter(
        Vehicle.is_validated == "pending"
    ).group_by(
        Vehicle.id,
        Vehicle.original_name,
        Vehicle.garage_number,
        Vehicle.license_plate,
        Vehicle.is_validated
    ).order_by(
        func.count(Transaction.id).desc()
    ).limit(20).all()
    
    pending_vehicles_list = []
    for veh in vehicles_pending_details:
        pending_vehicles_list.append({
            "vehicle": veh.original_name,
            "garage_number": veh.garage_number or "—",
            "license_plate": veh.license_plate or "—",
            "transaction_count": veh.transaction_count
        })
    
    # ТС с ошибками и их детали
    vehicles_errors_details = db.query(
        Vehicle.original_name,
        Vehicle.garage_number,
        Vehicle.license_plate,
        Vehicle.is_validated,
        Vehicle.validation_errors,
        func.count(Transaction.id).label('transaction_count')
    ).join(
        Transaction, Transaction.vehicle == Vehicle.original_name, isouter=True
    ).filter(
        Vehicle.is_validated == "invalid"
    ).group_by(
        Vehicle.id,
        Vehicle.original_name,
        Vehicle.garage_number,
        Vehicle.license_plate,
        Vehicle.is_validated,
        Vehicle.validation_errors
    ).order_by(
        func.count(Transaction.id).desc()
    ).limit(20).all()
    
    errors_vehicles_list = []
    for veh in vehicles_errors_details:
        errors_vehicles_list.append({
            "vehicle": veh.original_name,
            "garage_number": veh.garage_number or "—",
            "license_plate": veh.license_plate or "—",
            "errors": veh.validation_errors or "Ошибки валидации",
            "transaction_count": veh.transaction_count
        })
    
    logger.debug("Статистика по транспортным средствам загружена")
    
    return {
        "summary": {
            "total": total_vehicles,
            "valid": vehicles_valid,
            "pending": vehicles_pending,
            "invalid": vehicles_invalid,
            "with_transactions": vehicles_with_transactions,
            "without_transactions": vehicles_without_transactions,
            "without_garage": vehicles_without_garage,
            "without_license": vehicles_without_license,
            "without_both": vehicles_without_both
        },
        "top_vehicles_by_transactions": top_vehicles_list,
        "vehicles_pending": pending_vehicles_list,
        "vehicles_errors": errors_vehicles_list
    }
