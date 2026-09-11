#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  GSM Converter — самоподписанный сертификат (ВРЕМЕННЫЙ)
# ═══════════════════════════════════════════════════════════════
#
#  Нужен, чтобы поднять и проверить HTTPS до того, как появится
#  доверенный сертификат. Браузер будет показывать предупреждение —
#  это ожидаемо и означает ровно одно: сертификат ещё не заменён.
#
#  Использование:
#      bash make_selfsigned_cert.sh gsm.example.com [доп.имя ...] [IP]
#
#  Все переданные имена и IP попадают в SAN, поэтому один сертификат
#  обслуживает и DNS-имя, и доступ по адресу.
#
#  Результат: <project>/certs/{fullchain.pem,privkey.pem}
#
#  ЗАМЕНА НА ДОВЕРЕННЫЙ: положить настоящие файлы под теми же именами и
#      docker compose ... exec frontend nginx -s reload
#  Конфиг nginx при этом не меняется.
# ───────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
CERT_DIR="${CERT_DIR:-$PROJECT_DIR/certs}"
DAYS="${DAYS:-825}"

if [[ $# -lt 1 ]]; then
  echo "Использование: bash $0 <основное-имя> [доп.имя|IP ...]"
  echo "Пример:        bash $0 gsm.example.com 10.0.0.10"
  exit 1
fi

PRIMARY="$1"; shift

# Собираем SAN: имена как DNS, адреса как IP
SAN="DNS:${PRIMARY}"
for extra in "$@"; do
  if [[ "$extra" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
    SAN="${SAN},IP:${extra}"
  else
    SAN="${SAN},DNS:${extra}"
  fi
done

mkdir -p "$CERT_DIR"

if [[ -f "$CERT_DIR/fullchain.pem" ]]; then
  echo "⚠ $CERT_DIR/fullchain.pem уже существует."
  # Доверенный сертификат перезаписывать самоподписанным — почти наверняка ошибка
  ISSUER=$(openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -issuer 2>/dev/null || echo "")
  SUBJECT=$(openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -subject 2>/dev/null || echo "")
  echo "  $ISSUER"
  echo "  $SUBJECT"
  if [[ "$ISSUER" != "$SUBJECT" ]]; then
    echo "❌ Похоже, это выпущенный центром сертификат (issuer ≠ subject)."
    echo "   Перезапись самоподписанным отменена. Удалите файл вручную, если уверены."
    exit 1
  fi
  echo "  (самоподписанный — перевыпускаю)"
fi

echo "→ Выпускаю самоподписанный сертификат"
echo "  CN:  $PRIMARY"
echo "  SAN: $SAN"
echo "  срок: $DAYS дней"

# Subject и расширения задаём конфигом, а не флагами -subj/-addext:
# под Git Bash (MSYS) строка "/CN=имя" переписывается в путь вида
# "C:/Program Files/Git/CN=имя", и openssl отвергает subject. Конфиг переносим.
CONF="$(mktemp)"
trap 'rm -f "$CONF"' EXIT
cat > "$CONF" <<EOF
[req]
distinguished_name = dn
x509_extensions    = v3
prompt             = no

[dn]
CN = ${PRIMARY}

[v3]
subjectAltName   = ${SAN}
basicConstraints = CA:FALSE
keyUsage         = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
EOF

if ! openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$CERT_DIR/privkey.pem" \
  -out "$CERT_DIR/fullchain.pem" \
  -days "$DAYS" \
  -config "$CONF" 2>"$CONF.err"; then
  echo "❌ openssl не смог выпустить сертификат:"
  sed 's/^/   /' "$CONF.err"
  rm -f "$CONF.err"
  exit 1
fi
rm -f "$CONF.err"

chmod 644 "$CERT_DIR/fullchain.pem"
chmod 600 "$CERT_DIR/privkey.pem"

echo ""
echo "✓ Готово:"
ls -l "$CERT_DIR"
echo ""
openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -subject -issuer -dates -ext subjectAltName \
  | sed 's/^/  /'
echo ""
echo "⚠ Сертификат САМОПОДПИСАННЫЙ — браузеры будут предупреждать."
echo "  Заменить на доверенный: положить настоящие fullchain.pem и privkey.pem"
echo "  в $CERT_DIR и выполнить: docker compose exec frontend nginx -s reload"
