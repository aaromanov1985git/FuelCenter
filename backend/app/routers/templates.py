"""
Роутер для работы с шаблонами провайдеров
"""
from fastapi import APIRouter, UploadFile, File, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
from app.database import get_db
from app.logger import logger
from app.models import Provider, ProviderTemplate
from app.schemas import (
    ProviderTemplateResponse, ProviderTemplateCreate, ProviderTemplateUpdate,
    ProviderTemplateListResponse
)
from app.services import analyze_template_structure
from app.utils import (
    validate_excel_file,
    create_temp_file,
    cleanup_temp_file,
    parse_template_json,
    serialize_template_json,
    get_firebird_service
)
from app.services.api_provider_service import ApiProviderService
from app.services.auto_load_service import AutoLoadService

router = APIRouter(prefix="/api/v1/templates", tags=["templates"])


@router.get("/{template_id}", response_model=ProviderTemplateResponse)
async def get_template(template_id: int, db: Session = Depends(get_db)):
    """
    Получение шаблона по ID
    """
    template = db.query(ProviderTemplate).filter(ProviderTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    return template


@router.put("/{template_id}", response_model=ProviderTemplateResponse)
async def update_template(
    template_id: int,
    template: ProviderTemplateUpdate,
    db: Session = Depends(get_db)
):
    """
    Обновление шаблона
    """
    db_template = db.query(ProviderTemplate).filter(ProviderTemplate.id == template_id).first()
    if not db_template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    
    if template.name is not None:
        db_template.name = template.name
    if template.description is not None:
        db_template.description = template.description
    if template.connection_type is not None:
        db_template.connection_type = template.connection_type
    if template.connection_settings is not None:
        db_template.connection_settings = serialize_template_json(template.connection_settings)
    if template.field_mapping is not None:
        db_template.field_mapping = serialize_template_json(template.field_mapping)
    if template.header_row is not None:
        db_template.header_row = template.header_row
    if template.data_start_row is not None:
        db_template.data_start_row = template.data_start_row
    if template.source_table is not None:
        db_template.source_table = template.source_table
    if template.source_query is not None:
        db_template.source_query = template.source_query
    if template.fuel_type_mapping is not None:
        db_template.fuel_type_mapping = serialize_template_json(template.fuel_type_mapping)
    if template.is_active is not None:
        db_template.is_active = template.is_active
    if template.auto_load_enabled is not None:
        db_template.auto_load_enabled = template.auto_load_enabled
    if template.auto_load_schedule is not None:
        db_template.auto_load_schedule = template.auto_load_schedule
    if template.auto_load_date_from_offset is not None:
        db_template.auto_load_date_from_offset = template.auto_load_date_from_offset
    if template.auto_load_date_to_offset is not None:
        db_template.auto_load_date_to_offset = template.auto_load_date_to_offset
    
    db.commit()
    db.refresh(db_template)
    
    logger.info("Шаблон обновлен", extra={"template_id": template_id})
    
    return db_template


@router.delete("/{template_id}")
async def delete_template(template_id: int, db: Session = Depends(get_db)):
    """
    Удаление шаблона
    """
    template = db.query(ProviderTemplate).filter(ProviderTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    
    db.delete(template)
    db.commit()
    
    logger.info("Шаблон удален", extra={"template_id": template_id})
    
    return {"message": "Шаблон успешно удален"}


@router.post("/analyze")
async def analyze_template(
    file: UploadFile = File(...)
):
    """
    Анализ структуры Excel файла для создания шаблона
    """
    validate_excel_file(file)
    
    tmp_file_path = None
    try:
        content = await file.read()
        tmp_file_path = create_temp_file(content, suffix=".xlsx")
        
        structure = analyze_template_structure(tmp_file_path)
        
        logger.debug("Анализ структуры файла завершен", extra={"file_name": file.filename})
        
        return structure
    finally:
        if tmp_file_path:
            cleanup_temp_file(tmp_file_path)


@router.post("/test-firebird-connection")
async def test_firebird_connection_direct(
    connection_settings: dict,
    db: Session = Depends(get_db)
):
    """
    Тестирование подключения к Firebird без сохранения шаблона
    Используется при создании нового шаблона
    """
    firebird_service_class = get_firebird_service()
    
    if not connection_settings:
        raise HTTPException(
            status_code=400,
            detail="Не указаны настройки подключения"
        )
    
    try:
        firebird_service = firebird_service_class(db)
        test_result = firebird_service.test_connection(connection_settings)
        
        logger.info("Тест подключения к Firebird выполнен (без шаблона)", extra={
            "success": test_result["success"]
        })
        
        return test_result
        
    except ConnectionError as e:
        # Ошибка подключения (включая отсутствие клиентской библиотеки)
        logger.error("Ошибка подключения к Firebird", extra={
            "error": str(e)
        }, exc_info=True)
        # Возвращаем результат с ошибкой вместо исключения, чтобы фронтенд мог показать сообщение
        return {
            "success": False,
            "message": str(e),
            "tables": []
        }
    except Exception as e:
        logger.error("Ошибка при тестировании подключения к Firebird", extra={
            "error": str(e)
        }, exc_info=True)
        return {
            "success": False,
            "message": f"Ошибка при тестировании подключения: {str(e)}",
            "tables": []
        }


@router.post("/{template_id}/test-firebird-connection")
async def test_firebird_connection(
    template_id: int,
    db: Session = Depends(get_db)
):
    """
    Тестирование подключения к базе данных Firebird для указанного шаблона
    Возвращает список таблиц при успешном подключении
    """
    firebird_service_class = get_firebird_service()
    
    template = db.query(ProviderTemplate).filter(ProviderTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    
    if template.connection_type != "firebird":
        raise HTTPException(
            status_code=400,
            detail=f"Шаблон имеет тип подключения '{template.connection_type}', ожидается 'firebird'"
        )
    
    if not template.connection_settings:
        raise HTTPException(
            status_code=400,
            detail="В шаблоне не указаны настройки подключения к Firebird"
        )
    
    try:
        connection_settings = parse_template_json(template.connection_settings)
        
        firebird_service = firebird_service_class(db)
        test_result = firebird_service.test_connection(connection_settings)
        
        logger.info("Тест подключения к Firebird выполнен", extra={
            "template_id": template_id,
            "success": test_result["success"]
        })
        
        return test_result
        
    except ConnectionError as e:
        # Ошибка подключения (включая отсутствие клиентской библиотеки)
        logger.error("Ошибка подключения к Firebird", extra={
            "template_id": template_id,
            "error": str(e)
        }, exc_info=True)
        # Возвращаем результат с ошибкой вместо исключения, чтобы фронтенд мог показать сообщение
        return {
            "success": False,
            "message": str(e),
            "tables": []
        }
    except Exception as e:
        logger.error("Ошибка при тестировании подключения к Firebird", extra={
            "template_id": template_id,
            "error": str(e)
        }, exc_info=True)
        return {
            "success": False,
            "message": f"Ошибка при тестировании подключения: {str(e)}",
            "tables": []
        }


@router.post("/firebird-table-columns")
async def get_firebird_table_columns_direct(
    request_data: dict,
    db: Session = Depends(get_db)
):
    """
    Получение списка колонок таблицы из базы данных Firebird без сохранения шаблона
    Используется при создании нового шаблона
    """
    logger.info("Получен запрос на загрузку колонок таблицы", extra={
        "request_data_keys": list(request_data.keys()) if request_data else []
    })
    
    firebird_service_class = get_firebird_service()
    
    connection_settings = request_data.get("connection_settings")
    table_name = request_data.get("table_name")
    
    logger.info("Парсинг параметров запроса", extra={
        "has_connection_settings": bool(connection_settings),
        "table_name": table_name
    })
    
    if not connection_settings:
        logger.error("Не указаны настройки подключения")
        raise HTTPException(
            status_code=400,
            detail="Не указаны настройки подключения"
        )
    
    if not table_name:
        logger.error("Не указано имя таблицы")
        raise HTTPException(
            status_code=400,
            detail="Не указано имя таблицы"
        )
    
    try:
        logger.info("Запрос колонок таблицы (без шаблона)", extra={
            "table_name": table_name,
            "connection_settings": {k: v for k, v in connection_settings.items() if k != 'password'}
        })
        
        firebird_service = firebird_service_class(db)
        columns = firebird_service.get_table_columns(connection_settings, table_name)
        
        logger.info("Колонки таблицы загружены (без шаблона)", extra={
            "table_name": table_name,
            "columns_count": len(columns),
            "columns": columns[:10] if columns else []
        })
        
        return {
            "table_name": table_name,
            "columns": columns
        }
        
    except Exception as e:
        logger.error("Ошибка при получении колонок таблицы", extra={
            "table_name": table_name,
            "error": str(e)
        }, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка при получении колонок таблицы: {str(e)}")


@router.post("/firebird-query-columns")
async def get_firebird_query_columns(
    request_data: dict,
    db: Session = Depends(get_db)
):
    """
    Получение списка колонок из результата SQL запроса без сохранения шаблона
    Используется при создании нового шаблона для получения колонок из SQL запроса
    """
    logger.info("Получен запрос на загрузку колонок из SQL запроса", extra={
        "request_data_keys": list(request_data.keys()) if request_data else []
    })
    
    firebird_service_class = get_firebird_service()
    
    connection_settings = request_data.get("connection_settings")
    query = request_data.get("query")
    
    logger.info("Парсинг параметров запроса", extra={
        "has_connection_settings": bool(connection_settings),
        "has_query": bool(query),
        "query_preview": query[:200] if query and len(query) > 200 else query
    })
    
    if not connection_settings:
        logger.error("Не указаны настройки подключения")
        raise HTTPException(
            status_code=400,
            detail="Не указаны настройки подключения"
        )
    
    if not query:
        logger.error("Не указан SQL запрос")
        raise HTTPException(
            status_code=400,
            detail="Не указан SQL запрос"
        )
    
    try:
        logger.info("Запрос колонок из SQL запроса (без шаблона)", extra={
            "query_preview": query[:200] if len(query) > 200 else query
        })
        
        firebird_service = firebird_service_class(db)
        columns = firebird_service.get_query_columns(connection_settings, query)
        
        logger.info("Колонки из SQL запроса загружены (без шаблона)", extra={
            "columns_count": len(columns),
            "columns": columns[:10] if columns else []
        })
        
        return {
            "columns": columns,
            "query_preview": query[:200] if len(query) > 200 else query
        }
        
    except Exception as e:
        logger.error("Ошибка при получении колонок из SQL запроса", extra={
            "error": str(e),
            "query_preview": query[:200] if query and len(query) > 200 else query
        }, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка при получении колонок из SQL запроса: {str(e)}")


@router.get("/{template_id}/firebird-table-columns")
async def get_firebird_table_columns(
    template_id: int,
    table_name: str = Query(..., description="Имя таблицы"),
    db: Session = Depends(get_db)
):
    """
    Получение списка колонок таблицы из базы данных Firebird
    """
    firebird_service_class = get_firebird_service()
    
    template = db.query(ProviderTemplate).filter(ProviderTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    
    if template.connection_type != "firebird":
        raise HTTPException(
            status_code=400,
            detail=f"Шаблон имеет тип подключения '{template.connection_type}', ожидается 'firebird'"
        )
    
    if not template.connection_settings:
        raise HTTPException(
            status_code=400,
            detail="В шаблоне не указаны настройки подключения к Firebird"
        )
    
    try:
        connection_settings = parse_template_json(template.connection_settings)
        
        firebird_service = firebird_service_class(db)
        columns = firebird_service.get_table_columns(connection_settings, table_name)
        
        logger.info("Колонки таблицы загружены", extra={
            "template_id": template_id,
            "table_name": table_name,
            "columns_count": len(columns)
        })
        
        return {
            "table_name": table_name,
            "columns": columns
        }
        
    except Exception as e:
        logger.error("Ошибка при получении колонок таблицы", extra={
            "template_id": template_id,
            "table_name": table_name,
            "error": str(e)
        }, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка при получении колонок таблицы: {str(e)}")


@router.post("/test-api-connection")
async def test_api_connection_direct(
    connection_settings: dict,
    db: Session = Depends(get_db)
):
    """
    Тестирование подключения к API без сохранения шаблона
    Используется при создании нового шаблона
    """
    api_service = ApiProviderService(db)
    
    if not connection_settings:
        raise HTTPException(
            status_code=400,
            detail="Не указаны настройки подключения"
        )
    
    try:
        # Создаем временный шаблон для тестирования
        from app.models import ProviderTemplate
        temp_template = ProviderTemplate(
            connection_type="api",
            connection_settings=serialize_template_json(connection_settings),
            field_mapping={},
            provider_id=1  # Временное значение, не используется
        )
        
        import asyncio
        result = await api_service.test_connection(temp_template)
        
        logger.info("Тест подключения к API выполнен (без шаблона)", extra={
            "success": result["success"]
        })
        
        return result
        
    except ValueError as e:
        logger.error("Ошибка валидации при тестировании подключения к API", extra={
            "error": str(e)
        }, exc_info=True)
        return {
            "success": False,
            "message": str(e),
            "details": {"error": str(e)}
        }
    except Exception as e:
        logger.error("Ошибка при тестировании подключения к API", extra={
            "error": str(e)
        }, exc_info=True)
        return {
            "success": False,
            "message": f"Ошибка при тестировании подключения: {str(e)}",
            "details": {"error": str(e)}
        }


@router.post("/{template_id}/test-api-connection")
async def test_api_connection(
    template_id: int,
    db: Session = Depends(get_db)
):
    """
    Тестирование подключения к API для указанного шаблона
    """
    api_service = ApiProviderService(db)
    
    template = db.query(ProviderTemplate).filter(ProviderTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    
    if template.connection_type != "api":
        raise HTTPException(
            status_code=400,
            detail=f"Шаблон имеет тип подключения '{template.connection_type}', ожидается 'api'"
        )
    
    if not template.connection_settings:
        raise HTTPException(
            status_code=400,
            detail="В шаблоне не указаны настройки подключения к API"
        )
    
    try:
        import asyncio
        result = await api_service.test_connection(template)
        
        logger.info("Тест подключения к API выполнен", extra={
            "template_id": template_id,
            "success": result["success"]
        })
        
        return result
        
    except Exception as e:
        logger.error("Ошибка при тестировании подключения к API", extra={
            "template_id": template_id,
            "error": str(e)
        }, exc_info=True)
        return {
            "success": False,
            "message": f"Ошибка при тестировании подключения: {str(e)}",
            "details": {"error": str(e)}
        }


@router.post("/api-fields")
async def get_api_fields_direct(
    connection_settings: dict,
    db: Session = Depends(get_db)
):
    """
    Получение списка полей из API ответа без сохранения шаблона
    Используется при создании нового шаблона для получения доступных полей
    """
    api_service = ApiProviderService(db)
    
    if not connection_settings:
        raise HTTPException(
            status_code=400,
            detail="Не указаны настройки подключения"
        )
    
    try:
        # Создаем временный шаблон для получения полей
        from app.models import ProviderTemplate
        temp_template = ProviderTemplate(
            connection_type="api",
            connection_settings=serialize_template_json(connection_settings),
            field_mapping={},
            provider_id=1  # Временное значение, не используется
        )
        
        import asyncio
        result = await api_service.get_api_fields(temp_template)
        
        logger.info("Поля из API получены (без шаблона)", extra={
            "fields_count": result.get("count", 0),
            "has_error": result.get("error") is not None
        })
        
        return result
        
    except Exception as e:
        logger.error("Ошибка при получении полей из API", extra={
            "error": str(e)
        }, exc_info=True)
        return {
            "fields": [],
            "count": 0,
            "error": f"Ошибка при получении полей: {str(e)}"
        }


@router.post("/{template_id}/api-fields")
async def get_api_fields(
    template_id: int,
    db: Session = Depends(get_db)
):
    """
    Получение списка полей из API ответа для указанного шаблона
    """
    api_service = ApiProviderService(db)
    
    template = db.query(ProviderTemplate).filter(ProviderTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    
    if template.connection_type != "api":
        raise HTTPException(
            status_code=400,
            detail=f"Шаблон имеет тип подключения '{template.connection_type}', ожидается 'api'"
        )
    
    if not template.connection_settings:
        raise HTTPException(
            status_code=400,
            detail="В шаблоне не указаны настройки подключения к API"
        )
    
    try:
        import asyncio
        result = await api_service.get_api_fields(template)
        
        logger.info("Поля из API получены", extra={
            "template_id": template_id,
            "fields_count": result.get("count", 0),
            "has_error": result.get("error") is not None
        })
        
        return result
        
    except Exception as e:
        logger.error("Ошибка при получении полей из API", extra={
            "template_id": template_id,
            "error": str(e)
        }, exc_info=True)
        return {
            "fields": [],
            "count": 0,
            "error": f"Ошибка при получении полей: {str(e)}"
        }


@router.post("/auto-load")
async def run_auto_load(
    db: Session = Depends(get_db)
):
    """
    Запуск автоматической загрузки транзакций для всех шаблонов с включенной автозагрузкой
    
    Автоматически загружает транзакции из Firebird и API для всех активных шаблонов,
    у которых включена автоматическая загрузка (auto_load_enabled = True).
    
    Для каждого шаблона используются настройки:
    - auto_load_date_from_offset: смещение в днях от текущей даты для начальной даты
    - auto_load_date_to_offset: смещение в днях от текущей даты для конечной даты
    
    Returns:
        Словарь с результатами загрузки:
        - total_templates: общее количество шаблонов с включенной автозагрузкой
        - loaded_templates: количество успешно загруженных шаблонов
        - failed_templates: количество шаблонов с ошибками
        - results: список результатов по каждому шаблону
    """
    logger.info("Запуск автоматической загрузки шаблонов")
    
    try:
        auto_load_service = AutoLoadService(db)
        result = auto_load_service.load_all_enabled_templates()
        
        logger.info("Автоматическая загрузка завершена", extra={
            "total_templates": result["total_templates"],
            "loaded_templates": result["loaded_templates"],
            "failed_templates": result["failed_templates"]
        })
        
        return result
        
    except Exception as e:
        logger.error("Ошибка при автоматической загрузке шаблонов", extra={
            "error": str(e)
        }, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка при автоматической загрузке: {str(e)}"
        )
