"""
Скрипт для смены пароля пользователя (для администратора).
Запуск из корня backend:
  python -m scripts.set_user_password USERNAME NEW_PASSWORD

Пример (установить пароль NAKaisina для пользователя NAKaisina):
  python -m scripts.set_user_password NAKaisina NAKaisina
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import get_db
from app.auth import get_user_by_username, get_password_hash


def main():
    if len(sys.argv) < 3:
        print("Использование: python -m scripts.set_user_password USERNAME NEW_PASSWORD")
        print("Пример: python -m scripts.set_user_password NAKaisina NAKaisina")
        sys.exit(1)

    username = sys.argv[1]
    new_password = sys.argv[2]

    if len(new_password) < 8:
        print("Ошибка: пароль должен быть не короче 8 символов.")
        sys.exit(1)

    db = next(get_db())
    try:
        user = get_user_by_username(db, username)
        if not user:
            print(f"Ошибка: пользователь '{username}' не найден.")
            sys.exit(1)

        user.hashed_password = get_password_hash(new_password)
        db.commit()
        print(f"Пароль для пользователя '{username}' успешно изменён.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
