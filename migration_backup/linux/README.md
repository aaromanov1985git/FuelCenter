# GSM Converter — комплект переноса на отдельный Ubuntu-сервер

Комплект под **текущую** архитектуру. Старые файлы в `migration_backup/`
(Windows + Docker Desktop, дамп от 30.01.2026) оставлены как исторические —
**использовать эти, в `linux/`**.

Адрес нового сервера **нигде не прошит**: задаётся один раз в `.env`
(`GSM_HOST`), скрипты и URL считаются от него. Сменить целевой сервер =
поменять одну строку.

## Файлы

| Файл | Где запускать | Назначение |
|------|---------------|-----------|
| `01_backup_current_server.sh` | старый сервер | свежий `pg_dump -Fc` + копия `.env` + контрольные числа + SHA256 |
| `02_setup_new_server.sh` | новый сервер (sudo) | Docker-проверки, **проверка занятости портов**, сеть `gsm_network`, директории, firewall |
| `00_preflight_check.sh` | новый сервер | валидация заполненного `.env` до запуска: `SECRET_KEY`, `COOKIE_SECURE`, CORS, `DATABASE_URL`, порты, место |
| `03_restore_on_new_server.sh` | новый сервер | preflight → `compose up` → чистый `pg_restore` → `alembic` → health |
| `env.newserver.example` | новый сервер | шаблон корневого `.env` (только плейсхолдеры, без секретов) |
| `MIGRATION_CHECKLIST.md` | — | пошаговый чеклист |

Дополнительно, в репозитории: `backend/scripts/rotate_secret_key.py` —
перешифровка сохранённых секретов при смене `SECRET_KEY`.

## Быстрый путь

```bash
# ── 1. СТАРЫЙ сервер ────────────────────────────────────────────
bash migration_backup/linux/01_backup_current_server.sh
#   → migration_backup/linux/out/{gsm_backup_<ts>.dump, backend.env.backup, db_counts_<ts>.txt}
#   Перенести out/ + исходники проекта на новый сервер ЗАЩИЩЁННЫМ каналом
#   (в backend.env.backup лежат секреты в открытом виде).

# ── 2. НОВЫЙ сервер: подготовка ────────────────────────────────
sudo bash migration_backup/linux/02_setup_new_server.sh
#   Если Docker не установлен — скрипт напечатает команды для Ubuntu и выйдет.

# ── 3. НОВЫЙ сервер: конфиг ────────────────────────────────────
cp migration_backup/linux/env.newserver.example .env
nano .env        # заполнить ВСЕ плейсхолдеры <...>, начиная с GSM_HOST и SECRET_KEY
#   ⚠️ нужен ВТОРОЙ файл — backend/.env (см. раздел «Два файла .env» ниже)

# ── 4. НОВЫЙ сервер: проверка конфига ──────────────────────────
bash migration_backup/linux/00_preflight_check.sh \
     migration_backup/linux/out/backend.env.backup
#   Второй аргумент включает сверку SECRET_KEY со старым сервером —
#   это самая дорогая ошибка переноса, проверять обязательно.

# ── 5. НОВЫЙ сервер: запуск + восстановление ───────────────────
bash migration_backup/linux/03_restore_on_new_server.sh \
     migration_backup/linux/out/gsm_backup_<ts>.dump
#   Скрипт сам прогоняет preflight и прерывается при ошибках.
#   Осознанно пропустить: SKIP_PREFLIGHT=1

# ── 6. Проверка ────────────────────────────────────────────────
curl http://$GSM_HOST:8000/health
# Открыть http://$GSM_HOST:3002, войти под admin, проверить провайдеров.
```

## Два файла .env

Файлов конфигурации **два**, и путать их нельзя:

| Файл | Кто читает | Что в нём |
|------|-----------|-----------|
| `<project>/.env` | Docker Compose — подстановки `${...}` | порты, `ALLOWED_ORIGINS`, `DATABASE_URL`, `POSTGRES_*`, `GSM_HOST` |
| `<project>/backend/.env` | **приложение** (подключён через `env_file`) | `SECRET_KEY`, `ADMIN_*`, `ENVIRONMENT`, `COOKIE_SECURE`, `ENABLE_AUTH` |

`backend/.env` в репозитории отсутствует (gitignored) и **сам не создаётся**:

- без него `docker compose up` падает сразу — `env_file` обязателен;
- в блоке `environment:` сервиса backend `SECRET_KEY` намеренно отсутствует, поэтому
  при расхождении приложение возьмёт значение **из `backend/.env`**, а не из корневого.

Наполнять значениями из `migration_backup/linux/out/backend.env.backup`.
Оба файла и их согласованность проверяет `00_preflight_check.sh`.

## ⚠️ Критичные моменты

1. **`SECRET_KEY` идентичен старому серверу.** Иначе не расшифруются пароли
   провайдеров (ГПН/РН-Карт/ППР/Firebird), SMTP-пароль и токен Telegram, а старые
   JWT станут невалидными. `ENCRYPTION_KEY` на старом сервере не задавался →
   шифрование идёт от `SECRET_KEY`, поэтому новый `ENCRYPTION_KEY` **НЕ задавать**.
   Проверяется автоматически в `00_preflight_check.sh`.
2. **`COOKIE_SECURE=false`** для HTTP-доступа (иначе не залогиниться).
3. **`gsm_network` создать ДО `compose up`** (делает шаг 02).
4. **`pg_restore` только в пустую пересозданную БД.** Если лить дамп поверх
   работающего backend, он успевает засидить дефолтные записи → FK/PK-конфликты
   и потеря `providers`/`provider_templates`. Шаг 03 делает это правильно:
   стоп backend → `DROP`/`CREATE` → `pg_restore` → старт backend.
5. **Подстановки в `.env` не раскрываются.** `ALLOWED_ORIGINS=http://${GSM_HOST}:3002`
   не сработает — Docker Compose не разворачивает переменные внутри `.env`.
   Писать адрес строкой (preflight это ловит).
6. **DNS-имя в dev-режиме.** IP-литералы Vite пропускает, а имя нужно перечислить
   в `VITE_ALLOWED_HOSTS` (переменная окружения, не код). В prod-режиме
   неактуально — статику раздаёт nginx.
7. **Первая сборка долгая.** Образ backend тянет Firebird 4.0 и Playwright+Chromium:
   минуты и несколько ГБ. Нужно ≥ 10 ГБ свободного места.

## Dev vs Prod

| | `docker-compose.yml` (dev) | `docker-compose.prod.yml` (prod) |
|--|----------------------------|----------------------------------|
| Frontend | Vite dev-сервер, hot-reload | сборка `npm run build` → nginx |
| Исходники | bind-mount (`./src`, `./backend/app`) | запечены в образ (иммутабельно) |
| Backend | `uvicorn --reload` | `uvicorn` без reload |
| Доп. файлы | — | `Dockerfile.frontend.prod`, `nginx.frontend.conf` |
| Порт фронта | `3002:3000` | `${FRONTEND_PORT:-3002}:80` (можно `FRONTEND_PORT=80` → URL без порта) |
| CORS | нужен корректный `ALLOWED_ORIGINS` | `/api` проксируется тем же nginx → один origin |
| `allowedHosts` | проверяется Vite (см. `VITE_ALLOWED_HOSTS`) | не применяется |

**Для боевого сервера рекомендуется prod.** Запуск — тем же скриптом 03:

```bash
export COMPOSE_FILE=docker-compose.prod.yml
echo 'FRONTEND_PORT=80' >> .env        # опционально: чистый URL без порта
bash migration_backup/linux/03_restore_on_new_server.sh \
     migration_backup/linux/out/gsm_backup_<ts>.dump
```

`COOKIE_SECURE=false` остаётся обязательным и в prod, пока доступ идёт по HTTP.
Для HTTPS — терминировать TLS на внешнем nginx/реверс-прокси, затем выставить
`GSM_SCHEME=https` и `COOKIE_SECURE=true`.

## Мониторинг

Стек мониторинга поднимается отдельно и подключается к той же сети `gsm_network`:

```bash
docker compose -f docker-compose.monitoring.yml up -d
```

Grafana на `:3001` — `GRAFANA_ROOT_URL` и `GRAFANA_ADMIN_PASSWORD` задаются в `.env`.
Порты мониторинга шаг 02 наружу **не открывает**; нужно — запустить с `OPEN_INTERNAL=1`.

## Ротация SECRET_KEY

Старый ключ находился в отслеживаемом git-файле (`migration_backup/backend.env.backup`,
сейчас из индекса убран, но остался в истории), поэтому ротация — разумная гигиена.
Делать после успешного переноса и проверки работоспособности:

```bash
NEW=$(python -c "import secrets; print(secrets.token_urlsafe(64))")

# 1. Бэкап БД — единственный путь отката
# 2. Холостой прогон: убедиться, что всё расшифровывается старым ключом
docker exec -e OLD_SECRET_KEY="$OLD" -e NEW_SECRET_KEY="$NEW" \
  gsm_backend python -m scripts.rotate_secret_key
# 3. Применить
docker exec -e OLD_SECRET_KEY="$OLD" -e NEW_SECRET_KEY="$NEW" \
  gsm_backend python -m scripts.rotate_secret_key --apply
# 4. Заменить SECRET_KEY в .env и перезапустить backend
docker compose up -d --force-recreate backend
```

Порядок шагов 3 и 4 менять нельзя: пока backend работает на старом ключе, данные,
перешифрованные новым, он не прочитает.

## Откат

`docker compose down` на новом сервере, вернуть интеграции (1С, провайдеры) на старый.
Старый сервер не трогать до подтверждения стабильности нового.
