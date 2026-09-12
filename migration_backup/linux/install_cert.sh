#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  GSM Converter — установка доверенного TLS-сертификата
# ═══════════════════════════════════════════════════════════════
#
#  Проверяет сертификат ДО установки и откатывается, если nginx его не принял.
#  Конфиг nginx не меняется — только содержимое ./certs.
#
#  Использование:
#      bash install_cert.sh <fullchain.pem> <privkey.pem>
#      bash install_cert.sh <сертификат.pfx>            # пароль спросит openssl
#      PFX_PASS='...' bash install_cert.sh <сертификат.pfx>
#
#  Переменные:
#      PROJECT_DIR   корень проекта (по умолчанию текущий каталог)
#      EXPECT_NAME   имя, которое обязано быть в SAN (например gsm.example.com)
#      COMPOSE_FILES файлы compose для перезагрузки nginx
#                    (по умолчанию docker-compose.prod.yml:docker-compose.https.yml)
# ───────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
CERT_DIR="${CERT_DIR:-$PROJECT_DIR/certs}"
EXPECT_NAME="${EXPECT_NAME:-}"
COMPOSE_FILES="${COMPOSE_FILES:-docker-compose.prod.yml:docker-compose.https.yml}"
TS="$(date +%Y%m%d_%H%M%S)"

if [[ $# -lt 1 ]]; then
  sed -n '2,22p' "$0"
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ── 1. Приводим вход к паре PEM ───────────────────────────────
if [[ $# -eq 1 ]]; then
  SRC="$1"
  [[ -f "$SRC" ]] || { echo "❌ файл не найден: $SRC"; exit 1; }
  echo "→ Разбираю PKCS#12 ($SRC)..."
  PASS_ARG=(-passin "pass:${PFX_PASS:-}")
  [[ -z "${PFX_PASS:-}" ]] && PASS_ARG=()
  openssl pkcs12 -in "$SRC" -clcerts -nokeys -out "$WORK/fullchain.pem" "${PASS_ARG[@]}" 2>/dev/null \
    || { echo "❌ не удалось извлечь сертификат (неверный пароль? укажите PFX_PASS)"; exit 1; }
  # Промежуточные центры дописываем следом — браузеру нужна полная цепочка
  openssl pkcs12 -in "$SRC" -cacerts -nokeys -chain -out "$WORK/chain.pem" "${PASS_ARG[@]}" 2>/dev/null || true
  if [[ -s "$WORK/chain.pem" ]]; then
    grep -q 'BEGIN CERTIFICATE' "$WORK/chain.pem" && cat "$WORK/chain.pem" >> "$WORK/fullchain.pem"
  fi
  openssl pkcs12 -in "$SRC" -nocerts -nodes -out "$WORK/privkey.pem" "${PASS_ARG[@]}" 2>/dev/null \
    || { echo "❌ не удалось извлечь закрытый ключ"; exit 1; }
else
  [[ -f "$1" && -f "$2" ]] || { echo "❌ укажите существующие файлы сертификата и ключа"; exit 1; }
  cp "$1" "$WORK/fullchain.pem"
  cp "$2" "$WORK/privkey.pem"
fi

# Ключ мог приехать зашифрованным — nginx такой без пароля не прочитает
if grep -q 'ENCRYPTED' "$WORK/privkey.pem"; then
  echo "❌ Закрытый ключ зашифрован. Снимите пароль:"
  echo "   openssl rsa -in privkey.pem -out privkey-plain.pem"
  exit 1
fi

# Совпадение имени с SAN по правилам RFC 6125, с учётом wildcard.
# "*.example.com" покрывает ровно одну метку слева: gsm.example.com — да,
# a.b.example.com — нет, сам example.com — нет.
san_matches_name() {
  local san="$1" name="$2" entry base
  # Разбираем "DNS:a, DNS:*.b, IP Address:1.2.3.4" в отдельные записи
  while IFS= read -r entry; do
    entry="$(echo "$entry" | sed -E 's/^[[:space:]]*(DNS|IP Address):[[:space:]]*//; s/[[:space:]]+$//')"
    [[ -z "$entry" ]] && continue
    if [[ "$entry" == "$name" ]]; then
      return 0
    fi
    if [[ "$entry" == \*.* ]]; then
      base="${entry#\*.}"
      # имя должно оканчиваться на ".base" и не содержать точек в первой метке
      if [[ "$name" == *."$base" ]]; then
        local left="${name%.$base}"
        [[ "$left" == *.* ]] || return 0
      fi
    fi
  done < <(echo "$san" | tr ',' '\n')
  return 1
}

# ── 2. Проверки ДО установки ──────────────────────────────────
echo "→ Проверяю сертификат..."
FAIL=0

C_MOD=$(openssl x509 -noout -modulus -in "$WORK/fullchain.pem" 2>/dev/null | openssl md5)
K_MOD=$(openssl rsa  -noout -modulus -in "$WORK/privkey.pem"  2>/dev/null | openssl md5 \
        || openssl pkey -noout -in "$WORK/privkey.pem" 2>/dev/null | openssl md5)
if [[ -n "$C_MOD" && "$C_MOD" == "$K_MOD" ]]; then
  echo "  ✓ ключ соответствует сертификату"
else
  echo "  ✗ ключ НЕ соответствует сертификату — nginx не запустится"
  FAIL=1
fi

if openssl x509 -checkend 0 -noout -in "$WORK/fullchain.pem" >/dev/null 2>&1; then
  echo "  ✓ действителен до $(openssl x509 -noout -enddate -in "$WORK/fullchain.pem" | cut -d= -f2)"
else
  echo "  ✗ сертификат просрочен"
  FAIL=1
fi

ISS=$(openssl x509 -noout -issuer  -in "$WORK/fullchain.pem" | sed 's/^issuer=//')
SUB=$(openssl x509 -noout -subject -in "$WORK/fullchain.pem" | sed 's/^subject=//')
echo "  subject: $SUB"
echo "  issuer:  $ISS"
if [[ "$ISS" == "$SUB" ]]; then
  echo "  ⚠ сертификат самоподписанный — браузеры будут предупреждать"
fi

SAN=$(openssl x509 -noout -ext subjectAltName -in "$WORK/fullchain.pem" 2>/dev/null | tail -n +2 | xargs)
echo "  SAN:     ${SAN:-(отсутствует)}"
if [[ -z "$SAN" ]]; then
  echo "  ✗ в сертификате нет SAN — современные браузеры такой отвергнут"
  FAIL=1
fi
if [[ -n "$EXPECT_NAME" ]]; then
  if san_matches_name "$SAN" "$EXPECT_NAME"; then
    echo "  ✓ имя $EXPECT_NAME покрывается SAN"
  else
    echo "  ✗ имя $EXPECT_NAME не покрывается SAN"
    FAIL=1
  fi
fi

# Цепочка: без промежуточных сертификатов часть клиентов не построит доверие
N_CERTS=$(grep -c 'BEGIN CERTIFICATE' "$WORK/fullchain.pem" || true)
echo "  сертификатов в цепочке: $N_CERTS"
if [[ "$N_CERTS" -lt 2 && "$ISS" != "$SUB" ]]; then
  echo "  ⚠ только конечный сертификат, без промежуточных — часть клиентов не построит цепочку."
  echo "    Дополните fullchain.pem сертификатами промежуточных центров."
fi

[[ "$FAIL" == "1" ]] && { echo ""; echo "❌ Проверки не пройдены, ничего не установлено."; exit 1; }

# ── 3. Установка с резервной копией ───────────────────────────
mkdir -p "$CERT_DIR"
BACKUP=""
if [[ -f "$CERT_DIR/fullchain.pem" ]]; then
  BACKUP="$CERT_DIR/backup_$TS"
  mkdir -p "$BACKUP"
  cp "$CERT_DIR/fullchain.pem" "$CERT_DIR/privkey.pem" "$BACKUP/" 2>/dev/null || true
  echo "→ Прежний сертификат сохранён в $BACKUP"
fi

install -m 644 "$WORK/fullchain.pem" "$CERT_DIR/fullchain.pem"
install -m 600 "$WORK/privkey.pem"   "$CERT_DIR/privkey.pem"
echo "✓ Установлено в $CERT_DIR"

# ── 4. Проверка и перезагрузка nginx, откат при ошибке ────────
cd "$PROJECT_DIR"
export COMPOSE_FILE="$COMPOSE_FILES"

echo "→ Проверяю конфигурацию nginx..."
if docker compose exec -T frontend nginx -t >/dev/null 2>&1; then
  echo "  ✓ конфигурация принята"
  docker compose exec -T frontend nginx -s reload
  echo "✓ nginx перезагружен"
else
  echo "  ✗ nginx отверг конфигурацию:"
  docker compose exec -T frontend nginx -t 2>&1 | sed 's/^/     /' || true
  if [[ -n "$BACKUP" ]]; then
    cp "$BACKUP/fullchain.pem" "$CERT_DIR/fullchain.pem"
    cp "$BACKUP/privkey.pem"   "$CERT_DIR/privkey.pem"
    docker compose exec -T frontend nginx -s reload >/dev/null 2>&1 || true
    echo "  ↩ откат к прежнему сертификату выполнен"
  fi
  exit 1
fi

echo ""
echo "Проверка снаружи (подставьте имя):"
echo "  curl -v https://<имя>/ 2>&1 | grep -E 'subject:|issuer:|SSL certificate verify'"
echo ""
echo "Не забудьте в .env И в backend/.env: GSM_SCHEME=https, COOKIE_SECURE=true,"
echo "ALLOWED_ORIGINS с https://<имя> — затем перезапустить backend."
