#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  GSM Converter — ПОДГОТОВКА НОВОГО Linux-СЕРВЕРА 10.35.1.55
# ═══════════════════════════════════════════════════════════════
#
#  Запускать на новом сервере (sudo для firewall).
#  Делает: проверку Docker, создание внешней сети gsm_network,
#  создание рабочих директорий, открытие портов (ufw/firewalld).
#
#  НЕ запускает сами контейнеры — это шаг 03 (restore).
# ───────────────────────────────────────────────────────────────
set -euo pipefail

INSTALL_PATH="${INSTALL_PATH:-/opt/gsm}"
OPEN_FIREWALL="${OPEN_FIREWALL:-1}"
# Порты хоста (совпадают с docker-compose.yml дефолтами)
PORTS_REQUIRED=(8000 3002)           # backend, frontend
PORTS_OPTIONAL=(5432 6379 3001 9090) # postgres, redis, grafana, prometheus

echo "═══════════════════════════════════════════════════════════════"
echo "  GSM — НАСТРОЙКА НОВОГО СЕРВЕРА (Linux)"
echo "═══════════════════════════════════════════════════════════════"

# 1. Docker / compose
echo "→ Проверка Docker..."
command -v docker >/dev/null || { echo "❌ Docker не установлен. Установите Docker Engine + compose plugin."; exit 1; }
docker info >/dev/null 2>&1 || { echo "❌ Docker daemon не запущен (или нет прав; добавьте пользователя в группу docker)."; exit 1; }
docker --version
docker compose version 2>/dev/null || echo "⚠ 'docker compose' (v2) не найден — проверьте установку compose-плагина"

# 2. Внешняя сеть gsm_network (КРИТИЧНО — без неё docker compose up упадёт)
echo "→ Сеть gsm_network..."
if docker network inspect gsm_network >/dev/null 2>&1; then
  echo "✓ Сеть gsm_network уже существует"
else
  docker network create gsm_network
  echo "✓ Сеть gsm_network создана"
fi

# 3. Рабочие директории
echo "→ Директории в $INSTALL_PATH..."
mkdir -p "$INSTALL_PATH"/{backups,logs}
echo "✓ $INSTALL_PATH (+ backups, logs)"

# 4. Firewall
if [[ "$OPEN_FIREWALL" == "1" ]]; then
  echo "→ Открываю порты..."
  if command -v ufw >/dev/null 2>&1; then
    for p in "${PORTS_REQUIRED[@]}" "${PORTS_OPTIONAL[@]}"; do
      ufw allow "${p}/tcp" >/dev/null && echo "  ✓ ufw allow ${p}/tcp"
    done
  elif command -v firewall-cmd >/dev/null 2>&1; then
    for p in "${PORTS_REQUIRED[@]}" "${PORTS_OPTIONAL[@]}"; do
      firewall-cmd --permanent --add-port="${p}/tcp" >/dev/null && echo "  ✓ firewalld ${p}/tcp"
    done
    firewall-cmd --reload >/dev/null
  else
    echo "⚠ Ни ufw, ни firewalld не найдены — откройте порты вручную: ${PORTS_REQUIRED[*]} ${PORTS_OPTIONAL[*]}"
  fi
else
  echo "→ Firewall пропущен (OPEN_FIREWALL=0)"
fi

echo ""
echo "✓ ГОТОВО. Дальше:"
echo "  1. Скопируйте проект в $INSTALL_PATH (git clone / архив)."
echo "  2. cp migration_backup/linux/env.newserver.example $INSTALL_PATH/.env  и проверьте значения."
echo "  3. Положите свежий дамп в $INSTALL_PATH/migration_backup/."
echo "  4. Запустите: bash migration_backup/linux/03_restore_on_new_server.sh <путь_к_дампу>"
