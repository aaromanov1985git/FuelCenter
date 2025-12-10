"""
Сервис для работы с автозаправочными станциями (АЗС)
Содержит бизнес-логику для работы с АЗС
"""
from sqlalchemy.orm import Session
from typing import Optional, List, Tuple
from app.repositories.gas_station_repository import GasStationRepository
from app.models import GasStation, Transaction
from app.validators import validate_gas_station_data
from app.logger import logger


class GasStationService:
    """
    Сервис для работы с АЗС
    Содержит бизнес-логику поверх репозитория
    """
    
    def __init__(self, db: Session):
        self.gas_station_repo = GasStationRepository(db)
        self.db = db
    
    def get_gas_station(self, gas_station_id: int) -> Optional[GasStation]:
        """
        Получение АЗС по ID
        """
        return self.gas_station_repo.get_by_id(gas_station_id)
    
    def get_gas_stations(
        self,
        skip: int = 0,
        limit: int = 100,
        is_validated: Optional[str] = None
    ) -> Tuple[List[GasStation], int]:
        """
        Получение списка АЗС с фильтрацией
        
        Returns:
            tuple: (список АЗС, общее количество)
        """
        return self.gas_station_repo.get_all(
            skip=skip,
            limit=limit,
            is_validated=is_validated
        )
    
    def update_gas_station(
        self,
        gas_station_id: int,
        original_name: Optional[str] = None,
        azs_number: Optional[str] = None,
        location: Optional[str] = None,
        region: Optional[str] = None,
        settlement: Optional[str] = None,
        is_validated: Optional[str] = None
    ) -> Optional[GasStation]:
        """
        Обновление данных АЗС с валидацией
        
        Returns:
            GasStation: обновленная АЗС или None если не найдено
        """
        gas_station = self.gas_station_repo.get_by_id(gas_station_id)
        if not gas_station:
            return None
        
        # Обновляем поля
        if original_name is not None:
            gas_station.original_name = original_name
        if azs_number is not None:
            gas_station.azs_number = azs_number
        if location is not None:
            gas_station.location = location
        if region is not None:
            gas_station.region = region
        if settlement is not None:
            gas_station.settlement = settlement
        if is_validated is not None:
            gas_station.is_validated = is_validated
        
        # Валидация при обновлении
        validation_result = validate_gas_station_data(
            azs_number=gas_station.azs_number,
            location=gas_station.location,
            region=gas_station.region,
            settlement=gas_station.settlement
        )
        
        if validation_result["errors"]:
            gas_station.is_validated = "invalid"
            gas_station.validation_errors = "; ".join(validation_result["errors"])
        elif validation_result["warnings"]:
            gas_station.is_validated = "pending"
            gas_station.validation_errors = None
        else:
            gas_station.is_validated = "valid"
            gas_station.validation_errors = None
        
        self.db.commit()
        self.db.refresh(gas_station)
        
        logger.info("АЗС обновлена", extra={"gas_station_id": gas_station_id})
        
        return gas_station
    
    def get_stats_summary(self) -> dict:
        """
        Получение статистики по АЗС
        
        Returns:
            dict: статистика по статусам валидации
        """
        total = self.db.query(GasStation).count()
        valid = self.db.query(GasStation).filter(GasStation.is_validated == "valid").count()
        invalid = self.db.query(GasStation).filter(GasStation.is_validated == "invalid").count()
        pending = self.db.query(GasStation).filter(GasStation.is_validated == "pending").count()
        
        return {
            "total": total,
            "valid": valid,
            "invalid": invalid,
            "pending": pending
        }

