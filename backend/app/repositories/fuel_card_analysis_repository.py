"""
Репозиторий для работы с результатами анализа топливных карт
"""
from sqlalchemy.orm import Session
from typing import Optional, List, Tuple
from datetime import datetime
from app.models import FuelCardAnalysisResult


class FuelCardAnalysisRepository:
    """
    Репозиторий для работы с результатами анализа
    Инкапсулирует логику доступа к данным
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_by_id(self, result_id: int) -> Optional[FuelCardAnalysisResult]:
        """
        Получение результата анализа по ID
        """
        return self.db.query(FuelCardAnalysisResult).filter(
            FuelCardAnalysisResult.id == result_id
        ).first()
    
    def get_by_transaction_id(self, transaction_id: int) -> Optional[FuelCardAnalysisResult]:
        """
        Получение результата анализа по ID транзакции
        """
        return self.db.query(FuelCardAnalysisResult).filter(
            FuelCardAnalysisResult.transaction_id == transaction_id
        ).first()
    
    def get_all(
        self,
        skip: int = 0,
        limit: int = 100,
        transaction_id: Optional[int] = None,
        card_id: Optional[int] = None,
        vehicle_id: Optional[int] = None,
        match_status: Optional[str] = None,
        is_anomaly: Optional[bool] = None,
        anomaly_type: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None
    ) -> Tuple[List[FuelCardAnalysisResult], int]:
        """
        Получение списка результатов анализа с фильтрацией
        
        Returns:
            tuple: (список результатов, общее количество)
        """
        query = self.db.query(FuelCardAnalysisResult)
        
        if transaction_id is not None:
            query = query.filter(FuelCardAnalysisResult.transaction_id == transaction_id)
        if card_id is not None:
            query = query.filter(FuelCardAnalysisResult.fuel_card_id == card_id)
        if vehicle_id is not None:
            query = query.filter(FuelCardAnalysisResult.vehicle_id == vehicle_id)
        if match_status:
            query = query.filter(FuelCardAnalysisResult.match_status == match_status)
        if is_anomaly is not None:
            query = query.filter(FuelCardAnalysisResult.is_anomaly == is_anomaly)
        if anomaly_type:
            query = query.filter(FuelCardAnalysisResult.anomaly_type == anomaly_type)
        if date_from is not None:
            query = query.filter(FuelCardAnalysisResult.analysis_date >= date_from)
        if date_to is not None:
            query = query.filter(FuelCardAnalysisResult.analysis_date <= date_to)
        
        total = query.count()
        items = query.order_by(
            FuelCardAnalysisResult.analysis_date.desc()
        ).offset(skip).limit(limit).all()
        
        return items, total
    
    def create(self, **kwargs) -> FuelCardAnalysisResult:
        """
        Создание нового результата анализа
        """
        result = FuelCardAnalysisResult(**kwargs)
        self.db.add(result)
        self.db.commit()
        self.db.refresh(result)
        return result
    
    def update(self, result_id: int, **kwargs) -> Optional[FuelCardAnalysisResult]:
        """
        Обновление результата анализа
        """
        result = self.get_by_id(result_id)
        if not result:
            return None
        
        for key, value in kwargs.items():
            if hasattr(result, key):
                setattr(result, key, value)
        
        self.db.commit()
        self.db.refresh(result)
        return result
    
    def get_anomaly_stats(
        self,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        anomaly_type: Optional[str] = None
    ) -> dict:
        """
        Получение статистики по аномалиям
        """
        query = self.db.query(FuelCardAnalysisResult).filter(
            FuelCardAnalysisResult.is_anomaly == True
        )
        
        if date_from is not None:
            query = query.filter(FuelCardAnalysisResult.analysis_date >= date_from)
        if date_to is not None:
            query = query.filter(FuelCardAnalysisResult.analysis_date <= date_to)
        if anomaly_type:
            query = query.filter(FuelCardAnalysisResult.anomaly_type == anomaly_type)
        
        results = query.all()
        
        # Формируем статистику
        by_type = {}
        by_status = {}
        
        for result in results:
            if result.anomaly_type:
                by_type[result.anomaly_type] = by_type.get(result.anomaly_type, 0) + 1
            by_status[result.match_status] = by_status.get(result.match_status, 0) + 1
        
        return {
            "total_anomalies": len(results),
            "by_type": by_type,
            "by_status": by_status
        }
