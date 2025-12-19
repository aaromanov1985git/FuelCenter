"""
Репозиторий для работы с заправками ТС
"""
from sqlalchemy.orm import Session
from typing import Optional, List, Tuple
from datetime import datetime
from app.models import VehicleRefuel


class VehicleRefuelRepository:
    """
    Репозиторий для работы с заправками ТС
    Инкапсулирует логику доступа к данным
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_by_id(self, refuel_id: int) -> Optional[VehicleRefuel]:
        """
        Получение заправки по ID
        """
        return self.db.query(VehicleRefuel).filter(VehicleRefuel.id == refuel_id).first()
    
    def get_by_vehicle_and_date_range(
        self,
        vehicle_id: int,
        date_from: datetime,
        date_to: datetime
    ) -> List[VehicleRefuel]:
        """
        Получение заправок ТС за период
        """
        return self.db.query(VehicleRefuel).filter(
            VehicleRefuel.vehicle_id == vehicle_id,
            VehicleRefuel.refuel_date >= date_from,
            VehicleRefuel.refuel_date <= date_to
        ).order_by(VehicleRefuel.refuel_date.desc()).all()
    
    def get_all(
        self,
        skip: int = 0,
        limit: int = 100,
        vehicle_id: Optional[int] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        source_system: Optional[str] = None
    ) -> Tuple[List[VehicleRefuel], int]:
        """
        Получение списка заправок с фильтрацией
        
        Returns:
            tuple: (список заправок, общее количество)
        """
        query = self.db.query(VehicleRefuel)
        
        if vehicle_id is not None:
            query = query.filter(VehicleRefuel.vehicle_id == vehicle_id)
        if date_from is not None:
            query = query.filter(VehicleRefuel.refuel_date >= date_from)
        if date_to is not None:
            query = query.filter(VehicleRefuel.refuel_date <= date_to)
        if source_system:
            query = query.filter(VehicleRefuel.source_system == source_system)
        
        total = query.count()
        items = query.order_by(VehicleRefuel.refuel_date.desc()).offset(skip).limit(limit).all()
        
        return items, total
    
    def create(self, **kwargs) -> VehicleRefuel:
        """
        Создание новой заправки
        """
        refuel = VehicleRefuel(**kwargs)
        self.db.add(refuel)
        self.db.commit()
        self.db.refresh(refuel)
        return refuel
    
    def bulk_create(self, refuels: List[dict]) -> List[VehicleRefuel]:
        """
        Массовое создание заправок
        """
        created = []
        for refuel_data in refuels:
            refuel = VehicleRefuel(**refuel_data)
            self.db.add(refuel)
            created.append(refuel)
        
        self.db.commit()
        for refuel in created:
            self.db.refresh(refuel)
        
        return created
