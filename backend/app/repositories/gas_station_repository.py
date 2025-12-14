"""
Репозиторий для работы с автозаправочными станциями (АЗС)
"""
from sqlalchemy.orm import Session
from typing import Optional, List, Tuple
from app.models import GasStation


class GasStationRepository:
    """
    Репозиторий для работы с АЗС
    Инкапсулирует логику доступа к данным
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_by_id(self, gas_station_id: int) -> Optional[GasStation]:
        """
        Получение АЗС по ID
        """
        return self.db.query(GasStation).filter(GasStation.id == gas_station_id).first()
    
    def get_by_original_name(self, original_name: str, organization_id: Optional[int] = None) -> Optional[GasStation]:
        """
        Получение АЗС по исходному наименованию
        """
        query = self.db.query(GasStation).filter(GasStation.original_name == original_name)
        if organization_id is not None:
            query = query.filter(
                (GasStation.organization_id == organization_id) | (GasStation.organization_id.is_(None))
            )
        return query.first()
    
    def get_all(
        self,
        skip: int = 0,
        limit: int = 100,
        is_validated: Optional[str] = None,
        organization_id: Optional[int] = None,
        organization_ids: Optional[List[int]] = None
    ) -> tuple[List[GasStation], int]:
        """
        Получение списка АЗС с фильтрацией
        
        Args:
            organization_id: Фильтр по одной организации
            organization_ids: Фильтр по списку организаций (приоритет над organization_id)
        
        Returns:
            tuple: (список АЗС, общее количество)
        """
        query = self.db.query(GasStation)
        
        if is_validated:
            query = query.filter(GasStation.is_validated == is_validated)
        
        # Фильтрация по организациям
        if organization_ids is not None:
            query = query.filter(
                (GasStation.organization_id.in_(organization_ids)) | (GasStation.organization_id.is_(None))
            )
        elif organization_id is not None:
            query = query.filter(
                (GasStation.organization_id == organization_id) | (GasStation.organization_id.is_(None))
            )
        
        total = query.count()
        gas_stations = query.order_by(GasStation.created_at.desc()).offset(skip).limit(limit).all()
        
        return gas_stations, total
    
    def create(
        self,
        original_name: str,
        azs_number: Optional[str] = None,
        location: Optional[str] = None,
        region: Optional[str] = None,
        settlement: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        organization_id: Optional[int] = None
    ) -> GasStation:
        """
        Создание новой АЗС
        """
        gas_station = GasStation(
            original_name=original_name,
            azs_number=azs_number,
            location=location,
            region=region,
            settlement=settlement,
            latitude=latitude,
            longitude=longitude,
            organization_id=organization_id
        )
        self.db.add(gas_station)
        self.db.commit()
        self.db.refresh(gas_station)
        return gas_station
    
    def update(
        self,
        gas_station_id: int,
        original_name: Optional[str] = None,
        azs_number: Optional[str] = None,
        location: Optional[str] = None,
        region: Optional[str] = None,
        settlement: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        is_validated: Optional[str] = None,
        validation_errors: Optional[str] = None
    ) -> Optional[GasStation]:
        """
        Обновление данных АЗС
        
        Returns:
            GasStation: обновленная АЗС или None если не найдено
        """
        gas_station = self.get_by_id(gas_station_id)
        if not gas_station:
            return None
        
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
        if latitude is not None:
            gas_station.latitude = latitude
        if longitude is not None:
            gas_station.longitude = longitude
        if is_validated is not None:
            gas_station.is_validated = is_validated
        if validation_errors is not None:
            gas_station.validation_errors = validation_errors
        
        self.db.commit()
        self.db.refresh(gas_station)
        return gas_station
    
    def get_by_ids(self, gas_station_ids: List[int]) -> List[GasStation]:
        """
        Получение списка АЗС по списку ID
        """
        if not gas_station_ids:
            return []
        
        return self.db.query(GasStation).filter(GasStation.id.in_(gas_station_ids)).all()

