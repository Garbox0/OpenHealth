#!/bin/sh
set -eu

env_file="${1:-.env.tunnel}"

get_env() {
  key="$1"
  if [ -f "$env_file" ]; then
    value="$(grep -E "^${key}=" "$env_file" | tail -n 1 | cut -d= -f2- || true)"
    if [ -n "$value" ]; then
      printf '%s' "$value"
      return
    fi
  fi
  echo "Missing ${key} in ${env_file}" >&2
  exit 1
}

admin_password="$(get_env KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD)"

docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password "$admin_password" >/dev/null

docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh update realms/openhealth \
  -s bruteForceProtected=true \
  -s failureFactor=5 \
  -s waitIncrementSeconds=60 \
  -s maxFailureWaitSeconds=900 \
  -s maxDeltaTimeSeconds=43200 \
  -s quickLoginCheckMilliSeconds=1000 \
  -s minimumQuickLoginWaitSeconds=60 \
  -s permanentLockout=false >/dev/null

client_id="$(
  docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh get clients \
    -r openhealth \
    -q clientId=openhealth-dev \
    --fields id \
    --format csv \
    --noquotes | tail -n 1
)"

if [ -z "$client_id" ]; then
  echo "openhealth-dev client not found" >&2
  exit 1
fi

docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh update "clients/${client_id}" \
  -r openhealth \
  -s directAccessGrantsEnabled=false \
  -s 'redirectUris=["https://www.aerosftp.com/","https://www.aerosftp.com/backoffice/*","https://www.aerosftp.com/medicos/*","https://www.aerosftp.com/seguridad/*","https://centralsalud.aerosftp.com/","https://centralsalud.aerosftp.com/backoffice/*","https://centralsalud.aerosftp.com/medicos/*","https://centralsalud.aerosftp.com/seguridad/*"]' \
  -s 'webOrigins=["https://www.aerosftp.com","https://centralsalud.aerosftp.com"]' \
  -s 'attributes."post.logout.redirect.uris"="https://www.aerosftp.com/##https://www.aerosftp.com/backoffice/*##https://www.aerosftp.com/medicos/*##https://www.aerosftp.com/seguridad/*##https://centralsalud.aerosftp.com/##https://centralsalud.aerosftp.com/backoffice/*##https://centralsalud.aerosftp.com/medicos/*##https://centralsalud.aerosftp.com/seguridad/*"' >/dev/null

echo "Keycloak hardening applied."
