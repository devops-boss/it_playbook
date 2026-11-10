#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Write the TLS certificate the reverse proxy serves.
#
# Two cases:
#
#   1. The company has an internal certificate authority. Put the
#      certificate and the key of the authority in .env as CA_CERT and
#      CA_KEY, and the script issues a certificate for the domain from it.
#      This is the case to aim for: the certificate is trusted by every
#      machine in the company, so nobody is asked to click through a
#      warning.
#
#   2. There is no internal authority, or none is available yet. The
#      script writes a self signed certificate. It works, but every
#      browser will show a warning until the certificate is trusted, so
#      the certificate can be installed on the machines by the group that
#      looks after them.
#
#   ./scripts/make-certificates.sh
#   ./scripts/make-certificates.sh --domain playbook.example.com
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."

CERT_DIR="docker/nginx/certs"
DOMAIN=""
DAYS=825
FORCE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) shift; DOMAIN="$1" ;;
    --days)   shift; DAYS="$1" ;;
    --force)  FORCE=true ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

# Read the three settings this script needs from .env, without sourcing the
# whole file. Sourcing it would overwrite a value that was passed in the
# environment, which is the natural way to point the script at a certificate
# authority that is not kept in the .env.
read_env() {
  local key="$1"
  [[ -f .env ]] || return 0
  grep -m1 "^${key}=" .env 2>/dev/null | cut -d= -f2- | sed 's/^"//; s/"$//'
}

if [[ -z "$DOMAIN" ]]; then
  DOMAIN=$(read_env DOMAIN)
fi
if [[ -z "$DOMAIN" ]]; then
  DOMAIN="playbook.local"
fi
if [[ -z "${CA_CERT:-}" ]]; then
  CA_CERT=$(read_env CA_CERT)
fi
if [[ -z "${CA_KEY:-}" ]]; then
  CA_KEY=$(read_env CA_KEY)
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "ERROR: openssl is required." >&2
  echo "       Install it (apt-get install openssl) and run this again." >&2
  exit 1
fi

mkdir -p "$CERT_DIR"

# Docker creates the mounted directory as root if it is not there when the
# stack first starts, and then this script cannot write into it. That is
# worth saying plainly rather than failing with "permission denied".
if [[ ! -w "$CERT_DIR" ]]; then
  echo "ERROR: $CERT_DIR is not writable by the current user." >&2
  echo "       It was probably created by Docker as root." >&2
  echo "       Fix it with: sudo chown -R \$(id -u):\$(id -g) $CERT_DIR" >&2
  exit 1
fi

if [[ -f "$CERT_DIR/fullchain.pem" && "$FORCE" != "true" ]]; then
  echo "A certificate is already there: $CERT_DIR/fullchain.pem"
  echo "Run again with --force to replace it."
  exit 0
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# --- The extensions of the certificate --------------------------------------
#
# The subject alternative name is what modern browsers look at. A
# certificate without one is rejected outright, so the domain, localhost
# and the loopback address are all listed.
# If DOMAIN is an IP address, add it as an IP SAN as well as a DNS SAN
IP_EXTRA=""
if [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  IP_EXTRA="IP.2  = ${DOMAIN}"
fi

cat > "$TMP_DIR/openssl.cnf" <<EOF
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
req_extensions     = v3_req

[dn]
C  = XX
O  = BOS Playbook
CN = ${DOMAIN}

[v3_req]
basicConstraints       = CA:FALSE
keyUsage               = digitalSignature, keyEncipherment
extendedKeyUsage       = serverAuth
subjectAltName         = @alt_names

[alt_names]
DNS.1 = ${DOMAIN}
DNS.2 = localhost
DNS.3 = playbook.test.local
IP.1  = 127.0.0.1
IP.2  = 100.122.173.113
IP.3  = 192.168.3.60
${IP_EXTRA}
EOF

# --- The key ----------------------------------------------------------------
echo "-- writing the private key"
openssl genrsa -out "$TMP_DIR/privkey.pem" 4096 2>/dev/null
chmod 600 "$TMP_DIR/privkey.pem"

# --- The certificate --------------------------------------------------------
if [[ -n "${CA_CERT:-}" && -n "${CA_KEY:-}" ]]; then
  # ---- Signed by the internal certificate authority -------------------------
  if [[ ! -f "$CA_CERT" || ! -f "$CA_KEY" ]]; then
    echo "ERROR: CA_CERT or CA_KEY points at a file that does not exist." >&2
    exit 1
  fi

  echo "-- issuing a certificate for ${DOMAIN} from the internal authority"

  # The request, with the alternative names.
  openssl req -new -key "$TMP_DIR/privkey.pem" \
    -out "$TMP_DIR/request.csr" \
    -config "$TMP_DIR/openssl.cnf" 2>/dev/null

  # Sign it. The serial number is random, and the authority is given the
  # extensions that say what the certificate may be used for.
  SERIAL=$(openssl rand -hex 16)
  openssl x509 -req \
    -in "$TMP_DIR/request.csr" \
    -CA "$CA_CERT" \
    -CAkey "$CA_KEY" \
    -CAcreateserial \
    -CAserial "$TMP_DIR/ca.srl" \
    -out "$TMP_DIR/certificate.pem" \
    -days "$DAYS" \
    -sha256 \
    -extfile "$TMP_DIR/openssl.cnf" \
    -extensions v3_req 2>/dev/null

  # The chain: the leaf certificate followed by the authority, so that a
  # client can build the path to the root.
  cat "$TMP_DIR/certificate.pem" "$CA_CERT" > "$TMP_DIR/fullchain.pem"

  cp "$TMP_DIR/fullchain.pem" "$CERT_DIR/fullchain.pem"
  cp "$TMP_DIR/privkey.pem"   "$CERT_DIR/privkey.pem"

  # The application container talks to the API over HTTPS, and it has to
  # trust the same authority as the browser does. The certificate is
  # mounted into that container and named in NODE_EXTRA_CA_CERTS.
  cp "$CA_CERT" "$CERT_DIR/ca.crt"

  echo
  echo "The certificate was issued by the internal authority."
  echo "Distribute the root certificate of the authority to the machines"
  echo "that are not part of the company image, or the browser will"
  echo "still warn."

else
  # ---- Self signed ----------------------------------------------------------
  echo "-- writing a self signed certificate for ${DOMAIN}"

  openssl req -x509 -new \
    -key "$TMP_DIR/privkey.pem" \
    -out "$TMP_DIR/fullchain.pem" \
    -days "$DAYS" \
    -sha256 \
    -config "$TMP_DIR/openssl.cnf" \
    -extensions v3_req 2>/dev/null

  cp "$TMP_DIR/fullchain.pem" "$CERT_DIR/fullchain.pem"
  cp "$TMP_DIR/privkey.pem"   "$CERT_DIR/privkey.pem"

  # A self signed certificate is its own root, so the file the
  # application container trusts is the certificate itself.
  cp "$TMP_DIR/fullchain.pem" "$CERT_DIR/ca.crt"

  echo
  echo "This certificate is not trusted by anything yet. Either:"
  echo
  echo "  a) import $CERT_DIR/fullchain.pem into the trusted root store of"
  echo "     the machines that use the application, or"
  echo
  echo "  b) set CA_CERT and CA_KEY in .env to the internal certificate"
  echo "     authority and run this script again."
fi

chmod 644 "$CERT_DIR/fullchain.pem"
chmod 600 "$CERT_DIR/privkey.pem"

echo
echo "-- the certificate"
openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -subject -issuer -dates -ext subjectAltName 2>/dev/null | sed 's/^/   /'
echo
echo "Written to $CERT_DIR/fullchain.pem and $CERT_DIR/privkey.pem"
