"""
Middleware для логирования запросов
"""
import time
import traceback
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app.logger import logger
from app.services.logging_service import logging_service
from app.database import SessionLocal


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware для логирования всех HTTP запросов
    """
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # Получаем IP адрес клиента
        client_ip = request.client.host if request.client else "unknown"
        
        # Пропускаем логирование для health check и других служебных endpoints
        skip_paths = ["/health", "/api/v1/config", "/docs", "/openapi.json", "/redoc"]
        should_log = not any(request.url.path.startswith(path) for path in skip_paths)
        
        # Специальная обработка для PPR API - всегда логируем
        is_ppr_api = request.url.path.startswith("/api/public-api/v2") or request.url.path.startswith("/api/ppr")
        if is_ppr_api:
            import sys
            print(f"\n{'!'*80}", file=sys.stdout, flush=True)
            print(f"!!! MIDDLEWARE: PPR API ЗАПРОС ПОЛУЧЕН !!!", file=sys.stdout, flush=True)
            print(f"Path: {request.url.path}", file=sys.stdout, flush=True)
            print(f"Method: {request.method}", file=sys.stdout, flush=True)
            print(f"Client IP: {client_ip}", file=sys.stdout, flush=True)
            print(f"Full URL: {request.url}", file=sys.stdout, flush=True)
            print(f"Headers: {dict(request.headers)}", file=sys.stdout, flush=True)
            print(f"{'!'*80}\n", file=sys.stdout, flush=True)
        
        # Логируем начало запроса
        if should_log:
            # Специальная обработка для всех POST запросов к /api/v1/templates
            if request.url.path.startswith("/api/v1/templates") and request.method == "POST":
                import sys
                print(f"\n{'='*80}", file=sys.stdout, flush=True)
                print(f"MIDDLEWARE: POST {request.url.path} ЗАПРОС ПОЛУЧЕН", file=sys.stdout, flush=True)
                print(f"Client IP: {client_ip}", file=sys.stdout, flush=True)
                print(f"Full URL: {request.url}", file=sys.stdout, flush=True)
                print(f"Headers: {dict(request.headers)}", file=sys.stdout, flush=True)
                print(f"{'='*80}\n", file=sys.stdout, flush=True)
                logger.info(f"MIDDLEWARE: POST {request.url.path} ЗАПРОС ПОЛУЧЕН", extra={
                    "method": request.method,
                    "path": request.url.path,
                    "full_url": str(request.url),
                    "client_ip": client_ip,
                    "headers": dict(request.headers),
                    "event_type": "request",
                    "event_category": "templates_post"
                })
            
            # Специальная обработка для auto-load endpoint
            if request.url.path == "/api/v1/templates/auto-load" and request.method == "POST":
                import sys
                print(f"\n{'!'*80}", file=sys.stdout, flush=True)
                print(f"!!! MIDDLEWARE: POST /api/v1/templates/auto-load ЗАПРОС ПОЛУЧЕН !!!", file=sys.stdout, flush=True)
                print(f"Client IP: {client_ip}", file=sys.stdout, flush=True)
                print(f"Headers: {dict(request.headers)}", file=sys.stdout, flush=True)
                print(f"{'!'*80}\n", file=sys.stdout, flush=True)
                logger.info("!!! MIDDLEWARE: POST /api/v1/templates/auto-load ЗАПРОС ПОЛУЧЕН !!!", extra={
                    "method": request.method,
                    "path": request.url.path,
                    "client_ip": client_ip,
                    "headers": dict(request.headers),
                    "event_type": "request",
                    "event_category": "auto_load_manual"
                })
            
            logger.info(
                f"Входящий запрос: {request.method} {request.url.path}",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "client_ip": client_ip,
                    "query_params": str(request.query_params) if request.query_params else None
                }
            )
        
        db = SessionLocal()
        try:
            # Выполняем запрос
            response = await call_next(request)
            
            # Вычисляем время выполнения
            process_time = time.time() - start_time
            
            # Логируем успешный ответ
            if should_log:
                logger.info(
                    f"Запрос выполнен: {request.method} {request.url.path}",
                    extra={
                        "method": request.method,
                        "path": request.url.path,
                        "status_code": response.status_code,
                        "process_time_ms": round(process_time * 1000, 2),
                        "client_ip": client_ip
                    }
                )
                
                # Логируем системное событие в БД
                try:
                    # Логируем все запросы для отладки (можно ограничить только важными)
                    log_level = "ERROR" if response.status_code >= 500 else "INFO"
                    logging_service.log_system_event(
                        db=db,
                        level=log_level,
                        message=f"HTTP {request.method} {request.url.path} - {response.status_code}",
                        module="middleware",
                        function="dispatch",
                        event_type="request",
                        event_category="http",
                        extra_data={
                            "method": request.method,
                            "path": request.url.path,
                            "status_code": response.status_code,
                            "client_ip": client_ip,
                            "process_time_ms": round(process_time * 1000, 2)
                        }
                    )
                except Exception as log_error:
                    # Не прерываем выполнение, если логирование не удалось
                    logger.error(f"Ошибка при записи системного лога: {log_error}", exc_info=True)
            
            # Добавляем заголовок с временем выполнения
            response.headers["X-Process-Time"] = str(round(process_time * 1000, 2))
            
            return response
            
        except Exception as e:
            # Логируем ошибку
            process_time = time.time() - start_time
            logger.error(
                f"Ошибка при обработке запроса: {request.method} {request.url.path}",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "error": str(e),
                    "process_time_ms": round(process_time * 1000, 2),
                    "client_ip": client_ip
                },
                exc_info=True
            )
            
            # Логируем системное событие в БД
            if should_log:
                try:
                    logging_service.log_system_event(
                        db=db,
                        level="ERROR",
                        message=f"Ошибка при обработке запроса: {request.method} {request.url.path}",
                        module="middleware",
                        function="dispatch",
                        event_type="request",
                        event_category="http",
                        extra_data={
                            "method": request.method,
                            "path": request.url.path,
                            "client_ip": client_ip,
                            "process_time_ms": round(process_time * 1000, 2)
                        },
                        exception=e
                    )
                except Exception as log_error:
                    logger.error(f"Ошибка при записи системного лога: {log_error}", exc_info=True)
            
            raise
        finally:
            db.close()

