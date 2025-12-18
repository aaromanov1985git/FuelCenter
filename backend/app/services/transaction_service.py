"""
Сервис для работы с транзакциями
Содержит бизнес-логику для работы с транзакциями
"""
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from app.repositories.transaction_repository import TransactionRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.models import Transaction, Vehicle, Provider, UploadPeriodLock, GasStation
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
        
        # Оптимизация N+1: загружаем все АЗС одним запросом
        gas_station_ids = [trans.gas_station_id for trans in transactions if trans.gas_station_id]
        gas_stations_dict = {}
        if gas_station_ids:
            gas_stations = self.db.query(GasStation).filter(GasStation.id.in_(gas_station_ids)).all()
            gas_stations_dict = {gs.id: gs for gs in gas_stations}
        
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
                "vehicle_has_errors": False,
                "gas_station_name": None  # Наименование АЗС из справочника
            }
            
            # Если есть gas_station_id, получаем наименование из справочника
            if trans.gas_station_id and trans.gas_station_id in gas_stations_dict:
                gas_station = gas_stations_dict[trans.gas_station_id]
                trans_dict["gas_station_name"] = gas_station.name
            
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
    
    def clear_transactions_by_provider(
        self,
        provider_id: int,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Очистка транзакций по провайдеру с проверкой блокировки периода
        
        Args:
            provider_id: ID провайдера
            date_from: Начальная дата периода (включительно). Если None - за все время
            date_to: Конечная дата периода (включительно). Если None - за все время
        
        Returns:
            Dict с ключами: deleted_count, message
        
        Raises:
            ValueError: если период пересекается с заблокированным периодом
        """
        # Проверяем наличие провайдера
        provider = self.db.query(Provider).filter(Provider.id == provider_id).first()
        if not provider:
            raise ValueError(f"Провайдер с ID {provider_id} не найден")
        
        # Проверяем блокировку периода
        period_lock = self.db.query(UploadPeriodLock).first()
        
        if period_lock:
            lock_date = period_lock.lock_date
            
            # Если указан период
            if date_from is not None or date_to is not None:
                # Проверяем, не попадает ли начало периода в заблокированную зону
                if date_from is not None:
                    date_from_date = date_from.date() if isinstance(date_from, datetime) else date_from
                    if date_from_date < lock_date:
                        raise ValueError(
                            f"Нельзя удалять транзакции с датами раньше {lock_date.strftime('%d.%m.%Y')}. "
                            f"Указана начальная дата: {date_from_date.strftime('%d.%m.%Y')}"
                        )
                
                # Проверяем, не попадает ли конец периода в заблокированную зону
                if date_to is not None:
                    date_to_date = date_to.date() if isinstance(date_to, datetime) else date_to
                    if date_to_date < lock_date:
                        raise ValueError(
                            f"Нельзя удалять транзакции с датами раньше {lock_date.strftime('%d.%m.%Y')}. "
                            f"Указана конечная дата: {date_to_date.strftime('%d.%m.%Y')}"
                        )
            else:
                # Если период не указан (удаление за все время), проверяем наличие транзакций раньше lock_date
                # Преобразуем date в datetime (начало дня)
                lock_datetime = datetime.combine(lock_date, datetime.min.time())
                has_blocked = self.transaction_repo.has_transactions_before_date(
                    provider_id=provider_id,
                    before_date=lock_datetime
                )
                if has_blocked:
                    raise ValueError(
                        f"Нельзя удалять все транзакции провайдера, так как есть транзакции "
                        f"с датами раньше заблокированного периода ({lock_date.strftime('%d.%m.%Y')}). "
                        f"Укажите период удаления после {lock_date.strftime('%d.%m.%Y')}"
                    )
        
        # Выполняем удаление
        deleted_count = self.transaction_repo.delete_by_provider_and_period(
            provider_id=provider_id,
            date_from=date_from,
            date_to=date_to
        )
        
        # Формируем сообщение
        if date_from is not None or date_to is not None:
            period_str = ""
            if date_from is not None:
                date_from_str = date_from.strftime('%d.%m.%Y') if isinstance(date_from, datetime) else date_from.strftime('%d.%m.%Y')
                period_str += f"с {date_from_str}"
            if date_to is not None:
                date_to_str = date_to.strftime('%d.%m.%Y') if isinstance(date_to, datetime) else date_to.strftime('%d.%m.%Y')
                if period_str:
                    period_str += f" по {date_to_str}"
                else:
                    period_str += f"по {date_to_str}"
            message = f"Удалено {deleted_count} транзакций провайдера '{provider.name}' за период {period_str}"
        else:
            message = f"Удалено {deleted_count} транзакций провайдера '{provider.name}' за все время"
        
        logger.info(
            "Транзакции провайдера удалены",
            extra={
                "provider_id": provider_id,
                "provider_name": provider.name,
                "deleted_count": deleted_count,
                "date_from": date_from.isoformat() if date_from else None,
                "date_to": date_to.isoformat() if date_to else None
            }
        )
        
        return {
            "deleted_count": deleted_count,
            "message": message
        }
