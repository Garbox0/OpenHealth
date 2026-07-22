#!/bin/sh
set -eu

server="${KEYCLOAK_URL:-http://keycloak:8080}"
admin_user="${KEYCLOAK_ADMIN_USERNAME:-admin}"
admin_password="${KEYCLOAK_ADMIN_PASSWORD:?set KEYCLOAK_ADMIN_PASSWORD}"
realm="${OPENHEALTH_REALM:-openhealth}"
kcadm="/opt/keycloak/bin/kcadm.sh"

until "$kcadm" config credentials --server "$server" --realm master --user "$admin_user" --password "$admin_password" >/dev/null 2>&1; do
  echo "Waiting for Keycloak admin API..."
  sleep 2
done

"$kcadm" update "realms/$realm" -s loginTheme=openhealth -s displayName="Central Salud" -s displayNameHtml="Central Salud" >/dev/null

set_password() {
  "$kcadm" set-password -r "$realm" --username "$1" --new-password "$2" >/dev/null
}

set_password admin "${OPENHEALTH_USER_ADMIN_PASSWORD:?set OPENHEALTH_USER_ADMIN_PASSWORD}"
set_password admission "${OPENHEALTH_USER_ADMISSION_PASSWORD:?set OPENHEALTH_USER_ADMISSION_PASSWORD}"
set_password auditor "${OPENHEALTH_USER_AUDITOR_PASSWORD:?set OPENHEALTH_USER_AUDITOR_PASSWORD}"
set_password billing "${OPENHEALTH_USER_BILLING_PASSWORD:?set OPENHEALTH_USER_BILLING_PASSWORD}"
set_password doctor "${OPENHEALTH_USER_DOCTOR_PASSWORD:?set OPENHEALTH_USER_DOCTOR_PASSWORD}"
set_password support "${OPENHEALTH_USER_SUPPORT_PASSWORD:?set OPENHEALTH_USER_SUPPORT_PASSWORD}"

echo "OpenHealth demo users seeded."
