#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Generate secure secrets for BOS Playbook.
#
# Produces a .env file with a strong JWT secret, a strong Postgres password
# and matching anon / service role keys. No real secret is ever committed to
# the repository - .env is gitignored and .env.example holds placeholders.
#
#   ./scripts/generate-secrets.sh            # write .env
#   ./scripts/generate-secrets.sh --stdout   # print to stdout, write nothing
#   ./scripts/generate-secrets.sh --domain playbook.example.com
#   ./scripts/generate-secrets.sh --refresh-keys
#
# --refresh-keys re-signs the anon and service role keys in an existing .env
# with the JWT_SECRET that is already in it. It is the repair for the case
# where the secret and the keys have drifted apart - which happens when
# the .env is edited by hand - and it changes no other value.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."

OUT_TO_STDOUT=false
REFRESH_KEYS=false
DOMAIN="playbook.example.com"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stdout)  OUT_TO_STDOUT=true ;;
    --refresh-keys) REFRESH_KEYS=true ;;
    --domain)  shift; DOMAIN="$1" ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

if [[ "$REFRESH_KEYS" != "true" ]] && [[ -f .env ]] && [[ "$OUT_TO_STDOUT" != "true" ]]; then
  echo "ERROR: .env already exists. Move it aside first:" >&2
  echo "       mv .env .env.bak" >&2
  exit 1
fi

# --- Secret generation ------------------------------------------------------
# Prefer openssl; fall back to /dev/urandom so the script works on a slim
# container image without extra packages.
random_hex() {
  local bytes="$1"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
  else
    head -c "$bytes" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

random_password() {
  local length="${1:-32}"
  # The alphabet is deliberately narrow. The password is put into the
  # connection strings of the other services - postgres://user:PASSWORD@host
  # - and a character that is special in a URL (@ : / ? # [ ] % & = +)
  # would have to be escaped there. Rather than escape it in every place,
  # the password is built from characters that need no escaping.
  local alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~'
  local out=''
  local i idx
  for ((i = 0; i < length; i++)); do
    # The 0x prefix matters: without it bash reads a hex string that
    # starts with a letter as the name of a variable, and the script
    # stops with "unbound variable".
    idx=$(( 0x$(random_hex 2) % ${#alphabet} ))
    out+="${alphabet:$idx:1}"
  done
  printf '%s' "$out"
}

# A JWT signed with HS256. The payload matches what the Supabase components
# expect: role, iss, iat, exp.
make_jwt() {
  local role="$1"
  local secret="$2"
  local header payload

  header=$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | base64 -w0 | tr '+/' '-_' | tr -d '=')
  payload=$(printf '{"role":"%s","iss":"bosp","iat":1700000000,"exp":4102444800}' "$role" \
    | base64 -w0 | tr '+/' '-_' | tr -d '=')

  local signature
  # The message is the two parts joined by a dot. It is passed as a single
  # argument to a format with one placeholder: "printf '%s.%s' one-arg"
  # would put an extra dot at the end of the message, and the signature
  # would then be over a string that no verifier ever signs.
  signature=$(printf '%s' "$header.$payload" \
    | openssl dgst -sha256 -hmac "$secret" -binary 2>/dev/null \
    | base64 -w0 | tr '+/' '-_' | tr -d '=')

  printf '%s.%s.%s' "$header" "$payload" "$signature"
}

if ! command -v openssl >/dev/null 2>&1; then
  echo "ERROR: openssl is required to sign the JWT keys." >&2
  echo "       Install it (apt-get install openssl) and run this again." >&2
  exit 1
fi

# --- Repair: re-sign the keys in an existing .env ---------------------------
# This block is after the functions above, because it uses make_jwt.
if [[ "$REFRESH_KEYS" == "true" ]]; then
  if [[ ! -f .env ]]; then
    echo "ERROR: .env does not exist. Nothing to refresh." >&2
    exit 1
  fi
  # The secret is read back from the file, so the keys are signed with the
  # secret that is actually in use rather than with a new one.
  JWT_SECRET=$(grep -m1 '^JWT_SECRET=' .env | cut -d= -f2-)
  if [[ -z "$JWT_SECRET" ]]; then
    echo "ERROR: .env has no JWT_SECRET line." >&2
    exit 1
  fi
  ANON_KEY=$(make_jwt anon "$JWT_SECRET")
  SERVICE_ROLE_KEY=$(make_jwt service "$JWT_SECRET")
  # The keys are base64url and dots; neither is special to sed.
  sed -i "s|^ANON_KEY=.*|ANON_KEY=${ANON_KEY}|" .env
  sed -i "s|^SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}|" .env
  echo "Re-signed the anon and service role keys in .env with the JWT_SECRET it already holds."
  echo "No other value was changed. Restart the services that hold the anon key:"
  echo "  make up"
  exit 0
fi

JWT_SECRET=$(random_hex 48)
POSTGRES_PASSWORD=$(random_password 32)
SECRET_KEY_BASE=$(random_hex 48)
REALTIME_DB_ENC_KEY=$(random_hex 8)
PG_META_CRYPTO_KEY=$(random_hex 16)
DEMO_USER_PASSWORD=$(random_password 20)
ANON_KEY=$(make_jwt anon "$JWT_SECRET")
SERVICE_ROLE_KEY=$(make_jwt service "$JWT_SECRET")

# --- Render the .env --------------------------------------------------------
render_env() {
  cat <<EOF
# ---------------------------------------------------------------------------
# BOS Playbook - generated secrets
# Generated: $(date -u '+%Y-%m-%d %H:%M:%S UTC')
#
# THIS FILE CONTAINS SECRETS. Do not commit it, do not email it, and do not
# copy it to a shared drive. Back it up somewhere encrypted and offline.
#
# The addresses below use ${DOMAIN}. Change the DOMAIN line and the four
# url lines if the server is reached under a different name.
# ---------------------------------------------------------------------------

# --- The name people type in the address bar ---
DOMAIN=${DOMAIN}

# --- The public addresses ---
SUPABASE_PUBLIC_URL=https://${DOMAIN}
API_EXTERNAL_URL=https://${DOMAIN}/auth/v1
SITE_URL=https://${DOMAIN}
ADDITIONAL_REDIRECT_URLS=https://${DOMAIN}/**

# --- Secrets ---
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
JWT_SECRET=${JWT_SECRET}
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
SECRET_KEY_BASE=${SECRET_KEY_BASE}
REALTIME_DB_ENC_KEY=${REALTIME_DB_ENC_KEY}
PG_META_CRYPTO_KEY=${PG_META_CRYPTO_KEY}

# --- The database ---
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_DB=postgres
POSTGRES_USER=supabase_admin

# --- The API ---
JWT_EXPIRY=3600
PGRST_DB_SCHEMAS=public
PGRST_DB_MAX_ROWS=1000
PGRST_DB_EXTRA_SEARCH_PATH=public

# --- Accounts ---
# There is no public sign up. Administrators create the accounts.
DISABLE_SIGNUP=true
ENABLE_EMAIL_SIGNUP=false
ENABLE_EMAIL_AUTOCONFIRM=true
MAILER_URLPATHS_INVITE=/auth/v1/verify
MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify
MAILER_URLPATHS_RECOVERY=/auth/v1/verify
MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_ADMIN_EMAIL=admin@example.com
SMTP_SENDER_NAME="BOS Playbook"

# --- Storage ---
GLOBAL_S3_BUCKET=stub
REGION=stub
STORAGE_TENANT_ID=stub
S3_PROTOCOL_ACCESS_KEY_ID=stub
S3_PROTOCOL_ACCESS_KEY_SECRET=stub
UPLOAD_MAX_SIZE=10485760
ALLOWED_UPLOAD_TYPES=image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain
IMGPROXY_AUTO_WEBP=true

# --- Studio: bound to the loopback address, reached through a tunnel ---
STUDIO_BIND=127.0.0.1
STUDIO_DEFAULT_ORGANIZATION="BOS Playbook"
STUDIO_DEFAULT_PROJECT="BOS Playbook"

# --- The application ---
NEXT_PUBLIC_SUPABASE_URL=https://${DOMAIN}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
NEXT_PUBLIC_APP_NAME="BOS Playbook"
NEXT_PUBLIC_APP_LOGO=/logo.png
NEXT_PUBLIC_ACCENT_COLOR=#2563eb
APP_ENV=production
NODE_ENV=production

# --- The reverse proxy ---
HTTPS_CERT=./docker/nginx/certs/fullchain.pem
HTTPS_KEY=./docker/nginx/certs/privkey.pem
CA_CERT=
CA_KEY=

# --- The gateway ---
KONG_LOG_LEVEL=notice

# --- Backups ---
BACKUP_DIR=./backups
BACKUP_RETENTION_DAILY=7
BACKUP_RETENTION_WEEKLY=4

# --- The demo content ---
DEMO_USER_PASSWORD=${DEMO_USER_PASSWORD}
EOF
}

if [[ "$OUT_TO_STDOUT" == "true" ]]; then
  render_env
else
  render_env > .env
  chmod 600 .env
  echo "Wrote .env with fresh secrets (mode 600)."
  echo
  echo "Next steps:"
  echo "  1. Check the DOMAIN line in .env is the name your users will type."
  echo "  2. Run: ./scripts/make-certificates.sh"
  echo "  3. Run: make up"
  echo "  4. Run: make migrate"
fi
