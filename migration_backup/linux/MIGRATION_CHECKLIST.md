# Чеклист миграции GSM Converter на отдельный Ubuntu-сервер

> **`$GSM_HOST`** ниже — IP или DNS-имя нового сервера. Адрес нигде не прошит в код:
> задаётся один раз в `.env` (`GSM_HOST`), остальное считается от него.
>
> Стек: PostgreSQL 15 + Redis 7 + FastAPI backend + React/Vite frontend, всё в Docker Compose.
> Доступ по умолчанию — по HTTP (`GSM_SCHEME=http`), без домена и TLS.

---

## Этап 0. Прочитать до начала

- [ ] **Свежий дамп БД.** Старый `migration_backup/gsm_backup_migration.dump` (30.01.2026) устарел — снять новый через `01_backup_current_server.sh`.
- [ ] **`SECRET_KEY` должен совпасть со старым сервером.** Им зашифрованы пароли провайдеров (ГПН/РН-Карт/ППР/Firebird), SMTP-пароль и токен Telegram. Другой ключ = данные нечитаемы. Если ключ всё же меняется — после восстановления БД выполнить перешифровку (Этап 6).
- [ ] **`ENCRYPTION_KEY` не задавать.** На старом сервере его не было → шифрование идёт от `SECRET_KEY`. Новый `ENCRYPTION_KEY` ломает расшифровку.
- [ ] **`COOKIE_SECURE=false`** при доступе по HTTP — иначе браузер не отправит auth-cookie и вход не сработает.
- [ ] **Внешняя сеть `gsm_network`** должна существовать ДО `docker compose up` (создаёт шаг 02).
- [ ] **Порт фронта — 3002**, не 3000 (compose маппит `3002:3000` в dev и `3002:80` в prod).
- [ ] **Первая сборка долгая.** Образ backend тянет Firebird 4.0 и Playwright+Chromium — это минуты и несколько ГБ. Не прерывать.
- [ ] **Выбрать режим:** prod (`docker-compose.prod.yml`, статика за nginx — рекомендуется) или dev (`docker-compose.yml`, Vite hot-reload). См. README.

---

## Этап 1. На СТАРОМ сервере (источник)

- [ ] Контейнеры запущены (`docker compose ps` → `gsm_db`, `gsm_backend` healthy)
- [ ] Снят свежий дамп: `bash migration_backup/linux/01_backup_current_server.sh`
- [ ] В `out/` появились: `gsm_backup_<ts>.dump`, `backend.env.backup`, `db_counts_<ts>.txt`
- [ ] Записаны контрольные числа (transactions / fuel_cards / gas_stations) и версия alembic
- [ ] Сверена SHA256 дампа (`.sha256`) после переноса на новый сервер
- [ ] Зафиксированы настройки провайдеров (ГПН, РН-Карт, ППР) и URL интеграции 1С
- [ ] `out/` перенесён на новый сервер **защищённым каналом** — в нём лежат секреты в открытом виде

## Этап 2. Новый сервер — подготовка

- [ ] Ubuntu обновлена (`sudo apt-get update && sudo apt-get upgrade`)
- [ ] Установлен Docker Engine + `docker-compose-plugin` из репозитория Docker
      (не `docker.io` из репозиториев Ubuntu — он устарел и идёт без compose v2).
      Команды печатает `02_setup_new_server.sh`, если Docker не найден.
- [ ] Пользователь в группе `docker` (`sudo usermod -aG docker $USER`, затем перелогиниться)
- [ ] `sudo systemctl enable --now docker` — автозапуск при загрузке ОС
- [ ] Выполнен `sudo bash migration_backup/linux/02_setup_new_server.sh`:
  - [ ] проверены Docker и compose v2
  - [ ] **порты 8000/3002/5432/6379 свободны** (скрипт падает, если заняты)
  - [ ] создана сеть `gsm_network`
  - [ ] открыты порты 8000, 3002 (служебные и мониторинг — только с `OPEN_INTERNAL=1`)
  - [ ] создан `/opt/gsm` (`INSTALL_PATH`)
  - [ ] свободно ≥ 10 ГБ
- [ ] Скопирован проект (git clone нужной ветки / архив) в `/opt/gsm`
- [ ] Перенесён `out/` со старого сервера в `/opt/gsm/migration_backup/linux/out/`

## Этап 3. Конфигурация

- [ ] `cp migration_backup/linux/env.newserver.example .env` в корне проекта
- [ ] Заполнены **все** плейсхолдеры `<...>`:
  - [ ] `GSM_HOST` — IP или DNS-имя нового сервера
  - [ ] `GSM_SCHEME` — `http` (или `https`, если TLS терминируется впереди)
  - [ ] `SECRET_KEY` — значение из `out/backend.env.backup`
  - [ ] `ADMIN_PASSWORD`, `ADMIN_EMAIL`
  - [ ] `POSTGRES_PASSWORD` — и тот же пароль внутри `DATABASE_URL`
  - [ ] `GRAFANA_ADMIN_PASSWORD` (если поднимаете мониторинг)
  - [ ] `ALLOWED_ORIGINS` — адрес сервера **строкой**; подстановки `${GSM_HOST}` внутри `.env` не раскрываются
- [ ] `ENCRYPTION_KEY` оставлен закомментированным
- [ ] `COOKIE_SECURE=false` (при `GSM_SCHEME=http`), `ENVIRONMENT=production`
- [ ] Если у сервера есть **DNS-имя** и используется dev-режим — имя добавлено в `VITE_ALLOWED_HOSTS` (в код лезть не нужно)
- [ ] **Предполётная проверка пройдена без ошибок:**
      `bash migration_backup/linux/00_preflight_check.sh migration_backup/linux/out/backend.env.backup`

## Этап 4. Запуск и восстановление

- [ ] Для prod-режима: `export COMPOSE_FILE=docker-compose.prod.yml` (и при желании `FRONTEND_PORT=80` в `.env`)
- [ ] `bash migration_backup/linux/03_restore_on_new_server.sh /opt/gsm/migration_backup/linux/out/gsm_backup_<ts>.dump`
  - [ ] предполётная проверка пройдена (скрипт прерывается при ошибках)
  - [ ] `docker compose up -d --build` — все контейнеры Up
  - [ ] БД пересоздана пустой, `pg_restore` без фатальных ошибок
  - [ ] `alembic current` совпадает со старым сервером
  - [ ] контрольные числа записей совпадают с `db_counts_<ts>.txt`
  - [ ] **`providers` и `provider_templates` непустые** — если пусты, restore шёл поверх живого backend

## Этап 5. Проверка работоспособности

- [ ] `$GSM_SCHEME://$GSM_HOST:8000/health` → 200
- [ ] `$GSM_SCHEME://$GSM_HOST:8000/docs` открывается
- [ ] `$GSM_SCHEME://$GSM_HOST:3002` — фронт грузится (в prod при `FRONTEND_PORT=80` — без порта)
- [ ] Вход под `admin` работает (auth-cookie ставится → `COOKIE_SECURE` выставлен верно)
- [ ] Загрузка Excel, просмотр транзакций, фильтры, экспорт — ок
- [ ] **Провайдеры подключаются** (ГПН, РН-Карт, ППР Web) — значит сохранённые пароли расшифровались и `SECRET_KEY` верный
- [ ] Email-уведомления и Telegram-бот работают (их секреты тоже зашифрованы `SECRET_KEY`)
- [ ] Автозагрузка по расписанию (APScheduler) запускается — проверить `docker compose logs backend`

## Этап 6. Ротация SECRET_KEY (только если ключ меняется)

Старый `SECRET_KEY` лежал в истории git (`migration_backup/backend.env.backup`), поэтому
ротация — разумная гигиена. Делать **после** успешного восстановления и проверки Этапа 5.

- [ ] Снят бэкап БД уже на новом сервере (откат возможен только из него)
- [ ] Сгенерирован новый ключ: `python -c "import secrets; print(secrets.token_urlsafe(64))"`
- [ ] Холостой прогон без ошибок расшифровки:
      `docker exec -e OLD_SECRET_KEY=... -e NEW_SECRET_KEY=... gsm_backend python -m scripts.rotate_secret_key`
- [ ] Применено: тот же вызов с `--apply`
- [ ] `SECRET_KEY` в `.env` заменён на новый, backend перезапущен
      (`docker compose up -d --force-recreate backend`)
- [ ] Повторно проверены провайдеры, email и Telegram
- [ ] Пользователи перелогинились (старые JWT невалидны)

## Этап 7. Интеграции и внешние системы

- [ ] Обновлён URL сервиса в 1С: старый → `$GSM_SCHEME://$GSM_HOST:8000`
- [ ] Проверена интеграция с 1С (ППР API)
- [ ] Обновлены адреса у провайдеров, если они указывают на старый сервер
- [ ] (Опц.) Мониторинг: `docker compose -f docker-compose.monitoring.yml up -d`
      — `GRAFANA_ROOT_URL` в `.env` указывает на новый адрес, Grafana на `:3001`

## Этап 8. Бэкапы и эксплуатация

- [ ] `restart: unless-stopped` уже в compose — проверено, что стек поднимается после `sudo reboot`
- [ ] Настроен ежедневный бэкап (cron + `pg_dump -Fc`), retention ≥ 7 дней
- [ ] Бэкапы складываются **вне** этого сервера (или хотя бы на отдельный том)
- [ ] Проверено восстановление из бэкапа хотя бы один раз

## Этап 9. Финал / откат

- [ ] Старый сервер оставлен работающим N дней для подстраховки
- [ ] Пользователи уведомлены о новом адресе
- [ ] Заполнен MIGRATION_LOG (дата, версия, простой, проблемы)
- [ ] Удалены временные SSH-ключи доступа, если добавлялись для миграции
- [ ] `out/` с секретами удалён с промежуточных носителей
- [ ] **Откат:** `docker compose down` на новом → вернуть трафик и интеграции на старый сервер

---

**Дата миграции:** ___________  **`GSM_HOST`:** ___________  **Ответственный:** ___________

**Статус:** ☐ В процессе ☐ Завершено ☐ Откат
