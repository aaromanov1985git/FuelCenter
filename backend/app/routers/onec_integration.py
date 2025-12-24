"""
Роутер для интеграции с 1С ERP
Предоставляет API для получения данных в формате, ожидаемом модулем уатЗагрузкаПЦ
"""
from fastapi import APIRouter, Query, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from app.database import get_db
from app.logger import logger
from app.services.onec_integration_service import OneCIntegrationService
from app.utils import parse_date_range
from app.auth import require_auth_if_enabled
from app.models import User, Provider
from pydantic import BaseModel
from typing import List, Dict, Any


router = APIRouter(prefix="/api/v1/onec", tags=["1C Integration"])


class OneCTransactionItem(BaseModel):
    """Схема элемента транзакции для 1С"""
    Дата: datetime
    Количество: float
    МестоЗаправкиКод: str
    МестоЗаправкиНаименование: str
    НоменклатураОтчета: str
    ПластиковаяКартаОтчета: str
    ТСОтчета: str
    Сумма: float
    СтавкаНДС: Optional[float] = None
    СуммаНДС: float = 0.0
    Лат: Optional[float] = None
    Лон: Optional[float] = None
    Транзакция: str


class OneCTransactionsResponse(BaseModel):
    """Схема ответа для 1С"""
    Успех: bool = True
    Транзакции: List[OneCTransactionItem] = []
    ВсегоЗаписей: int = 0
    СообщениеОбОшибке: str = ""


@router.get("/transactions", response_model=OneCTransactionsResponse)
async def get_transactions_for_1c(
    provider_id: int = Query(..., description="ID провайдера (обязательный параметр)"),
    date_from: Optional[str] = Query(None, description="Начальная дата периода в формате YYYY-MM-DD или YYYY-MM-DD HH:MM:SS"),
    date_to: Optional[str] = Query(None, description="Конечная дата периода в формате YYYY-MM-DD или YYYY-MM-DD HH:MM:SS"),
    skip: int = Query(0, ge=0, description="Количество записей для пропуска (пагинация)"),
    limit: int = Query(1000, ge=1, le=1000, description="Максимальное количество записей на странице"),
    db: Session = Depends(get_db),
    _: None = Depends(require_auth_if_enabled)
):
    """
    Получение транзакций в формате для модуля 1С уатЗагрузкаПЦ
    
    Этот endpoint предназначен для использования из модуля 1С "Рарус Модуль автотранспорта для ЕРП".
    Возвращает данные в формате, который ожидает процедура СоздатьЗаправкиВОтчетеПЦ.
    
    Параметры:
    - provider_id: ID провайдера (обязательный)
    - date_from: Начальная дата периода (включительно), необязательный
    - date_to: Конечная дата периода (включительно), необязательный
    - skip: Количество записей для пропуска (для пагинации), по умолчанию 0
    - limit: Максимальное количество записей на странице, по умолчанию 1000
    
    Возвращает структуру:
    - Успех: Булево - Признак успешного выполнения запроса
    - Транзакции: Массив - Массив структур с данными транзакций
    - ВсегоЗаписей: Число - Общее количество записей, соответствующих фильтрам
    - СообщениеОбОшибке: Строка - Текст ошибки (заполняется при Успех = Ложь)
    """
    
    try:
        # Проверяем существование провайдера
        provider = db.query(Provider).filter(Provider.id == provider_id).first()
        if not provider:
            return OneCTransactionsResponse(
                Успех=False,
                СообщениеОбОшибке=f"Провайдер с ID {provider_id} не найден"
            )
        
        # Парсим даты периода, если указаны
        parsed_date_from, parsed_date_to = parse_date_range(date_from, date_to)
        
        logger.info(
            "Запрос данных для 1С",
            extra={
                "provider_id": provider_id,
                "provider_name": provider.name,
                "date_from": parsed_date_from.isoformat() if parsed_date_from else None,
                "date_to": parsed_date_to.isoformat() if parsed_date_to else None,
                "skip": skip,
                "limit": limit
            }
        )
        
        # Получаем данные через сервис
        onec_service = OneCIntegrationService(db)
        транзакции_1с, всего_записей = onec_service.get_transactions_for_1c(
            provider_id=provider_id,
            date_from=parsed_date_from,
            date_to=parsed_date_to,
            skip=skip,
            limit=limit
        )
        
        # Преобразуем в формат ответа
        транзакции_ответ = [
            OneCTransactionItem(**транзакция) for транзакция in транзакции_1с
        ]
        
        logger.info(
            "Данные для 1С успешно возвращены",
            extra={
                "provider_id": provider_id,
                "total": всего_записей,
                "returned": len(транзакции_ответ),
                "skip": skip,
                "limit": limit
            }
        )
        
        return OneCTransactionsResponse(
            Успех=True,
            Транзакции=транзакции_ответ,
            ВсегоЗаписей=всего_записей,
            СообщениеОбОшибке=""
        )
        
    except ValueError as e:
        logger.error(
            "Ошибка валидации при запросе данных для 1С",
            extra={
                "provider_id": provider_id,
                "error": str(e),
                "error_type": type(e).__name__
            }
        )
        return OneCTransactionsResponse(
            Успех=False,
            СообщениеОбОшибке=f"Ошибка валидации: {str(e)}"
        )
    
    except Exception as e:
        logger.error(
            "Ошибка при получении данных для 1С",
            extra={
                "provider_id": provider_id,
                "error": str(e),
                "error_type": type(e).__name__
            },
            exc_info=True
        )
        return OneCTransactionsResponse(
            Успех=False,
            СообщениеОбОшибке=f"Ошибка при выполнении запроса: {str(e)}"
        )

