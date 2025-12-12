"""
Сервис для фиксации событий загрузок
"""
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from app.models import UploadEvent
from app.logger import logger


class UploadEventService:
    """
    Упрощенный сервис для записи событий загрузок
    """

    def __init__(self, db: Session):
        self.db = db

    def log_event(
        self,
        *,
        source_type: str,
        status: str,
        is_scheduled: bool = False,
        file_name: Optional[str] = None,
        provider_id: Optional[int] = None,
        template_id: Optional[int] = None,
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        transactions_total: int = 0,
        transactions_created: int = 0,
        transactions_skipped: int = 0,
        transactions_failed: int = 0,
        duration_ms: Optional[int] = None,
        message: Optional[str] = None,
    ) -> UploadEvent:
        """
        Создает запись о событии загрузки
        """
        try:
            event = UploadEvent(
                source_type=source_type,
                status=status,
                is_scheduled=is_scheduled,
                file_name=file_name,
                provider_id=provider_id,
                template_id=template_id,
                user_id=user_id,
                username=username,
                transactions_total=transactions_total or 0,
                transactions_created=transactions_created or 0,
                transactions_skipped=transactions_skipped or 0,
                transactions_failed=transactions_failed or 0,
                duration_ms=duration_ms,
                message=message,
            )

            self.db.add(event)
            self.db.commit()
            self.db.refresh(event)
            return event
        except Exception as exc:
            logger.error(
                "Не удалось записать событие загрузки",
                extra={
                    "error": str(exc),
                    "source_type": source_type,
                    "status": status,
                    "file_name": file_name,
                    "provider_id": provider_id,
                    "template_id": template_id,
                    "user_id": user_id,
                },
                exc_info=True,
            )
            # Не прерываем основной поток — возвращаем псевдообъект
            return UploadEvent(
                source_type=source_type,
                status=status,
                is_scheduled=is_scheduled,
                file_name=file_name,
                provider_id=provider_id,
                template_id=template_id,
                user_id=user_id,
                username=username,
                transactions_total=transactions_total or 0,
                transactions_created=transactions_created or 0,
                transactions_skipped=transactions_skipped or 0,
                transactions_failed=transactions_failed or 0,
                duration_ms=duration_ms,
                message=message,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
