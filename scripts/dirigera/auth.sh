#!/usr/bin/env bash
# DIRIGERA hub OAuth pairing — one-time bootstrap.
#
# Performs the PKCE flow against an IKEA DIRIGERA hub on the LAN, prompts
# the user to physically press the action button on the hub within 60s,
# and prints the resulting `DIRIGERA_HOST` + `DIRIGERA_TOKEN` lines that
# need to be appended to `apps/api/.env` (locally for dev) and the NAS env
# at `/volume1/docker/home-panel/apps/api/.env` (production).
#
# Usage:
#   ./scripts/dirigera/auth.sh <hub-ip>
#
# Example:
#   ./scripts/dirigera/auth.sh 192.168.178.164
#
# Requirements:
#   - bash, curl, jq, openssl (already on macOS + Synology)
#   - LAN access to the hub on TCP/8443
#
# Notes:
#   - DIRIGERA serves a self-signed cert on :8443. We pass `curl -k`
#     explicitly only here; the backend uses a per-request `https.Agent`
#     with rejectUnauthorized:false, never disabling TLS globally.
#   - The bearer token is long-lived. Store it in `.env` and treat it
#     like any other secret. Never commit it.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <hub-ip>" >&2
  echo "example: $0 192.168.178.164" >&2
  exit 64
fi

HOST="$1"
BASE="https://${HOST}:8443/v1"

for cmd in curl jq openssl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: '$cmd' is required but not in PATH" >&2
    exit 127
  fi
done

# Reachability probe — fail fast with a friendly message instead of a
# cryptic curl SSL error if the hub is offline.
if ! curl -ks --max-time 4 -o /dev/null -w '%{http_code}' "${BASE}/" | grep -qE '^[1-5][0-9][0-9]$'; then
  echo "error: DIRIGERA non raggiungibile su ${HOST}:8443 (controlla IP, alimentazione, LAN)" >&2
  exit 1
fi

# --- PKCE: generate code_verifier + code_challenge (S256) ------------------

# 32 random bytes, base64-url, no padding — RFC 7636 length 43.
CODE_VERIFIER=$(openssl rand 32 | basenc --base64url 2>/dev/null | tr -d '=' || \
                openssl rand -base64 32 | tr -d '=' | tr '/+' '_-')

# SHA-256 hash of the verifier, base64-url, no padding.
CODE_CHALLENGE=$(printf '%s' "${CODE_VERIFIER}" | openssl dgst -sha256 -binary \
  | { basenc --base64url 2>/dev/null || openssl base64; } | tr -d '=\n' | tr '/+' '_-')

# --- 1. Authorize ---------------------------------------------------------

AUTH_RESP=$(curl -ks --max-time 10 \
  -G "${BASE}/oauth/authorize" \
  --data-urlencode "audience=homesmart.local" \
  --data-urlencode "response_type=code" \
  --data-urlencode "code_challenge=${CODE_CHALLENGE}" \
  --data-urlencode "code_challenge_method=S256")

CODE=$(printf '%s' "${AUTH_RESP}" | jq -r '.code // empty')
if [[ -z "${CODE}" ]]; then
  echo "error: authorize fallito, risposta hub:" >&2
  echo "${AUTH_RESP}" >&2
  exit 2
fi

# --- 2. Prompt physical button press --------------------------------------

cat <<EOF >&2

   ┌────────────────────────────────────────────────────────────┐
   │  Premi ORA il pulsante di azione sul DIRIGERA              │
   │  (il piccolo cerchio sulla parte superiore dell'hub).      │
   │                                                            │
   │  Hai 60 secondi prima del timeout.                         │
   └────────────────────────────────────────────────────────────┘

EOF

# --- 3. Token exchange — retry up to 60s ----------------------------------

DEADLINE=$(($(date +%s) + 60))
TOKEN=""
ATTEMPT=0
while [[ $(date +%s) -lt ${DEADLINE} ]]; do
  ATTEMPT=$((ATTEMPT + 1))
  RESP=$(curl -ks --max-time 5 -X POST "${BASE}/oauth/token" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "code=${CODE}" \
    --data-urlencode "name=home-panel" \
    --data-urlencode "grant_type=authorization_code" \
    --data-urlencode "code_verifier=${CODE_VERIFIER}" || true)

  TOKEN=$(printf '%s' "${RESP}" | jq -r '.access_token // empty' 2>/dev/null || true)
  if [[ -n "${TOKEN}" ]]; then
    break
  fi

  # Give visual feedback so the user knows we're polling
  printf '\r  ⏳  In attesa del press del pulsante (tentativo %d) ' "${ATTEMPT}" >&2
  sleep 2
done
printf '\n' >&2

if [[ -z "${TOKEN}" ]]; then
  echo "error: pulsante non premuto in tempo, riprova lanciando di nuovo lo script" >&2
  exit 3
fi

# --- 4. Output env vars to stdout (user pastes into .env) -----------------

cat <<EOF
# Append the two lines below to apps/api/.env (and the NAS env file).
# Generated $(date -u +%Y-%m-%dT%H:%M:%SZ) by scripts/dirigera/auth.sh
DIRIGERA_HOST=${HOST}
DIRIGERA_TOKEN=${TOKEN}
EOF

echo "" >&2
echo "✓ pairing completato" >&2
