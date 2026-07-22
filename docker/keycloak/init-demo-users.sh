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

find_user_id() {
  "$kcadm" get users -r "$realm" -q username="$1" |
    sed -n 's/.*"id" : "\([^"]*\)".*/\1/p' |
    head -n 1
}

find_group_id() {
  "$kcadm" get groups -r "$realm" -q search="$1" |
    sed -n 's/.*"id" : "\([^"]*\)".*/\1/p' |
    head -n 1
}

ensure_role() {
  "$kcadm" get "roles/$1" -r "$realm" >/dev/null 2>&1 ||
    "$kcadm" create roles -r "$realm" -s name="$1" >/dev/null
}

ensure_user() {
  if [ -z "$(find_user_id "$1")" ]; then
    "$kcadm" create users -r "$realm" -s username="$1" -s enabled=true -s email="$2" -s emailVerified=true >/dev/null
  fi
}

disable_user() {
  user_id="$(find_user_id "$1")"
  if [ -n "$user_id" ]; then
    "$kcadm" update "users/$user_id" -r "$realm" -s enabled=false >/dev/null
  fi
}

add_user_to_group() {
  user_id="$(find_user_id "$1")"
  group_id="$(find_group_id "$2")"
  if [ -n "$user_id" ] && [ -n "$group_id" ]; then
    "$kcadm" update "users/$user_id/groups/$group_id" -r "$realm" >/dev/null
  fi
}

ensure_role admin
ensure_role administrative
ensure_role doctor

ensure_user admin admin@openhealth.local
ensure_user administrative administrative@openhealth.local
ensure_user doctor doctor@openhealth.local

set_password admin "${OPENHEALTH_USER_ADMIN_PASSWORD:?set OPENHEALTH_USER_ADMIN_PASSWORD}"
set_password administrative "${OPENHEALTH_USER_ADMINISTRATIVE_PASSWORD:?set OPENHEALTH_USER_ADMINISTRATIVE_PASSWORD}"
set_password doctor "${OPENHEALTH_USER_DOCTOR_PASSWORD:?set OPENHEALTH_USER_DOCTOR_PASSWORD}"

"$kcadm" add-roles -r "$realm" --uusername admin --rolename admin >/dev/null
"$kcadm" add-roles -r "$realm" --uusername administrative --rolename administrative >/dev/null
"$kcadm" add-roles -r "$realm" --uusername doctor --rolename doctor >/dev/null

add_user_to_group admin IT
add_user_to_group administrative Administrativos
add_user_to_group doctor Medicos

disable_user admission
disable_user auditor
disable_user billing
disable_user support

"$kcadm" add-roles -r "$realm" --gname Administrativos --rolename administrative >/dev/null
for legacy_role in admission medical_auditor billing support; do
  "$kcadm" remove-roles -r "$realm" --gname Administrativos --rolename "$legacy_role" >/dev/null 2>&1 || true
  "$kcadm" delete "roles/$legacy_role" -r "$realm" >/dev/null 2>&1 || true
done

echo "OpenHealth demo users seeded."
