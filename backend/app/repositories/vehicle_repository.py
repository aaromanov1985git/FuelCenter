"""
Репозиторий для работы с транспортными средствами
"""
from sqlalchemy.orm import Session
from typing import Optional, List, Tuple
from app.models import Vehicle


class VehicleRepository:
    """
    Репозиторий для работы с транспортными средствами
    Инкапсулирует логику доступа к данным
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_by_id(self, vehicle_id: int) -> Optional[Vehicle]:
        """
        Получение ТС по ID
        """
        return self.db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    
    def get_all(
        self,
        skip: int = 0,
        limit: int = 100,
        is_validated: Optional[str] = None
    ) -> tuple[List[Vehicle], int]:
        """
        Получение списка ТС с фильтрацией
        
        Returns:
            tuple: (список ТС, общее количество)
        """
        query = self.db.query(Vehicle)
        
        if is_validated:
            query = query.filter(Vehicle.is_validated == is_validated)
        
        total = query.count()
        vehicles = query.order_by(Vehicle.created_at.desc()).offset(skip).limit(limit).all()
        
        return vehicles, total
    
    def update(
        self,
        vehicle_id: int,
        garage_number: Optional[str] = None,
        license_plate: Optional[str] = None,
        is_validated: Optional[str] = None
    ) -> Optional[Vehicle]:
        """
        Обновление данных ТС
        
        Returns:
            Vehicle: обновленное ТС или None если не найдено
        """
        vehicle = self.get_by_id(vehicle_id)
        if not vehicle:
            return None
        
        if garage_number is not None:
            vehicle.garage_number = garage_number
        if license_plate is not None:
            vehicle.license_plate = license_plate
        if is_validated is not None:
            vehicle.is_validated = is_validated
        
        self.db.commit()
        self.db.refresh(vehicle)
        return vehicle
    
    def get_by_ids(self, vehicle_ids: List[int]) -> List[Vehicle]:
        """
        Получение списка ТС по списку ID
        """
        if not vehicle_ids:
            return []
        
        return self.db.query(Vehicle).filter(Vehicle.id.in_(vehicle_ids)).all()
