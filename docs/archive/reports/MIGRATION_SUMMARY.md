# ✅ Подготовка к миграции GSM Converter завершена

**Дата:** 30 января 2026, 16:03  
**Статус:** Готово к переносу на новый сервер

---

## 📦 Что было сделано

### 1. Создание резервных копий базы данных

✅ **Бэкап в формате .dump** (3.84 MB)
- Формат: PostgreSQL custom format
- Использование: `pg_restore`
- Рекомендуется для восстановления

✅ **Бэкап в формате .sql** (54.9 MB)
- Формат: Plain SQL
- Резервный вариант на случай проблем

### 2. Сохранение конфигурации

✅ **backend/.env** - критические настройки безопасности
- SECRET_KEY
- ADMIN_PASSWORD  
- ENCRYPTION_KEY
- ⚠️ **ВАЖНО:** Эти значения ДОЛЖНЫ быть идентичны на новом сервере!

✅ **docker-compose.yml** - конфигурация Docker

### 3. Сбор информации о текущей системе

✅ **Статистика базы данных:**
- Транзакций: **46,141**
- Топливных карт: **593**
- АЗС: **89**
- Размер БД: **117 MB**
- Версия миграций: `add_performance_indexes`

✅ **Информация о сервере:**
- ОС: Windows 11 Pro (64-bit)
- Docker: 28.5.2, build ecc6942
- Docker Compose: v2.40.3-desktop.1
- Все контейнеры работают корректно

### 4. Создание скриптов автоматизации

✅ **setup_new_server.ps1** (12 KB)
- Создание директорий
- Настройка Windows Firewall
- Проверка установленного ПО

✅ **restore_on_new_server.ps1** (11 KB)
- Автоматическое восстановление БД
- Применение миграций
- Проверка работоспособности

✅ **setup_automatic_backups.ps1** (11 KB)
- Настройка ежедневных бэкапов
- Создание задачи в Task Scheduler
- Автоматическая ротация старых бэкапов

✅ **check_current_server.ps1** (5 KB)
- Сбор информации о текущем сервере
- Уже выполнен, отчет сохранен

### 5. Документация

✅ **MIGRATION_GUIDE.md** - основное руководство по миграции
✅ **MIGRATION_CHECKLIST.md** - пошаговый чеклист
✅ **BACKUP_INFO.txt** - детальная информация о бэкапе
✅ **README.md** - краткое описание и быстрый старт

---

## 📂 Структура директории migration_backup/

```
migration_backup/
├── gsm_backup_migration.dump      (3.84 MB)  - Основной бэкап БД
├── gsm_backup_migration.sql       (54.9 MB)  - Резервный бэкап БД
├── backend.env.backup             (0.26 KB)  - Конфигурация
├── docker-compose.yml             (2.82 KB)  - Docker конфигурация
├── current_server_info.txt        (8.71 KB)  - Информация о текущем сервере
│
├── setup_new_server.ps1           (12 KB)    - Настройка нового сервера
├── restore_on_new_server.ps1      (11 KB)    - Восстановление БД
├── setup_automatic_backups.ps1    (11 KB)    - Настройка бэкапов
├── check_current_server.ps1       (5 KB)     - Проверка сервера
│
├── BACKUP_INFO.txt                (5.28 KB)  - Информация о бэкапе
├── MIGRATION_CHECKLIST.md         (9.4 KB)   - Чеклист миграции
└── README.md                      (6 KB)     - Быстрый старт
```

**Общий размер:** ~60 MB

---

## 🚀 Следующие шаги

### На текущем сервере (СЕЙЧАС)

1. **Скопируйте директорию `migration_backup/` на внешний носитель**
   ```powershell
   # Например, на USB-накопитель
   Copy-Item -Path "C:\curWork\GSM\migration_backup" -Destination "E:\GSM_Migration" -Recurse
   ```

2. **Скопируйте файлы проекта** (опционально, если не будете клонировать через git)
   ```powershell
   Copy-Item -Path "C:\curWork\GSM" -Destination "E:\GSM_Project" -Recurse -Exclude ".git","node_modules","dist"
   ```

### На новом сервере

1. **Установите Docker Desktop**
   - https://www.docker.com/products/docker-desktop

2. **Скопируйте файлы**
   - Проект в `C:\GSM`
   - Бэкапы в `C:\GSM\migration_backup\`

3. **Запустите автоматическую настройку**
   ```powershell
   cd C:\GSM\migration_backup
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   .\setup_new_server.ps1
   ```

4. **Следуйте инструкциям в MIGRATION_GUIDE.md**

---

## 📋 Быстрая справка

### Основные файлы для миграции

| Файл | Назначение | Критичность |
|------|------------|-------------|
| `gsm_backup_migration.dump` | Бэкап БД | ⚠️ КРИТИЧНО |
| `backend.env.backup` | Ключи безопасности | ⚠️ КРИТИЧНО |
| `restore_on_new_server.ps1` | Автоматическое восстановление | 🔧 Рекомендуется |
| `MIGRATION_GUIDE.md` | Пошаговая инструкция | 📖 Обязательно |

### Ключевые команды

**На новом сервере после копирования файлов:**

```powershell
# 1. Настройка сервера (от имени администратора)
.\migration_backup\setup_new_server.ps1

# 2. Восстановление .env
copy migration_backup\backend.env.backup backend\.env

# 3. Запуск Docker
docker-compose up -d

# 4. Восстановление БД
.\migration_backup\restore_on_new_server.ps1

# 5. Проверка
curl http://localhost:8000/health
```

---

## ⚠️ Важные замечания

### Критически важно

1. **SECRET_KEY и ENCRYPTION_KEY** в файле `.env` должны быть ИДЕНТИЧНЫ значениям со старого сервера
   - Иначе зашифрованные данные будут недоступны
   - Пароли Firebird, API ключи провайдеров станут нечитаемыми

2. **Проверьте целостность бэкапов** перед началом миграции
   ```powershell
   Get-FileHash migration_backup\gsm_backup_migration.dump -Algorithm SHA256
   ```

3. **Не удаляйте старый сервер** до полного подтверждения работоспособности нового
   - Рекомендуется держать старый сервер активным минимум неделю

### После миграции

1. **Обновите ALLOWED_ORIGINS** в `backend/.env` с новым IP/доменом
2. **Обновите URL в 1С** для интеграции с ППР API
3. **Обновите настройки провайдеров** (ГПН, РН-Карт, ППР)
4. **Настройте автоматические бэкапы** через `setup_automatic_backups.ps1`

---

## 📞 Поддержка

### Документация

- **Основное руководство:** `MIGRATION_GUIDE.md`
- **Чеклист:** `migration_backup/MIGRATION_CHECKLIST.md`
- **План миграции:** `.cursor/plans/migration_to_new_server_*.plan.md`
- **Техническая документация:** `docs/deployment/`

### Решение проблем

При возникновении проблем:

1. **Проверьте логи:**
   ```powershell
   docker-compose logs -f backend
   docker-compose logs -f db
   ```

2. **См. документацию:**
   - `docs/deployment/diagnostics.md`
   - `docs/deployment/deployment.md`

3. **Откат:** Остановите новый сервер и вернитесь к старому

---

## ✅ Чеклист готовности к миграции

- [x] Бэкап базы данных создан
- [x] Конфигурация сохранена
- [x] Информация о системе собрана
- [x] Скрипты автоматизации созданы
- [x] Документация подготовлена
- [ ] Файлы скопированы на внешний носитель
- [ ] Новый сервер подготовлен
- [ ] Docker Desktop установлен на новом сервере
- [ ] Миграция выполнена
- [ ] Работоспособность проверена

---

## 📊 Статистика

**Текущий сервер:**
- Компьютер: WSTMNIT01
- Пользователь: aaromanov
- Дата бэкапа: 30.01.2026 16:00

**База данных:**
- Транзакций: 46,141
- Топливных карт: 593
- АЗС: 89
- Размер: 117 MB
- Таблиц: 23

**Контейнеры:**
- gsm_backend (Up 3 days)
- gsm_db (Up 3 days, healthy)
- gsm_redis (Up 3 days, healthy)
- + мониторинг (Grafana, Prometheus, Loki)

---

**Подготовлено:** 30.01.2026 16:03  
**Версия:** 1.0  
**Статус:** ✅ Готово к миграции

**Следующий шаг:** Скопируйте `migration_backup/` на внешний носитель и перенесите на новый сервер.
