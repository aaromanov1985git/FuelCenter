"""
Сервис для работы с видами топлива
Содержит бизнес-логику для работы с видами топлива
"""
from sqlalchemy.orm import Session
from typing import Optional, List, Tuple, Dict
from app.repositories.fuel_type_repository import FuelTypeRepository
from app.models import FuelType, Transaction
from app.logger import logger


class FuelTypeService:
    """
    Сервис для работы с видами топлива
    Содержит бизнес-логику поверх репозитория
    """
    
    def __init__(self, db: Session):
        self.fuel_type_repo = FuelTypeRepository(db)
        self.db = db
    
    def get_fuel_type(self, fuel_type_id: int) -> Optional[FuelType]:
        """
        Получение вида топлива по ID
        """
        return self.fuel_type_repo.get_by_id(fuel_type_id)
    
    def get_fuel_types(
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
        return self.fuel_type_repo.get_all(
            skip=skip,
            limit=limit,
            is_validated=is_validated
        )
    
    def update_fuel_type(
        self,
        fuel_type_id: int,
        original_name: Optional[str] = None,
        normalized_name: Optional[str] = None,
        is_validated: Optional[str] = None
    ) -> Optional[FuelType]:
        """
        Обновление данных вида топлива
        
        Returns:
            FuelType: обновленный вид топлива или None если не найдено
        """
        fuel_type = self.fuel_type_repo.get_by_id(fuel_type_id)
        if not fuel_type:
            return None
        
        # original_name нельзя изменять - это поле только для чтения
        # Оно устанавливается только при создании записи из транзакций
        if normalized_name is not None:
            fuel_type.normalized_name = normalized_name
        if is_validated is not None:
            fuel_type.is_validated = is_validated
        
        # Валидация данных
        validation_errors = []
        if normalized_name and len(normalized_name.strip()) == 0:
            validation_errors.append("Нормализованное наименование не может быть пустым")
        
        if validation_errors:
            fuel_type.validation_errors = "; ".join(validation_errors)
            fuel_type.is_validated = "invalid"
        else:
            fuel_type.validation_errors = None
            if is_validated is None:
                fuel_type.is_validated = "valid"
        
        return self.fuel_type_repo.update(
            fuel_type_id=fuel_type_id,
            normalized_name=normalized_name,
            is_validated=fuel_type.is_validated,
            validation_errors=fuel_type.validation_errors
        )
    
    def get_or_create_fuel_type(
        self,
        original_name: str,
        normalized_name: Optional[str] = None
    ) -> Tuple[FuelType, List[str]]:
        """
        Получение или создание вида топлива по исходному наименованию
        
        Args:
            original_name: Исходное наименование вида топлива
            normalized_name: Нормализованное наименование (если None, то равно original_name)
        
        Returns:
            tuple: (FuelType, список предупреждений)
        """
        warnings = []
        
        if not original_name or not original_name.strip():
            raise ValueError("Исходное наименование вида топлива не может быть пустым")
        
        original_name = original_name.strip()
        
        if normalized_name is None:
            normalized_name = original_name
        else:
            normalized_name = normalized_name.strip()
        
        # Ищем существующий вид топлива по исходному наименованию
        fuel_type = self.fuel_type_repo.get_by_original_name(original_name)
        
        if fuel_type:
            # Если нашли, но нормализованное имя отличается - предупреждаем
            if fuel_type.normalized_name != normalized_name:
                warnings.append(
                    f"Вид топлива '{original_name}' уже существует с нормализованным именем "
                    f"'{fuel_type.normalized_name}'. Будет использована существующая запись."
                )
            return fuel_type, warnings
        
        # Создаем новый вид топлива
        fuel_type = self.fuel_type_repo.create(
            original_name=original_name,
            normalized_name=normalized_name
        )
        
        logger.info("Создан новый вид топлива", extra={
            "fuel_type_id": fuel_type.id,
            "original_name": original_name,
            "normalized_name": normalized_name
        })
        
        return fuel_type, warnings
    
    def get_stats_summary(self) -> dict:
        """
        Получение статистики по видам топлива для дашборда
        
        Returns:
            dict: статистика по статусам валидации
        """
        total = self.db.query(FuelType).count()
        pending = self.db.query(FuelType).filter(FuelType.is_validated == "pending").count()
        valid = self.db.query(FuelType).filter(FuelType.is_validated == "valid").count()
        invalid = self.db.query(FuelType).filter(FuelType.is_validated == "invalid").count()
        
        return {
            "total": total,
            "pending": pending,
            "valid": valid,
            "invalid": invalid
        }
    
    def get_transactions_count(self, fuel_type_id: int) -> int:
        """
        Получение количества транзакций для вида топлива
        
        Args:
            fuel_type_id: ID вида топлива
        
        Returns:
            int: количество транзакций
        """
        fuel_type = self.get_fuel_type(fuel_type_id)
        if not fuel_type:
            return 0
        
        # Подсчитываем транзакции, где product совпадает с original_name или normalized_name
        count = self.db.query(Transaction).filter(
            (Transaction.product == fuel_type.original_name) |
            (Transaction.product == fuel_type.normalized_name)
        ).count()
        
        return count
    
    def get_transactions_counts_batch(self, fuel_type_ids: List[int]) -> dict:
        """
        Получение количества транзакций для списка видов топлива (оптимизированная версия)
        
        Args:
            fuel_type_ids: Список ID видов топлива
        
        Returns:
            dict: словарь {fuel_type_id: count}
        """
        if not fuel_type_ids:
            return {}
        
        # Получаем все виды топлива одним запросом
        fuel_types = self.db.query(FuelType).filter(FuelType.id.in_(fuel_type_ids)).all()
        if not fuel_types:
            return {}
        
        # Собираем все уникальные названия (original_name и normalized_name)
        product_names = set()
        fuel_type_names_map = {}  # {name: [fuel_type_ids]}
        
        for fuel_type in fuel_types:
            if fuel_type.original_name:
                product_names.add(fuel_type.original_name)
                if fuel_type.original_name not in fuel_type_names_map:
                    fuel_type_names_map[fuel_type.original_name] = []
                fuel_type_names_map[fuel_type.original_name].append(fuel_type.id)
            
            if fuel_type.normalized_name and fuel_type.normalized_name != fuel_type.original_name:
                product_names.add(fuel_type.normalized_name)
                if fuel_type.normalized_name not in fuel_type_names_map:
                    fuel_type_names_map[fuel_type.normalized_name] = []
                fuel_type_names_map[fuel_type.normalized_name].append(fuel_type.id)
        
        if not product_names:
            return {ft_id: 0 for ft_id in fuel_type_ids}
        
        # Подсчитываем транзакции для всех названий одним запросом
        from sqlalchemy import func
        counts = self.db.query(
            Transaction.product,
            func.count(Transaction.id).label('count')
        ).filter(
            Transaction.product.in_(product_names)
        ).group_by(Transaction.product).all()
        
        # Формируем результат
        result = {ft_id: 0 for ft_id in fuel_type_ids}
        for product, count in counts:
            if product in fuel_type_names_map:
                for ft_id in fuel_type_names_map[product]:
                    result[ft_id] = result.get(ft_id, 0) + count
        
        return result
