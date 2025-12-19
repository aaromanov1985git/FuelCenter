"""
Сервис для анализа топливных карт
Содержит логику сопоставления транзакций по картам с фактическими заправками ТС
и проверки геолокации
"""
import json
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_, func

from app.models import (
    Transaction, Vehicle, FuelCard, GasStation,
    VehicleRefuel, VehicleLocation, FuelCardAnalysisResult
)
from app.repositories import (
    VehicleRefuelRepository,
    VehicleLocationRepository,
    FuelCardAnalysisRepository
)
from app.utils.geolocation_utils import (
    calculate_distance_haversine,
    is_point_in_radius
)
from app.logger import logger


class FuelCardAnalysisService:
    """
    Сервис для анализа топливных карт
    """
    
    # Параметры анализа по умолчанию
    DEFAULT_TIME_WINDOW_MINUTES = 30  # ±30 минут
    DEFAULT_QUANTITY_TOLERANCE_PERCENT = 5  # ±5%
    DEFAULT_AZS_RADIUS_METERS = 500  # 500 метров
    
    def __init__(self, db: Session):
        self.db = db
        self.refuel_repo = VehicleRefuelRepository(db)
        self.location_repo = VehicleLocationRepository(db)
        self.analysis_repo = FuelCardAnalysisRepository(db)
    
    def get_vehicle_location_at_time(
        self,
        vehicle_id: int,
        target_time: datetime,
        time_window_seconds: int = 300
    ) -> Optional[VehicleLocation]:
        """
        Получает местоположение ТС ближайшее к указанному времени
        
        Args:
            vehicle_id: ID транспортного средства
            target_time: Целевое время
            time_window_seconds: Окно поиска в секундах (по умолчанию ±5 минут)
        
        Returns:
            VehicleLocation или None
        """
        return self.location_repo.get_nearest_to_time(
            vehicle_id, target_time, time_window_seconds
        )
    
    def find_matching_refuels(
        self,
        transaction: Transaction,
        vehicle_id: int,
        time_window_minutes: int = None,
        quantity_tolerance_percent: float = None
    ) -> List[VehicleRefuel]:
        """
        Находит заправки ТС, соответствующие транзакции
        
        Args:
            transaction: Транзакция по карте
            vehicle_id: ID транспортного средства
            time_window_minutes: Временное окно в минутах (по умолчанию из настроек)
            quantity_tolerance_percent: Допустимое отклонение количества в % (по умолчанию из настроек)
        
        Returns:
            Список подходящих заправок
        """
        if time_window_minutes is None:
            time_window_minutes = self.DEFAULT_TIME_WINDOW_MINUTES
        if quantity_tolerance_percent is None:
            quantity_tolerance_percent = self.DEFAULT_QUANTITY_TOLERANCE_PERCENT
        
        # Вычисляем временное окно
        time_from = transaction.transaction_date - timedelta(minutes=time_window_minutes)
        time_to = transaction.transaction_date + timedelta(minutes=time_window_minutes)
        
        # Вычисляем допустимый диапазон количества
        quantity_min = float(transaction.quantity) * (1 - quantity_tolerance_percent / 100)
        quantity_max = float(transaction.quantity) * (1 + quantity_tolerance_percent / 100)
        
        # Ищем заправки
        refuels = self.db.query(VehicleRefuel).filter(
            and_(
                VehicleRefuel.vehicle_id == vehicle_id,
                VehicleRefuel.refuel_date >= time_from,
                VehicleRefuel.refuel_date <= time_to,
                VehicleRefuel.quantity >= quantity_min,
                VehicleRefuel.quantity <= quantity_max
            )
        )
        
        # Фильтр по типу топлива, если указан
        if transaction.product:
            refuels = refuels.filter(
                VehicleRefuel.fuel_type == transaction.product
            )
        
        return refuels.order_by(
            func.abs(
                func.extract('epoch', VehicleRefuel.refuel_date - transaction.transaction_date)
            )
        ).all()
    
    def check_vehicle_at_azs(
        self,
        vehicle_id: int,
        transaction_time: datetime,
        azs: GasStation,
        radius_meters: int = None
    ) -> Tuple[bool, Optional[float], Optional[VehicleLocation]]:
        """
        Проверяет, было ли ТС в радиусе АЗС в момент транзакции
        
        Args:
            vehicle_id: ID транспортного средства
            transaction_time: Время транзакции
            azs: АЗС
            radius_meters: Радиус в метрах (по умолчанию из настроек)
        
        Returns:
            Tuple: (находится ли в радиусе, расстояние в метрах, местоположение ТС)
        """
        if radius_meters is None:
            radius_meters = self.DEFAULT_AZS_RADIUS_METERS
        
        # Проверяем наличие координат АЗС
        if not azs.latitude or not azs.longitude:
            logger.warning(f"АЗС {azs.id} не имеет координат")
            return False, None, None
        
        # Получаем местоположение ТС
        location = self.get_vehicle_location_at_time(vehicle_id, transaction_time)
        
        if not location:
            logger.debug(f"Не найдено местоположение ТС {vehicle_id} в момент транзакции")
            return False, None, None
        
        # Вычисляем расстояние и проверяем нахождение в радиусе
        is_in_radius = is_point_in_radius(
            float(azs.latitude),
            float(azs.longitude),
            float(location.latitude),
            float(location.longitude),
            radius_meters,
            float(location.accuracy) if location.accuracy else None
        )
        
        # Вычисляем расстояние для возврата
        distance = calculate_distance_haversine(
            float(azs.latitude),
            float(azs.longitude),
            float(location.latitude),
            float(location.longitude)
        )
        
        return is_in_radius, distance, location
    
    def analyze_transaction(
        self,
        transaction_id: int,
        time_window_minutes: int = None,
        quantity_tolerance_percent: float = None,
        azs_radius_meters: int = None
    ) -> FuelCardAnalysisResult:
        """
        Анализирует конкретную транзакцию
        
        Args:
            transaction_id: ID транзакции
            time_window_minutes: Временное окно в минутах
            quantity_tolerance_percent: Допустимое отклонение количества в %
            azs_radius_meters: Радиус АЗС в метрах
        
        Returns:
            FuelCardAnalysisResult с результатами анализа
        """
        # Получаем транзакцию
        transaction = self.db.query(Transaction).filter(
            Transaction.id == transaction_id
        ).first()
        
        if not transaction:
            raise ValueError(f"Транзакция {transaction_id} не найдена")
        
        # Проверяем, есть ли уже результат анализа
        existing_result = self.analysis_repo.get_by_transaction_id(transaction_id)
        
        if existing_result:
            # Обновляем существующий результат
            result = existing_result
        else:
            # Создаем новый результат
            result = FuelCardAnalysisResult(
                transaction_id=transaction_id,
                analysis_date=datetime.now()
            )
            self.db.add(result)
        
        # Получаем карту и ТС
        fuel_card = None
        vehicle_id = None
        
        if transaction.card_number:
            fuel_card = self.db.query(FuelCard).filter(
                FuelCard.card_number == transaction.card_number
            ).first()
            
            if fuel_card:
                result.fuel_card_id = fuel_card.id
                vehicle_id = fuel_card.vehicle_id
        
        # Если ТС не найдено через карту, используем vehicle_id из транзакции
        if not vehicle_id and transaction.vehicle_id:
            vehicle_id = transaction.vehicle_id
        
        result.vehicle_id = vehicle_id
        
        # Получаем АЗС
        azs = None
        if transaction.gas_station_id:
            azs = self.db.query(GasStation).filter(
                GasStation.id == transaction.gas_station_id
            ).first()
        
        # Ищем соответствующие заправки
        matching_refuels = []
        if vehicle_id:
            matching_refuels = self.find_matching_refuels(
                transaction,
                vehicle_id,
                time_window_minutes,
                quantity_tolerance_percent
            )
        
        # Проверяем геолокацию
        is_at_azs = False
        distance_to_azs = None
        vehicle_location = None
        
        if vehicle_id and azs:
            is_at_azs, distance_to_azs, vehicle_location = self.check_vehicle_at_azs(
                vehicle_id,
                transaction.transaction_date,
                azs,
                azs_radius_meters
            )
            result.distance_to_azs = Decimal(str(distance_to_azs)) if distance_to_azs else None
        
        # Определяем статус соответствия
        if len(matching_refuels) == 1:
            refuel = matching_refuels[0]
            result.refuel_id = refuel.id
            
            # Вычисляем разницу во времени
            time_diff = abs((refuel.refuel_date - transaction.transaction_date).total_seconds())
            result.time_difference = int(time_diff)
            
            # Вычисляем разницу в количестве
            qty_diff = abs(float(refuel.quantity) - float(transaction.quantity))
            result.quantity_difference = Decimal(str(qty_diff))
            
            if is_at_azs:
                result.match_status = "matched"
                result.match_confidence = Decimal("95.0")
            else:
                result.match_status = "location_mismatch"
                result.match_confidence = Decimal("75.0")
                result.is_anomaly = True
                result.anomaly_type = "data_error"
        
        elif len(matching_refuels) > 1:
            # Несколько возможных соответствий
            result.match_status = "multiple_matches"
            result.match_confidence = Decimal("60.0")
            result.is_anomaly = True
            result.anomaly_type = "data_error"
            # Сохраняем первую заправку для справки
            result.refuel_id = matching_refuels[0].id
        
        else:
            # Заправка не найдена
            result.match_status = "no_refuel"
            
            if is_at_azs:
                # ТС было в радиусе, но заправки нет - возможная кража
                result.match_confidence = Decimal("40.0")
                result.is_anomaly = True
                result.anomaly_type = "fuel_theft"
            else:
                # ТС не было в радиусе и заправки нет
                result.match_confidence = Decimal("20.0")
                result.is_anomaly = True
                result.anomaly_type = "card_misuse"
        
        # Формируем детальную информацию
        analysis_details = {
            "transaction": {
                "id": transaction.id,
                "date": transaction.transaction_date.isoformat(),
                "card_number": transaction.card_number,
                "product": transaction.product,
                "quantity": float(transaction.quantity),
                "azs_number": transaction.azs_number
            },
            "vehicle_id": vehicle_id,
            "azs": {
                "id": azs.id if azs else None,
                "name": azs.name if azs else None,
                "coordinates": {
                    "latitude": float(azs.latitude) if azs and azs.latitude else None,
                    "longitude": float(azs.longitude) if azs and azs.longitude else None
                }
            } if azs else None,
            "vehicle_location": {
                "latitude": float(vehicle_location.latitude) if vehicle_location else None,
                "longitude": float(vehicle_location.longitude) if vehicle_location else None,
                "timestamp": vehicle_location.timestamp.isoformat() if vehicle_location else None,
                "accuracy": float(vehicle_location.accuracy) if vehicle_location and vehicle_location.accuracy else None
            } if vehicle_location else None,
            "matching_refuels_count": len(matching_refuels),
            "is_at_azs": is_at_azs,
            "distance_to_azs_meters": float(distance_to_azs) if distance_to_azs else None
        }
        
        result.analysis_details = json.dumps(analysis_details, ensure_ascii=False)
        
        self.db.commit()
        self.db.refresh(result)
        
        logger.info(
            f"Анализ транзакции {transaction_id} завершен. "
            f"Статус: {result.match_status}, Уверенность: {result.match_confidence}%, "
            f"Аномалия: {result.is_anomaly}"
        )
        
        return result
    
    def analyze_card(
        self,
        card_id: int,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None
    ) -> List[FuelCardAnalysisResult]:
        """
        Анализирует все транзакции по указанной карте за период
        
        Args:
            card_id: ID топливной карты
            date_from: Начальная дата (по умолчанию - месяц назад)
            date_to: Конечная дата (по умолчанию - сейчас)
        
        Returns:
            Список результатов анализа
        """
        # Получаем карту
        fuel_card = self.db.query(FuelCard).filter(FuelCard.id == card_id).first()
        if not fuel_card:
            raise ValueError(f"Топливная карта {card_id} не найдена")
        
        # Устанавливаем период по умолчанию
        if date_to is None:
            date_to = datetime.now()
        if date_from is None:
            date_from = date_to - timedelta(days=30)
        
        # Получаем транзакции по карте
        transactions = self.db.query(Transaction).filter(
            and_(
                Transaction.card_number == fuel_card.card_number,
                Transaction.transaction_date >= date_from,
                Transaction.transaction_date <= date_to
            )
        ).all()
        
        results = []
        for transaction in transactions:
            try:
                result = self.analyze_transaction(transaction.id)
                results.append(result)
            except Exception as e:
                logger.error(f"Ошибка при анализе транзакции {transaction.id}: {e}")
        
        return results
    
    def analyze_period(
        self,
        date_from: datetime,
        date_to: datetime,
        card_ids: Optional[List[int]] = None,
        vehicle_ids: Optional[List[int]] = None,
        organization_ids: Optional[List[int]] = None
    ) -> Dict[str, Any]:
        """
        Массовый анализ транзакций за период
        
        Args:
            date_from: Начальная дата
            date_to: Конечная дата
            card_ids: Список ID карт для фильтрации (опционально)
            vehicle_ids: Список ID ТС для фильтрации (опционально)
            organization_ids: Список ID организаций для фильтрации (опционально)
        
        Returns:
            Словарь со статистикой анализа
        """
        # Формируем запрос транзакций
        query = self.db.query(Transaction).filter(
            and_(
                Transaction.transaction_date >= date_from,
                Transaction.transaction_date <= date_to
            )
        )
        
        # Применяем фильтры
        if card_ids:
            fuel_cards = self.db.query(FuelCard).filter(
                FuelCard.id.in_(card_ids)
            ).all()
            card_numbers = [fc.card_number for fc in fuel_cards]
            query = query.filter(Transaction.card_number.in_(card_numbers))
        
        if vehicle_ids:
            query = query.filter(Transaction.vehicle_id.in_(vehicle_ids))
        
        if organization_ids:
            query = query.filter(Transaction.organization_id.in_(organization_ids))
        
        transactions = query.all()
        
        # Анализируем транзакции
        results = []
        errors = []
        
        for transaction in transactions:
            try:
                result = self.analyze_transaction(transaction.id)
                results.append(result)
            except Exception as e:
                errors.append({
                    "transaction_id": transaction.id,
                    "error": str(e)
                })
                logger.error(f"Ошибка при анализе транзакции {transaction.id}: {e}")
        
        # Формируем статистику
        stats = {
            "total_transactions": len(transactions),
            "analyzed": len(results),
            "errors": len(errors),
            "matched": len([r for r in results if r.match_status == "matched"]),
            "no_refuel": len([r for r in results if r.match_status == "no_refuel"]),
            "location_mismatch": len([r for r in results if r.match_status == "location_mismatch"]),
            "anomalies": len([r for r in results if r.is_anomaly]),
            "anomaly_types": {}
        }
        
        # Подсчитываем типы аномалий
        for result in results:
            if result.is_anomaly and result.anomaly_type:
                stats["anomaly_types"][result.anomaly_type] = \
                    stats["anomaly_types"].get(result.anomaly_type, 0) + 1
        
        return {
            "statistics": stats,
            "errors": errors
        }
