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
from app.services.normalization_service import normalize_vehicle_name
from app.services.fuzzy_matching_service import find_similar_vehicles


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
        is_validated: Optional[str] = None,
        organization_ids: Optional[List[int]] = None
    ) -> Tuple[List[Vehicle], int]:
        """
        Получение списка ТС с фильтрацией
        
        Args:
            organization_ids: Список ID организаций для фильтрации
        
        Returns:
            tuple: (список ТС, общее количество)
        """
        return self.vehicle_repo.get_all(
            skip=skip,
            limit=limit,
            is_validated=is_validated,
            organization_ids=organization_ids
        )
    
    def update_vehicle(
        self,
        vehicle_id: int,
        garage_number: Optional[str] = None,
        license_plate: Optional[str] = None,
        is_validated: Optional[str] = None,
        organization_id: Optional[int] = None
    ) -> Optional[Vehicle]:
        """
        Обновление данных ТС с валидацией
        
        Returns:
            Vehicle: обновленное ТС или None если не найдено
        """
        vehicle = self.vehicle_repo.get_by_id(vehicle_id)
        if not vehicle:
            return None
        
        logger.info(
            "Начало обновления ТС",
            extra={
                "vehicle_id": vehicle_id,
                "garage_number": garage_number,
                "license_plate": license_plate,
                "is_validated": is_validated,
                "organization_id": organization_id,
                "current_organization_id": vehicle.organization_id
            }
        )
        
        # Обновляем поля
        if garage_number is not None:
            vehicle.garage_number = garage_number
        if license_plate is not None:
            vehicle.license_plate = license_plate
        if is_validated is not None:
            vehicle.is_validated = is_validated
        
        # organization_id всегда обновляем (может быть None для сброса организации)
        # Используем специальный подход: если organization_id передан (даже None), обновляем
        # Для этого проверяем, был ли параметр передан через inspect или просто всегда обновляем
        vehicle.organization_id = organization_id
        logger.info(
            "Обновлен organization_id для ТС",
            extra={
                "vehicle_id": vehicle_id,
                "old_organization_id": getattr(vehicle, '_old_organization_id', None),
                "new_organization_id": organization_id,
                "vehicle_organization_id_after": vehicle.organization_id
            }
        )
        
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
        
        logger.info(
            "ТС обновлено",
            extra={
                "vehicle_id": vehicle_id,
                "final_organization_id": vehicle.organization_id,
                "garage_number": vehicle.garage_number,
                "license_plate": vehicle.license_plate
            }
        )
        
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

    def get_or_create_vehicle(
        self,
        original_name: str,
        garage_number: Optional[str] = None,
        license_plate: Optional[str] = None
    ) -> Tuple[Vehicle, List[str]]:
        """
        Получить или создать транспортное средство в справочнике

        Использует нормализацию для поиска дублей и fuzzy matching для похожих записей.
        Возвращает ТС и список предупреждений.

        Args:
            original_name: Исходное название ТС
            garage_number: Гаражный номер (опционально)
            license_plate: Государственный номер (опционально)

        Returns:
            Tuple[Vehicle, List[str]]: ТС и список предупреждений

        Examples:
            >>> vehicle_service = VehicleService(db)
            >>> vehicle, warnings = vehicle_service.get_or_create_vehicle("КАМАЗ 5490", garage_number="123")
            >>> print(f"Vehicle: {vehicle.original_name}, Warnings: {warnings}")
        """
        warnings = []

        # Нормализуем название для поиска
        normalized_name = normalize_vehicle_name(original_name)

        # Сначала ищем по точному совпадению исходного названия
        vehicle = self.db.query(Vehicle).filter(Vehicle.original_name == original_name).first()

        # Если не найдено, ищем по нормализованному названию
        if not vehicle:
            all_vehicles = self.db.query(Vehicle).all()
            for v in all_vehicles:
                if normalize_vehicle_name(v.original_name) == normalized_name:
                    vehicle = v
                    break

        # Если все еще не найдено, проверяем на похожие записи
        if not vehicle:
            similar_vehicles = find_similar_vehicles(self.db, original_name, threshold=85)
            if similar_vehicles:
                # Берем самую похожую запись, если схожесть >= 95%
                best_match, score = similar_vehicles[0]
                if score >= 95:
                    vehicle = best_match
                    warnings.append(
                        f"ТС '{original_name}' объединено с существующим '{best_match.original_name}' "
                        f"(схожесть: {score}%)"
                    )
                elif score >= 85:
                    # Предупреждаем о возможном дубле
                    warnings.append(
                        f"Возможный дубль ТС: найдена похожая запись '{best_match.original_name}' "
                        f"(схожесть: {score}%). Проверьте вручную."
                    )

        if not vehicle:
            # Создаем новое ТС
            vehicle = Vehicle(
                original_name=original_name,
                garage_number=garage_number,
                license_plate=license_plate,
                is_validated="pending"
            )
            self.db.add(vehicle)
            self.db.flush()
        else:
            # Обновляем данные, если они были пустыми
            updated = False
            if not vehicle.garage_number and garage_number:
                vehicle.garage_number = garage_number
                updated = True
            if not vehicle.license_plate and license_plate:
                vehicle.license_plate = license_plate
                updated = True

            if updated:
                self.db.flush()

        # Валидация данных
        validation_result = validate_vehicle_data(vehicle.garage_number, vehicle.license_plate)

        if validation_result["errors"]:
            vehicle.is_validated = "invalid"
            vehicle.validation_errors = "; ".join(validation_result["errors"])
            warnings.extend([f"ТС '{original_name}': {err}" for err in validation_result["errors"]])
        elif validation_result["warnings"]:
            vehicle.is_validated = "pending"
            warnings.extend([f"ТС '{original_name}': {warn}" for warn in validation_result["warnings"]])
        else:
            vehicle.is_validated = "valid"
            vehicle.validation_errors = None

        return vehicle, warnings
