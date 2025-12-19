"""
Репозиторий для работы с видами топлива
"""
from sqlalchemy.orm import Session
from typing import Optional, List, Tuple
from app.models import FuelType


class FuelTypeRepository:
    """
    Репозиторий для работы с видами топлива
    Инкапсулирует логику доступа к данным
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_by_id(self, fuel_type_id: int) -> Optional[FuelType]:
        """
        Получение вида топлива по ID
        """
        return self.db.query(FuelType).filter(FuelType.id == fuel_type_id).first()
    
    def get_by_original_name(self, original_name: str) -> Optional[FuelType]:
        """
        Получение вида топлива по исходному наименованию
        """
        return self.db.query(FuelType).filter(FuelType.original_name == original_name).first()
    
    def get_all(
        self,
        skip: int = 0,
        limit: int = 100,
        is_validated: Optional[str] = None
    ) -> Tuple[List[FuelType], int]:
        """
        Получение списка видов топлива с фильтрацией
        
        Returns:
            tuple: (список видов топлива, общее количество)
        """
        query = self.db.query(FuelType)
        
        # Фильтр по статусу валидации
        if is_validated:
            query = query.filter(FuelType.is_validated == is_validated)
        
        # Подсчет общего количества
        total = query.count()
        
        # Применяем пагинацию и сортировку
        items = query.order_by(FuelType.original_name).offset(skip).limit(limit).all()
        
        return items, total
    
    def create(
        self,
        original_name: str,
        normalized_name: Optional[str] = None
    ) -> FuelType:
        """
        Создание нового вида топлива
        """
        if normalized_name is None:
            normalized_name = original_name
        
        fuel_type = FuelType(
            original_name=original_name,
            normalized_name=normalized_name
        )
        self.db.add(fuel_type)
        self.db.flush()
        return fuel_type
    
    def update(
        self,
        fuel_type_id: int,
        original_name: Optional[str] = None,
        normalized_name: Optional[str] = None,
        is_validated: Optional[str] = None,
        validation_errors: Optional[str] = None
    ) -> Optional[FuelType]:
        """
        Обновление вида топлива
        """
        fuel_type = self.get_by_id(fuel_type_id)
        if not fuel_type:
            return None
        
        if original_name is not None:
            fuel_type.original_name = original_name
        if normalized_name is not None:
            fuel_type.normalized_name = normalized_name
        if is_validated is not None:
            fuel_type.is_validated = is_validated
        if validation_errors is not None:
            fuel_type.validation_errors = validation_errors
        
        self.db.flush()
        return fuel_type
    
    def delete(self, fuel_type_id: int) -> bool:
        """
        Удаление вида топлива
        """
        fuel_type = self.get_by_id(fuel_type_id)
        if not fuel_type:
            return False
        
        self.db.delete(fuel_type)
        self.db.flush()
        return True
