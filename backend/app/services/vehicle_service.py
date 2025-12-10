"""
Сервис для работы с транспортными средствами
Содержит бизнес-логику для работы с ТС
"""
from sqlalchemy.orm import Session
from typing import Optional, List, Tuple
from app.repositories.vehicle_repository import VehicleRepository
from app.models import Vehicle
from app.validators import validate_vehicle_data
from app.logger import logger


class VehicleService:
    """
    Сервис для работы с транспортными средствами
    Содержит бизнес-логику поверх репозитория
    """
    
    def __init__(self, db: Session):
        self.vehicle_repo = VehicleRepository(db)
        self.db = db
    
    def get_vehicle(self, vehicle_id: int) -> Optional[Vehicle]:
        """
        Получение ТС по ID
        """
        return self.vehicle_repo.get_by_id(vehicle_id)
    
    def get_vehicles(
        self,
        skip: int = 0,
        limit: int = 100,
        is_validated: Optional[str] = None
    ) -> Tuple[List[Vehicle], int]:
        """
        Получение списка ТС с фильтрацией
        
        Returns:
            tuple: (список ТС, общее количество)
        """
        return self.vehicle_repo.get_all(
            skip=skip,
            limit=limit,
            is_validated=is_validated
        )
    
    def update_vehicle(
        self,
        vehicle_id: int,
        garage_number: Optional[str] = None,
        license_plate: Optional[str] = None,
        is_validated: Optional[str] = None
    ) -> Optional[Vehicle]:
        """
        Обновление данных ТС с валидацией
        
        Returns:
            Vehicle: обновленное ТС или None если не найдено
        """
        vehicle = self.vehicle_repo.get_by_id(vehicle_id)
        if not vehicle:
            return None
        
        # Обновляем поля
        if garage_number is not None:
            vehicle.garage_number = garage_number
        if license_plate is not None:
            vehicle.license_plate = license_plate
        if is_validated is not None:
            vehicle.is_validated = is_validated
        
        # Валидация при обновлении
        validation_result = validate_vehicle_data(vehicle.garage_number, vehicle.license_plate)
        
        if validation_result["errors"]:
            vehicle.is_validated = "invalid"
            vehicle.validation_errors = "; ".join(validation_result["errors"])
        elif validation_result["warnings"]:
            vehicle.is_validated = "pending"
            vehicle.validation_errors = None
        else:
            vehicle.is_validated = "valid"
            vehicle.validation_errors = None
        
        self.db.commit()
        self.db.refresh(vehicle)
        
        logger.info("ТС обновлено", extra={"vehicle_id": vehicle_id})
        
        return vehicle
    
    def merge_vehicles(
        self,
        source_vehicle_id: int,
        target_vehicle_id: int
    ) -> Optional[Vehicle]:
        """
        Слияние двух транспортных средств
        
        Все транзакции и связи с source_vehicle_id переносятся на target_vehicle_id,
        после чего source_vehicle удаляется
        
        Args:
            source_vehicle_id: ID ТС, которое будет удалено (источник)
            target_vehicle_id: ID ТС, которое останется (цель)
        
        Returns:
            Vehicle: обновленное целевое ТС или None если не найдено
        """
        from app.models import Transaction, FuelCard
        
        source_vehicle = self.vehicle_repo.get_by_id(source_vehicle_id)
        target_vehicle = self.vehicle_repo.get_by_id(target_vehicle_id)
        
        if not source_vehicle or not target_vehicle:
            return None
        
        if source_vehicle_id == target_vehicle_id:
            return target_vehicle
        
        # Обновляем все транзакции, связанные с source_vehicle
        transactions_updated = self.db.query(Transaction).filter(
            Transaction.vehicle_id == source_vehicle_id
        ).update({"vehicle_id": target_vehicle_id})
        
        # Обновляем все карты, связанные с source_vehicle
        cards_updated = self.db.query(FuelCard).filter(
            FuelCard.vehicle_id == source_vehicle_id
        ).update({"vehicle_id": target_vehicle_id})
        
        # Обновляем данные target_vehicle, если в source_vehicle есть более полная информация
        updated = False
        if not target_vehicle.garage_number and source_vehicle.garage_number:
            target_vehicle.garage_number = source_vehicle.garage_number
            updated = True
        if not target_vehicle.license_plate and source_vehicle.license_plate:
            target_vehicle.license_plate = source_vehicle.license_plate
            updated = True
        
        # Удаляем source_vehicle
        self.db.delete(source_vehicle)
        self.db.commit()
        self.db.refresh(target_vehicle)
        
        logger.info(
            "ТС объединены",
            extra={
                "source_vehicle_id": source_vehicle_id,
                "target_vehicle_id": target_vehicle_id,
                "transactions_updated": transactions_updated,
                "cards_updated": cards_updated
            }
        )
        
        return target_vehicle
