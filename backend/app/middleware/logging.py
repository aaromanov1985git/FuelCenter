"""
Middleware для логирования запросов
"""
import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app.logger import logger


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware для логирования всех HTTP запросов
    """
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # Получаем IP адрес клиента
        client_ip = request.client.host if request.client else "unknown"
        
        # Логируем начало запроса
        logger.info(
            f"Входящий запрос: {request.method} {request.url.path}",
            extra={
                "method": request.method,
                "path": request.url.path,
                "client_ip": client_ip,
                "query_params": str(request.query_params) if request.query_params else None
            }
        )
        
        try:
            # Выполняем запрос
            response = await call_next(request)
            
            # Вычисляем время выполнения
            process_time = time.time() - start_time
            
            # Логируем успешный ответ
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
            raise

