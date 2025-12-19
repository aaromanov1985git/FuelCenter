"""
Репозиторий для работы с местоположениями ТС
"""
from sqlalchemy.orm import Session
from typing import Optional, List, Tuple
from datetime import datetime
from sqlalchemy import func
from app.models import VehicleLocation


class VehicleLocationRepository:
    """
    Репозиторий для работы с местоположениями ТС
    Инкапсулирует логику доступа к данным
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_by_id(self, location_id: int) -> Optional[VehicleLocation]:
        """
        Получение местоположения по ID
        """
        return self.db.query(VehicleLocation).filter(VehicleLocation.id == location_id).first()
    
    def get_nearest_to_time(
        self,
        vehicle_id: int,
        target_time: datetime,
        time_window_seconds: int = 300
    ) -> Optional[VehicleLocation]:
        """
        Получение ближайшего местоположения ТС к указанному времени
        
        Args:
            vehicle_id: ID транспортного средства
            target_time: Целевое время
            time_window_seconds: Окно поиска в секундах
        
        Returns:
            VehicleLocation или None
        """
        from datetime import timedelta
        
        time_from = target_time - timedelta(seconds=time_window_seconds)
        time_to = target_time + timedelta(seconds=time_window_seconds)
        
        location = self.db.query(VehicleLocation).filter(
            VehicleLocation.vehicle_id == vehicle_id,
            VehicleLocation.timestamp >= time_from,
            VehicleLocation.timestamp <= time_to
        ).order_by(
            func.abs(
                func.extract('epoch', VehicleLocation.timestamp - target_time)
            )
        ).first()
        
        return location
    
    def get_by_vehicle_and_date_range(
        self,
        vehicle_id: int,
        date_from: datetime,
        date_to: datetime
    ) -> List[VehicleLocation]:
        """
        Получение местоположений ТС за период
        """
        return self.db.query(VehicleLocation).filter(
            VehicleLocation.vehicle_id == vehicle_id,
            VehicleLocation.timestamp >= date_from,
            VehicleLocation.timestamp <= date_to
        ).order_by(VehicleLocation.timestamp.desc()).all()
    
    def get_all(
        self,
        skip: int = 0,
        limit: int = 100,
        vehicle_id: Optional[int] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        source: Optional[str] = None
    ) -> Tuple[List[VehicleLocation], int]:
        """
        Получение списка местоположений с фильтрацией
        
        Returns:
            tuple: (список местоположений, общее количество)
        """
        query = self.db.query(VehicleLocation)
        
        if vehicle_id is not None:
            query = query.filter(VehicleLocation.vehicle_id == vehicle_id)
        if date_from is not None:
            query = query.filter(VehicleLocation.timestamp >= date_from)
        if date_to is not None:
            query = query.filter(VehicleLocation.timestamp <= date_to)
        if source:
            query = query.filter(VehicleLocation.source == source)
        
        total = query.count()
        items = query.order_by(VehicleLocation.timestamp.desc()).offset(skip).limit(limit).all()
        
        return items, total
    
    def create(self, **kwargs) -> VehicleLocation:
        """
        Создание нового местоположения
        """
        location = VehicleLocation(**kwargs)
        self.db.add(location)
        self.db.commit()
        self.db.refresh(location)
        return location
    
    def bulk_create(self, locations: List[dict]) -> List[VehicleLocation]:
        """
        Массовое создание местоположений
        """
        created = []
        for location_data in locations:
            location = VehicleLocation(**location_data)
            self.db.add(location)
            created.append(location)
        
        self.db.commit()
        for location in created:
            self.db.refresh(location)
        
        return created
