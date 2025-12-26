"""
Роутер для управления системными настройками (SMTP, Telegram Bot и др.)
Доступен только администраторам
"""
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.auth import require_auth_if_enabled
from app.database import get_db
from app.logger import logger
from app.models import User, SystemSettings
from app.utils.encryption import encrypt_value, decrypt_value

router = APIRouter(prefix="/api/v1/system-settings", tags=["Системные настройки"])


# Схемы Pydantic
class EmailSettingsUpdate(BaseModel):
    """Схема для обновления настроек email"""
    email_enabled: Optional[bool] = Field(None, description="Включены ли email уведомления")
    smtp_host: Optional[str] = Field(None, max_length=200, description="SMTP сервер")
    smtp_port: Optional[int] = Field(None, ge=1, le=65535, description="SMTP порт")
    smtp_user: Optional[str] = Field(None, max_length=200, description="SMTP пользователь")
    smtp_password: Optional[str] = Field(None, max_length=500, description="SMTP пароль")
    from_address: Optional[str] = Field(None, max_length=200, description="Email отправителя")
    from_name: Optional[str] = Field(None, max_length=100, description="Имя отправителя")
    use_tls: Optional[bool] = Field(None, description="Использовать TLS")


class EmailSettingsResponse(BaseModel):
    """Схема ответа с настройками email"""
    email_enabled: bool = False
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_user: Optional[str] = None
    smtp_password_set: bool = False  # Не возвращаем сам пароль, только флаг
    from_address: Optional[str] = None
    from_name: str = "GSM Converter"
    use_tls: bool = True


class TelegramSettingsUpdate(BaseModel):
    """Схема для обновления настроек Telegram"""
    telegram_enabled: Optional[bool] = Field(None, description="Включены ли Telegram уведомления")
    bot_token: Optional[str] = Field(None, max_length=200, description="Токен Telegram бота")


class TelegramSettingsResponse(BaseModel):
    """Схема ответа с настройками Telegram"""
    telegram_enabled: bool = False
    bot_token_set: bool = False  # Не возвращаем сам токен, только флаг


class TestEmailRequest(BaseModel):
    """Схема для тестовой отправки email"""
    to_email: str = Field(..., description="Email для тестовой отправки")


# Вспомогательные функции
def get_setting(db: Session, key: str) -> Optional[str]:
    """Получить значение настройки по ключу"""
    setting = db.query(SystemSettings).filter(SystemSettings.key == key).first()
    if not setting:
        return None
    if setting.is_encrypted and setting.value:
        try:
            return decrypt_value(setting.value)
        except Exception as e:
            logger.error(f"Ошибка расшифровки настройки {key}: {e}")
            return None
    return setting.value


def set_setting(db: Session, key: str, value: Optional[str], is_encrypted: bool = False, description: str = None):
    """Установить значение настройки"""
    setting = db.query(SystemSettings).filter(SystemSettings.key == key).first()
    
    # Шифруем если нужно
    stored_value = value
    if is_encrypted and value:
        try:
            stored_value = encrypt_value(value)
        except Exception as e:
            logger.error(f"Ошибка шифрования настройки {key}: {e}")
            raise HTTPException(status_code=500, detail="Ошибка шифрования")
    
    if setting:
        setting.value = stored_value
        setting.is_encrypted = is_encrypted
        if description:
            setting.description = description
    else:
        setting = SystemSettings(
            key=key,
            value=stored_value,
            is_encrypted=is_encrypted,
            description=description
        )
        db.add(setting)
    
    db.commit()


def require_admin(current_user: Optional[User]):
    """Проверка прав администратора"""
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется аутентификация"
        )
    if current_user.role != "admin" and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ разрешен только администраторам"
        )


# API Endpoints
@router.get("/email", response_model=EmailSettingsResponse)
async def get_email_settings(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Получение настроек email (только для админов)
    """
    require_admin(current_user)
    
    return EmailSettingsResponse(
        email_enabled=get_setting(db, "email_enabled") == "true",
        smtp_host=get_setting(db, "email_smtp_host"),
        smtp_port=int(get_setting(db, "email_smtp_port") or 587),
        smtp_user=get_setting(db, "email_smtp_user"),
        smtp_password_set=bool(get_setting(db, "email_smtp_password")),
        from_address=get_setting(db, "email_from_address"),
        from_name=get_setting(db, "email_from_name") or "GSM Converter",
        use_tls=get_setting(db, "email_use_tls") != "false"
    )


@router.put("/email", response_model=EmailSettingsResponse)
async def update_email_settings(
    settings_data: EmailSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Обновление настроек email (только для админов)
    """
    require_admin(current_user)
    
    try:
        if settings_data.email_enabled is not None:
            set_setting(db, "email_enabled", "true" if settings_data.email_enabled else "false", description="Включены ли email уведомления")
        
        if settings_data.smtp_host is not None:
            set_setting(db, "email_smtp_host", settings_data.smtp_host, description="SMTP сервер")
        
        if settings_data.smtp_port is not None:
            set_setting(db, "email_smtp_port", str(settings_data.smtp_port), description="SMTP порт")
        
        if settings_data.smtp_user is not None:
            set_setting(db, "email_smtp_user", settings_data.smtp_user, description="SMTP пользователь")
        
        if settings_data.smtp_password is not None:
            set_setting(db, "email_smtp_password", settings_data.smtp_password, is_encrypted=True, description="SMTP пароль")
        
        if settings_data.from_address is not None:
            set_setting(db, "email_from_address", settings_data.from_address, description="Email отправителя")
        
        if settings_data.from_name is not None:
            set_setting(db, "email_from_name", settings_data.from_name, description="Имя отправителя")
        
        if settings_data.use_tls is not None:
            set_setting(db, "email_use_tls", "true" if settings_data.use_tls else "false", description="Использовать TLS")
        
        logger.info(f"Настройки email обновлены пользователем {current_user.username}")
        
        return EmailSettingsResponse(
            email_enabled=get_setting(db, "email_enabled") == "true",
            smtp_host=get_setting(db, "email_smtp_host"),
            smtp_port=int(get_setting(db, "email_smtp_port") or 587),
            smtp_user=get_setting(db, "email_smtp_user"),
            smtp_password_set=bool(get_setting(db, "email_smtp_password")),
            from_address=get_setting(db, "email_from_address"),
            from_name=get_setting(db, "email_from_name") or "GSM Converter",
            use_tls=get_setting(db, "email_use_tls") != "false"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка обновления настроек email: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка сохранения настроек: {str(e)}")


@router.post("/email/test")
async def test_email_settings(
    request: TestEmailRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Тестовая отправка email для проверки настроек
    """
    require_admin(current_user)
    
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    
    # Получаем настройки
    smtp_host = get_setting(db, "email_smtp_host")
    smtp_port = int(get_setting(db, "email_smtp_port") or 587)
    smtp_user = get_setting(db, "email_smtp_user")
    smtp_password = get_setting(db, "email_smtp_password")
    from_address = get_setting(db, "email_from_address")
    from_name = get_setting(db, "email_from_name") or "GSM Converter"
    use_tls = get_setting(db, "email_use_tls") != "false"
    
    if not all([smtp_host, smtp_user, from_address]):
        raise HTTPException(
            status_code=400,
            detail="Не все настройки SMTP заполнены. Укажите хост, пользователя и адрес отправителя."
        )
    
    try:
        # Создаем сообщение
        msg = MIMEMultipart('alternative')
        msg['Subject'] = "Тестовое сообщение GSM Converter"
        msg['From'] = f"{from_name} <{from_address}>"
        msg['To'] = request.to_email
        
        text_content = "Это тестовое сообщение от GSM Converter.\n\nНастройки email работают корректно!"
        html_content = """
        <html>
            <body>
                <h2>Тестовое сообщение GSM Converter</h2>
                <p>Настройки email работают корректно!</p>
                <p style="color: green;">✓ SMTP соединение установлено</p>
                <p style="color: green;">✓ Аутентификация прошла успешно</p>
                <p style="color: green;">✓ Сообщение отправлено</p>
            </body>
        </html>
        """
        
        msg.attach(MIMEText(text_content, 'plain', 'utf-8'))
        msg.attach(MIMEText(html_content, 'html', 'utf-8'))
        
        # Отправка
        with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
            if use_tls:
                server.starttls()
            if smtp_user and smtp_password:
                server.login(smtp_user, smtp_password)
            server.send_message(msg)
        
        logger.info(f"Тестовое email отправлено на {request.to_email}")
        return {"success": True, "message": f"Тестовое сообщение отправлено на {request.to_email}"}
        
    except smtplib.SMTPAuthenticationError as e:
        logger.error(f"Ошибка аутентификации SMTP: {e}")
        raise HTTPException(status_code=400, detail="Ошибка аутентификации. Проверьте логин и пароль.")
    except smtplib.SMTPConnectError as e:
        logger.error(f"Ошибка подключения к SMTP: {e}")
        raise HTTPException(status_code=400, detail=f"Не удалось подключиться к серверу {smtp_host}:{smtp_port}")
    except Exception as e:
        logger.error(f"Ошибка отправки тестового email: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Ошибка отправки: {str(e)}")


@router.get("/telegram", response_model=TelegramSettingsResponse)
async def get_telegram_settings(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Получение настроек Telegram (только для админов)
    """
    require_admin(current_user)
    
    return TelegramSettingsResponse(
        telegram_enabled=get_setting(db, "telegram_enabled") == "true",
        bot_token_set=bool(get_setting(db, "telegram_bot_token"))
    )


@router.put("/telegram", response_model=TelegramSettingsResponse)
async def update_telegram_settings(
    settings_data: TelegramSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_enabled)
):
    """
    Обновление настроек Telegram (только для админов)
    """
    require_admin(current_user)
    
    try:
        if settings_data.telegram_enabled is not None:
            set_setting(db, "telegram_enabled", "true" if settings_data.telegram_enabled else "false", description="Включены ли Telegram уведомления")
        
        if settings_data.bot_token is not None:
            set_setting(db, "telegram_bot_token", settings_data.bot_token, is_encrypted=True, description="Токен Telegram бота")
        
        logger.info(f"Настройки Telegram обновлены пользователем {current_user.username}")
        
        return TelegramSettingsResponse(
            telegram_enabled=get_setting(db, "telegram_enabled") == "true",
            bot_token_set=bool(get_setting(db, "telegram_bot_token"))
        )
    except Exception as e:
        logger.error(f"Ошибка обновления настроек Telegram: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка сохранения настроек: {str(e)}")

