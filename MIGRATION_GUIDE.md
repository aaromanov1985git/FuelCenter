# Руководство по миграции GSM Converter на новый Windows сервер

## Краткое описание

Этот документ содержит пошаговые инструкции для миграции GSM Converter с текущего сервера на новый Windows сервер.

## Подготовка завершена ✅

**Дата создания бэкапов:** 30.01.2026 16:00  
**Статистика:**
- Транзакций: 46,141
- Топливных карт: 593
- АЗС: 89
- Размер БД: 117 MB

**Директория с бэкапами:** `migration_backup/`

## Процесс миграции

### Фаза 1: На текущем сервере (ВЫПОЛНЕНО ✅)

- [x] Создан бэкап базы данных (.dump и .sql)
- [x] Сохранена конфигурация (backend/.env, docker-compose.yml)
- [x] Собрана информация о системе
- [x] Созданы скрипты автоматизации

**Что нужно сделать:**
1. Скопируйте директорию `migration_backup/` на USB-накопитель или сетевой диск
2. Скопируйте всю директорию проекта `C:\curWork\GSM` (или используйте git clone на новом сервере)

### Фаза 2: На новом сервере (ВРУЧНУЮ)

#### Шаг 1: Установка необходимого ПО

1. **Docker Desktop для Windows**
   - Скачать: https://www.docker.com/products/docker-desktop
   - Установить и перезагрузить систему
   - Включить WSL 2 (если требуется)

2. **Git для Windows** (опционально, если будете клонировать репозиторий)
   - Скачать: https://git-scm.com/download/win
   - Установить с настройками по умолчанию

#### Шаг 2: Автоматическая настройка сервера

Запустите PowerShell **от имени администратора** и выполните:

```powershell
cd C:\GSM\migration_backup
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup_new_server.ps1
```

Этот скрипт:
- Создаст необходимые директории
- Откроет порты в Windows Firewall
- Проверит установленное ПО

#### Шаг 3: Перенос файлов

1. Скопируйте файлы проекта в `C:\GSM`
2. Скопируйте `migration_backup/` в `C:\GSM\migration_backup\`

#### Шаг 4: Восстановление конфигурации

```powershell
cd C:\GSM
copy migration_backup\backend.env.backup backend\.env
```

**⚠️ ВАЖНО:** Не изменяйте `SECRET_KEY` и `ENCRYPTION_KEY` в файле `.env`!

#### Шаг 5: Запуск Docker Compose

```powershell
cd C:\GSM
docker-compose up -d
```

Проверьте статус:
```powershell
docker-compose ps
```

Все контейнеры должны быть в статусе "Up".

#### Шаг 6: Восстановление базы данных

**Автоматически (рекомендуется):**

```powershell
cd C:\GSM
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\migration_backup\restore_on_new_server.ps1
```

Скрипт автоматически:
- Скопирует бэкап в контейнер
- Восстановит данные
- Применит миграции
- Проверит работоспособность

**Вручную:**

```powershell
# Копирование бэкапа
docker cp migration_backup\gsm_backup_migration.dump gsm_db:/tmp/

# Восстановление
docker exec gsm_db pg_restore -U gsm_user -d gsm_db -c /tmp/gsm_backup_migration.dump

# Применение миграций
docker exec gsm_backend alembic upgrade head

# Проверка
docker exec -it gsm_db psql -U gsm_user -d gsm_db -c "SELECT COUNT(*) FROM transactions;"
```

Ожидаемый результат: 46,141 транзакций

#### Шаг 7: Сборка Frontend

```powershell
cd C:\GSM
npm install
npm run build
```

Собранные файлы будут в `dist/`.

#### Шаг 8: Настройка веб-сервера

**Вариант A: Nginx на Windows**

1. Скачать: https://nginx.org/en/download.html
2. Распаковать в `C:\nginx`
3. Скопировать конфигурацию из `nginx.conf.example`
4. Обновить пути и домен в конфигурации
5. Запустить: `cd C:\nginx; .\nginx.exe`

**Вариант B: IIS**

1. Включить IIS в Windows Features
2. Установить URL Rewrite Module
3. Создать сайт с путем к `C:\GSM\dist`
4. Настроить reverse proxy для `/api` → `http://localhost:8000`

#### Шаг 9: Проверка работоспособности

```powershell
# Health check
curl http://localhost:8000/health

# Открыть в браузере
Start-Process "http://localhost:3000"
```

Проверьте:
- ✅ Вход в систему (admin / пароль из .env)
- ✅ Загрузка Excel файлов
- ✅ Просмотр транзакций
- ✅ Экспорт в Excel

#### Шаг 10: Настройка автоматических бэкапов

```powershell
cd C:\GSM\migration_backup
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup_automatic_backups.ps1
```

Настроит ежедневные бэкапы в 02:00 с хранением за 7 дней.

#### Шаг 11: Обновление внешних интеграций

1. **В 1С:** Обновить URL API на новый адрес
2. **Провайдеры:** Обновить настройки ГПН, РН-Карт, ППР (если изменился IP/домен)

### Фаза 3: Финальная проверка

Используйте чеклист: `migration_backup/MIGRATION_CHECKLIST.md`

## Полезные команды

### Управление Docker

```powershell
# Статус контейнеров
docker-compose ps

# Логи
docker-compose logs -f backend
docker-compose logs -f db

# Перезапуск
docker-compose restart backend

# Остановка
docker-compose down

# Запуск с пересборкой
docker-compose up -d --build
```

### Проверка портов

```powershell
netstat -an | findstr "8000"
netstat -an | findstr "5432"
```

### Проверка базы данных

```powershell
# Подключение к БД
docker exec -it gsm_db psql -U gsm_user -d gsm_db

# SQL команды
\dt  -- список таблиц
SELECT COUNT(*) FROM transactions;
\q  -- выход
```

## Решение проблем

### Контейнеры не запускаются

```powershell
docker-compose logs -f
```

Проверьте, что:
- Docker Desktop запущен
- Порты не заняты другими приложениями
- Файл `.env` существует и корректен

### Ошибка восстановления БД

Попробуйте SQL формат:

```powershell
docker exec -i gsm_db psql -U gsm_user -d gsm_db < migration_backup\gsm_backup_migration.sql
```

### Health check не проходит

```powershell
# Проверьте логи backend
docker-compose logs backend --tail 100

# Проверьте подключение к БД
docker exec gsm_backend python -c "from app.database import engine; print(engine)"
```

## Откат миграции

Если что-то пошло не так:

1. Остановите сервисы на новом сервере: `docker-compose down`
2. Вернитесь к старому серверу (он остается работающим)
3. Проанализируйте проблемы
4. Исправьте и повторите миграцию

## Документация

- **План миграции:** `.cursor/plans/migration_to_new_server_*.plan.md`
- **Чеклист:** `migration_backup/MIGRATION_CHECKLIST.md`
- **Информация о бэкапе:** `migration_backup/BACKUP_INFO.txt`
- **Информация о текущем сервере:** `migration_backup/current_server_info.txt`
- **Основная документация:** `docs/`

## Контакты и поддержка

При возникновении проблем:
1. Проверьте логи: `docker-compose logs -f`
2. См. документацию: `docs/deployment/`
3. См. диагностику: `docs/deployment/diagnostics.md`

---

**Создано:** 30.01.2026  
**Версия:** 1.0  
**Статус:** Готово к миграции
