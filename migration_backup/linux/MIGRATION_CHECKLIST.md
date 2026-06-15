# Чеклист миграции GSM Converter → 10.35.1.55 (Linux + Docker)

> Доступ к приложению: **по IP `http://10.35.1.55`** (без домена и HTTPS).
> Стек: PostgreSQL 15 + Redis 7 + FastAPI backend + Vite/React frontend, всё в Docker Compose.

---

## Этап 0. Критичные отличия от старого комплекта (прочитать!)

- [ ] **Свежий дамп БД.** Дамп `gsm_backup_migration.dump` от 30.01.2026 устарел — снять новый (`01_backup_current_server.sh`).
- [ ] **Внешняя сеть `gsm_network`.** Текущий `docker-compose.yml` требует её ДО запуска — иначе `docker compose up` падает. Создаётся в `02_setup_new_server.sh` (`docker network create gsm_network`).
- [ ] **`COOKIE_SECURE=false`.** При доступе по `http://` и `COOKIE_SECURE=true` браузер не отправляет auth-cookie → вход не работает. В `.env` нового сервера выставить `false`.
- [ ] **`ALLOWED_ORIGINS` под новый IP** — `http://10.35.1.55:3002` и т.д. (см. `env.newserver.example`).
- [ ] **Порт фронта — 3002** (compose маппит `3002:3000`), а не 3000. Firewall открывать на 3002.
- [ ] **Frontend крутится в Docker (Vite dev-сервер)** — отдельная сборка `npm run build`/nginx НЕ нужна, в отличие от старой инструкции.

---

## Этап 1. На СТАРОМ сервере (источник)

- [ ] Контейнеры запущены (`docker compose ps` → gsm_db, gsm_backend healthy)
- [ ] Снят свежий дамп: `bash migration_backup/linux/01_backup_current_server.sh`
- [ ] В `out/` появились: `gsm_backup_<ts>.dump`, `backend.env.backup`, `db_counts_<ts>.txt`
- [ ] Записаны контрольные числа (transactions / fuel_cards / gas_stations) и версия alembic
- [ ] Проверена SHA256 дампа (`.sha256`)
- [ ] Зафиксированы текущие настройки провайдеров (ГПН, РН-Карт, ППР) и URL интеграции 1С

## Этап 2. Новый сервер — подготовка

- [ ] Установлен Docker Engine + compose-плагин (`docker --version`, `docker compose version`)
- [ ] Пользователь в группе `docker` (или запуск под sudo)
- [ ] Выполнен: `sudo bash migration_backup/linux/02_setup_new_server.sh`
  - [ ] создана сеть `gsm_network`
  - [ ] открыты порты 8000, 3002 (+ опц. 5432, 6379, 3001, 9090)
  - [ ] создан `/opt/gsm` (INSTALL_PATH)
- [ ] Скопирован проект (git clone нужной ветки / архив исходников) в `/opt/gsm`
- [ ] Перенесён `out/` со старого сервера в `/opt/gsm/migration_backup/`

## Этап 3. Конфигурация

- [ ] `cp migration_backup/linux/env.newserver.example .env` в корне проекта
- [ ] В `.env`: `SECRET_KEY` = значение из `backend.env.backup` (НЕ менять!)
- [ ] В `.env`: `COOKIE_SECURE=false`, `ENVIRONMENT=production`
- [ ] В `.env`: `ALLOWED_ORIGINS` содержит `http://10.35.1.55:3002`
- [ ] Проверено, что `ENCRYPTION_KEY` НЕ задан (на старом сервере его не было → используется SECRET_KEY)

## Этап 4. Запуск и восстановление

- [ ] `bash migration_backup/linux/03_restore_on_new_server.sh /opt/gsm/migration_backup/out/gsm_backup_<ts>.dump`
  - [ ] `docker compose up -d --build` — все контейнеры Up
  - [ ] pg_restore выполнен без фатальных ошибок
  - [ ] `alembic upgrade head` применён, `alembic current` совпадает со старым сервером
  - [ ] контрольные числа записей совпадают с `db_counts_<ts>.txt`

## Этап 5. Проверка работоспособности

- [ ] `http://10.35.1.55:8000/health` → 200
- [ ] `http://10.35.1.55:8000/docs` открывается
- [ ] `http://10.35.1.55:3002` — фронт грузится
- [ ] Вход под `admin` работает (cookie ставятся — проверить, что COOKIE_SECURE=false сработал)
- [ ] Загрузка Excel, просмотр транзакций, фильтры, экспорт — ок
- [ ] Провайдеры (ГПН, РН-Карт, ППР Web) подключаются (сохранённые пароли расшифровываются → SECRET_KEY верный)

## Этап 6. Интеграции и внешние системы

- [ ] Обновлён URL сервиса в 1С: старый → `http://10.35.1.55:8000`
- [ ] Проверена интеграция с 1С (ППР API)
- [ ] Обновлены адреса у провайдеров, если они указывают на старый IP
- [ ] (Опц.) Поднят мониторинг: `docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d`

## Этап 7. Автозапуск и бэкапы

- [ ] `restart: unless-stopped` уже в compose — проверить, что Docker стартует при загрузке ОС (`systemctl enable docker`)
- [ ] Настроен ежедневный бэкап (cron + `01_backup_current_server.sh` или `pg_dump`), retention 7 дней

## Этап 8. Финал / откат

- [ ] Старый сервер оставлен работающим N дней для подстраховки
- [ ] Пользователи уведомлены о новом адресе `http://10.35.1.55:3002`
- [ ] Заполнен MIGRATION_LOG (дата, версия, простой, проблемы)
- [ ] **Откат:** `docker compose down` на новом → вернуть трафик/интеграции на старый сервер

---

**Дата миграции:** ___________  **Ответственный:** ___________  **Статус:** ☐ В процессе ☐ Завершено ☐ Откат
