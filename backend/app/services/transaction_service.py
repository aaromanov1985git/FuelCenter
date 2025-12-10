"""
Сервис для работы с транзакциями
Содержит бизнес-логику для работы с транзакциями
"""
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.repositories.transaction_repository import TransactionRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.models import Transaction, Vehicle, Provider
from app.logger import logger


class TransactionService:
    """
    Сервис для работы с транзакциями
    Содержит бизнес-логику поверх репозитория
    """
    
    def __init__(self, db: Session):
        self.transaction_repo = TransactionRepository(db)
        self.vehicle_repo = VehicleRepository(db)
        self.db = db
    
    def get_transaction(self, transaction_id: int) -> Optional[Transaction]:
        """
        Получение транзакции по ID
        """
        return self.transaction_repo.get_by_id(transaction_id)
    
    def get_transactions(
        self,
        skip: int = 0,
        limit: int = 100,
        card_number: Optional[str] = None,
        azs_number: Optional[str] = None,
        product: Optional[str] = None,
        provider_id: Optional[int] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        sort_by: str = "transaction_date",
        sort_order: str = "desc"
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        Получение списка транзакций с оптимизацией N+1 запросов
        
        Args:
            date_from: Начальная дата периода (включительно)
            date_to: Конечная дата периода (включительно)
        
        Returns:
            tuple: (список транзакций с дополнительными полями, общее количество)
        """
        transactions, total = self.transaction_repo.get_all(
            skip=skip,
            limit=limit,
            card_number=card_number,
            azs_number=azs_number,
            product=product,
            provider_id=provider_id,
            date_from=date_from,
            date_to=date_to,
            sort_by=sort_by,
            sort_order=sort_order
        )
        
        # Оптимизация N+1: загружаем все vehicles одним запросом
        vehicle_ids = [trans.vehicle_id for trans in transactions if trans.vehicle_id]
        vehicles_dict = {}
        if vehicle_ids:
            vehicles = self.vehicle_repo.get_by_ids(vehicle_ids)
            vehicles_dict = {vehicle.id: vehicle for vehicle in vehicles}
        
        # Оптимизация N+1: загружаем все провайдеры одним запросом
        provider_ids = [trans.provider_id for trans in transactions if trans.provider_id]
        providers_dict = {}
        if provider_ids:
            providers = self.db.query(Provider).filter(Provider.id.in_(provider_ids)).all()
            providers_dict = {provider.id: provider for provider in providers}
        
        # Формируем результат с дополнительными полями
        result_items = []
        for trans in transactions:
            trans_dict = {
                "id": trans.id,
                "transaction_date": trans.transaction_date,
                "card_number": trans.card_number,
                "vehicle": trans.vehicle,
                "vehicle_id": trans.vehicle_id,
                "azs_number": trans.azs_number,
                "supplier": trans.supplier,
                "provider_id": trans.provider_id,
                "provider_name": (providers_dict[trans.provider_id].name if trans.provider_id and trans.provider_id in providers_dict else None),
                "region": trans.region,
                "settlement": trans.settlement,
                "location": trans.location,
                "location_code": trans.location_code,
                "product": trans.product,
                "operation_type": trans.operation_type,
                "quantity": trans.quantity,
                "currency": trans.currency,
                "exchange_rate": trans.exchange_rate,
                "price": trans.price,
                "price_with_discount": trans.price_with_discount,
                "amount": trans.amount,
                "amount_with_discount": trans.amount_with_discount,
                "discount_percent": trans.discount_percent,
                "discount_amount": trans.discount_amount,
                "vat_rate": trans.vat_rate,
                "vat_amount": trans.vat_amount,
                "source_file": trans.source_file,
                "organization": trans.organization,
                "created_at": trans.created_at,
                "updated_at": trans.updated_at,
                "vehicle_display_name": trans.vehicle,  # По умолчанию исходное название
                "vehicle_has_errors": False
            }
            
            # Если есть vehicle_id, получаем исправленное название из справочника (из кэша)
            if trans.vehicle_id and trans.vehicle_id in vehicles_dict:
                vehicle = vehicles_dict[trans.vehicle_id]
                # Формируем исправленное название: гаражный номер + госномер
                display_parts = []
                if vehicle.garage_number:
                    display_parts.append(vehicle.garage_number)
                if vehicle.license_plate:
                    display_parts.append(vehicle.license_plate)
                
                if display_parts:
                    trans_dict["vehicle_display_name"] = " ".join(display_parts)
                elif vehicle.is_validated == "valid":
                    trans_dict["vehicle_display_name"] = vehicle.original_name
                else:
                    trans_dict["vehicle_display_name"] = vehicle.original_name
                
                # Проверяем наличие ошибок валидации
                trans_dict["vehicle_has_errors"] = (
                    vehicle.is_validated == "invalid" and vehicle.validation_errors is not None
                )
            
            result_items.append(trans_dict)
        
        return result_items, total
    
    def delete_transaction(self, transaction_id: int) -> bool:
        """
        Удаление транзакции
        
        Returns:
            bool: True если удалено, False если не найдено
        """
        success = self.transaction_repo.delete(transaction_id)
        if success:
            logger.info("Транзакция удалена", extra={"transaction_id": transaction_id})
        return success
    
    def clear_all_transactions(self) -> int:
        """
        Очистка всех транзакций
        
        Returns:
            int: количество удаленных транзакций
        """
        count = self.transaction_repo.delete_all()
        logger.info("Все транзакции удалены", extra={"deleted_count": count})
        return count
    
    def get_stats_summary(self, provider_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Получение статистики по транзакциям
        """
        return self.transaction_repo.get_stats_summary(provider_id=provider_id)
