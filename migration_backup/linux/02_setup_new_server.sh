#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  GSM Converter — ПОДГОТОВКА НОВОГО СЕРВЕРА (Ubuntu + Docker)
# ═══════════════════════════════════════════════════════════════
#
#  Запускать на новом сервере (sudo для firewall).
#  Делает: проверку Docker, проверку занятости портов, создание внешней
#  сети gsm_network, создание рабочих директорий, открытие портов (ufw/firewalld).
#
#  НЕ запускает сами контейнеры — это шаг 03 (restore).
#  Адрес сервера здесь не нужен: он задаётся в .env (GSM_HOST).
#
#  Переменные:
#    INSTALL_PATH=/opt/gsm   куда кладётся проект
#    OPEN_FIREWALL=1         0 — не трогать firewall
#    OPEN_INTERNAL=0         1 — открыть снаружи и служебные порты
#                            (postgres/redis/мониторинг). По умолчанию
#                            наружу торчат только backend и frontend.
# ───────────────────────────────────────────────────────────────
set -euo pipefail

INSTALL_PATH="${INSTALL_PATH:-/opt/gsm}"
OPEN_FIREWALL="${OPEN_FIREWALL:-1}"
OPEN_INTERNAL="${OPEN_INTERNAL:-0}"

# Порты хоста (совпадают с дефолтами docker-compose.yml)
PORTS_REQUIRED=(8000 3002)            # backend, frontend — нужны пользователям
PORTS_INTERNAL=(5432 6379)            # postgres, redis — снаружи обычно не нужны
PORTS_MONITORING=(3001 9090 9093 3100 9121)  # grafana, prometheus, alertmanager, loki, redis_exporter

echo "═══════════════════════════════════════════════════════════════"
echo "  GSM — НАСТРОЙКА НОВОГО СЕРВЕРА (Ubuntu + Docker)"
echo "═══════════════════════════════════════════════════════════════"

# ── 1. Docker / compose ───────────────────────────────────────
echo "→ Проверка Docker..."
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker не установлен."
  echo ""
  echo "   Установка Docker Engine на Ubuntu (официальный репозиторий Docker;"
  echo "   пакет docker.io из репозиториев Ubuntu часто устарел и идёт без compose v2):"
  echo ""
  echo "     sudo apt-get update"
  echo "     sudo apt-get install -y ca-certificates curl"
  echo "     sudo install -m 0755 -d /etc/apt/keyrings"
  echo "     sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \\"
  echo "          -o /etc/apt/keyrings/docker.asc"
  echo "     sudo chmod a+r /etc/apt/keyrings/docker.asc"
  echo "     echo \"deb [arch=\$(dpkg --print-architecture) \\"
  echo "       signed-by=/etc/apt/keyrings/docker.asc] \\"
  echo "       https://download.docker.com/linux/ubuntu \$(. /etc/os-release && echo \$VERSION_CODENAME) stable\" \\"
  echo "       | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null"
  echo "     sudo apt-get update"
  echo "     sudo apt-get install -y docker-ce docker-ce-cli containerd.io \\"
  echo "          docker-buildx-plugin docker-compose-plugin"
  echo "     sudo usermod -aG docker \$USER   # затем перелогиниться"
  echo ""
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker daemon недоступен."
  echo "   → Запущен ли он:    sudo systemctl enable --now docker"
  echo "   → Права текущего пользователя: sudo usermod -aG docker \$USER (и перелогиниться)"
  exit 1
fi
docker --version

if docker compose version >/dev/null 2>&1; then
  echo "✓ compose v2: $(docker compose version --short 2>/dev/null || echo 'есть')"
else
  echo "❌ Плагин 'docker compose' (v2) не найден."
  echo "   → sudo apt-get install -y docker-compose-plugin"
  echo "   (legacy 'docker-compose' v1 не подходит: скрипты используют синтаксис v2)"
  exit 1
fi

# ── 2. Занятость портов (до создания чего-либо) ───────────────
echo "→ Проверка занятости портов..."
port_busy() {
  if command -v ss >/dev/null 2>&1; then
    ss -lntH 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${1}$"
  elif command -v netstat >/dev/null 2>&1; then
    netstat -lnt 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${1}$"
  else
    return 2
  fi
}

BUSY=()
for p in "${PORTS_REQUIRED[@]}" "${PORTS_INTERNAL[@]}"; do
  port_busy "$p"
  case $? in
    0)
      # Порт нашего же контейнера — не конфликт, а перезапуск стека
      if docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep -qE "^gsm_.*:${p}->"; then
        echo "  ✓ $p — занят контейнером GSM (существующий стек)"
      else
        echo "  ✗ $p — занят сторонним процессом"
        BUSY+=("$p")
      fi
      ;;
    1) echo "  ✓ $p свободен" ;;
    *) echo "  ⚠ $p — нет ss/netstat, проверить не удалось" ;;
  esac
done

if [[ ${#BUSY[@]} -gt 0 ]]; then
  echo ""
  echo "❌ Порты заняты: ${BUSY[*]} — 'docker compose up' на них упадёт."
  echo "   Найти владельца:  sudo ss -lntp | grep -E '${BUSY[0]}'"
  echo "   Либо освободите порт, либо переопределите в .env"
  echo "   (BACKEND_PORT / FRONTEND_PORT / POSTGRES_PORT / REDIS_PORT)."
  exit 1
fi

# ── 3. Внешняя сеть gsm_network (КРИТИЧНО) ────────────────────
# Без неё 'docker compose up' падает: сеть объявлена external в обоих compose-файлах.
echo "→ Сеть gsm_network..."
if docker network inspect gsm_network >/dev/null 2>&1; then
  echo "✓ Сеть gsm_network уже существует"
else
  docker network create gsm_network
  echo "✓ Сеть gsm_network создана"
fi

# ── 4. Рабочие директории ─────────────────────────────────────
echo "→ Директории в $INSTALL_PATH..."
mkdir -p "$INSTALL_PATH"/{backups,logs}
echo "✓ $INSTALL_PATH (+ backups, logs)"

# ── 5. Место на диске ─────────────────────────────────────────
# Образ backend тянет Firebird 4.0 и Playwright+Chromium — это несколько ГБ.
AVAIL_MB=$(df -Pm "$INSTALL_PATH" 2>/dev/null | awk 'NR==2 {print $4}')
if [[ -n "${AVAIL_MB:-}" ]]; then
  if [[ "$AVAIL_MB" -lt 5120 ]]; then
    echo "⚠ Свободно ${AVAIL_MB} МБ — мало. Образы (Firebird + Chromium) и БД требуют ~5 ГБ+"
  else
    echo "✓ Свободно ${AVAIL_MB} МБ"
  fi
fi

# ── 6. Firewall ───────────────────────────────────────────────
if [[ "$OPEN_FIREWALL" == "1" ]]; then
  PORTS_TO_OPEN=("${PORTS_REQUIRED[@]}")
  if [[ "$OPEN_INTERNAL" == "1" ]]; then
    PORTS_TO_OPEN+=("${PORTS_INTERNAL[@]}" "${PORTS_MONITORING[@]}")
    echo "→ Открываю порты (включая служебные, OPEN_INTERNAL=1)..."
  else
    echo "→ Открываю только прикладные порты (${PORTS_REQUIRED[*]})..."
    echo "  Служебные (${PORTS_INTERNAL[*]}) и мониторинг (${PORTS_MONITORING[*]}) наружу НЕ открываются."
    echo "  Нужны снаружи — перезапустите с OPEN_INTERNAL=1."
  fi

  if command -v ufw >/dev/null 2>&1; then
    for p in "${PORTS_TO_OPEN[@]}"; do
      ufw allow "${p}/tcp" >/dev/null && echo "  ✓ ufw allow ${p}/tcp"
    done
    ufw status >/dev/null 2>&1 || echo "  ⚠ ufw неактивен — правила вступят в силу после 'sudo ufw enable'"
  elif command -v firewall-cmd >/dev/null 2>&1; then
    for p in "${PORTS_TO_OPEN[@]}"; do
      firewall-cmd --permanent --add-port="${p}/tcp" >/dev/null && echo "  ✓ firewalld ${p}/tcp"
    done
    firewall-cmd --reload >/dev/null
  else
    echo "⚠ Ни ufw, ни firewalld не найдены — откройте порты вручную: ${PORTS_TO_OPEN[*]}"
  fi
else
  echo "→ Firewall пропущен (OPEN_FIREWALL=0)"
fi

echo ""
echo "✓ ГОТОВО. Дальше:"
echo "  1. Скопируйте проект в $INSTALL_PATH (git clone / архив)."
echo "  2. cp migration_backup/linux/env.newserver.example $INSTALL_PATH/.env"
echo "     и заполните все плейсхолдеры <...> (GSM_HOST, SECRET_KEY из шага 01, пароли)."
echo "  3. Положите свежий дамп из шага 01 в $INSTALL_PATH/migration_backup/."
echo "  4. ПРОВЕРЬТЕ конфигурацию до запуска:"
echo "     bash migration_backup/linux/00_preflight_check.sh <путь_к_backend.env.backup>"
echo "  5. Запустите: bash migration_backup/linux/03_restore_on_new_server.sh <путь_к_дампу>"
