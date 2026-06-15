#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  GSM Converter — ЗАПУСК И ВОССТАНОВЛЕНИЕ НА НОВОМ Linux-СЕРВЕРЕ
# ═══════════════════════════════════════════════════════════════
#
#  Использование:
#    bash 03_restore_on_new_server.sh /path/to/gsm_backup_YYYYMMDD.dump
#
#  Предусловия (шаг 02 выполнен):
#    - Docker запущен, сеть gsm_network создана
#    - Проект скопирован, рядом с docker-compose.yml лежит .env
#
#  Делает: docker compose up -d → ждёт healthy → pg_restore →
#          alembic upgrade head → health-проверки.
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

echo "═══════════════════════════════════════════════════════════════"
echo "  GSM — ВОССТАНОВЛЕНИЕ НА НОВОМ СЕРВЕРЕ"
echo "═══════════════════════════════════════════════════════════════"

# 0. Проверки
[[ -n "$DUMP_FILE" && -f "$DUMP_FILE" ]] || { echo "❌ Укажите существующий файл дампа первым аргументом."; exit 1; }
[[ -f "$PROJECT_DIR/docker-compose.yml" ]] || { echo "❌ docker-compose.yml не найден в $PROJECT_DIR (задайте PROJECT_DIR)."; exit 1; }
[[ -f "$PROJECT_DIR/.env" ]] || echo "⚠ $PROJECT_DIR/.env не найден — будут использованы дефолты compose. Скопируйте env.newserver.example в .env!"
docker network inspect gsm_network >/dev/null 2>&1 || { echo "❌ Сеть gsm_network отсутствует. Сначала: bash 02_setup_new_server.sh"; exit 1; }

cd "$PROJECT_DIR"

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

# 3. Восстановление дампа
echo "→ Восстановление БД из $DUMP_FILE ..."
docker cp "$DUMP_FILE" "${DB_CONTAINER}:/tmp/restore.dump"
# -c --if-exists: пересоздать объекты; ошибки на отсутствующих объектах не фатальны
docker exec "$DB_CONTAINER" pg_restore -U "$PG_USER" -d "$PG_DB" -c --if-exists --no-owner /tmp/restore.dump || \
  echo "⚠ pg_restore завершился с предупреждениями (обычно норма при -c --if-exists)"
docker exec "$DB_CONTAINER" rm -f /tmp/restore.dump

# 4. Миграции
echo "→ alembic upgrade head ..."
docker exec "$BACKEND_CONTAINER" alembic upgrade head
echo -n "  Текущая версия миграций: "
docker exec "$BACKEND_CONTAINER" alembic current 2>/dev/null || echo "N/A"

# 5. Контрольные числа
echo "→ Контроль записей:"
for t in transactions fuel_cards gas_stations; do
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
echo "✓ ГОТОВО. Откройте: http://10.35.1.55:3002  (вход: admin)"
echo "  Не забудьте обновить URL сервиса в 1С и у провайдеров (ГПН/РН-Карт/ППР)."
