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
  docker exec "$BACKEND_CONTAINER" alembic current 2>/dev/null || echo "alembic: N/A"
} | tee "$OUT_DIR/db_counts_${TS}.txt"

# 3. Дамп БД в custom format
echo "→ Создаю дамп БД (pg_dump -Fc)..."
docker exec "$DB_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc -f /tmp/migration.dump
docker cp "${DB_CONTAINER}:/tmp/migration.dump" "$DUMP"
docker exec "$DB_CONTAINER" rm -f /tmp/migration.dump
echo "✓ Дамп: $DUMP ($(du -h "$DUMP" | cut -f1))"

# 4. Копия .env из контейнера backend (актуальные секреты)
echo "→ Копирую backend/.env..."
if docker exec "$BACKEND_CONTAINER" test -f /app/.env 2>/dev/null; then
  docker cp "${BACKEND_CONTAINER}:/app/.env" "$OUT_DIR/backend.env.backup"
  echo "✓ backend.env.backup сохранён"
else
  echo "⚠ /app/.env не найден в контейнере — скопируйте backend/.env вручную со старого хоста"
fi

# 5. Контрольная сумма
echo "→ SHA256 дампа:"
sha256sum "$DUMP" | tee "$DUMP.sha256"

echo ""
echo "✓ ГОТОВО. Перенесите на новый сервер всё содержимое: $OUT_DIR"
echo "  + директорию проекта (git clone / архив исходников)."
