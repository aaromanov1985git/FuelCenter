#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  GSM Converter — ПРЕДПОЛЁТНАЯ ПРОВЕРКА НОВОГО СЕРВЕРА
# ═══════════════════════════════════════════════════════════════
#
#  Запускать на НОВОМ сервере после заполнения .env, ПЕРЕД шагом 03.
#  Ничего не меняет — только проверяет и объясняет, что не так.
#
#  Использование:
#      bash migration_backup/linux/00_preflight_check.sh
#      bash migration_backup/linux/00_preflight_check.sh <путь_к_backend.env.backup>
#
#  Второй аргумент (копия .env со старого сервера из шага 01) включает
#  сверку SECRET_KEY — самую частую и самую дорогую ошибку переноса.
#
#  Код возврата: 0 — можно запускать 03; 1 — есть ошибки.
# ───────────────────────────────────────────────────────────────
set -uo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"
OLD_ENV_BACKUP="${1:-}"

ERRORS=0
WARNINGS=0

err()  { echo "  ✗ $1"; ERRORS=$((ERRORS + 1)); }
warn() { echo "  ⚠ $1"; WARNINGS=$((WARNINGS + 1)); }
ok()   { echo "  ✓ $1"; }

# Значение переменной из .env (без раскрытия подстановок, последнее вхождение)
getenv_val() {
  [[ -f "$ENV_FILE" ]] || return 0
  grep -E "^[[:space:]]*${1}=" "$ENV_FILE" 2>/dev/null \
    | tail -n1 \
    | sed -E "s/^[[:space:]]*${1}=//" \
    | tr -d '\r' \
    | sed -E 's/[[:space:]]+$//'
}

echo "═══════════════════════════════════════════════════════════════"
echo "  GSM — ПРЕДПОЛЁТНАЯ ПРОВЕРКА"
echo "═══════════════════════════════════════════════════════════════"
echo "  Проект: $PROJECT_DIR"
echo "  .env:   $ENV_FILE"
echo ""

# ── 1. Наличие .env и незаполненных плейсхолдеров ──────────────
echo "1. Файл .env"
if [[ ! -f "$ENV_FILE" ]]; then
  err ".env не найден. Скопируйте: cp migration_backup/linux/env.newserver.example .env"
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  ✗ Проверка прервана: без .env остальное проверять нечего."
  exit 1
fi
ok ".env найден"

# CRLF в .env: Docker Compose включает CR в значение переменной, т.е.
# SECRET_KEY=... прочитается с хвостовым CR и расшифровка данных упадёт.
if grep -qU $'\r' "$ENV_FILE" 2>/dev/null; then
  err ".env в формате CRLF (Windows) — Compose включит CR в значения переменных"
  echo "      → Исправить: sed -i 's/\r$//' $ENV_FILE"
else
  ok ".env в формате LF"
fi

PLACEHOLDERS=$(grep -nE '<[А-ЯA-Z_]+>' "$ENV_FILE" | grep -vE '^\s*[0-9]+:\s*#' || true)
if [[ -n "$PLACEHOLDERS" ]]; then
  err "Остались незаполненные плейсхолдеры <...>:"
  echo "$PLACEHOLDERS" | sed 's/^/      /'
else
  ok "Плейсхолдеры <...> заполнены"
fi

# ── 2. Адрес сервера ──────────────────────────────────────────
echo ""
echo "2. Адрес сервера"
GSM_HOST_VAL="$(getenv_val GSM_HOST)"
GSM_SCHEME_VAL="$(getenv_val GSM_SCHEME)"
GSM_SCHEME_VAL="${GSM_SCHEME_VAL:-http}"

if [[ -z "$GSM_HOST_VAL" ]]; then
  warn "GSM_HOST не задан — скрипты не смогут печатать корректные URL (на работу стека не влияет)"
else
  ok "GSM_HOST=$GSM_HOST_VAL, схема $GSM_SCHEME_VAL"
  # Адрес должен быть доступен на одном из интерфейсов этого хоста
  if [[ "$GSM_HOST_VAL" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
    if command -v ip >/dev/null 2>&1 && ip -4 addr show 2>/dev/null | grep -qw "$GSM_HOST_VAL"; then
      ok "IP $GSM_HOST_VAL поднят на этом хосте"
    else
      warn "IP $GSM_HOST_VAL не найден среди адресов хоста — проверьте, что .env от этого сервера"
    fi
  fi
fi

# ── 3. SECRET_KEY ─────────────────────────────────────────────
echo ""
echo "3. SECRET_KEY и шифрование"
SECRET_VAL="$(getenv_val SECRET_KEY)"

if [[ -z "$SECRET_VAL" ]]; then
  err "SECRET_KEY не задан — backend не стартует в ENVIRONMENT=production"
elif [[ ${#SECRET_VAL} -lt 32 ]]; then
  err "SECRET_KEY короче 32 символов (${#SECRET_VAL}) — backend откажется стартовать"
elif [[ "$SECRET_VAL" == "your-secret-key-here-change-in-production" ]]; then
  err "SECRET_KEY — небезопасное значение по умолчанию"
else
  ok "SECRET_KEY задан (${#SECRET_VAL} симв.)"
fi

if [[ -n "$OLD_ENV_BACKUP" ]]; then
  if [[ -f "$OLD_ENV_BACKUP" ]]; then
    OLD_SECRET=$(grep -E '^[[:space:]]*SECRET_KEY=' "$OLD_ENV_BACKUP" 2>/dev/null \
      | tail -n1 | sed -E 's/^[[:space:]]*SECRET_KEY=//' | tr -d '\r' | sed -E 's/[[:space:]]+$//')
    if [[ -z "$OLD_SECRET" ]]; then
      warn "В $OLD_ENV_BACKUP нет SECRET_KEY — сверку пропускаю"
    elif [[ "$OLD_SECRET" == "$SECRET_VAL" ]]; then
      ok "SECRET_KEY совпадает со старым сервером — пароли провайдеров расшифруются"
    else
      err "SECRET_KEY НЕ совпадает со старым сервером!"
      echo "      → Пароли ГПН/РН-Карт/ППР/Firebird и токен Telegram не расшифруются."
      echo "      → Либо подставьте старый ключ, либо после восстановления БД выполните"
      echo "        перешифровку: docker exec -e OLD_SECRET_KEY=... -e NEW_SECRET_KEY=... \\"
      echo "                        gsm_backend python -m scripts.rotate_secret_key --apply"
    fi
  else
    warn "Файл для сверки не найден: $OLD_ENV_BACKUP"
  fi
else
  warn "Сверка SECRET_KEY со старым сервером не выполнена"
  echo "      → Передайте вторым аргументом путь к backend.env.backup из шага 01:"
  echo "        bash $0 migration_backup/linux/out/backend.env.backup"
fi

if grep -qE '^[[:space:]]*ENCRYPTION_KEY=.+' "$ENV_FILE"; then
  err "ENCRYPTION_KEY задан, хотя на старом сервере его не было"
  echo "      → Шифрование было привязано к SECRET_KEY; новый ENCRYPTION_KEY сделает"
  echo "        сохранённые пароли провайдеров нечитаемыми. Закомментируйте строку."
else
  ok "ENCRYPTION_KEY не задан (как на старом сервере)"
fi

# ── 3b. backend/.env — источник секретов для приложения ───────
echo ""
echo "3b. backend/.env (env_file сервиса backend)"
BACKEND_ENV="$PROJECT_DIR/backend/.env"

# Оба compose-файла подключают его через env_file -> без файла compose падает.
if [[ ! -f "$BACKEND_ENV" ]]; then
  err "backend/.env отсутствует — docker compose up упадёт (env_file обязателен)"
  echo "      → Файл не в репозитории (gitignored). Создайте его со значениями"
  echo "        ENABLE_AUTH/SECRET_KEY/JWT_EXPIRE_MINUTES/ADMIN_*/ENVIRONMENT/COOKIE_SECURE"
  echo "        из migration_backup/linux/out/backend.env.backup"
else
  ok "backend/.env найден"

  if grep -qU $'\r' "$BACKEND_ENV" 2>/dev/null; then
    err "backend/.env в формате CRLF — CR попадёт в значения переменных"
  fi

  benv_val() {
    grep -E "^[[:space:]]*${1}=" "$BACKEND_ENV" 2>/dev/null \
      | tail -n1 | sed -E "s/^[[:space:]]*${1}=//" | tr -d '\r' | sed -E 's/[[:space:]]+$//'
  }

  # Именно это значение получает приложение — его и сверяем со старым сервером
  B_SECRET="$(benv_val SECRET_KEY)"
  if [[ -z "$B_SECRET" ]]; then
    err "в backend/.env нет SECRET_KEY — приложение не расшифрует пароли провайдеров"
  else
    ok "SECRET_KEY задан в backend/.env (${#B_SECRET} симв.)"
    if [[ -n "${OLD_SECRET:-}" ]]; then
      if [[ "$OLD_SECRET" == "$B_SECRET" ]]; then
        ok "SECRET_KEY в backend/.env совпадает со старым сервером"
      else
        err "SECRET_KEY в backend/.env НЕ совпадает со старым сервером!"
        echo "      → Это значение и попадёт в приложение (env_file), а не то, что в корневом .env."
      fi
    fi
    # Расхождение между файлами — источник трудноуловимых ошибок
    if [[ -n "$SECRET_VAL" && "$SECRET_VAL" != "$B_SECRET" ]]; then
      err "SECRET_KEY в .env и backend/.env РАЗНЫЕ — приложение возьмёт значение из backend/.env"
    fi
  fi

  if grep -qE "^[[:space:]]*ENCRYPTION_KEY=.+" "$BACKEND_ENV"; then
    err "ENCRYPTION_KEY задан в backend/.env — сохранённые пароли станут нечитаемыми"
  fi

  # COOKIE_SECURE приложение тоже берёт отсюда
  B_COOKIE="$(benv_val COOKIE_SECURE | tr '[:upper:]' '[:lower:]')"
  if [[ "$GSM_SCHEME_VAL" == "http" && "$B_COOKIE" == "true" ]]; then
    err "COOKIE_SECURE=true в backend/.env при доступе по HTTP — вход не сработает"
  elif [[ -n "$B_COOKIE" ]]; then
    ok "COOKIE_SECURE=$B_COOKIE в backend/.env"
  fi
fi

# ── 4. COOKIE_SECURE vs схема доступа ─────────────────────────
echo ""
echo "4. Cookie и схема доступа"
COOKIE_VAL="$(getenv_val COOKIE_SECURE | tr '[:upper:]' '[:lower:]')"
if [[ "$GSM_SCHEME_VAL" == "http" && "$COOKIE_VAL" == "true" ]]; then
  err "COOKIE_SECURE=true при доступе по HTTP — браузер не отправит auth-cookie, вход не сработает"
  echo "      → Поставьте COOKIE_SECURE=false (или настройте HTTPS и GSM_SCHEME=https)"
elif [[ "$GSM_SCHEME_VAL" == "https" && "$COOKIE_VAL" != "true" ]]; then
  warn "GSM_SCHEME=https, но COOKIE_SECURE=$COOKIE_VAL — при работающем HTTPS лучше true"
elif [[ -z "$COOKIE_VAL" ]]; then
  warn "COOKIE_SECURE не задан — для HTTP-доступа задайте явно false"
else
  ok "COOKIE_SECURE=$COOKIE_VAL соответствует схеме $GSM_SCHEME_VAL"
fi

# ── 5. CORS ───────────────────────────────────────────────────
echo ""
echo "5. CORS (ALLOWED_ORIGINS)"
ORIGINS_VAL="$(getenv_val ALLOWED_ORIGINS)"
if [[ -z "$ORIGINS_VAL" ]]; then
  warn "ALLOWED_ORIGINS не задан — будет дефолт только с localhost"
elif [[ -n "$GSM_HOST_VAL" ]] && [[ "$ORIGINS_VAL" != *"$GSM_HOST_VAL"* ]]; then
  err "ALLOWED_ORIGINS не содержит $GSM_HOST_VAL — фронт получит ошибки CORS"
  echo "      → Подстановки вида \${GSM_HOST} в .env НЕ раскрываются, впишите адрес строкой."
else
  ok "ALLOWED_ORIGINS содержит адрес сервера"
fi
if [[ "$ORIGINS_VAL" == *'$'* ]]; then
  err "В ALLOWED_ORIGINS есть символ '\$' — Docker Compose не раскрывает переменные внутри .env"
fi

# ── 6. База данных ────────────────────────────────────────────
echo ""
echo "6. База данных"
PG_USER_VAL="$(getenv_val POSTGRES_USER)"
PG_PASS_VAL="$(getenv_val POSTGRES_PASSWORD)"
PG_DB_VAL="$(getenv_val POSTGRES_DB)"
DB_URL_VAL="$(getenv_val DATABASE_URL)"

if [[ -z "$DB_URL_VAL" ]]; then
  warn "DATABASE_URL не задан — сработает дефолт compose"
else
  MISMATCH=0
  [[ -n "$PG_USER_VAL" && "$DB_URL_VAL" != *"//$PG_USER_VAL:"* ]] && MISMATCH=1
  [[ -n "$PG_PASS_VAL" && "$DB_URL_VAL" != *":$PG_PASS_VAL@"* ]] && MISMATCH=1
  [[ -n "$PG_DB_VAL" && "$DB_URL_VAL" != *"/$PG_DB_VAL" ]] && MISMATCH=1
  if [[ $MISMATCH -eq 1 ]]; then
    err "DATABASE_URL не согласован с POSTGRES_USER/PASSWORD/DB — backend не подключится к БД"
    echo "      → Ожидается: postgresql://${PG_USER_VAL}:${PG_PASS_VAL}@db:5432/${PG_DB_VAL}"
  else
    ok "DATABASE_URL согласован с POSTGRES_*"
  fi
  if [[ "$DB_URL_VAL" == *"@localhost"* || "$DB_URL_VAL" == *"@127.0.0.1"* ]]; then
    err "DATABASE_URL указывает на localhost — внутри контейнера хост БД должен быть 'db'"
  fi
fi

# ── 7. Docker и сеть ──────────────────────────────────────────
echo ""
echo "7. Docker"
if ! command -v docker >/dev/null 2>&1; then
  err "Docker не установлен"
elif ! docker info >/dev/null 2>&1; then
  err "Docker daemon недоступен (не запущен или пользователь не в группе docker)"
else
  ok "Docker: $(docker --version | sed 's/,.*//')"
  if docker compose version >/dev/null 2>&1; then
    ok "compose v2: $(docker compose version --short 2>/dev/null || echo 'есть')"
  else
    err "Плагин 'docker compose' (v2) не найден — установите docker-compose-plugin"
  fi
  if docker network inspect gsm_network >/dev/null 2>&1; then
    ok "Внешняя сеть gsm_network существует"
  else
    err "Сети gsm_network нет — compose up упадёт. Запустите 02_setup_new_server.sh"
  fi
fi

# ── 8. Занятость портов ───────────────────────────────────────
echo ""
echo "8. Порты"
port_busy() {
  if command -v ss >/dev/null 2>&1; then
    ss -lntH 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${1}$"
  elif command -v netstat >/dev/null 2>&1; then
    netstat -lnt 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${1}$"
  else
    return 2
  fi
}

check_port() {
  local port="$1" label="$2"
  port_busy "$port"
  case $? in
    0)
      # Порт, уже занятый нашим же контейнером, — это не конфликт
      if docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep -qE "^gsm_.*:${port}->"; then
        ok "$port ($label) — занят контейнером GSM (перезапуск существующего стека)"
      else
        err "$port ($label) уже занят сторонним процессом — compose up упадёт"
        echo "      → Найти: sudo ss -lntp | grep :$port"
      fi
      ;;
    1) ok "$port ($label) свободен" ;;
    *) warn "$port ($label) — нет ss/netstat, проверить не удалось" ;;
  esac
}

BACKEND_PORT_VAL="$(getenv_val BACKEND_PORT)";   BACKEND_PORT_VAL="${BACKEND_PORT_VAL:-8000}"
FRONTEND_PORT_VAL="$(getenv_val FRONTEND_PORT)"; FRONTEND_PORT_VAL="${FRONTEND_PORT_VAL:-3002}"
POSTGRES_PORT_VAL="$(getenv_val POSTGRES_PORT)"; POSTGRES_PORT_VAL="${POSTGRES_PORT_VAL:-5432}"
REDIS_PORT_VAL="$(getenv_val REDIS_PORT)";       REDIS_PORT_VAL="${REDIS_PORT_VAL:-6379}"

check_port "$BACKEND_PORT_VAL"  "backend"
check_port "$FRONTEND_PORT_VAL" "frontend"
check_port "$POSTGRES_PORT_VAL" "postgres"
check_port "$REDIS_PORT_VAL"    "redis"

# ── 9. Место на диске ─────────────────────────────────────────
echo ""
echo "9. Ресурсы"
AVAIL_MB=$(df -Pm "$PROJECT_DIR" 2>/dev/null | awk 'NR==2 {print $4}')
if [[ -n "${AVAIL_MB:-}" ]]; then
  if [[ "$AVAIL_MB" -lt 5120 ]]; then
    err "Свободно ${AVAIL_MB} МБ — мало. Образы (Firebird + Playwright/Chromium) и БД требуют ~5 ГБ+"
  elif [[ "$AVAIL_MB" -lt 10240 ]]; then
    warn "Свободно ${AVAIL_MB} МБ — с запасом на образы и бэкапы лучше иметь 10 ГБ+"
  else
    ok "Свободно ${AVAIL_MB} МБ"
  fi
else
  warn "Не удалось определить свободное место"
fi

# ── Итог ──────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
if [[ $ERRORS -eq 0 ]]; then
  echo "  ✓ ОШИБОК НЕТ (предупреждений: $WARNINGS)"
  echo ""
  echo "  Можно запускать:"
  echo "    bash migration_backup/linux/03_restore_on_new_server.sh <дамп>"
  exit 0
else
  echo "  ✗ ОШИБОК: $ERRORS (предупреждений: $WARNINGS)"
  echo ""
  echo "  Исправьте ошибки выше и повторите. Запуск 03 с этими ошибками"
  echo "  приведёт к нерабочему или частично повреждённому развёртыванию."
  exit 1
fi
