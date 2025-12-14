"""
Сервис для управления планировщиком задач автоматической загрузки
"""
import sys
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.date import DateTrigger
from datetime import datetime
from typing import Optional, Dict
from sqlalchemy.orm import Session
from app.models import ProviderTemplate
from app.services.auto_load_service import AutoLoadService
from app.logger import logger
from app.database import SessionLocal


class SchedulerService:
    """
    Сервис для управления планировщиком задач автоматической загрузки
    """
    
    _instance: Optional['SchedulerService'] = None
    _scheduler: Optional[AsyncIOScheduler] = None
    
    def __init__(self):
        if SchedulerService._instance is not None:
            raise RuntimeError("SchedulerService is a singleton. Use get_instance() instead.")
        self._scheduler = AsyncIOScheduler()
        SchedulerService._instance = self
    
    @classmethod
    def get_instance(cls) -> 'SchedulerService':
        """
        Получить экземпляр планировщика (singleton)
        """
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def start(self):
        """
        Запустить планировщик
        """
        try:
            if not self._scheduler.running:
                self._scheduler.start()
                logger.info("Планировщик задач автоматической загрузки запущен", extra={
                    "event_type": "scheduler",
                    "event_category": "startup"
                })
                self._load_all_schedules()
            else:
                logger.warning("Планировщик уже запущен", extra={
                    "event_type": "scheduler",
                    "event_category": "startup"
                })
        except Exception as e:
            logger.error("Критическая ошибка при запуске планировщика", extra={
                "error": str(e),
                "error_type": type(e).__name__,
                "event_type": "scheduler",
                "event_category": "startup"
            }, exc_info=True)
            raise
    
    def shutdown(self):
        """
        Остановить планировщик
        """
        if self._scheduler.running:
            self._scheduler.shutdown()
            logger.info("Планировщик задач автоматической загрузки остановлен")
    
    def _load_all_schedules(self):
        """
        Загрузить все расписания из базы данных
        """
        db = SessionLocal()
        try:
            # Получаем все активные шаблоны с включенной автозагрузкой и расписанием
            templates = db.query(ProviderTemplate).filter(
                ProviderTemplate.is_active == True,
                ProviderTemplate.auto_load_enabled == True,
                ProviderTemplate.auto_load_schedule.isnot(None),
                ProviderTemplate.auto_load_schedule != ''
            ).all()
            
            logger.info("Загрузка расписаний автоматической загрузки", extra={
                "templates_count": len(templates),
                "event_type": "scheduler",
                "event_category": "startup"
            })
            
            if len(templates) == 0:
                logger.info("Не найдено шаблонов с настроенным расписанием автоматической загрузки")
            
            scheduled_count = 0
            failed_count = 0
            
            for template in templates:
                try:
                    self._add_template_schedule(template)
                    scheduled_count += 1
                    logger.debug("Расписание для шаблона добавлено", extra={
                        "template_id": template.id,
                        "template_name": template.name,
                        "schedule": template.auto_load_schedule
                    })
                except Exception as e:
                    failed_count += 1
                    logger.error("Ошибка при добавлении расписания для шаблона", extra={
                        "template_id": template.id,
                        "template_name": template.name,
                        "schedule": template.auto_load_schedule,
                        "error": str(e),
                        "event_type": "scheduler",
                        "event_category": "startup"
                    }, exc_info=True)
            
            logger.info("Расписания автоматической загрузки загружены", extra={
                "total_templates": len(templates),
                "scheduled_templates": scheduled_count,
                "failed_templates": failed_count,
                "event_type": "scheduler",
                "event_category": "startup"
            })
        except Exception as e:
            logger.error("Ошибка при загрузке расписаний", extra={"error": str(e)}, exc_info=True)
        finally:
            try:
                db.close()
            except Exception as close_error:
                logger.error("Ошибка при закрытии сессии БД при загрузке расписаний", extra={
                    "error": str(close_error)
                }, exc_info=True)
    
    def _add_template_schedule(self, template: ProviderTemplate):
        """
        Добавить расписание для шаблона
        
        Args:
            template: Шаблон провайдера
        """
        schedule_str = template.auto_load_schedule.strip()
        
        if not schedule_str:
            return
        
        # Удаляем старое расписание для этого шаблона, если оно существует
        job_id = f"auto_load_template_{template.id}"
        if self._scheduler.get_job(job_id):
            self._scheduler.remove_job(job_id)
            logger.debug("Удалено старое расписание для шаблона", extra={
                "template_id": template.id,
                "job_id": job_id
            })
        
        # Парсим cron-выражение
        try:
            trigger = self._parse_schedule(schedule_str)
            
            # Добавляем задачу в планировщик
            # Используем run_in_executor для синхронной функции в асинхронном планировщике
            import asyncio
            def run_sync():
                try:
                    self._run_auto_load_for_template(template.id)
                except Exception as e:
                    logger.error("Критическая ошибка при выполнении задачи планировщика", extra={
                        "template_id": template.id,
                        "job_id": job_id,
                        "error": str(e)
                    }, exc_info=True)
            
            async def run_async():
                try:
                    logger.info("Запуск задачи планировщика", extra={
                        "template_id": template.id,
                        "job_id": job_id,
                        "event_type": "scheduler",
                        "event_category": "job_execution"
                    })
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(None, run_sync)
                    logger.info("Задача планировщика завершена", extra={
                        "template_id": template.id,
                        "job_id": job_id,
                        "event_type": "scheduler",
                        "event_category": "job_execution"
                    })
                except Exception as e:
                    logger.error("Ошибка в асинхронной обертке задачи планировщика", extra={
                        "template_id": template.id,
                        "job_id": job_id,
                        "error": str(e),
                        "event_type": "scheduler",
                        "event_category": "job_execution"
                    }, exc_info=True)
            
            self._scheduler.add_job(
                func=run_async,
                trigger=trigger,
                id=job_id,
                replace_existing=True,
                max_instances=1,  # Не запускать параллельно несколько экземпляров одной задачи
                misfire_grace_time=300  # 5 минут на выполнение задачи
            )
            
            # Получаем информацию о следующем запуске
            job = self._scheduler.get_job(job_id)
            next_run = job.next_run_time.isoformat() if job and job.next_run_time else None
            
            logger.info("Добавлено расписание для шаблона", extra={
                "template_id": template.id,
                "template_name": template.name,
                "schedule": schedule_str,
                "job_id": job_id,
                "next_run_time": next_run,
                "event_type": "scheduler",
                "event_category": "startup"
            })
        except Exception as e:
            logger.error("Ошибка при парсинге расписания", extra={
                "template_id": template.id,
                "template_name": template.name,
                "schedule": schedule_str,
                "error": str(e)
            }, exc_info=True)
            raise
    
    def _parse_schedule(self, schedule_str: str):
        """
        Парсинг расписания (cron-выражение или простой формат)
        
        Args:
            schedule_str: Строка расписания
            
        Returns:
            Объект триггера для APScheduler
        """
        schedule_str = schedule_str.strip().lower()
        
        # Простые форматы
        if schedule_str == "daily" or schedule_str == "day":
            # Каждый день в 2:00
            return CronTrigger(hour=2, minute=0)
        elif schedule_str == "hourly" or schedule_str == "hour":
            # Каждый час
            return IntervalTrigger(hours=1)
        elif schedule_str == "weekly" or schedule_str == "week":
            # Каждую неделю в понедельник в 2:00
            return CronTrigger(day_of_week="mon", hour=2, minute=0)
        elif schedule_str.startswith("every "):
            # Формат "every N hours/minutes"
            parts = schedule_str.split()
            if len(parts) >= 3:
                try:
                    interval = int(parts[1])
                    unit = parts[2].lower()
                    if unit in ["hour", "hours", "ч", "час", "часов"]:
                        return IntervalTrigger(hours=interval)
                    elif unit in ["minute", "minutes", "мин", "минута", "минут"]:
                        return IntervalTrigger(minutes=interval)
                    else:
                        raise ValueError(f"Неизвестная единица времени: {unit}")
                except ValueError as e:
                    raise ValueError(f"Неверный формат интервала: {schedule_str}")
        
        # Парсим cron-выражение (формат: минута час день месяц день_недели)
        # Примеры: "0 2 * * *" - каждый день в 2:00, "0 */6 * * *" - каждые 6 часов
        parts = schedule_str.split()
        if len(parts) == 5:
            minute, hour, day, month, day_of_week = parts
            
            # Преобразуем в формат APScheduler
            kwargs = {}
            
            if minute != "*":
                kwargs["minute"] = minute
            if hour != "*":
                kwargs["hour"] = hour
            if day != "*":
                kwargs["day"] = day
            if month != "*":
                kwargs["month"] = month
            if day_of_week != "*":
                kwargs["day_of_week"] = day_of_week
            
            return CronTrigger(**kwargs)
        else:
            raise ValueError(f"Неверный формат cron-выражения: {schedule_str}. Ожидается формат: минута час день месяц день_недели")
    
    def _run_auto_load_for_template(self, template_id: int):
        """
        Запустить автоматическую загрузку для конкретного шаблона
        
        Args:
            template_id: ID шаблона
        """
        logger.info("Запуск автоматической загрузки по расписанию", extra={
            "template_id": template_id,
            "event_type": "scheduler",
            "event_category": "auto_load"
        })
        
        db = SessionLocal()
        template = None
        try:
            template = db.query(ProviderTemplate).filter(
                ProviderTemplate.id == template_id
            ).first()
            
            if not template:
                logger.warning("Шаблон не найден для автоматической загрузки", extra={
                    "template_id": template_id
                })
                # Логируем событие о том, что шаблон не найден
                try:
                    from app.services.upload_event_service import UploadEventService
                    event_service = UploadEventService(db)
                    event_service.log_event(
                        source_type="auto",
                        status="failed",
                        is_scheduled=True,
                        file_name=f"AutoLoad: template_id={template_id}",
                        template_id=template_id,
                        user_id=None,
                        username="system",
                        transactions_total=0,
                        transactions_created=0,
                        transactions_skipped=0,
                        transactions_failed=0,
                        duration_ms=0,
                        message=f"Шаблон с ID {template_id} не найден"
                    )
                except Exception as log_error:
                    logger.error("Не удалось зафиксировать событие о не найденном шаблоне", extra={
                        "template_id": template_id,
                        "error": str(log_error)
                    }, exc_info=True)
                return
            
            if not template.is_active or not template.auto_load_enabled:
                logger.warning("Шаблон отключен для автоматической загрузки", extra={
                    "template_id": template_id,
                    "is_active": template.is_active,
                    "auto_load_enabled": template.auto_load_enabled
                })
                # Логируем событие о том, что шаблон отключен
                try:
                    from app.services.upload_event_service import UploadEventService
                    event_service = UploadEventService(db)
                    event_service.log_event(
                        source_type="auto",
                        status="failed",
                        is_scheduled=True,
                        file_name=f"AutoLoad: {template.name}",
                        provider_id=template.provider_id,
                        template_id=template.id,
                        user_id=None,
                        username="system",
                        transactions_total=0,
                        transactions_created=0,
                        transactions_skipped=0,
                        transactions_failed=0,
                        duration_ms=0,
                        message=f"Шаблон отключен (is_active={template.is_active}, auto_load_enabled={template.auto_load_enabled})"
                    )
                except Exception as log_error:
                    logger.error("Не удалось зафиксировать событие об отключенном шаблоне", extra={
                        "template_id": template_id,
                        "error": str(log_error)
                    }, exc_info=True)
                return
            
            # Запускаем загрузку
            auto_load_service = AutoLoadService(db)
            result = auto_load_service.load_template(template)
            
            logger.info("Автоматическая загрузка по расписанию завершена", extra={
                "template_id": template_id,
                "template_name": template.name,
                "success": result.get("success", False),
                "transactions_created": result.get("transactions_created", 0)
            })
        except Exception as e:
            logger.error("Ошибка при выполнении автоматической загрузки по расписанию", extra={
                "template_id": template_id,
                "error": str(e)
            }, exc_info=True)
            # Пытаемся залогировать событие об ошибке, даже если шаблон не был найден
            try:
                from app.services.upload_event_service import UploadEventService
                event_service = UploadEventService(db)
                template_name = template.name if template else f"template_id={template_id}"
                event_service.log_event(
                    source_type="auto",
                    status="failed",
                    is_scheduled=True,
                    file_name=f"AutoLoad: {template_name}",
                    provider_id=template.provider_id if template else None,
                    template_id=template_id,
                    user_id=None,
                    username="system",
                    transactions_total=0,
                    transactions_created=0,
                    transactions_skipped=0,
                    transactions_failed=0,
                    duration_ms=0,
                    message=f"Ошибка при выполнении автоматической загрузки: {str(e)}"
                )
            except Exception as log_error:
                logger.error("Не удалось зафиксировать событие об ошибке автоматической загрузки", extra={
                    "template_id": template_id,
                    "error": str(log_error),
                    "original_error": str(e)
                }, exc_info=True)
        finally:
            try:
                db.close()
            except Exception as close_error:
                logger.error("Ошибка при закрытии сессии БД", extra={
                    "template_id": template_id,
                    "error": str(close_error)
                }, exc_info=True)
    
    def reload_schedules(self):
        """
        Перезагрузить все расписания из базы данных
        """
        if not self._scheduler.running:
            logger.warning("Планировщик не запущен, пропускаем перезагрузку расписаний")
            return
        
        logger.info("Перезагрузка расписаний автоматической загрузки")
        
        # Удаляем все существующие задачи
        jobs = self._scheduler.get_jobs()
        for job in jobs:
            if job.id.startswith("auto_load_template_"):
                self._scheduler.remove_job(job.id)
        
        # Загружаем заново
        self._load_all_schedules()
    
    def get_scheduled_jobs(self) -> Dict:
        """
        Получить список запланированных задач
        
        Returns:
            Словарь с информацией о задачах
        """
        jobs = self._scheduler.get_jobs()
        return {
            "total": len(jobs),
            "jobs": [
                {
                    "id": job.id,
                    "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
                    "trigger": str(job.trigger)
                }
                for job in jobs
            ]
        }
