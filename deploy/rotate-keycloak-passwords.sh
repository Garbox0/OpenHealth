#!/bin/sh
set -eu

env_file="${1:-.env.tunnel}"
realm="${OPENHEALTH_REALM:-openhealth}"
keycloak_container="${KEYCLOAK_CONTAINER:-current-keycloak-1}"

get_env() {
  key="$1"
  default="${2:-}"
  value="$(grep -E "^${key}=" "$env_file" | tail -n 1 | cut -d= -f2- || true)"
  if [ -n "$value" ]; then
    printf '%s' "$value"
  else
    printf '%s' "$default"
  fi
}

require_env() {
  key="$1"
  value="$(get_env "$key")"
  if [ -z "$value" ]; then
    echo "Missing ${key} in ${env_file}" >&2
    exit 1
  fi
  printf '%s' "$value"
}

gen_password() {
  python3 -c 'import secrets,string; chars=string.ascii_letters+string.digits+"_-."; print("".join(secrets.choice(chars) for _ in range(32)))'
}

set_password() {
  username="$1"
  password="$2"
  docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh set-password \
    -r "$realm" \
    --username "$username" \
    --new-password "$password" >/dev/null
}

old_admin_password="$(require_env KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD)"
tunnel_token="$(require_env CLOUDFLARE_TUNNEL_TOKEN)"
postgres_data_dir="$(get_env POSTGRES_DATA_DIR_HOST postgres_data)"
keycloak_data_dir="$(get_env KEYCLOAK_DATA_DIR_HOST keycloak_data)"
postgres_backup_dir="$(get_env POSTGRES_BACKUP_DIR_HOST ./backups/postgres)"

new_admin_password="$(gen_password)"
new_admission_password="$(gen_password)"
new_auditor_password="$(gen_password)"
new_billing_password="$(gen_password)"
new_doctor_password="$(gen_password)"
new_support_password="$(gen_password)"

cp "$env_file" "${env_file}.pre-rotation-$(date -u +%Y%m%dT%H%M%SZ)"

cat > "$env_file" <<EOF
CLOUDFLARE_TUNNEL_TOKEN=${tunnel_token}
KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD=${new_admin_password}
OPENHEALTH_USER_ADMIN_PASSWORD=${new_admin_password}
OPENHEALTH_USER_ADMISSION_PASSWORD=${new_admission_password}
OPENHEALTH_USER_AUDITOR_PASSWORD=${new_auditor_password}
OPENHEALTH_USER_BILLING_PASSWORD=${new_billing_password}
OPENHEALTH_USER_DOCTOR_PASSWORD=${new_doctor_password}
OPENHEALTH_USER_SUPPORT_PASSWORD=${new_support_password}
POSTGRES_DATA_DIR_HOST=${postgres_data_dir}
KEYCLOAK_DATA_DIR_HOST=${keycloak_data_dir}
POSTGRES_BACKUP_DIR_HOST=${postgres_backup_dir}
EOF

docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password "$old_admin_password" >/dev/null

docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh set-password \
  -r master \
  --username admin \
  --new-password "$new_admin_password" >/dev/null

set_password admin "$new_admin_password"
set_password admission "$new_admission_password"
set_password auditor "$new_auditor_password"
set_password billing "$new_billing_password"
set_password doctor "$new_doctor_password"
set_password support "$new_support_password"

docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --env-file "$env_file" up -d api >/dev/null

echo "Keycloak passwords rotated. Secrets were written to ${env_file}."
