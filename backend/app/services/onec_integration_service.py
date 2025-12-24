"""
Сервис для интеграции с 1С ERP
Преобразует данные транзакций в формат, ожидаемый модулем уатЗагрузкаПЦ
"""
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from datetime import datetime
from decimal import Decimal
from app.repositories.transaction_repository import TransactionRepository
from app.models import Transaction, Provider, GasStation
from app.logger import logger


class OneCIntegrationService:
    """
    Сервис для преобразования данных транзакций в формат 1С
    """
    
    def __init__(self, db: Session):
        self.transaction_repo = TransactionRepository(db)
        self.db = db
    
    def convert_transaction_to_1c_format(self, transaction: Transaction) -> Dict[str, Any]:
        """
        Преобразует транзакцию в формат, ожидаемый модулем 1С уатЗагрузкаПЦ
        
        Формат структуры для 1С:
        - Дата - Дата транзакции
        - Количество - Количество топлива
        - МестоЗаправкиКод - Код АЗС (location_code или azs_number)
        - МестоЗаправкиНаименование - Наименование АЗС (location или gas_station.name)
        - НоменклатураОтчета - Наименование товара (product)
        - ПластиковаяКартаОтчета - Номер карты (card_number)
        - ТСОтчета - Транспортное средство (vehicle)
        - Сумма - Сумма транзакции (amount или amount_with_discount)
        - СтавкаНДС - Ставка НДС (vat_rate)
        - СуммаНДС - Сумма НДС (vat_amount)
        - Лат - Широта (если есть в данных)
        - Лон - Долгота (если есть в данных)
        - Транзакция - Уникальный идентификатор транзакции (id или комбинация полей)
        """
        
        # Получаем данные АЗС, если есть gas_station_id
        gas_station_name = None
        if transaction.gas_station_id:
            gas_station = self.db.query(GasStation).filter(
                GasStation.id == transaction.gas_station_id
            ).first()
            if gas_station:
                gas_station_name = gas_station.name
        
        # Формируем код места заправки
        # Приоритет: location_code -> azs_number
        место_заправки_код = transaction.location_code or transaction.azs_number or ""
        
        # Формируем наименование места заправки
        # Приоритет: gas_station.name -> location -> azs_number
        место_заправки_наименование = (
            gas_station_name or 
            transaction.location or 
            transaction.azs_number or 
            ""
        )
        
        # Формируем уникальный идентификатор транзакции
        # Используем ID транзакции как основу, добавляем дату для уникальности
        транзакция_ид = f"{transaction.id}_{transaction.transaction_date.strftime('%Y%m%d%H%M%S')}"
        
        # Определяем сумму (приоритет: amount_with_discount -> amount)
        сумма = transaction.amount_with_discount or transaction.amount or Decimal(0)
        
        # Формируем структуру для 1С
        структура_1с = {
            "Дата": transaction.transaction_date,
            "Количество": float(transaction.quantity) if transaction.quantity else 0.0,
            "МестоЗаправкиКод": место_заправки_код,
            "МестоЗаправкиНаименование": место_заправки_наименование,
            "НоменклатураОтчета": transaction.product or "",
            "ПластиковаяКартаОтчета": transaction.card_number or "",
            "ТСОтчета": transaction.vehicle or "",
            "Сумма": float(сумма) if сумма else 0.0,
            "СтавкаНДС": float(transaction.vat_rate) if transaction.vat_rate else None,
            "СуммаНДС": float(transaction.vat_amount) if transaction.vat_amount else 0.0,
            "Лат": None,  # Пока нет данных о широте в транзакциях
            "Лон": None,  # Пока нет данных о долготе в транзакциях
            "Транзакция": транзакция_ид
        }
        
        return структура_1с
    
    def get_transactions_for_1c(
        self,
        provider_id: Optional[int] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 1000
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        Получает транзакции и преобразует их в формат для 1С
        
        Args:
            provider_id: ID провайдера (обязательно для фильтрации)
            date_from: Начальная дата периода (включительно)
            date_to: Конечная дата периода (включительно)
            skip: Количество записей для пропуска (пагинация)
            limit: Максимальное количество записей (по умолчанию 1000, как в модуле 1С)
        
        Returns:
            tuple: (список структур для 1С, общее количество записей)
        """
        
        if provider_id is None:
            raise ValueError("provider_id обязателен для получения данных для 1С")
        
        # Получаем транзакции из репозитория
        transactions, total = self.transaction_repo.get_all(
            skip=skip,
            limit=limit,
            provider_id=provider_id,
            date_from=date_from,
            date_to=date_to,
            sort_by="transaction_date",
            sort_order="asc"  # Сортировка по возрастанию даты для 1С
        )
        
        # Преобразуем транзакции в формат 1С
        результат_1с = []
        for transaction in transactions:
            try:
                структура_1с = self.convert_transaction_to_1c_format(transaction)
                результат_1с.append(структура_1с)
            except Exception as e:
                logger.error(
                    f"Ошибка при преобразовании транзакции {transaction.id} в формат 1С",
                    extra={
                        "transaction_id": transaction.id,
                        "error": str(e),
                        "error_type": type(e).__name__
                    },
                    exc_info=True
                )
                # Продолжаем обработку других транзакций
                continue
        
        logger.info(
            "Данные для 1С успешно подготовлены",
            extra={
                "provider_id": provider_id,
                "total": total,
                "converted": len(результат_1с),
                "date_from": date_from.isoformat() if date_from else None,
                "date_to": date_to.isoformat() if date_to else None,
                "skip": skip,
                "limit": limit
            }
        )
        
        return результат_1с, total

