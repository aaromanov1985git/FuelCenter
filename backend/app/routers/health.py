"""
Health check endpoints для мониторинга состояния сервисов
"""
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime
from typing import Dict, Any
import os
import redis

from app.database import get_db, engine
from app.config import get_settings
from app.logger import logger

router = APIRouter(prefix="/health", tags=["Health"])

settings = get_settings()


def check_database() -> Dict[str, Any]:
    """Проверка подключения к PostgreSQL"""
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            result.fetchone()
        return {"status": "healthy", "latency_ms": 0}
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {"status": "unhealthy", "error": str(e)}


def check_redis() -> Dict[str, Any]:
    """Проверка подключения к Redis"""
    try:
        redis_host = os.getenv("REDIS_HOST", "redis")
        redis_port = int(os.getenv("REDIS_PORT", "6379"))
        r = redis.Redis(host=redis_host, port=redis_port, socket_timeout=2)
        start = datetime.now()
        r.ping()
        latency = (datetime.now() - start).total_seconds() * 1000
        return {"status": "healthy", "latency_ms": round(latency, 2)}
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        return {"status": "unhealthy", "error": str(e)}


def get_system_info() -> Dict[str, Any]:
    """Информация о системе"""
    import platform
    import psutil
    
    try:
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        return {
            "python_version": platform.python_version(),
            "platform": platform.system(),
            "cpu_percent": psutil.cpu_percent(interval=0.1),
            "memory_percent": memory.percent,
            "memory_available_mb": round(memory.available / (1024 * 1024), 2),
            "disk_percent": disk.percent,
            "disk_free_gb": round(disk.free / (1024 * 1024 * 1024), 2)
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/live")
async def liveness():
    """
    Liveness probe - проверка что приложение запущено.
    Используется Kubernetes/Docker для проверки "жив ли" контейнер.
    
    Returns:
        200 OK если приложение работает
    """
    return {"status": "alive", "timestamp": datetime.utcnow().isoformat()}


@router.get("/ready")
async def readiness(db: Session = Depends(get_db)):
    """
    Readiness probe - проверка готовности принимать трафик.
    Проверяет подключение к БД и другим зависимостям.
    
    Returns:
        200 OK если приложение готово
        503 Service Unavailable если не готово
    """
    checks = {
        "database": check_database(),
        "redis": check_redis()
    }
    
    all_healthy = all(c["status"] == "healthy" for c in checks.values())
    
    response = {
        "status": "ready" if all_healthy else "not_ready",
        "timestamp": datetime.utcnow().isoformat(),
        "checks": checks
    }
    
    if not all_healthy:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=response
        )
    
    return response


@router.get("/")
async def health_check(db: Session = Depends(get_db)):
    """
    Полная проверка здоровья системы.
    Возвращает детальную информацию о всех компонентах.
    """
    db_check = check_database()
    redis_check = check_redis()
    system_info = get_system_info()
    
    checks = {
        "database": db_check,
        "redis": redis_check
    }
    
    all_healthy = all(c["status"] == "healthy" for c in checks.values())
    
    # Получаем информацию о scheduler
    scheduler_info = {"status": "unknown"}
    try:
        from app.services.scheduler_service import SchedulerService
        scheduler = SchedulerService.get_instance()
        jobs = scheduler.get_scheduled_jobs()
        scheduler_info = {
            "status": "running" if scheduler._scheduler and scheduler._scheduler.running else "stopped",
            "jobs_count": jobs.get("total", 0)
        }
    except Exception as e:
        scheduler_info = {"status": "error", "error": str(e)}
    
    response = {
        "status": "healthy" if all_healthy else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "version": settings.api_version,
        "environment": settings.environment,
        "checks": checks,
        "scheduler": scheduler_info,
        "system": system_info
    }
    
    status_code = status.HTTP_200_OK if all_healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    
    return JSONResponse(status_code=status_code, content=response)


@router.get("/metrics/summary")
async def metrics_summary():
    """
    Краткая сводка метрик для дашбордов.
    """
    from app.middleware.prometheus_metrics import (
        HTTP_REQUEST_COUNT,
        ACTIVE_USERS,
        TRANSACTIONS_TOTAL,
        AUTH_FAILURES_TOTAL,
        BACKUP_LAST_SUCCESS
    )
    
    # Собираем метрики
    try:
        # Получаем значения gauge метрик
        active_users = ACTIVE_USERS._value.get()
        backup_last = BACKUP_LAST_SUCCESS._value.get()
        
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "metrics": {
                "active_users": active_users,
                "last_backup_timestamp": backup_last if backup_last > 0 else None,
                "uptime_seconds": (datetime.utcnow() - datetime(2025, 1, 1)).total_seconds()  # Placeholder
            }
        }
    except Exception as e:
        return {"error": str(e)}

