"""
Роутер для эмуляции API ППР
Предоставляет эндпоинты, идентичные API ППР, для интеграции с 1С
"""
from fastapi import APIRouter, Query, Depends, HTTPException, Header, Request
from starlette.requests import Request as StarletteRequest
from fastapi.security import HTTPBasic, HTTPBasicCredentials, HTTPBearer, HTTPAuthorizationCredentials, APIKeyHeader
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta
from app.database import get_db
from app.logger import logger
from app.services.ppr_api_service import PPRAPIService
from app.utils import parse_date_range
from app.auth import create_access_token, get_user_by_username, verify_password, get_current_user
from app.models import User
from pydantic import BaseModel
from typing import List, Dict, Any


# Роутер для эмуляции оригинального ППР API
# Поддерживает как оригинальные пути ППР, так и упрощенные пути для совместимости
router = APIRouter(prefix="/api/ppr", tags=["PPR API"])
router_public_api = APIRouter(prefix="/api/public-api/v2", tags=["PPR API"])
router_public_api_v1 = APIRouter(prefix="/public-api/v1", tags=["PPR API v1"])

# HTTP Basic для получения токена
security_basic = HTTPBasic()

# HTTP Bearer для проверки токена
security_bearer = HTTPBearer(auto_error=False)


class PPRLoginRequest(BaseModel):
    """Запрос на авторизацию ППР"""
    username: str
    password: str


class PPRTransactionListV1Request(BaseModel):
    """Запрос на получение списка транзакций через API v1 (для 1С ЕРП)"""
    token: str  # Ключ авторизации (API ключ)
    dateFrom: str  # Дата начала выгрузки в формате 'YYYY-MM-DD'
    dateTo: str  # Дата конца выгрузки в формате 'YYYY-MM-DD'
    format: str  # Формат выгрузки: "JSON" или "XML"


class PPRLoginResponse(BaseModel):
    """Ответ на авторизацию ППР"""
    success: bool = True
    token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: int = 1800  # 30 минут в секундах
    user: Optional[Dict[str, Any]] = None
    message: str = ""


class PPRTransactionItem(BaseModel):
    """Элемент транзакции в формате ППР (русские названия)"""
    Дата: str
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


class PPRTransactionItemEnglish(BaseModel):
    """Элемент транзакции в формате ППР (английские названия для другого модуля 1С)
    
    Соответствует формату официального API ППР
    
    ВАЖНО: В API ППР:
    - amount = количество (литры), НЕ сумма!
    - sum = сумма (цена * количество)
    - quantity отсутствует в API ППР
    """
    # Основные поля (обязательные)
    date: str  # ISO format: "2025-12-10T18:28:30"
    cardNum: str  # Номер карты: "3 001 388 124"
    TypeID: int  # 1 = "Заправка"/"Дебет", 0 = "Возврат"
    amount: float  # КОЛИЧЕСТВО (литры), НЕ сумма!
    sum: float  # Сумма (цена * количество)
    price: float  # Цена за литр
    
    # Дополнительные поля для совместимости с официальным API ППР
    serviceName: Optional[str] = None  # Вид топлива: "ДТ", "АИ-92"
    fuel: Optional[str] = None  # Альтернативное название для serviceName
    posAddress: Optional[str] = None  # Адрес АЗС
    address: Optional[str] = None  # Альтернативное название для posAddress
    carNumber: Optional[str] = None  # Гос. номер ТС
    stateNumber: Optional[str] = None  # Альтернативное название для carNumber
    serviceId: Optional[int] = None  # ID услуги
    posNumber: Optional[int] = None  # Номер АЗС
    posName: Optional[str] = None  # Название АЗС
    posBrand: Optional[str] = None  # Бренд АЗС
    posTown: Optional[str] = None  # Город
    latitude: Optional[float] = None  # Широта
    longitude: Optional[float] = None  # Долгота
    currency: Optional[str] = "RUB"  # Валюта
    unitName: Optional[str] = "л"  # Единица измерения
    sumNds: Optional[float] = None  # Сумма НДС
    discount: Optional[float] = 0.0  # Скидка
    
    # Русские названия для совместимости
    Дата: Optional[str] = None  # Русское название для date
    ПластиковаяКарта: Optional[str] = None  # Русское название для cardNum
    КомуВыдана: Optional[str] = None  # Кому выдана карта
    ТС: Optional[str] = None  # Транспортное средство


class PPRTransactionListResponse(BaseModel):
    """Ответ со списком транзакций ППР"""
    success: bool = True
    Успех: bool = True  # Русское название для совместимости с 1С
    data: List[PPRTransactionItem] = []
    items: List[PPRTransactionItem] = []  # Альтернативное поле для совместимости
    Транзакции: List[PPRTransactionItem] = []  # Русское название для совместимости с 1С
    transactions: List[Dict[str, Any]] = []  # Английское название для другого модуля 1С
    total: int = 0
    ВсегоЗаписей: int = 0  # Русское название для совместимости с 1С
    skip: int = 0
    limit: int = 1000
    message: str = ""
    СообщениеОбОшибке: str = ""  # Русское название для совместимости с 1С
    
    def model_dump(self, **kwargs):
        """Переопределяем сериализацию для поддержки обоих форматов"""
        result = super().model_dump(**kwargs)
        # Копируем данные во все варианты полей для совместимости
        transactions_data = result.get("data") or result.get("items") or result.get("Транзакции") or []
        if transactions_data:
            result["data"] = transactions_data
            result["items"] = transactions_data
            result["Транзакции"] = transactions_data
        
        # Копируем total во ВсегоЗаписей
        total_value = result.get("total", 0)
        result["ВсегоЗаписей"] = total_value
        
        # Копируем success в Успех
        success_value = result.get("success", True)
        result["Успех"] = success_value
        
        # Копируем message в СообщениеОбОшибке
        message_value = result.get("message", "")
        result["СообщениеОбОшибке"] = message_value
        
        return result


class PPRCardItem(BaseModel):
    """Элемент карты в формате ППР"""
    Идентификатор: str
    Номер: str
    Статус: str
    Владелец: str
    Провайдер: str = ""


class PPRCardListResponse(BaseModel):
    """Ответ со списком карт ППР"""
    success: bool = True
    data: List[PPRCardItem] = []
    items: List[PPRCardItem] = []  # Альтернативное поле для совместимости с 1С
    total: int = 0
    skip: int = 0
    limit: int = 1000
    message: str = ""
    
    def model_dump(self, **kwargs):
        """Переопределяем сериализацию для поддержки обоих форматов"""
        result = super().model_dump(**kwargs)
        # Если items пустой, копируем data в items для совместимости
        if not result.get("items") and result.get("data"):
            result["items"] = result["data"]
        return result


@router.post("/login", response_model=PPRLoginResponse)
async def ppr_login(
    login_data: PPRLoginRequest,
    db: Session = Depends(get_db)
):
    """
    Авторизация в API ППР и получение токена
    
    Принимает логин и пароль, возвращает JWT токен для использования в последующих запросах
    Совместимо с API ППР для интеграции с 1С
    """
    try:
        # Аутентифицируем пользователя
        user = get_user_by_username(db, login_data.username)
        if not user:
            logger.warning(f"Пользователь не найден: {login_data.username}")
            return PPRLoginResponse(
                success=False,
                message="Неверное имя пользователя или пароль"
            )
        
        if not verify_password(login_data.password, user.hashed_password):
            logger.warning(f"Неверный пароль для пользователя: {login_data.username}")
            return PPRLoginResponse(
                success=False,
                message="Неверное имя пользователя или пароль"
            )
        
        if not user.is_active:
            logger.warning(f"Пользователь неактивен: {login_data.username}")
            return PPRLoginResponse(
                success=False,
                message="Пользователь неактивен"
            )
        
        # Создаем JWT токен
        access_token_expires = timedelta(minutes=30)
        access_token = create_access_token(
            data={"sub": user.username, "user_id": user.id, "role": user.role},
            expires_delta=access_token_expires
        )
        
        user_data = {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "is_active": user.is_active
        }
        
        logger.info(f"Успешная авторизация через ППР API: {login_data.username}")
        
        return PPRLoginResponse(
            success=True,
            token=access_token,
            token_type="bearer",
            expires_in=30 * 60,  # 30 минут в секундах
            user=user_data,
            message="Авторизация успешна"
        )
    
    except Exception as e:
        logger.error(f"Ошибка при авторизации через ППР API: {str(e)}", exc_info=True)
        return PPRLoginResponse(
            success=False,
            message=f"Внутренняя ошибка сервера: {str(e)}"
        )


@router.post("/login-basic", response_model=PPRLoginResponse)
async def ppr_login_basic(
    credentials: HTTPBasicCredentials = Depends(security_basic),
    db: Session = Depends(get_db)
):
    """
    Авторизация в API ППР через HTTP Basic Authentication
    
    Альтернативный способ авторизации для совместимости
    """
    try:
        # Аутентифицируем пользователя
        user = get_user_by_username(db, credentials.username)
        if not user:
            logger.warning(f"Пользователь не найден: {credentials.username}")
            raise HTTPException(
                status_code=401,
                detail="Неверное имя пользователя или пароль",
                headers={"WWW-Authenticate": "Basic"},
            )
        
        if not verify_password(credentials.password, user.hashed_password):
            logger.warning(f"Неверный пароль для пользователя: {credentials.username}")
            raise HTTPException(
                status_code=401,
                detail="Неверное имя пользователя или пароль",
                headers={"WWW-Authenticate": "Basic"},
            )
        
        if not user.is_active:
            logger.warning(f"Пользователь неактивен: {credentials.username}")
            raise HTTPException(
                status_code=403,
                detail="Пользователь неактивен"
            )
        
        # Создаем JWT токен
        access_token_expires = timedelta(minutes=30)
        access_token = create_access_token(
            data={"sub": user.username, "user_id": user.id, "role": user.role},
            expires_delta=access_token_expires
        )
        
        user_data = {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "is_active": user.is_active
        }
        
        logger.info(f"Успешная авторизация через ППР API (Basic): {credentials.username}")
        
        return PPRLoginResponse(
            success=True,
            token=access_token,
            token_type="bearer",
            expires_in=30 * 60,
            user=user_data,
            message="Авторизация успешна"
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при авторизации через ППР API: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Внутренняя ошибка сервера: {str(e)}"
        )


async def verify_ppr_auth(
    request: StarletteRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Проверка авторизации для PPR API
    Поддерживает два метода:
    1. Bearer токен (JWT) - для пользователей
    2. API ключ в заголовке Authorization - для интеграции с 1С (как в ППР)
    """
    # Логируем входящий запрос для диагностики
    import sys
    print(f"\n{'='*80}", file=sys.stdout, flush=True)
    print(f"!!! PPR API: ВХОДЯЩИЙ ЗАПРОС (verify_ppr_auth) !!!", file=sys.stdout, flush=True)
    print(f"Method: {request.method}", file=sys.stdout, flush=True)
    print(f"URL: {request.url}", file=sys.stdout, flush=True)
    print(f"Path: {request.url.path}", file=sys.stdout, flush=True)
    print(f"Query: {request.url.query}", file=sys.stdout, flush=True)
    print(f"Client: {request.client.host if request.client else None}", file=sys.stdout, flush=True)
    print(f"Authorization header: {request.headers.get('Authorization', 'NOT SET')}", file=sys.stdout, flush=True)
    print(f"{'='*80}\n", file=sys.stdout, flush=True)
    
    logger.info(
        "PPR API: Входящий запрос",
        extra={
            "method": request.method,
            "url": str(request.url),
            "path": request.url.path,
            "query_params": str(request.url.query),
            "client_host": request.client.host if request.client else None,
            "headers": dict(request.headers)
        }
    )
    
    ppr_service = PPRAPIService(db)
    
    # Метод 1: Проверяем Bearer токен
    if credentials and credentials.credentials:
        try:
            current_user = await get_current_user(credentials.credentials, db)
            return {
                "auth_type": "bearer",
                "user": current_user,
                "provider_id": None
            }
        except HTTPException:
            pass  # Продолжаем проверку API ключа
    
    # Метод 2: Проверяем API ключ в заголовке Authorization
    auth_header = request.headers.get("Authorization", "")
    
    # Если есть заголовок Authorization и он не начинается с "Bearer ", это может быть API ключ
    if auth_header:
        if not auth_header.startswith("Bearer "):
            # Это может быть API ключ (как в ППР)
            api_key = auth_header.strip()
            auth_data = ppr_service.authenticate_by_api_key(api_key)
            if auth_data:
                return {
                    "auth_type": "api_key",
                    "user": None,
                    "provider_id": auth_data.get("provider_id"),
                    "provider_name": auth_data.get("provider_name")
                }
        # Если это Bearer токен, но проверка не прошла выше, продолжаем
    
    # Если ничего не подошло
    raise HTTPException(
        status_code=401,
        detail="Неверный токен авторизации или API ключ. Укажите Bearer токен или API ключ в заголовке Authorization.",
        headers={"WWW-Authenticate": "Bearer"},
    )


@router.get("/transaction-list", response_model=PPRTransactionListResponse)
async def ppr_get_transactions(
    auth_info: Dict[str, Any] = Depends(verify_ppr_auth),
    provider_id: Optional[int] = Query(None, description="ID провайдера"),
    date_from: Optional[str] = Query(None, alias="dateFrom", description="Начальная дата периода в формате YYYY-MM-DD или YYYY-MM-DD HH:MM:SS"),
    date_to: Optional[str] = Query(None, alias="dateTo", description="Конечная дата периода в формате YYYY-MM-DD или YYYY-MM-DD HH:MM:SS"),
    skip: int = Query(0, ge=0, description="Количество записей для пропуска"),
    limit: int = Query(1000, ge=1, le=1000, description="Максимальное количество записей"),
    format: Optional[str] = Query(None, description="Формат ответа (json, xml) - для совместимости"),
    db: Session = Depends(get_db)
):
    """
    Получение списка транзакций в формате ППР
    
    Эндпоинт идентичен API ППР для интеграции с модулем 1С уатЗагрузкаПЦ
    Поддерживает два метода авторизации:
    1. Bearer токен: Authorization: Bearer <jwt_token>
    2. API ключ: Authorization: <api_key> (как в оригинальном ППР)
    """
    try:
        # Определяем provider_id из авторизации или параметра
        # Каждый API ключ привязан к своему провайдеру
        final_provider_id = None
        
        # Приоритет: параметр запроса > авторизация по API ключу
        if provider_id is not None:
            final_provider_id = provider_id
        elif auth_info["auth_type"] == "api_key" and auth_info.get("provider_id"):
            # Если используется API ключ, используем provider_id из ключа
            final_provider_id = auth_info["provider_id"]
        
        if not final_provider_id:
            logger.warning("Provider ID не определен для запроса транзакций")
            raise HTTPException(
                status_code=400,
                detail="Необходимо указать provider_id или использовать API ключ, привязанный к провайдеру"
            )
        
        # Используем final_provider_id для запроса
        provider_id = final_provider_id
        
        username = auth_info["user"].username if auth_info.get("user") else f"API_KEY_{auth_info.get('provider_name', 'UNKNOWN')}"
        
        # Парсим даты периода
        parsed_date_from, parsed_date_to = parse_date_range(date_from, date_to)
        
        logger.info(
            "Запрос транзакций через ППР API",
            extra={
                "username": username,
                "auth_type": auth_info["auth_type"],
                "provider_id": provider_id,
                "date_from": parsed_date_from.isoformat() if parsed_date_from else None,
                "date_to": parsed_date_to.isoformat() if parsed_date_to else None,
                "skip": skip,
                "limit": limit
            }
        )
        
        # Создаем сервис и получаем транзакции
        ppr_service = PPRAPIService(db)
        транзакции_русские, всего = ppr_service.get_transactions(
            provider_id=provider_id,
            date_from=parsed_date_from,
            date_to=parsed_date_to,
            skip=skip,
            limit=limit
        )
        
        # Преобразуем в формат ответа (русский формат)
        транзакции_ответ = []
        ошибки_преобразования = []
        
        # Логируем первую транзакцию для диагностики
        if транзакции_русские:
            import sys
            print(f"\n{'='*80}", file=sys.stdout, flush=True)
            print(f"!!! ПЕРВАЯ ТРАНЗАКЦИЯ ДЛЯ ПРЕОБРАЗОВАНИЯ !!!", file=sys.stdout, flush=True)
            первая = транзакции_русские[0]
            if isinstance(первая, dict):
                print(f"Тип: dict", file=sys.stdout, flush=True)
                print(f"Ключи: {list(первая.keys())}", file=sys.stdout, flush=True)
                for key, value in первая.items():
                    print(f"  {key}: {value} (type: {type(value).__name__})", file=sys.stdout, flush=True)
            else:
                print(f"Тип: {type(первая).__name__}", file=sys.stdout, flush=True)
                print(f"Значение: {str(первая)[:500]}", file=sys.stdout, flush=True)
            print(f"{'='*80}\n", file=sys.stdout, flush=True)
        
        for idx, транзакция in enumerate(транзакции_русские):
            try:
                # Логируем первые несколько транзакций перед созданием PPRTransactionItem
                if idx < 3:
                    import sys
                    print(f"\n!!! СОЗДАНИЕ PPRTransactionItem для транзакции {idx} !!!", file=sys.stdout, flush=True)
                    print(f"Данные транзакции:", file=sys.stdout, flush=True)
                    for key, value in транзакция.items():
                        print(f"  {key}: {value} (type: {type(value).__name__})", file=sys.stdout, flush=True)
                
                транзакция_ответ = PPRTransactionItem(**транзакция)
                
                # Логируем результат создания
                if idx < 3:
                    import sys
                    print(f"PPRTransactionItem создан успешно:", file=sys.stdout, flush=True)
                    print(f"  Количество: {транзакция_ответ.Количество} (type: {type(транзакция_ответ.Количество).__name__})", file=sys.stdout, flush=True)
                    print(f"  Сумма: {транзакция_ответ.Сумма} (type: {type(транзакция_ответ.Сумма).__name__})", file=sys.stdout, flush=True)
                    print(f"  ПластиковаяКартаОтчета: '{транзакция_ответ.ПластиковаяКартаОтчета}' (type: {type(транзакция_ответ.ПластиковаяКартаОтчета).__name__})", file=sys.stdout, flush=True)
                    # Проверяем model_dump
                    dumped = транзакция_ответ.model_dump()
                    print(f"model_dump() результат:", file=sys.stdout, flush=True)
                    print(f"  Количество: {dumped.get('Количество')} (type: {type(dumped.get('Количество')).__name__})", file=sys.stdout, flush=True)
                    print(f"  Сумма: {dumped.get('Сумма')} (type: {type(dumped.get('Сумма')).__name__})", file=sys.stdout, flush=True)
                    print(f"  ПластиковаяКартаОтчета: '{dumped.get('ПластиковаяКартаОтчета')}' (type: {type(dumped.get('ПластиковаяКартаОтчета')).__name__})", file=sys.stdout, flush=True)
                
                транзакции_ответ.append(транзакция_ответ)
            except Exception as e:
                ошибки_преобразования.append({
                    "index": idx,
                    "transaction_id": транзакция.get("id") if isinstance(транзакция, dict) else None,
                    "error": str(e),
                    "error_type": type(e).__name__
                })
                if idx < 3:  # Логируем первые 3 ошибки подробно
                    import sys
                    print(f"\n!!! ОШИБКА ПРЕОБРАЗОВАНИЯ ТРАНЗАКЦИИ {idx} !!!", file=sys.stdout, flush=True)
                    print(f"Error: {str(e)}", file=sys.stdout, flush=True)
                    print(f"Error type: {type(e).__name__}", file=sys.stdout, flush=True)
                    if isinstance(транзакция, dict):
                        print(f"Данные транзакции:", file=sys.stdout, flush=True)
                        for key, value in транзакция.items():
                            print(f"  {key}: {value} (type: {type(value).__name__})", file=sys.stdout, flush=True)
                    import traceback
                    print(f"Traceback: {traceback.format_exc()}", file=sys.stdout, flush=True)
                
                logger.error(
                    f"Ошибка при преобразовании транзакции в PPRTransactionItem",
                    extra={
                        "transaction_index": idx,
                        "transaction_data": транзакция if isinstance(транзакция, dict) else str(транзакция)[:200],
                        "error": str(e),
                        "error_type": type(e).__name__
                    },
                    exc_info=True
                )
        
        # Логируем итоги преобразования
        import sys
        print(f"\n{'='*80}", file=sys.stdout, flush=True)
        print(f"!!! ИТОГИ ПРЕОБРАЗОВАНИЯ ТРАНЗАКЦИЙ !!!", file=sys.stdout, flush=True)
        print(f"Всего транзакций: {len(транзакции_русские)}", file=sys.stdout, flush=True)
        print(f"Успешно преобразовано в PPRTransactionItem: {len(транзакции_ответ)}", file=sys.stdout, flush=True)
        print(f"Ошибок преобразования: {len(ошибки_преобразования)}", file=sys.stdout, flush=True)
        if транзакции_ответ:
            print(f"Первый PPRTransactionItem создан успешно", file=sys.stdout, flush=True)
            print(f"Тип первого элемента: {type(транзакции_ответ[0]).__name__}", file=sys.stdout, flush=True)
        if ошибки_преобразования:
            print(f"Первые 5 ошибок:", file=sys.stdout, flush=True)
            for err in ошибки_преобразования[:5]:
                print(f"  Индекс {err['index']}: {err['error_type']} - {err['error']}", file=sys.stdout, flush=True)
        print(f"{'='*80}\n", file=sys.stdout, flush=True)
        
        # Преобразуем в английский формат для другого модуля 1С
        # Получаем оригинальные транзакции из БД для преобразования
        транзакции_english = []
        
        try:
            # Получаем транзакции из БД для преобразования в английский формат
            db_transactions, _ = ppr_service.transaction_repo.get_all(
                skip=skip,
                limit=limit,
                provider_id=provider_id,
                date_from=parsed_date_from,
                date_to=parsed_date_to,
                sort_by="transaction_date",
                sort_order="asc"
            )
            
            import sys
            print(f"Получено транзакций для английского формата: {len(db_transactions)}", file=sys.stdout, flush=True)
            
            for db_transaction in db_transactions:
                try:
                    english_format = ppr_service._convert_transaction_to_english_format(db_transaction)
                    транзакции_english.append(english_format)
                except Exception as e:
                    import sys
                    print(f"Ошибка при преобразовании транзакции {db_transaction.id} в английский формат: {str(e)}", file=sys.stdout, flush=True)
                    logger.error(f"Ошибка при преобразовании транзакции {db_transaction.id} в английский формат", exc_info=True)
                    continue
            
            print(f"Успешно преобразовано в английский формат: {len(транзакции_english)}", file=sys.stdout, flush=True)
        except Exception as e:
            import sys
            print(f"Ошибка при получении транзакций для английского формата: {str(e)}", file=sys.stdout, flush=True)
            import traceback
            print(f"Traceback: {traceback.format_exc()}", file=sys.stdout, flush=True)
            logger.error("Ошибка при получении транзакций для английского формата", exc_info=True)
            # Продолжаем работу, даже если английский формат не получился
        
        logger.info(
            "Транзакции успешно возвращены через ППР API",
            extra={
                "username": username,
                "auth_type": auth_info["auth_type"],
                "total": всего,
                "returned": len(транзакции_ответ),
                "skip": skip,
                "limit": limit
            }
        )
        
        # Логируем перед созданием ответа
        import sys
        print(f"\n{'='*80}", file=sys.stdout, flush=True)
        print(f"!!! СОЗДАНИЕ PPRTransactionListResponse !!!", file=sys.stdout, flush=True)
        print(f"транзакции_ответ (len): {len(транзакции_ответ)}", file=sys.stdout, flush=True)
        print(f"транзакции_english (len): {len(транзакции_english)}", file=sys.stdout, flush=True)
        print(f"всего: {всего}", file=sys.stdout, flush=True)
        if транзакции_ответ:
            print(f"Тип первого элемента транзакции_ответ: {type(транзакции_ответ[0]).__name__}", file=sys.stdout, flush=True)
        print(f"{'='*80}\n", file=sys.stdout, flush=True)
        
        response = PPRTransactionListResponse(
            success=True,
            Успех=True,
            data=транзакции_ответ,
            items=транзакции_ответ,
            Транзакции=транзакции_ответ,  # Русское название для совместимости с 1С
            transactions=транзакции_english,  # Английское название для другого модуля 1С
            total=всего,
            ВсегоЗаписей=всего,  # Русское название для совместимости с 1С
            skip=skip,
            limit=limit,
            message="",
            СообщениеОбОшибке=""
        )
        
        # Логируем после создания ответа
        print(f"\n{'='*80}", file=sys.stdout, flush=True)
        print(f"!!! PPRTransactionListResponse СОЗДАН !!!", file=sys.stdout, flush=True)
        print(f"response.data (len): {len(response.data) if response.data else 0}", file=sys.stdout, flush=True)
        print(f"response.items (len): {len(response.items) if response.items else 0}", file=sys.stdout, flush=True)
        print(f"response.Транзакции (len): {len(response.Транзакции) if response.Транзакции else 0}", file=sys.stdout, flush=True)
        print(f"response.transactions (len): {len(response.transactions) if response.transactions else 0}", file=sys.stdout, flush=True)
        print(f"response.total: {response.total}", file=sys.stdout, flush=True)
        if response.data:
            first_item = response.data[0]
            print(f"Первый элемент response.data:", file=sys.stdout, flush=True)
            print(f"  Тип: {type(first_item).__name__}", file=sys.stdout, flush=True)
            dumped_first = first_item.model_dump() if hasattr(first_item, 'model_dump') else first_item
            print(f"  Количество: {dumped_first.get('Количество')} (type: {type(dumped_first.get('Количество')).__name__})", file=sys.stdout, flush=True)
            print(f"  Сумма: {dumped_first.get('Сумма')} (type: {type(dumped_first.get('Сумма')).__name__})", file=sys.stdout, flush=True)
            print(f"  ПластиковаяКартаОтчета: '{dumped_first.get('ПластиковаяКартаОтчета')}' (type: {type(dumped_first.get('ПластиковаяКартаОтчета')).__name__})", file=sys.stdout, flush=True)
        # Проверяем model_dump всего response
        response_dumped = response.model_dump()
        print(f"response.model_dump() результат:", file=sys.stdout, flush=True)
        print(f"  total: {response_dumped.get('total')}", file=sys.stdout, flush=True)
        print(f"  len(data): {len(response_dumped.get('data', []))}", file=sys.stdout, flush=True)
        print(f"  len(items): {len(response_dumped.get('items', []))}", file=sys.stdout, flush=True)
        print(f"  len(Транзакции): {len(response_dumped.get('Транзакции', []))}", file=sys.stdout, flush=True)
        if response_dumped.get('data'):
            first_dumped = response_dumped['data'][0]
            print(f"  Первый элемент data в model_dump:", file=sys.stdout, flush=True)
            print(f"    Количество: {first_dumped.get('Количество')} (type: {type(first_dumped.get('Количество')).__name__})", file=sys.stdout, flush=True)
            print(f"    Сумма: {first_dumped.get('Сумма')} (type: {type(first_dumped.get('Сумма')).__name__})", file=sys.stdout, flush=True)
            print(f"    ПластиковаяКартаОтчета: '{first_dumped.get('ПластиковаяКартаОтчета')}' (type: {type(first_dumped.get('ПластиковаяКартаОтчета')).__name__})", file=sys.stdout, flush=True)
        print(f"{'='*80}\n", file=sys.stdout, flush=True)
        
        return response
    
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(
            "Ошибка валидации при запросе транзакций через ППР API",
            extra={
                "error": str(e),
                "error_type": type(e).__name__
            }
        )
        return PPRTransactionListResponse(
            success=False,
            message=f"Ошибка валидации: {str(e)}"
        )
    except Exception as e:
        logger.error(
            "Ошибка при получении транзакций через ППР API",
            extra={
                "error": str(e),
                "error_type": type(e).__name__
            },
            exc_info=True
        )
        return PPRTransactionListResponse(
            success=False,
            Успех=False,
            data=[],
            items=[],
            Транзакции=[],
            total=0,
            ВсегоЗаписей=0,
            skip=skip,
            limit=limit,
            message=f"Ошибка при выполнении запроса: {str(e)}",
            СообщениеОбОшибке=f"Ошибка при выполнении запроса: {str(e)}"
        )


@router.get("/card-list", response_model=PPRCardListResponse)
async def ppr_get_cards(
    auth_info: Dict[str, Any] = Depends(verify_ppr_auth),
    provider_id: Optional[int] = Query(None, description="ID провайдера"),
    skip: int = Query(0, ge=0, description="Количество записей для пропуска"),
    limit: int = Query(1000, ge=1, le=1000, description="Максимальное количество записей"),
    db: Session = Depends(get_db)
):
    """
    Получение списка топливных карт в формате ППР
    
    Эндпоинт идентичен API ППР для обновления карт в 1С
    Поддерживает два метода авторизации:
    1. Bearer токен: Authorization: Bearer <jwt_token>
    2. API ключ: Authorization: <api_key> (как в оригинальном ППР)
    """
    try:
        # Определяем provider_id из авторизации или параметра
        if auth_info["auth_type"] == "api_key" and auth_info.get("provider_id"):
            if provider_id is None:
                provider_id = auth_info["provider_id"]
        
        username = auth_info["user"].username if auth_info.get("user") else f"API_KEY_{auth_info.get('provider_name', 'UNKNOWN')}"
        
        logger.info(
            "Запрос карт через ППР API",
            extra={
                "username": username,
                "auth_type": auth_info["auth_type"],
                "provider_id": provider_id,
                "skip": skip,
                "limit": limit
            }
        )
        
        # Создаем сервис и получаем карты
        ppr_service = PPRAPIService(db)
        карты, всего = ppr_service.get_cards(
            provider_id=provider_id,
            skip=skip,
            limit=limit
        )
        
        # Преобразуем в формат ответа
        карты_ответ = [
            PPRCardItem(**карта) for карта in карты
        ]
        
        logger.info(
            "Карты успешно возвращены через ППР API",
            extra={
                "username": username,
                "auth_type": auth_info["auth_type"],
                "total": всего,
                "returned": len(карты_ответ),
                "skip": skip,
                "limit": limit
            }
        )
        
        return PPRCardListResponse(
            success=True,
            data=карты_ответ,
            items=карты_ответ,  # Добавляем items для совместимости с 1С
            total=всего,
            skip=skip,
            limit=limit,
            message=""
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Ошибка при получении карт через ППР API",
            extra={
                "error": str(e),
                "error_type": type(e).__name__
            },
            exc_info=True
        )
        return PPRCardListResponse(
            success=False,
            message=f"Ошибка при выполнении запроса: {str(e)}"
        )


@router.get("")
async def ppr_root():
    """
    Корневой endpoint API ППР для проверки доступности
    """
    return {
        "status": "ok",
        "service": "PPR API",
        "version": "1.0",
        "endpoints": {
            "login": "/api/ppr/login",
            "login_basic": "/api/ppr/login-basic",
            "transaction_list": "/api/ppr/transaction-list",
            "card_list": "/api/ppr/card-list",
            "providers": "/api/ppr/providers",
            "health": "/api/ppr/health"
        },
        "message": "PPR API доступен. Используйте /api/ppr/login для получения токена."
    }


@router.get("/providers")
async def ppr_get_providers(
    auth_info: Dict[str, Any] = Depends(verify_ppr_auth),
    db: Session = Depends(get_db)
):
    """
    Получение списка провайдеров для помощи в настройке
    
    Полезно для определения правильного provider_id при запросе транзакций
    Поддерживает авторизацию по Bearer токену или API ключу
    """
    try:
        username = auth_info["user"].username if auth_info.get("user") else f"API_KEY_{auth_info.get('provider_name', 'UNKNOWN')}"
        
        from app.models import Provider
        
        # Получаем всех активных провайдеров
        providers = db.query(Provider).filter(Provider.is_active == True).all()
        
        providers_list = [
            {
                "id": provider.id,
                "name": provider.name,
                "code": provider.code,
                "is_active": provider.is_active
            }
            for provider in providers
        ]
        
        logger.info(
            "Список провайдеров получен через ППР API",
            extra={
                "username": username,
                "auth_type": auth_info["auth_type"],
                "providers_count": len(providers_list)
            }
        )
        
        return {
            "success": True,
            "data": providers_list,
            "total": len(providers_list),
            "message": ""
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Ошибка при получении провайдеров через ППР API",
            extra={
                "error": str(e),
                "error_type": type(e).__name__
            },
            exc_info=True
        )
        return {
            "success": False,
            "data": [],
            "total": 0,
            "message": f"Ошибка при выполнении запроса: {str(e)}"
        }


@router.get("/health")
async def ppr_health():
    """
    Проверка работоспособности API ППР
    """
    return {
        "status": "ok",
        "service": "PPR API",
        "version": "1.0"
    }


# ============================================================================
# Оригинальные пути ППР API (/api/public-api/v2/...)
# ============================================================================

router_public_api = APIRouter(prefix="/api/public-api/v2", tags=["PPR API"])


@router_public_api.get("")
async def ppr_public_api_root(request: StarletteRequest):
    """
    Корневой эндпоинт оригинального ППР API
    
    Возвращает информацию о доступных эндпоинтах
    БЕЗ АВТОРИЗАЦИИ для диагностики
    """
    # Логируем обращение к корневому эндпоинту
    import sys
    print(f"\n{'='*80}", file=sys.stdout, flush=True)
    print(f"!!! PPR API: ЗАПРОС К КОРНЕВОМУ ЭНДПОИНТУ !!!", file=sys.stdout, flush=True)
    print(f"Method: {request.method}", file=sys.stdout, flush=True)
    print(f"URL: {request.url}", file=sys.stdout, flush=True)
    print(f"Path: {request.url.path}", file=sys.stdout, flush=True)
    print(f"Client: {request.client.host if request.client else None}", file=sys.stdout, flush=True)
    print(f"Headers: {dict(request.headers)}", file=sys.stdout, flush=True)
    print(f"{'='*80}\n", file=sys.stdout, flush=True)
    
    logger.info(
        "PPR API: Запрос к корневому эндпоинту",
        extra={
            "method": request.method,
            "url": str(request.url),
            "path": request.url.path,
            "client_host": request.client.host if request.client else None,
            "headers": {k: v for k, v in request.headers.items() if k.lower() != "authorization"}
        }
    )
    
    return {
        "status": "ok",
        "service": "PPR API",
        "version": "2.0",
        "api_type": "public-api",
        "endpoints": {
            "transactions": "/api/public-api/v2/transactions",
            "cards": "/api/public-api/v2/cards"
        },
        "message": "PPR Public API v2 доступен. Используйте API ключ в заголовке Authorization."
    }


@router_public_api.get("/transactions", response_model=PPRTransactionListResponse)
async def ppr_get_transactions_original(
    request: StarletteRequest,
    auth_info: Dict[str, Any] = Depends(verify_ppr_auth),
    provider_id: Optional[int] = Query(None, description="ID провайдера"),
    date_from: Optional[str] = Query(None, alias="dateFrom", description="Начальная дата периода в формате YYYY-MM-DD или YYYY-MM-DD HH:MM:SS"),
    date_to: Optional[str] = Query(None, alias="dateTo", description="Конечная дата периода в формате YYYY-MM-DD или YYYY-MM-DD HH:MM:SS"),
    skip: int = Query(0, ge=0, description="Количество записей для пропуска"),
    limit: int = Query(1000, ge=1, le=1000, description="Максимальное количество записей"),
    format: Optional[str] = Query(None, description="Формат ответа (json, xml) - для совместимости, всегда возвращается JSON"),
    db: Session = Depends(get_db)
):
    """
    Получение списка транзакций в формате ППР (оригинальный путь)
    
    Оригинальный путь ППР API: /api/public-api/v2/transactions
    """
    # Логируем запрос к эндпоинту транзакций
    import sys
    print(f"\n{'='*80}", file=sys.stdout, flush=True)
    print(f"!!! PPR API: ЗАПРОС К ЭНДПОИНТУ ТРАНЗАКЦИЙ !!!", file=sys.stdout, flush=True)
    print(f"Method: {request.method}", file=sys.stdout, flush=True)
    print(f"URL: {request.url}", file=sys.stdout, flush=True)
    print(f"Path: {request.url.path}", file=sys.stdout, flush=True)
    print(f"Query: {request.url.query}", file=sys.stdout, flush=True)
    print(f"Auth type: {auth_info.get('auth_type')}", file=sys.stdout, flush=True)
    # Определяем provider_id из авторизации или параметра
    # Каждый API ключ привязан к своему провайдеру
    final_provider_id = None
    
    # Приоритет: параметр запроса > авторизация по API ключу
    if provider_id is not None:
        final_provider_id = provider_id
    elif auth_info["auth_type"] == "api_key" and auth_info.get("provider_id"):
        # Если используется API ключ, используем provider_id из ключа
        final_provider_id = auth_info["provider_id"]
    
    if not final_provider_id:
        logger.warning("Provider ID не определен для запроса транзакций (v2)")
        raise HTTPException(
            status_code=400,
            detail="Необходимо указать provider_id или использовать API ключ, привязанный к провайдеру"
        )
    
    provider_name = auth_info.get('provider_name', 'Unknown')
    print(f"Provider ID: {final_provider_id} (Provider: {provider_name}, from auth: {auth_info.get('provider_id')}, from param: {provider_id})", file=sys.stdout, flush=True)
    
    # Используем final_provider_id для запроса
    provider_id = final_provider_id
    print(f"Date from: {date_from}", file=sys.stdout, flush=True)
    print(f"Date to: {date_to}", file=sys.stdout, flush=True)
    print(f"{'='*80}\n", file=sys.stdout, flush=True)
    
    logger.info(
        "PPR API: Запрос транзакций (оригинальный путь v2)",
        extra={
            "method": request.method,
            "url": str(request.url),
            "path": request.url.path,
            "query_params": str(request.url.query),
            "client_host": request.client.host if request.client else None,
            "auth_type": auth_info.get("auth_type"),
            "provider_id": provider_id,
            "provider_name": provider_name,
            "date_from": date_from,
            "date_to": date_to
        }
    )
    
    try:
        # Используем ту же логику, что и в /api/ppr/transaction-list
        result = await ppr_get_transactions(
            auth_info=auth_info,
            provider_id=provider_id,
            date_from=date_from,
            date_to=date_to,
            skip=skip,
            limit=limit,
            db=db
        )
        
        print(f"\n{'='*80}", file=sys.stdout, flush=True)
        print(f"!!! PPR API: ОТВЕТ ОТПРАВЛЕН (в ppr_get_transactions_original) !!!", file=sys.stdout, flush=True)
        print(f"result type: {type(result).__name__}", file=sys.stdout, flush=True)
        print(f"result.total: {result.total}", file=sys.stdout, flush=True)
        print(f"result.data type: {type(result.data).__name__}", file=sys.stdout, flush=True)
        print(f"result.data (len): {len(result.data) if result.data else 0}", file=sys.stdout, flush=True)
        print(f"result.items (len): {len(result.items) if result.items else 0}", file=sys.stdout, flush=True)
        print(f"result.Транзакции (len): {len(result.Транзакции) if result.Транзакции else 0}", file=sys.stdout, flush=True)
        print(f"result.transactions (len): {len(result.transactions) if result.transactions else 0}", file=sys.stdout, flush=True)
        
        # Проверяем model_dump
        dumped = result.model_dump()
        print(f"model_dump() data (len): {len(dumped.get('data', []))}", file=sys.stdout, flush=True)
        print(f"model_dump() items (len): {len(dumped.get('items', []))}", file=sys.stdout, flush=True)
        print(f"model_dump() total: {dumped.get('total', 0)}", file=sys.stdout, flush=True)
        print(f"{'='*80}\n", file=sys.stdout, flush=True)
        
        return result
    except Exception as e:
        import traceback
        print(f"\n{'='*80}", file=sys.stdout, flush=True)
        print(f"!!! PPR API: ОШИБКА ПРИ ОБРАБОТКЕ !!!", file=sys.stdout, flush=True)
        print(f"Error: {str(e)}", file=sys.stdout, flush=True)
        print(f"Traceback: {traceback.format_exc()}", file=sys.stdout, flush=True)
        print(f"{'='*80}\n", file=sys.stdout, flush=True)
        raise


@router_public_api.get("/cards", response_model=PPRCardListResponse)
async def ppr_get_cards_original(
    auth_info: Dict[str, Any] = Depends(verify_ppr_auth),
    provider_id: Optional[int] = Query(None, description="ID провайдера"),
    skip: int = Query(0, ge=0, description="Количество записей для пропуска"),
    limit: int = Query(1000, ge=1, le=1000, description="Максимальное количество записей"),
    db: Session = Depends(get_db)
):
    """
    Получение списка топливных карт в формате ППР (оригинальный путь)
    
    Оригинальный путь ППР API: /api/public-api/v2/cards
    """
    # Используем ту же логику, что и в /api/ppr/card-list
    return await ppr_get_cards(
        auth_info=auth_info,
        provider_id=provider_id,
        skip=skip,
        limit=limit,
        db=db
    )


# ============================================================================
# API v1 для 1С ЕРП (/api/public-api/v1/...)
# ============================================================================

@router_public_api_v1.get("")
async def ppr_public_api_v1_root(request: StarletteRequest):
    """
    Корневой эндпоинт PPR API v1 (для 1С ЕРП)
    
    Возвращает информацию о доступных эндпоинтах
    БЕЗ АВТОРИЗАЦИИ для диагностики
    """
    # Логируем обращение к корневому эндпоинту
    import sys
    print(f"\n{'='*80}", file=sys.stdout, flush=True)
    print(f"!!! PPR API v1: ЗАПРОС К КОРНЕВОМУ ЭНДПОИНТУ !!!", file=sys.stdout, flush=True)
    print(f"Method: {request.method}", file=sys.stdout, flush=True)
    print(f"URL: {request.url}", file=sys.stdout, flush=True)
    print(f"Path: {request.url.path}", file=sys.stdout, flush=True)
    print(f"Client: {request.client.host if request.client else None}", file=sys.stdout, flush=True)
    print(f"Headers: {dict(request.headers)}", file=sys.stdout, flush=True)
    print(f"{'='*80}\n", file=sys.stdout, flush=True)
    
    logger.info(
        "PPR API v1: Запрос к корневому эндпоинту",
        extra={
            "method": request.method,
            "url": str(request.url),
            "path": request.url.path,
            "client_host": request.client.host if request.client else None,
            "headers": {k: v for k, v in request.headers.items() if k.lower() != "authorization"}
        }
    )
    
    return {
        "status": "ok",
        "service": "PPR API",
        "version": "1.0",
        "api_type": "public-api-v1",
        "endpoints": {
            "transaction-list": "/public-api/v1/transaction-list"
        },
        "message": "PPR Public API v1 доступен. Используйте POST запрос к /transaction-list с токеном в теле запроса.",
        "request_format": {
            "method": "POST",
            "url": "/public-api/v1/transaction-list",
            "body": {
                "token": "API_KEY",
                "dateFrom": "YYYY-MM-DD",
                "dateTo": "YYYY-MM-DD",
                "format": "JSON"
            }
        }
    }


@router_public_api_v1.post("/transaction-list")
async def ppr_get_transactions_v1(
    request_data: PPRTransactionListV1Request,
    db: Session = Depends(get_db)
):
    """
    Получение списка транзакций через API v1 (для 1С ЕРП)
    
    Оригинальный путь ППР API: /public-api/v1/transaction-list
    POST-запрос с JSON в теле запроса
    
    Формат запроса:
    {
        "token": "API_KEY",
        "dateFrom": "2015-05-01",
        "dateTo": "2015-05-03",
        "format": "JSON"
    }
    
    Формат ответа:
    {
        "array-list": [
            {
                "idTrans": "...",
                "date": "...",
                "cardNum": "...",
                "amount": 50.0,  // Количество (литры)
                "sum": 3861.8,   // Сумма
                "price": 77.24,  // Цена за литр
                ...
            }
        ]
    }
    """
    try:
        # Используем валидированные данные из Pydantic модели
        token = request_data.token
        date_from_str = request_data.dateFrom
        date_to_str = request_data.dateTo
        format_str = request_data.format
        import sys
        print(f"\n{'='*80}", file=sys.stdout, flush=True)
        print(f"!!! PPR API v1: ВХОДЯЩИЙ ЗАПРОС transaction-list !!!", file=sys.stdout, flush=True)
        print(f"Token: {token[:20]}..." if len(token) > 20 else f"Token: {token}", file=sys.stdout, flush=True)
        print(f"DateFrom: {date_from_str}", file=sys.stdout, flush=True)
        print(f"DateTo: {date_to_str}", file=sys.stdout, flush=True)
        print(f"Format: {format_str}", file=sys.stdout, flush=True)
        print(f"{'='*80}\n", file=sys.stdout, flush=True)
        
        # Проверяем токен (API ключ)
        ppr_service = PPRAPIService(db)
        auth_data = ppr_service.authenticate_by_api_key(token)
        
        if not auth_data:
            logger.warning(f"Неверный API ключ для PPR API v1: {token[:20]}...")
            raise HTTPException(
                status_code=401,
                detail="Неверный токен авторизации"
            )
        
        provider_id = auth_data.get("provider_id")
        provider_name = auth_data.get("provider_name", "Unknown")
        
        if not provider_id:
            # Если провайдер не найден, возвращаем ошибку
            logger.error(f"API ключ найден, но провайдер не определен для ключа: {token[:20]}...")
            raise HTTPException(
                status_code=403,
                detail="API ключ не привязан к провайдеру. Обратитесь к администратору."
            )
        
        print(f"Provider ID: {provider_id} (Provider: {provider_name})", file=sys.stdout, flush=True)
        
        logger.info(
            "Запрос транзакций через PPR API v1",
            extra={
                "provider_id": provider_id,
                "provider_name": provider_name,
                "date_from": date_from_str,
                "date_to": date_to_str,
                "format": format_str
            }
        )
        
        # Парсим даты
        try:
            # Проверяем формат дат перед парсингом
            if len(date_from_str) != 10 or date_from_str.count('-') != 2:
                raise ValueError(f"Неверный формат даты dateFrom: '{date_from_str}'. Ожидается 'YYYY-MM-DD'")
            if len(date_to_str) != 10 or date_to_str.count('-') != 2:
                raise ValueError(f"Неверный формат даты dateTo: '{date_to_str}'. Ожидается 'YYYY-MM-DD'")
            
            date_from = datetime.strptime(date_from_str, "%Y-%m-%d")
            date_to = datetime.strptime(date_to_str, "%Y-%m-%d")
            # Устанавливаем время для date_to на конец дня
            date_to = date_to.replace(hour=23, minute=59, second=59)
        except ValueError as e:
            logger.error(f"Ошибка парсинга дат: {e}, dateFrom: {date_from_str}, dateTo: {date_to_str}")
            raise HTTPException(
                status_code=400,
                detail=f"Неверный формат даты. Ожидается 'YYYY-MM-DD'. dateFrom: '{date_from_str}', dateTo: '{date_to_str}'. Ошибка: {str(e)}"
            )
        
        # Получаем транзакции напрямую из БД для преобразования в формат v1
        from app.models import Transaction
        from sqlalchemy import and_
        
        query = db.query(Transaction).filter(
            Transaction.provider_id == provider_id,
            Transaction.transaction_date >= date_from,
            Transaction.transaction_date <= date_to
        ).order_by(Transaction.transaction_date.desc()).limit(1000)
        
        transactions_raw = query.all()
        всего = query.count()
        
        # Преобразуем каждую транзакцию в формат v1 (английский формат)
        транзакции_english = []
        for transaction in transactions_raw:
            try:
                транзакция_v1 = ppr_service._convert_transaction_to_english_format(transaction)
                транзакции_english.append(транзакция_v1)
            except Exception as e:
                logger.warning(
                    f"Ошибка при преобразовании транзакции {transaction.id} в формат v1: {e}",
                    extra={"transaction_id": transaction.id, "error": str(e)}
                )
        
        logger.info(
            "Транзакции успешно возвращены через PPR API v1",
            extra={
                "provider_id": provider_id,
                "total": всего,
                "returned": len(транзакции_english)
            }
        )
        
        # Формируем ответ в формате v1
        response = {
            "array-list": транзакции_english
        }
        
        # Если формат XML, нужно преобразовать (но пока поддерживаем только JSON)
        if format_str.upper() == "XML":
            logger.warning("Формат XML не поддерживается, возвращаем JSON")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Ошибка при получении транзакций через PPR API v1",
            extra={
                "error": str(e),
                "error_type": type(e).__name__
            },
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка при выполнении запроса: {str(e)}"
        )

