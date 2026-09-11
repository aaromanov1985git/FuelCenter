"""
Скрипт ротации SECRET_KEY с перешифровкой сохранённых секретов

ЗАЧЕМ: если ENCRYPTION_KEY не задан, Fernet-ключ производится из SECRET_KEY.
Поэтому простая смена SECRET_KEY в .env делает нечитаемыми:
  - provider_templates.connection_settings (пароли Firebird, ключи/токены API
    ГПН/РН-Карт/ППР, сертификаты XML API)
  - system_settings с is_encrypted=true (SMTP-пароль, токен Telegram-бота)

Скрипт расшифровывает эти значения СТАРЫМ ключом и зашифровывает НОВЫМ.
Пароли пользователей (users.hashed_password) — bcrypt, ротация их не затрагивает;
но все ранее выданные JWT станут невалидными, пользователям нужно перелогиниться.

Запуск (по умолчанию — холостой прогон, ничего не пишет):
    docker exec -e OLD_SECRET_KEY=... -e NEW_SECRET_KEY=... \
        gsm_backend python -m scripts.rotate_secret_key

Применить изменения:
    docker exec -e OLD_SECRET_KEY=... -e NEW_SECRET_KEY=... \
        gsm_backend python -m scripts.rotate_secret_key --apply

ПОРЯДОК ДЕЙСТВИЙ:
    1. Снять бэкап БД (pg_dump -Fc) — откат возможен только из него.
    2. Прогнать холостой запуск, убедиться что ошибок расшифровки нет.
    3. Запустить с --apply.
    4. Заменить SECRET_KEY в .env на новый и перезапустить backend.
       Шаги 3 и 4 нельзя менять местами: пока backend работает на старом ключе,
       перешифрованные новым ключом данные он прочитать не сможет.
"""
import argparse
import os
import sys
from pathlib import Path

# Добавляем путь к приложению
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ProviderTemplate, SystemSettings
from app.utils.encryption import build_fernet
from app.utils.json_utils import parse_template_json, serialize_template_json
from app.logger import logger

ENCRYPTED_PREFIX = "encrypted:"

# Синхронизировано с encrypt_connection_settings() в app/utils/encryption.py
SENSITIVE_FIELDS = [
    "password",
    "api_token",
    "api_key",
    "api_secret",
    "xml_api_key",
    "xml_api_signature",
    "xml_api_salt",
    "certificate",
    "secret",
    "token",
]


def _reencrypt(value: str, old_fernet, new_fernet) -> str:
    """
    Перешифровка одного значения со старого ключа на новый

    Args:
        value: Значение с префиксом "encrypted:"
        old_fernet: Fernet на старом секрете
        new_fernet: Fernet на новом секрете

    Returns:
        str: Значение, зашифрованное новым ключом (с префиксом)
    """
    raw = old_fernet.decrypt(value[len(ENCRYPTED_PREFIX):].encode())
    return f"{ENCRYPTED_PREFIX}{new_fernet.encrypt(raw).decode()}"


def rotate_provider_templates(db: Session, old_fernet, new_fernet, apply: bool) -> tuple:
    """
    Перешифровка чувствительных полей в connection_settings всех шаблонов

    Returns:
        tuple: (изменено шаблонов, перешифровано полей, ошибок)
    """
    templates = db.query(ProviderTemplate).filter(
        ProviderTemplate.connection_settings.isnot(None)
    ).all()

    logger.info(f"Шаблонов с connection_settings: {len(templates)}")

    changed = fields_done = errors = 0

    for template in templates:
        # decrypt_passwords=False — нужен сырой вид, расшифровка идёт старым ключом
        settings = parse_template_json(template.connection_settings, decrypt_passwords=False)
        if not settings or not isinstance(settings, dict):
            continue

        updated = dict(settings)
        touched = 0

        for field in SENSITIVE_FIELDS:
            value = updated.get(field)
            if not isinstance(value, str) or not value.startswith(ENCRYPTED_PREFIX):
                continue
            try:
                updated[field] = _reencrypt(value, old_fernet, new_fernet)
                touched += 1
            except Exception as e:
                errors += 1
                logger.error(
                    f"✗ Не расшифровывается старым ключом: шаблон ID={template.id} "
                    f"({template.name}), поле '{field}': {e}"
                )

        if not touched:
            continue

        changed += 1
        fields_done += touched
        logger.info(
            f"{'✓' if apply else '→'} шаблон ID={template.id} ({template.name}): {touched} пол(я)"
        )

        if apply:
            # encrypt_passwords=False — значения уже зашифрованы новым ключом
            template.connection_settings = serialize_template_json(updated, encrypt_passwords=False)

    return changed, fields_done, errors


def rotate_system_settings(db: Session, old_fernet, new_fernet, apply: bool) -> tuple:
    """
    Перешифровка system_settings с is_encrypted=true

    Returns:
        tuple: (перешифровано записей, ошибок)
    """
    rows = db.query(SystemSettings).filter(
        SystemSettings.is_encrypted.is_(True),
        SystemSettings.value.isnot(None),
    ).all()

    logger.info(f"Зашифрованных system_settings: {len(rows)}")

    done = errors = 0

    for row in rows:
        if not row.value.startswith(ENCRYPTED_PREFIX):
            logger.warning(f"⚠ {row.key}: is_encrypted=true, но значение без префикса — пропущено")
            continue
        try:
            new_value = _reencrypt(row.value, old_fernet, new_fernet)
        except Exception as e:
            errors += 1
            logger.error(f"✗ Не расшифровывается старым ключом: system_settings '{row.key}': {e}")
            continue

        done += 1
        logger.info(f"{'✓' if apply else '→'} system_settings '{row.key}'")
        if apply:
            row.value = new_value

    return done, errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Ротация SECRET_KEY с перешифровкой сохранённых секретов"
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Записать изменения в БД (без флага — только холостой прогон)",
    )
    args = parser.parse_args()

    old_secret = os.getenv("OLD_SECRET_KEY")
    new_secret = os.getenv("NEW_SECRET_KEY")

    if not old_secret or not new_secret:
        print(
            "✗ Нужны переменные окружения OLD_SECRET_KEY и NEW_SECRET_KEY.\n"
            '  Новый ключ: python -c "import secrets; print(secrets.token_urlsafe(64))"',
            file=sys.stderr,
        )
        return 2

    if old_secret == new_secret:
        print("✗ OLD_SECRET_KEY и NEW_SECRET_KEY совпадают — ротация бессмысленна.", file=sys.stderr)
        return 2

    if len(new_secret) < 32:
        print(
            f"✗ NEW_SECRET_KEY слишком короткий ({len(new_secret)} симв.), минимум 32 — "
            "backend не стартует в production.",
            file=sys.stderr,
        )
        return 2

    if os.getenv("ENCRYPTION_KEY"):
        print(
            "✗ Задан ENCRYPTION_KEY — шифрование НЕ привязано к SECRET_KEY, "
            "и ротация SECRET_KEY данные не затрагивает.\n"
            "  Для ротации самого ENCRYPTION_KEY передайте его старое/новое значение через "
            "OLD_SECRET_KEY/NEW_SECRET_KEY и снимите ENCRYPTION_KEY из окружения этого запуска.",
            file=sys.stderr,
        )
        return 2

    mode = "ПРИМЕНЕНИЕ" if args.apply else "ХОЛОСТОЙ ПРОГОН (--apply для записи)"
    print("=" * 63)
    print(f"  РОТАЦИЯ SECRET_KEY — {mode}")
    print("=" * 63)

    old_fernet = build_fernet(old_secret)
    new_fernet = build_fernet(new_secret)

    db: Session = next(get_db())
    try:
        tpl_changed, tpl_fields, tpl_errors = rotate_provider_templates(
            db, old_fernet, new_fernet, args.apply
        )
        set_done, set_errors = rotate_system_settings(db, old_fernet, new_fernet, args.apply)

        errors = tpl_errors + set_errors

        if errors:
            db.rollback()
            print()
            print(f"✗ Ошибок расшифровки: {errors}. Ничего не записано.")
            print("  Вероятная причина: OLD_SECRET_KEY не тот, которым данные шифровались.")
            return 1

        if args.apply:
            db.commit()

        print()
        print(f"  Шаблоны провайдеров: {tpl_changed} шт., полей: {tpl_fields}")
        print(f"  system_settings:     {set_done} шт.")
        print()
        if args.apply:
            print("✓ Перешифровано. ДАЛЬШЕ ОБЯЗАТЕЛЬНО:")
            print("  1. Заменить SECRET_KEY в .env на новый.")
            print("  2. docker compose up -d --force-recreate backend")
            print("  3. Перелогиниться (старые JWT невалидны).")
        else:
            print("✓ Холостой прогон без ошибок. Повторите с --apply.")
        return 0
    except Exception as e:
        db.rollback()
        logger.error("Ошибка ротации", extra={"error": str(e)}, exc_info=True)
        print(f"✗ Прервано: {e}", file=sys.stderr)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
