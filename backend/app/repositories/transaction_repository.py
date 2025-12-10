"""
Репозиторий для работы с транзакциями
"""
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.models import Transaction, Vehicle, Provider


class TransactionRepository:
    """
    Репозиторий для работы с транзакциями
    Инкапсулирует логику доступа к данным
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_by_id(self, transaction_id: int) -> Optional[Transaction]:
        """
        Получение транзакции по ID
        """
        return self.db.query(Transaction).filter(Transaction.id == transaction_id).first()
    
    def get_all(
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
    ) -> tuple[List[Transaction], int]:
        """
        Получение списка транзакций с фильтрацией и сортировкой
        
        Args:
            date_from: Начальная дата периода (включительно)
            date_to: Конечная дата периода (включительно)
        
        Returns:
            tuple: (список транзакций, общее количество)
        """
        query = self.db.query(Transaction)
        
        # Применяем фильтры
        if card_number and card_number.strip():
            query = query.filter(
                Transaction.card_number.isnot(None),
                Transaction.card_number.ilike(f"%{card_number.strip()}%")
            )
        if azs_number and azs_number.strip():
            query = query.filter(
                Transaction.azs_number.isnot(None),
                Transaction.azs_number.ilike(f"%{azs_number.strip()}%")
            )
        if product and product.strip():
            query = query.filter(
                Transaction.product.isnot(None),
                Transaction.product.ilike(f"%{product.strip()}%")
            )
        if provider_id is not None:
            query = query.filter(Transaction.provider_id == provider_id)
        if date_from is not None:
            query = query.filter(Transaction.transaction_date >= date_from)
        if date_to is not None:
            query = query.filter(Transaction.transaction_date <= date_to)
        
        # Получаем общее количество
        total = query.count()
        
        # Определяем поле для сортировки
        sort_column_map = {
            "id": Transaction.id,
            "transaction_date": Transaction.transaction_date,
            "card_number": Transaction.card_number,
            "vehicle": Transaction.vehicle,
            "azs_number": Transaction.azs_number,
            "product": Transaction.product,
            "operation_type": Transaction.operation_type,
            "quantity": Transaction.quantity,
            "currency": Transaction.currency,
            "exchange_rate": Transaction.exchange_rate,
            "created_at": Transaction.created_at
        }
        
        sort_column = sort_column_map.get(sort_by, Transaction.transaction_date)
        
        # Применяем сортировку
        if sort_order == "asc":
            query = query.order_by(sort_column.asc())
        else:
            query = query.order_by(sort_column.desc())
        
        # Применяем пагинацию
        transactions = query.offset(skip).limit(limit).all()
        
        return transactions, total
    
    def delete(self, transaction_id: int) -> bool:
        """
        Удаление транзакции по ID
        
        Returns:
            bool: True если удалено, False если не найдено
        """
        transaction = self.get_by_id(transaction_id)
        if not transaction:
            return False
        
        self.db.delete(transaction)
        self.db.commit()
        return True
    
    def delete_all(self) -> int:
        """
        Удаление всех транзакций
        
        Returns:
            int: количество удаленных транзакций
        """
        count = self.db.query(Transaction).count()
        self.db.query(Transaction).delete()
        self.db.commit()
        return count
    
    def count(self) -> int:
        """
        Получение общего количества транзакций
        """
        return self.db.query(Transaction).count()
    
    def get_stats_summary(self, provider_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Получение статистики по транзакциям
        
        Returns:
            Dict с ключами: total_transactions, total_quantity, products
        """
        query = self.db.query(Transaction)
        if provider_id is not None:
            query = query.filter(Transaction.provider_id == provider_id)
        
        total_count = query.count()

        # Суммарное количество (литры)
        total_qty = query.with_entities(func.sum(Transaction.quantity)).scalar() or 0

        # Статистика по товарам
        products = query.with_entities(
            Transaction.product,
            func.sum(Transaction.quantity)
        ).group_by(Transaction.product).all()
        products_stats = {p[0]: float(p[1]) for p in products if p[0]}

        # Количество провайдеров
        if provider_id is not None:
            provider_count = 1
        else:
            provider_count = self.db.query(Provider).count()

        return {
            "total_transactions": total_count,
            "total_quantity": round(total_qty, 2),
            "products": products_stats,
            "provider_count": provider_count
        }
