#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  GSM Converter — ЗАПУСК И ВОССТАНОВЛЕНИЕ НА НОВОМ СЕРВЕРЕ (Ubuntu)
# ═══════════════════════════════════════════════════════════════
#
#  Использование:
#    bash 03_restore_on_new_server.sh /path/to/gsm_backup_YYYYMMDD.dump
#
#  Предусловия (шаг 02 выполнен):
#    - Docker запущен, сеть gsm_network создана
#    - Проект скопирован, рядом с docker-compose.yml лежит заполненный .env
#    - Пройдена проверка: bash 00_preflight_check.sh <backend.env.backup>
#      (ловит несовпадение SECRET_KEY, COOKIE_SECURE=true по HTTP, CORS, порты)
#
#  Делает: docker compose up -d → ждёт healthy → ЧИСТЫЙ restore в пустую БД
#          (стоп backend, drop/create, pg_restore, старт backend) → проверки.
#
#  ВАЖНО: restore идёт в ПУСТУЮ пересозданную базу. Если лить дамп поверх
#  уже поднятого backend, он успевает засидить дефолтные записи (напр. 1
#  провайдера) → FK/PK-конфликты и потеря части данных (providers/templates).
# ───────────────────────────────────────────────────────────────
set -euo pipefail

DUMP_FILE="${1:-}"
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
DB_CONTAINER="gsm_db"
BACKEND_CONTAINER="gsm_backend"
PG_USER="${POSTGRES_USER:-gsm_user}"
PG_DB="${POSTGRES_DB:-gsm_db}"
FRONTEND_PORT="${FRONTEND_PORT:-3002}"
# Для prod-стека заранее: export COMPOSE_FILE=docker-compose.prod.yml
# (docker compose сам подхватит этот файл вместо docker-compose.yml)

# Адрес сервера берём из .env (GSM_HOST) — в скрипт он не прошит.
env_val() {
  [[ -f "$PROJECT_DIR/.env" ]] || return 0
  grep -E "^[[:space:]]*${1}=" "$PROJECT_DIR/.env" 2>/dev/null \
    | tail -n1 \
    | sed -E "s/^[[:space:]]*${1}=//" \
    | tr -d '\r' \
    | sed -E 's/[[:space:]]+$//'
}

echo "═══════════════════════════════════════════════════════════════"
echo "  GSM — ВОССТАНОВЛЕНИЕ НА НОВОМ СЕРВЕРЕ"
echo "═══════════════════════════════════════════════════════════════"

# 0. Проверки
[[ -n "$DUMP_FILE" && -f "$DUMP_FILE" ]] || { echo "❌ Укажите существующий файл дампа первым аргументом."; exit 1; }
[[ -f "$PROJECT_DIR/docker-compose.yml" ]] || { echo "❌ docker-compose.yml не найден в $PROJECT_DIR (задайте PROJECT_DIR)."; exit 1; }
[[ -f "$PROJECT_DIR/.env" ]] || echo "⚠ $PROJECT_DIR/.env не найден — будут использованы дефолты compose. Скопируйте env.newserver.example в .env!"
docker network inspect gsm_network >/dev/null 2>&1 || { echo "❌ Сеть gsm_network отсутствует. Сначала: bash 02_setup_new_server.sh"; exit 1; }

cd "$PROJECT_DIR"

GSM_HOST_VAL="$(env_val GSM_HOST)"
GSM_SCHEME_VAL="$(env_val GSM_SCHEME)"; GSM_SCHEME_VAL="${GSM_SCHEME_VAL:-http}"
FRONTEND_PORT="$(env_val FRONTEND_PORT)"; FRONTEND_PORT="${FRONTEND_PORT:-3002}"
BASE_URL="${GSM_SCHEME_VAL}://${GSM_HOST_VAL:-localhost}"
# FRONTEND_PORT=80 -> URL без порта
if [[ "$FRONTEND_PORT" == "80" ]]; then
  APP_URL="$BASE_URL"
else
  APP_URL="${BASE_URL}:${FRONTEND_PORT}"
fi

# Предполётная проверка: дешевле поймать ошибку конфига здесь, чем после restore.
# SKIP_PREFLIGHT=1 — продолжить несмотря на найденные ошибки (на свой риск).
PREFLIGHT="$(dirname "${BASH_SOURCE[0]}")/00_preflight_check.sh"
if [[ -f "$PREFLIGHT" ]]; then
  echo "→ Предполётная проверка .env ..."
  PREFLIGHT_LOG="$(mktemp)"
  if bash "$PREFLIGHT" >"$PREFLIGHT_LOG" 2>&1; then
    echo "✓ Предполётная проверка пройдена"
  else
    cat "$PREFLIGHT_LOG"
    echo ""
    if [[ "${SKIP_PREFLIGHT:-0}" == "1" ]]; then
      echo "⚠ SKIP_PREFLIGHT=1 — продолжаю несмотря на ошибки выше."
    else
      echo "❌ Восстановление прервано: исправьте .env и повторите."
      echo "   Осознанно пропустить: SKIP_PREFLIGHT=1 bash $0 <дамп>"
      rm -f "$PREFLIGHT_LOG"
      exit 1
    fi
  fi
  rm -f "$PREFLIGHT_LOG"
else
  echo "⚠ 00_preflight_check.sh не найден рядом — проверка конфига пропущена."
fi

# 1. Поднять стек
echo "→ docker compose up -d ..."
docker compose up -d --build

# 2. Дождаться healthy у БД
echo "→ Жду готовности PostgreSQL..."
for i in $(seq 1 30); do
  if docker exec "$DB_CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
    echo "✓ PostgreSQL готов"; break
  fi
  sleep 2
  [[ $i -eq 30 ]] && { echo "❌ PostgreSQL не поднялся за 60с. Логи: docker compose logs db"; exit 1; }
done

# 3. ЧИСТОЕ восстановление БД (в пустую пересозданную базу)
echo "→ Останавливаю backend (чтобы не сидил дефолтные данные во время restore)..."
docker stop "$BACKEND_CONTAINER" >/dev/null 2>&1 || true

echo "→ Пересоздаю пустую базу ${PG_DB}..."
docker exec "$DB_CONTAINER" psql -U "$PG_USER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${PG_DB}' AND pid <> pg_backend_pid();" >/dev/null
docker exec "$DB_CONTAINER" psql -U "$PG_USER" -d postgres -c "DROP DATABASE IF EXISTS ${PG_DB};"
docker exec "$DB_CONTAINER" psql -U "$PG_USER" -d postgres -c "CREATE DATABASE ${PG_DB} OWNER ${PG_USER};"

echo "→ Восстановление БД из $DUMP_FILE ..."
docker cp "$DUMP_FILE" "${DB_CONTAINER}:/tmp/restore.dump"
if docker exec "$DB_CONTAINER" pg_restore -U "$PG_USER" -d "$PG_DB" --no-owner /tmp/restore.dump 2>/tmp/pgr.err; then
  echo "✓ pg_restore без ошибок"
else
  echo "⚠ pg_restore: $(docker exec "$DB_CONTAINER" sh -c 'grep -c -i error /tmp/pgr.err' 2>/dev/null || echo '?') ошибок — проверьте: docker exec $DB_CONTAINER cat /tmp/pgr.err"
fi
docker exec "$DB_CONTAINER" rm -f /tmp/restore.dump /tmp/pgr.err

echo "→ Запускаю backend ..."
docker start "$BACKEND_CONTAINER" >/dev/null 2>&1 || true
for i in $(seq 1 15); do curl -fsS http://localhost:8000/health >/dev/null 2>&1 && break; sleep 2; done

# 4. Миграции. Дамп уже несёт состояние alembic исходного сервера, поэтому
#    обычно применять нечего. В дереве возможны НЕСКОЛЬКО heads — используем
#    'heads' и не падаем, если упереться не во что.
echo "→ alembic upgrade heads (толерантно) ..."
docker exec "$BACKEND_CONTAINER" alembic upgrade heads >/dev/null 2>&1 \
  && echo "  ✓ применено" \
  || echo "  ⚠ пропущено (несколько heads / уже на состоянии источника) — норма для точной реплики"
echo "  Текущее состояние alembic:"
docker exec "$BACKEND_CONTAINER" alembic current 2>/dev/null | grep -vE '^\{' | sed 's/^/    /' || echo "    N/A"

# 5. Контрольные числа
echo "→ Контроль записей (сверьте с источником!):"
for t in transactions fuel_cards gas_stations providers provider_templates; do
  cnt=$(docker exec "$DB_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -t -A -c "SELECT COUNT(*) FROM ${t};" 2>/dev/null || echo "N/A")
  printf '   %-16s %s\n' "$t" "$cnt"
done

# 6. Health-проверки
echo "→ Health-проверки:"
sleep 3
if curl -fsS http://localhost:8000/health >/dev/null 2>&1; then echo "   ✓ backend /health"; else echo "   ✗ backend /health (см. docker compose logs backend)"; fi
if curl -fsS "http://localhost:${FRONTEND_PORT}/" >/dev/null 2>&1; then echo "   ✓ frontend :${FRONTEND_PORT}"; else echo "   ✗ frontend :${FRONTEND_PORT} (см. docker compose logs frontend)"; fi
docker exec gsm_redis redis-cli ping >/dev/null 2>&1 && echo "   ✓ redis PONG" || echo "   ✗ redis"

echo ""
echo "✓ ГОТОВО. Откройте: ${APP_URL}  (вход: admin)"
if [[ -z "$GSM_HOST_VAL" ]]; then
  echo "  ⚠ GSM_HOST в .env не задан — адрес выше показан как localhost."
fi
echo "  Не забудьте обновить URL сервиса в 1С и у провайдеров (ГПН/РН-Карт/ППР)"
echo "  на ${BASE_URL}:${BACKEND_PORT:-8000}"
