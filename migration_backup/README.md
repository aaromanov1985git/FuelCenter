# GSM Converter - Пакет миграции

Эта директория содержит все необходимое для миграции GSM Converter на новый Windows сервер.

## Содержимое

### Бэкапы базы данных

- **gsm_backup_migration.dump** (3.75 MB) - Бэкап PostgreSQL в custom format (рекомендуется)
- **gsm_backup_migration.sql** (54.94 MB) - Бэкап PostgreSQL в SQL format (резервный)

### Конфигурация

- **backend.env.backup** - Критические настройки безопасности (SECRET_KEY, ADMIN_PASSWORD, ENCRYPTION_KEY)
- **docker-compose.yml** - Конфигурация Docker Compose

### Информация о системе

- **current_server_info.txt** - Подробная информация о текущем сервере:
  - 46,141 транзакций
  - 593 топливных карт
  - 89 АЗС
  - Размер БД: 117 MB
  - Версия миграций: add_performance_indexes

### Скрипты автоматизации

- **restore_on_new_server.ps1** - Автоматическое восстановление на новом сервере
- **check_current_server.ps1** - Проверка текущего сервера (уже выполнен)

### Документация

- **BACKUP_INFO.txt** - Детальная информация о бэкапе и инструкции
- **MIGRATION_CHECKLIST.md** - Пошаговый чеклист миграции
- **README.md** - Этот файл

## Быстрый старт на новом сервере

### 1. Подготовка

```powershell
# Установите Docker Desktop для Windows
# https://www.docker.com/products/docker-desktop

# Скопируйте всю директорию migration_backup на новый сервер
# Скопируйте файлы проекта GSM в C:\GSM
```

### 2. Восстановление конфигурации

```powershell
cd C:\GSM
copy migration_backup\backend.env.backup backend\.env
```

**ВАЖНО:** Не изменяйте SECRET_KEY и ENCRYPTION_KEY! Используйте те же значения со старого сервера.

### 3. Запуск сервисов

```powershell
docker-compose up -d
```

### 4. Восстановление базы данных

#### Автоматически (рекомендуется)

```powershell
cd C:\GSM
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\migration_backup\restore_on_new_server.ps1
```

#### Вручную

```powershell
# Копирование бэкапа
docker cp migration_backup\gsm_backup_migration.dump gsm_db:/tmp/

# Восстановление
docker exec gsm_db pg_restore -U gsm_user -d gsm_db -c /tmp/gsm_backup_migration.dump

# Применение миграций
docker exec gsm_backend alembic upgrade head
```

### 5. Проверка

```powershell
# Health check
curl http://localhost:8000/health

# Проверка данных
docker exec -it gsm_db psql -U gsm_user -d gsm_db -c "SELECT COUNT(*) FROM transactions;"
```

Ожидаемый результат: 46,141 транзакций

## Важные замечания

### ⚠️ Критически важно

1. **SECRET_KEY и ENCRYPTION_KEY** должны быть ИДЕНТИЧНЫ значениям со старого сервера
   - Иначе зашифрованные данные (пароли Firebird, API ключи) будут недоступны
   
2. **ADMIN_PASSWORD** - используйте тот же пароль или измените после первого входа

3. **Проверьте целостность бэкапов** перед началом миграции:
   ```powershell
   Get-FileHash migration_backup\gsm_backup_migration.dump -Algorithm SHA256
   ```

### Обновление настроек

После успешной миграции обновите:

1. **ALLOWED_ORIGINS** в backend/.env - добавьте новый IP/домен
2. **URL в 1С** - обновите адрес API сервиса
3. **Настройки провайдеров** (ГПН, РН-Карт, ППР) - если изменился IP/домен

## Структура данных

На момент создания бэкапа (30.01.2026 16:00):

- **Транзакции:** 46,141
- **Топливные карты:** 593
- **АЗС:** 89
- **Размер БД:** 117 MB
- **Версия миграций:** add_performance_indexes

## Решение проблем

### Проблема: Контейнеры не запускаются

```powershell
# Проверьте логи
docker-compose logs -f backend
docker-compose logs -f db
```

### Проблема: Ошибка восстановления БД

```powershell
# Попробуйте SQL формат
docker exec -i gsm_db psql -U gsm_user -d gsm_db < migration_backup\gsm_backup_migration.sql
```

### Проблема: Health check не проходит

```powershell
# Проверьте, что все контейнеры запущены
docker-compose ps

# Проверьте логи backend
docker-compose logs backend --tail 100
```

## Контакты

При возникновении проблем:
- Проверьте MIGRATION_CHECKLIST.md
- Проверьте логи: `docker-compose logs -f`
- См. документацию в docs/deployment/

## Откат

Если миграция не удалась:

1. Остановите сервисы на новом сервере: `docker-compose down`
2. Вернитесь к старому серверу
3. Проанализируйте проблемы
4. Повторите миграцию после исправления

Старый сервер остается работающим и может быть использован в любой момент.
