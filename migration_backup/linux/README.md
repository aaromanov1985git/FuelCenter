# GSM Converter — комплект миграции на 10.35.1.55 (Linux + Docker)

Обновлённый под **текущую** архитектуру комплект переноса. Старые файлы в
`migration_backup/` (Windows/Docker Desktop, дамп от 30.01.2026) оставлены как
исторические — **использовать эти, в `linux/`**.

## Что изменилось относительно старого комплекта

| Тема | Было (старый комплект) | Стало (этот комплект) |
|------|------------------------|------------------------|
| ОС нового сервера | Windows + Docker Desktop | Linux + Docker Engine |
| Доступ | домен cloudpub.ru / HTTPS | `http://10.35.1.55` по IP |
| Сеть `gsm_network` | не создавалась → падение | `02_setup` создаёт явно |
| Frontend | `npm run build` + nginx/IIS | контейнер `gsm_frontend` (Vite), порт **3002** |
| `COOKIE_SECURE` | true (для HTTPS) | **false** (HTTP по IP) |
| Дамп БД | от 30.01.2026 (устар.) | свежий через `01_backup` |

## Файлы

| Файл | Где запускать | Назначение |
|------|---------------|-----------|
| `01_backup_current_server.sh` | старый сервер | свежий `pg_dump -Fc` + копия `.env` + контрольные числа |
| `02_setup_new_server.sh` | новый сервер (sudo) | Docker-проверки, сеть `gsm_network`, директории, firewall |
| `03_restore_on_new_server.sh` | новый сервер | `compose up` → `pg_restore` → `alembic upgrade` → health |
| `env.newserver.example` | новый сервер | шаблон корневого `.env` (IP, CORS, COOKIE_SECURE=false) |
| `MIGRATION_CHECKLIST.md` | — | пошаговый чеклист |

## Быстрый путь

```bash
# ── 1. СТАРЫЙ сервер ────────────────────────────────────────────
bash migration_backup/linux/01_backup_current_server.sh
#   → migration_backup/linux/out/{gsm_backup_<ts>.dump, backend.env.backup, db_counts_<ts>.txt}
#   Перенести out/ + исходники проекта на новый сервер.

# ── 2. НОВЫЙ сервер: подготовка ────────────────────────────────
sudo bash migration_backup/linux/02_setup_new_server.sh   # сеть, порты, директории

# ── 3. НОВЫЙ сервер: конфиг ────────────────────────────────────
cp migration_backup/linux/env.newserver.example .env
#   Проверить SECRET_KEY (= из backend.env.backup), COOKIE_SECURE=false, ALLOWED_ORIGINS.

# ── 4. НОВЫЙ сервер: запуск + восстановление ───────────────────
bash migration_backup/linux/03_restore_on_new_server.sh \
     migration_backup/linux/out/gsm_backup_<ts>.dump

# ── 5. Проверка ────────────────────────────────────────────────
curl http://10.35.1.55:8000/health
# Открыть http://10.35.1.55:3002, войти под admin.
```

## ⚠️ Критичные моменты

1. **`SECRET_KEY` идентичен старому серверу.** Иначе сохранённые пароли провайдеров
   (ГПН/РН-Карт/ППР/Firebird) не расшифруются, а старые JWT станут невалидными.
   `ENCRYPTION_KEY` на старом сервере не задавался → шифрование идёт от `SECRET_KEY`,
   поэтому новый `ENCRYPTION_KEY` НЕ задавать.
2. **`gsm_network` создать ДО `compose up`** (делает шаг 02).
3. **`COOKIE_SECURE=false`** для HTTP-доступа по IP (иначе не залогиниться).
4. **Два режима развёртывания** (см. ниже «Dev vs Prod»). По умолчанию `docker-compose.yml`
   поднимает Vite в dev-режиме (hot-reload, bind-mount исходников). Для боевого сервера
   рекомендуется `docker-compose.prod.yml` — собранная статика за nginx, без watch.
5. **Доступ по IP-литералу** Vite пропускает мимо `allowedHosts`. Если позже появится
   DNS-имя — добавить его в `server.allowedHosts` в `vite.config.js`.

## Dev vs Prod

| | `docker-compose.yml` (dev) | `docker-compose.prod.yml` (prod) |
|--|----------------------------|----------------------------------|
| Frontend | Vite dev-сервер, hot-reload | сборка `npm run build` → nginx |
| Исходники | bind-mount (`./src`, `./backend/app`) | запечены в образ (иммутабельно) |
| Backend | `uvicorn --reload` | `uvicorn` без reload |
| Файлы | — | `Dockerfile.frontend.prod`, `nginx.frontend.conf` |
| Порт фронта | `3002:3000` | `${FRONTEND_PORT:-3002}:80` (можно `FRONTEND_PORT=80` → чистый `http://10.35.1.55`) |
| CORS | нужен `ALLOWED_ORIGINS` | `/api` проксируется тем же nginx → один origin |

**Запуск prod** (восстановление тем же скриптом 03, просто укажите файл):

```bash
export COMPOSE_FILE=docker-compose.prod.yml
# при желании чистый URL без порта:
echo 'FRONTEND_PORT=80' >> .env
bash migration_backup/linux/03_restore_on_new_server.sh \
     migration_backup/linux/out/gsm_backup_<ts>.dump
```

`COOKIE_SECURE=false` остаётся обязательным и в prod, пока доступ идёт по HTTP.
Для HTTPS — терминировать TLS на внешнем nginx/реверс-прокси и затем вернуть `COOKIE_SECURE=true`.

## Откат

`docker compose down` на новом сервере, вернуть интеграции (1С, провайдеры) на старый.
Старый сервер не трогать до подтверждения стабильности нового.
