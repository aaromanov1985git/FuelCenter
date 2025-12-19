"""
Роутер для анализа топливных карт
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timedelta
from decimal import Decimal

from app.database import get_db
from app.logger import logger
from app.models import User, FuelCardAnalysisResult, VehicleRefuel, VehicleLocation
from app.schemas import (
    FuelCardAnalysisResultResponse,
    FuelCardAnalysisResultListResponse,
    AnalyzePeriodRequest,
    AnalyzePeriodResponse,
    AnomalyStatsResponse,
    VehicleRefuelCreate,
    VehicleRefuelResponse,
    VehicleLocationCreate,
    VehicleLocationResponse,
    BulkRefuelsUploadRequest,
    BulkLocationsUploadRequest,
    BulkUploadResponse
)
from app.services.fuel_card_analysis_service import FuelCardAnalysisService
from app.repositories import (
    VehicleRefuelRepository,
    VehicleLocationRepository
)
from app.auth import require_auth_if_enabled

router = APIRouter(prefix="/api/v1/fuel-card-analysis", tags=["fuel-card-analysis"])


@router.post("/analyze-transaction/{transaction_id}", response_model=FuelCardAnalysisResultResponse)
async def analyze_transaction(
    transaction_id: int,
    time_window_minutes: Optional[int] = Query(None, description="Временное окно в минутах (по умолчанию 30)"),
    quantity_tolerance_percent: Optional[float] = Query(None, description="Допустимое отклонение количества в % (по умолчанию 5)"),
    azs_radius_meters: Optional[int] = Query(None, description="Радиус АЗС в метрах (по умолчанию 500)"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Анализирует конкретную транзакцию и возвращает результат анализа
    """
    try:
        service = FuelCardAnalysisService(db)
        result = service.analyze_transaction(
            transaction_id,
            time_window_minutes,
            quantity_tolerance_percent,
            azs_radius_meters
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Ошибка при анализе транзакции {transaction_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при анализе транзакции: {str(e)}")


@router.post("/analyze-card/{card_id}", response_model=List[FuelCardAnalysisResultResponse])
async def analyze_card(
    card_id: int,
    date_from: Optional[datetime] = Query(None, description="Начальная дата (по умолчанию - месяц назад)"),
    date_to: Optional[datetime] = Query(None, description="Конечная дата (по умолчанию - сейчас)"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Анализирует все транзакции по указанной карте за период
    """
    try:
        service = FuelCardAnalysisService(db)
        results = service.analyze_card(card_id, date_from, date_to)
        return results
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Ошибка при анализе карты {card_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при анализе карты: {str(e)}")


@router.post("/analyze-period", response_model=AnalyzePeriodResponse)
async def analyze_period(
    request: AnalyzePeriodRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Массовый анализ транзакций за период с фильтрацией
    """
    try:
        service = FuelCardAnalysisService(db)
        result = service.analyze_period(
            request.date_from,
            request.date_to,
            request.card_ids,
            request.vehicle_ids,
            request.organization_ids
        )
        return result
    except Exception as e:
        logger.error(f"Ошибка при массовом анализе: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при массовом анализе: {str(e)}")


@router.get("/results", response_model=FuelCardAnalysisResultListResponse)
async def get_analysis_results(
    transaction_id: Optional[int] = Query(None, description="ID транзакции"),
    card_id: Optional[int] = Query(None, description="ID карты"),
    vehicle_id: Optional[int] = Query(None, description="ID ТС"),
    match_status: Optional[str] = Query(None, description="Статус соответствия"),
    is_anomaly: Optional[bool] = Query(None, description="Флаг аномалии"),
    date_from: Optional[datetime] = Query(None, description="Начальная дата"),
    date_to: Optional[datetime] = Query(None, description="Конечная дата"),
    skip: int = Query(0, ge=0, description="Количество пропущенных записей"),
    limit: int = Query(100, ge=1, le=1000, description="Количество записей"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Получение сохраненных результатов анализа с фильтрацией
    """
    try:
        query = db.query(FuelCardAnalysisResult)
        
        # Применяем фильтры
        if transaction_id:
            query = query.filter(FuelCardAnalysisResult.transaction_id == transaction_id)
        if card_id:
            query = query.filter(FuelCardAnalysisResult.fuel_card_id == card_id)
        if vehicle_id:
            query = query.filter(FuelCardAnalysisResult.vehicle_id == vehicle_id)
        if match_status:
            query = query.filter(FuelCardAnalysisResult.match_status == match_status)
        if is_anomaly is not None:
            query = query.filter(FuelCardAnalysisResult.is_anomaly == is_anomaly)
        if date_from:
            query = query.filter(FuelCardAnalysisResult.analysis_date >= date_from)
        if date_to:
            query = query.filter(FuelCardAnalysisResult.analysis_date <= date_to)
        
        # Получаем общее количество
        total = query.count()
        
        # Получаем записи с пагинацией
        items = query.order_by(
            FuelCardAnalysisResult.analysis_date.desc()
        ).offset(skip).limit(limit).all()
        
        return {
            "total": total,
            "items": items
        }
    except Exception as e:
        logger.error(f"Ошибка при получении результатов анализа: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при получении результатов: {str(e)}")


@router.get("/anomalies/stats", response_model=AnomalyStatsResponse)
async def get_anomaly_stats(
    date_from: Optional[datetime] = Query(None, description="Начальная дата"),
    date_to: Optional[datetime] = Query(None, description="Конечная дата"),
    organization_id: Optional[int] = Query(None, description="ID организации"),
    anomaly_type: Optional[str] = Query(None, description="Тип аномалии"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Получение статистики по аномалиям
    """
    try:
        from app.repositories import FuelCardAnalysisRepository
        
        repo = FuelCardAnalysisRepository(db)
        stats = repo.get_anomaly_stats(date_from, date_to, anomaly_type)
        
        # Если указана организация, фильтруем по транзакциям
        if organization_id:
            from app.models import Transaction
            transaction_ids = db.query(Transaction.id).filter(
                Transaction.organization_id == organization_id
            ).subquery()
            results = db.query(FuelCardAnalysisResult).filter(
                FuelCardAnalysisResult.is_anomaly == True,
                FuelCardAnalysisResult.transaction_id.in_(
                    db.query(transaction_ids.c.id)
                )
            )
            if date_from:
                results = results.filter(FuelCardAnalysisResult.analysis_date >= date_from)
            if date_to:
                results = results.filter(FuelCardAnalysisResult.analysis_date <= date_to)
            if anomaly_type:
                results = results.filter(FuelCardAnalysisResult.anomaly_type == anomaly_type)
            
            results = results.all()
            
            # Пересчитываем статистику
            by_type = {}
            by_status = {}
            for result in results:
                if result.anomaly_type:
                    by_type[result.anomaly_type] = by_type.get(result.anomaly_type, 0) + 1
                by_status[result.match_status] = by_status.get(result.match_status, 0) + 1
            
            stats = {
                "total_anomalies": len(results),
                "by_type": by_type,
                "by_status": by_status
            }
        
        return {
            "total_anomalies": stats["total_anomalies"],
            "by_type": stats["by_type"],
            "by_status": stats["by_status"],
            "date_from": date_from,
            "date_to": date_to
        }
    except Exception as e:
        logger.error(f"Ошибка при получении статистики по аномалиям: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при получении статистики: {str(e)}")


@router.post("/refuels/upload", response_model=BulkUploadResponse)
async def upload_refuels(
    request: BulkRefuelsUploadRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Загрузка данных о заправках ТС
    """
    try:
        repo = VehicleRefuelRepository(db)
        refuels_data = [refuel_data.model_dump() for refuel_data in request.refuels]
        created_refuels = repo.bulk_create(refuels_data)
        
        return {
            "created": len(created_refuels),
            "errors": []
        }
    except Exception as e:
        logger.error(f"Ошибка при массовой загрузке заправок: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при сохранении заправок: {str(e)}")


@router.post("/locations/upload", response_model=BulkUploadResponse)
async def upload_locations(
    request: BulkLocationsUploadRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Загрузка данных о местоположениях ТС
    """
    try:
        repo = VehicleLocationRepository(db)
        locations_data = [location_data.model_dump() for location_data in request.locations]
        created_locations = repo.bulk_create(locations_data)
        
        return {
            "created": len(created_locations),
            "errors": []
        }
    except Exception as e:
        logger.error(f"Ошибка при массовой загрузке местоположений: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при сохранении местоположений: {str(e)}")
