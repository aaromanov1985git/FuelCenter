"""
Репозиторий для работы с автозаправочными станциями (АЗС)
"""
from sqlalchemy.orm import Session
from typing import Optional, List, Tuple
from sqlalchemy import or_
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
        provider_id: Optional[int] = None,
        search: Optional[str] = None,
        organization_id: Optional[int] = None,
        organization_ids: Optional[List[int]] = None,
        sort_by: Optional[str] = None,
        sort_order: Optional[str] = 'asc'
    ) -> tuple[List[GasStation], int]:
        """
        Получение списка АЗС с фильтрацией и сортировкой
        
        Args:
            provider_id: Фильтр по провайдеру
            search: Поиск по названию, номеру АЗС, местоположению, региону, населенному пункту
            organization_id: Фильтр по одной организации
            organization_ids: Фильтр по списку организаций (приоритет над organization_id)
            sort_by: Поле для сортировки (original_name, name, azs_number, location, region, settlement, is_validated, created_at)
            sort_order: Направление сортировки (asc, desc)
        
        Returns:
            tuple: (список АЗС, общее количество)
        """
        query = self.db.query(GasStation)
        
        if is_validated:
            query = query.filter(GasStation.is_validated == is_validated)
        
        # Фильтрация по провайдеру
        if provider_id is not None:
            query = query.filter(GasStation.provider_id == provider_id)
        
        # Поиск
        if search and search.strip():
            search_term = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    GasStation.original_name.ilike(search_term),
                    GasStation.name.ilike(search_term),
                    GasStation.azs_number.ilike(search_term),
                    GasStation.location.ilike(search_term),
                    GasStation.region.ilike(search_term),
                    GasStation.settlement.ilike(search_term)
                )
            )
        
        # Фильтрация по организациям
        if organization_ids is not None:
            query = query.filter(
                (GasStation.organization_id.in_(organization_ids)) | (GasStation.organization_id.is_(None))
            )
        elif organization_id is not None:
            query = query.filter(
                (GasStation.organization_id == organization_id) | (GasStation.organization_id.is_(None))
            )
        
        # Сортировка
        valid_sort_fields = {
            'original_name': GasStation.original_name,
            'name': GasStation.name,
            'azs_number': GasStation.azs_number,
            'location': GasStation.location,
            'region': GasStation.region,
            'settlement': GasStation.settlement,
            'is_validated': GasStation.is_validated,
            'created_at': GasStation.created_at
        }
        
        if sort_by and sort_by in valid_sort_fields:
            sort_column = valid_sort_fields[sort_by]
            if sort_order and sort_order.lower() == 'desc':
                query = query.order_by(sort_column.desc())
            else:
                query = query.order_by(sort_column.asc())
        else:
            # Сортировка по умолчанию
            query = query.order_by(GasStation.created_at.desc())
        
        total = query.count()
        gas_stations = query.offset(skip).limit(limit).all()
        
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
    
    def delete(self, gas_station_id: int) -> bool:
        """
        Удаление АЗС по ID
        
        Returns:
            bool: True если удалено, False если не найдено
        """
        gas_station = self.get_by_id(gas_station_id)
        if not gas_station:
            return False
        
        self.db.delete(gas_station)
        self.db.commit()
        return True

