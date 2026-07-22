#!/bin/sh
set -eu

env_file="${1:-.env.tunnel}"

get_env() {
  key="$1"
  value="$(grep -E "^${key}=" "$env_file" | tail -n 1 | cut -d= -f2- || true)"
  if [ -z "$value" ]; then
    echo "Missing ${key} in ${env_file}" >&2
    exit 1
  fi
  printf '%s' "$value"
}

admin_password="$(get_env KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD)"

if ! grep -q "^POSTGRES_DB=" "$env_file" || ! grep -q "^POSTGRES_USER=" "$env_file"; then
  python3 deploy/repair-postgres-env-from-url.py
fi

replace_or_append() {
  key="$1"
  value="$2"
  tmp="$(mktemp)"
  awk -F= -v key="$key" -v value="$value" '
    BEGIN { done = 0 }
    $1 == key { print key "=" value; done = 1; next }
    { print }
    END { if (!done) print key "=" value }
  ' "$env_file" > "$tmp"
  mv "$tmp" "$env_file"
}

replace_or_append OPENHEALTH_KEYCLOAK_ADMIN_PASSWORD "$admin_password"

cat > .env.keycloak-bootstrap <<EOF
KC_BOOTSTRAP_ADMIN_USERNAME=admin
KC_BOOTSTRAP_ADMIN_PASSWORD=${admin_password}
EOF

cat > .env.keycloak-setup <<EOF
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=${admin_password}
OPENHEALTH_REALM=openhealth
OPENHEALTH_USER_ADMIN_PASSWORD=$(get_env OPENHEALTH_USER_ADMIN_PASSWORD)
OPENHEALTH_USER_ADMISSION_PASSWORD=$(get_env OPENHEALTH_USER_ADMISSION_PASSWORD)
OPENHEALTH_USER_AUDITOR_PASSWORD=$(get_env OPENHEALTH_USER_AUDITOR_PASSWORD)
OPENHEALTH_USER_BILLING_PASSWORD=$(get_env OPENHEALTH_USER_BILLING_PASSWORD)
OPENHEALTH_USER_DOCTOR_PASSWORD=$(get_env OPENHEALTH_USER_DOCTOR_PASSWORD)
OPENHEALTH_USER_SUPPORT_PASSWORD=$(get_env OPENHEALTH_USER_SUPPORT_PASSWORD)
EOF

cat > .env.api <<EOF
OPENHEALTH_KEYCLOAK_ADMIN_USERNAME=admin
OPENHEALTH_KEYCLOAK_ADMIN_PASSWORD=${admin_password}
EOF

cat > .env.postgres <<EOF
POSTGRES_DB=$(get_env POSTGRES_DB)
POSTGRES_USER=$(get_env POSTGRES_USER)
POSTGRES_PASSWORD=$(get_env POSTGRES_PASSWORD)
EOF

echo "Runtime env files synced from ${env_file}."
