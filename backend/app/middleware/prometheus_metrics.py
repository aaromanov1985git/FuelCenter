"""
Prometheus метрики для мониторинга приложения
"""
import time
from typing import Callable
from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from prometheus_client import (
    Counter,
    Histogram,
    Gauge,
    generate_latest,
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    multiprocess,
    REGISTRY
)
from starlette.responses import Response as StarletteResponse
import os

from app.logger import logger


# Создаём кастомный registry для избежания конфликтов
# При multiprocess режиме используется другой подход
try:
    # Проверяем, работаем ли в multiprocess режиме
    prometheus_multiproc_dir = os.getenv("PROMETHEUS_MULTIPROC_DIR")
    if prometheus_multiproc_dir:
        registry = CollectorRegistry()
        multiprocess.MultiProcessCollector(registry)
    else:
        registry = REGISTRY
except Exception:
    registry = REGISTRY


# HTTP метрики
HTTP_REQUEST_COUNT = Counter(
    "http_requests_total",
    "Общее количество HTTP запросов",
    ["method", "endpoint", "status_code"],
    registry=registry
)

HTTP_REQUEST_DURATION = Histogram(
    "http_request_duration_seconds",
    "Время выполнения HTTP запросов в секундах",
    ["method", "endpoint"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
    registry=registry
)

HTTP_REQUESTS_IN_PROGRESS = Gauge(
    "http_requests_in_progress",
    "Количество запросов в обработке",
    ["method", "endpoint"],
    registry=registry
)

# Метрики приложения
ACTIVE_USERS = Gauge(
    "gsm_active_users",
    "Количество активных пользователей",
    registry=registry
)

TRANSACTIONS_TOTAL = Counter(
    "gsm_transactions_total",
    "Общее количество обработанных транзакций",
    ["status"],  # success, failed, skipped
    registry=registry
)

UPLOAD_EVENTS_TOTAL = Counter(
    "gsm_upload_events_total",
    "Общее количество событий загрузки",
    ["source_type", "status"],  # auto/manual, success/failed
    registry=registry
)

DB_CONNECTIONS_ACTIVE = Gauge(
    "gsm_db_connections_active",
    "Количество активных подключений к БД",
    registry=registry
)

BACKUP_LAST_SUCCESS = Gauge(
    "gsm_backup_last_success_timestamp",
    "Время последнего успешного бэкапа (unix timestamp)",
    registry=registry
)

BACKUP_SIZE_BYTES = Gauge(
    "gsm_backup_size_bytes",
    "Размер последнего бэкапа в байтах",
    registry=registry
)

SCHEDULER_JOBS_TOTAL = Gauge(
    "gsm_scheduler_jobs_total",
    "Количество запланированных задач",
    registry=registry
)

AUTH_FAILURES_TOTAL = Counter(
    "gsm_auth_failures_total",
    "Количество неудачных попыток аутентификации",
    ["reason"],  # wrong_password, user_not_found, token_expired
    registry=registry
)

RATE_LIMIT_EXCEEDED_TOTAL = Counter(
    "gsm_rate_limit_exceeded_total",
    "Количество превышений rate limit",
    ["endpoint"],
    registry=registry
)


def normalize_endpoint(path: str) -> str:
    """
    Нормализация endpoint для агрегации метрик
    Заменяет динамические части пути на плейсхолдеры
    """
    # Разбиваем путь на части
    parts = path.split("/")
    normalized_parts = []
    
    for part in parts:
        # Если часть - это число (ID), заменяем на плейсхолдер
        if part.isdigit():
            normalized_parts.append("{id}")
        # Если часть похожа на UUID
        elif len(part) == 36 and part.count("-") == 4:
            normalized_parts.append("{uuid}")
        else:
            normalized_parts.append(part)
    
    return "/".join(normalized_parts)


class PrometheusMiddleware(BaseHTTPMiddleware):
    """Middleware для сбора Prometheus метрик"""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Пропускаем метрики endpoint
        if request.url.path == "/metrics":
            return await call_next(request)
        
        method = request.method
        endpoint = normalize_endpoint(request.url.path)
        
        # Увеличиваем счётчик запросов в обработке
        HTTP_REQUESTS_IN_PROGRESS.labels(method=method, endpoint=endpoint).inc()
        
        start_time = time.time()
        
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception as e:
            status_code = 500
            raise
        finally:
            # Время выполнения
            duration = time.time() - start_time
            
            # Записываем метрики
            HTTP_REQUEST_COUNT.labels(
                method=method,
                endpoint=endpoint,
                status_code=str(status_code)
            ).inc()
            
            HTTP_REQUEST_DURATION.labels(
                method=method,
                endpoint=endpoint
            ).observe(duration)
            
            # Уменьшаем счётчик запросов в обработке
            HTTP_REQUESTS_IN_PROGRESS.labels(method=method, endpoint=endpoint).dec()
        
        return response


def setup_prometheus(app: FastAPI):
    """
    Настройка Prometheus метрик для приложения
    
    Args:
        app: FastAPI приложение
    """
    # Добавляем middleware
    app.add_middleware(PrometheusMiddleware)
    
    # Endpoint для метрик
    @app.get("/metrics", include_in_schema=False)
    async def metrics():
        """Endpoint для Prometheus scraping"""
        return StarletteResponse(
            content=generate_latest(registry),
            media_type=CONTENT_TYPE_LATEST
        )
    
    logger.info("Prometheus метрики настроены", extra={
        "endpoint": "/metrics",
        "event_type": "system",
        "event_category": "startup"
    })


# Вспомогательные функции для обновления метрик из других модулей

def record_transaction(status: str):
    """Записать метрику транзакции"""
    TRANSACTIONS_TOTAL.labels(status=status).inc()


def record_upload_event(source_type: str, status: str):
    """Записать метрику события загрузки"""
    UPLOAD_EVENTS_TOTAL.labels(source_type=source_type, status=status).inc()


def record_auth_failure(reason: str):
    """Записать метрику неудачной аутентификации"""
    AUTH_FAILURES_TOTAL.labels(reason=reason).inc()


def record_rate_limit_exceeded(endpoint: str):
    """Записать метрику превышения rate limit"""
    RATE_LIMIT_EXCEEDED_TOTAL.labels(endpoint=normalize_endpoint(endpoint)).inc()


def update_active_users(count: int):
    """Обновить количество активных пользователей"""
    ACTIVE_USERS.set(count)


def update_db_connections(count: int):
    """Обновить количество активных подключений к БД"""
    DB_CONNECTIONS_ACTIVE.set(count)


def update_scheduler_jobs(count: int):
    """Обновить количество запланированных задач"""
    SCHEDULER_JOBS_TOTAL.set(count)


def record_backup_success(size_bytes: int):
    """Записать метрику успешного бэкапа"""
    import time
    BACKUP_LAST_SUCCESS.set(time.time())
    BACKUP_SIZE_BYTES.set(size_bytes)

