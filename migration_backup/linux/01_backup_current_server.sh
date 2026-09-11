#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  GSM Converter — СВЕЖИЙ БЭКАП НА ТЕКУЩЕМ (СТАРОМ) СЕРВЕРЕ
# ═══════════════════════════════════════════════════════════════
#
#  Запускать ТАМ, где работает контейнер gsm_db (старый сервер).
#  Работает в Linux-bash и в Git Bash на Windows — всё через docker.
#
#  Результат кладётся в ./out/ рядом со скриптом:
#    - gsm_backup_<timestamp>.dump   (custom format, для pg_restore)
#    - backend.env.backup            (копия .env из контейнера backend)
#    - db_counts_<timestamp>.txt     (контрольные числа записей)
#
#  Старый дамп от 30.01.2026 УСТАРЕЛ — всегда снимайте свежий.
# ───────────────────────────────────────────────────────────────
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-gsm_db}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-gsm_backend}"
PG_USER="${POSTGRES_USER:-gsm_user}"
PG_DB="${POSTGRES_DB:-gsm_db}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/out"
mkdir -p "$OUT_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
DUMP="$OUT_DIR/gsm_backup_${TS}.dump"

echo "═══════════════════════════════════════════════════════════════"
echo "  GSM — БЭКАП ТЕКУЩЕГО СЕРВЕРА  ($TS)"
echo "═══════════════════════════════════════════════════════════════"

# 1. Проверка, что контейнер БД жив
if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  echo "❌ Контейнер ${DB_CONTAINER} не запущен. Запустите docker compose up -d и повторите."
  exit 1
fi

# 2. Контрольные числа ДО бэкапа (для сверки на новом сервере)
echo "→ Снимаю контрольные числа записей..."
{
  echo "Backup timestamp: $TS"
  echo "--- row counts ---"
  for t in transactions fuel_cards gas_stations; do
    cnt=$(docker exec "$DB_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -t -A -c "SELECT COUNT(*) FROM ${t};" 2>/dev/null || echo "N/A")
    printf '%-16s %s\n' "$t" "$cnt"
  done
  echo "--- alembic version ---"
  # grep -v отбрасывает JSON-логи приложения, которые alembic печатает в stdout
  docker exec "$BACKEND_CONTAINER" alembic current 2>/dev/null | grep -vE '^\{' || echo "alembic: N/A"
} | tee "$OUT_DIR/db_counts_${TS}.txt"

# 3. Дамп БД в custom format
echo "→ Создаю дамп БД (pg_dump -Fc)..."
# Стримим дамп на stdout и пишем файл на хосте. Файл внутри контейнера не создаём:
# под Git Bash (MSYS) аргумент вида /tmp/x переписывается в C:/.../tmp/x, из-за чего
# pg_dump -f и последующий docker cp ломались. Поток от этого не зависит.
docker exec "$DB_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc > "$DUMP"
if [[ ! -s "$DUMP" ]]; then
  echo "❌ Дамп пустой — проверьте: docker logs $DB_CONTAINER"
  exit 1
fi
echo "✓ Дамп: $DUMP ($(du -h "$DUMP" | cut -f1))"

# 4. Копия .env из контейнера backend (актуальные секреты)
echo "→ Копирую backend/.env..."
ENV_OUT="$OUT_DIR/backend.env.backup"
# Переменные, которые обязаны уехать на новый сервер. SECRET_KEY — критичный:
# им зашифрованы пароли провайдеров, при несовпадении они не расшифруются.
ENV_KEYS='SECRET_KEY|ENCRYPTION_KEY|ENABLE_AUTH|ENVIRONMENT|COOKIE_SECURE|JWT_EXPIRE_MINUTES|ADMIN_USERNAME|ADMIN_PASSWORD|ADMIN_EMAIL'

# Путь к .env передаём внутри sh -c одной строкой — иначе MSYS его тоже переписал бы
if docker exec "$BACKEND_CONTAINER" sh -c 'test -f /app/.env' 2>/dev/null; then
  docker exec "$BACKEND_CONTAINER" sh -c 'cat /app/.env' > "$ENV_OUT"
  echo "✓ backend.env.backup — из /app/.env в контейнере"
elif [[ -f "$SCRIPT_DIR/../../backend/.env" ]]; then
  # compose отдаёт секреты через env_file, файла внутри контейнера нет
  tr -d '\r' < "$SCRIPT_DIR/../../backend/.env" > "$ENV_OUT"
  echo "✓ backend.env.backup — из backend/.env на хосте"
else
  # Последний рубеж: снимаем эффективные значения с работающего контейнера
  echo "→ /app/.env и backend/.env не найдены, снимаю значения из окружения контейнера..."
  docker exec "$BACKEND_CONTAINER" sh -c "printenv | grep -E '^($ENV_KEYS)='" \
    | sort > "$ENV_OUT" || true
  if [[ -s "$ENV_OUT" ]]; then
    echo "✓ backend.env.backup — из окружения $BACKEND_CONTAINER"
  else
    echo "❌ Не удалось получить настройки. Скопируйте backend/.env вручную в $ENV_OUT —"
    echo "   без него не сверить SECRET_KEY, и пароли провайдеров на новом сервере не расшифруются."
  fi
fi

# Проверяем, что главное действительно попало в файл
if [[ -s "$ENV_OUT" ]]; then
  if grep -qE '^[[:space:]]*SECRET_KEY=.+' "$ENV_OUT"; then
    echo "  ✓ SECRET_KEY присутствует ($(grep -cE "^[[:space:]]*($ENV_KEYS)=" "$ENV_OUT") перем.)"
  else
    echo "  ❌ В $ENV_OUT нет SECRET_KEY — на новом сервере не расшифруются пароли провайдеров!"
  fi
fi

# 5. Контрольная сумма
echo "→ SHA256 дампа:"
sha256sum "$DUMP" | tee "$DUMP.sha256"

echo ""
echo "✓ ГОТОВО. Перенесите на новый сервер всё содержимое: $OUT_DIR"
echo "  + директорию проекта (git clone / архив исходников)."
