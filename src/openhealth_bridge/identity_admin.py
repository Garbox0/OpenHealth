from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from openhealth_bridge.config import Settings


@dataclass(frozen=True)
class IdentityAdminError(Exception):
    status_code: int
    detail: str

    def __str__(self) -> str:
        return self.detail


class KeycloakIdentityAdmin:
    def __init__(self, settings: Settings) -> None:
        self.base_url = settings.keycloak_admin_base_url.rstrip("/")
        self.realm = settings.keycloak_admin_realm
        self.client_id = settings.keycloak_admin_client_id
        self.username = settings.keycloak_admin_username
        self.password = settings.keycloak_admin_password

    def list_groups(self) -> list[dict[str, Any]]:
        groups = self._request_json(
            "GET",
            f"/admin/realms/{self.realm}/groups",
            query={"briefRepresentation": "false"},
        )
        result: list[dict[str, Any]] = []
        for group in groups:
            roles = self._request_json(
                "GET",
                f"/admin/realms/{self.realm}/groups/{group['id']}/role-mappings/realm/composite",
            )
            members = self._request_json(
                "GET",
                f"/admin/realms/{self.realm}/groups/{group['id']}/members",
                query={"briefRepresentation": "true", "max": "200"},
            )
            result.append(
                {
                    "id": group["id"],
                    "name": group["name"],
                    "path": group.get("path", f"/{group['name']}"),
                    "roles": sorted(role["name"] for role in roles),
                    "member_count": len(members),
                }
            )
        return sorted(result, key=lambda item: str(item["name"]).lower())

    def list_users(self, search: str | None = None) -> list[dict[str, Any]]:
        query = {"briefRepresentation": "true", "max": "100"}
        if search:
            query["search"] = search
        users = self._request_json("GET", f"/admin/realms/{self.realm}/users", query=query)
        result = [self.get_user(str(user["id"])) for user in users]
        return sorted(result, key=lambda item: str(item["username"]).lower())

    def create_user(
        self,
        *,
        username: str,
        email: str | None,
        first_name: str | None,
        last_name: str | None,
        password: str,
        group_names: list[str],
        enabled: bool,
    ) -> dict[str, Any]:
        self._request_json(
            "POST",
            f"/admin/realms/{self.realm}/users",
            payload={
                "username": username,
                "email": email,
                "firstName": first_name,
                "lastName": last_name,
                "enabled": enabled,
                "emailVerified": False,
                "credentials": [
                    {
                        "type": "password",
                        "value": password,
                        "temporary": False,
                    }
                ],
            },
            expected_statuses={201},
        )
        created = self._find_user_by_username(username)
        if created is None:
            raise IdentityAdminError(status_code=500, detail="user was created but not found")
        self._sync_user_groups(str(created["id"]), group_names)
        return self.get_user(str(created["id"]))

    def update_user(
        self,
        user_id: str,
        *,
        enabled: bool | None = None,
        group_names: list[str] | None = None,
        password: str | None = None,
    ) -> dict[str, Any]:
        existing = self._request_json("GET", f"/admin/realms/{self.realm}/users/{user_id}")
        update_payload = {
            "id": existing["id"],
            "username": existing["username"],
            "email": existing.get("email"),
            "firstName": existing.get("firstName"),
            "lastName": existing.get("lastName"),
            "enabled": existing.get("enabled", True) if enabled is None else enabled,
        }
        self._request_json(
            "PUT",
            f"/admin/realms/{self.realm}/users/{user_id}",
            payload=update_payload,
            expected_statuses={204},
        )
        if password:
            self._request_json(
                "PUT",
                f"/admin/realms/{self.realm}/users/{user_id}/reset-password",
                payload={"type": "password", "value": password, "temporary": False},
                expected_statuses={204},
            )
        if group_names is not None:
            self._sync_user_groups(user_id, group_names)
        return self.get_user(user_id)

    def get_user(self, user_id: str) -> dict[str, Any]:
        user = self._request_json("GET", f"/admin/realms/{self.realm}/users/{user_id}")
        groups = self._request_json("GET", f"/admin/realms/{self.realm}/users/{user_id}/groups")
        roles = self._request_json(
            "GET",
            f"/admin/realms/{self.realm}/users/{user_id}/role-mappings/realm/composite",
        )
        return {
            "id": user["id"],
            "username": user["username"],
            "email": user.get("email"),
            "first_name": user.get("firstName"),
            "last_name": user.get("lastName"),
            "enabled": bool(user.get("enabled", True)),
            "groups": sorted(group["name"] for group in groups),
            "roles": sorted(role["name"] for role in roles),
        }

    def _find_user_by_username(self, username: str) -> dict[str, Any] | None:
        users = self._request_json(
            "GET",
            f"/admin/realms/{self.realm}/users",
            query={"username": username, "exact": "true"},
        )
        for user in users:
            if user.get("username") == username:
                return dict(user)
        return None

    def _sync_user_groups(self, user_id: str, group_names: list[str]) -> None:
        desired = set(group_names)
        current_groups = self._request_json(
            "GET",
            f"/admin/realms/{self.realm}/users/{user_id}/groups",
        )
        current_map = {group["name"]: group["id"] for group in current_groups}
        available_groups = self._request_json("GET", f"/admin/realms/{self.realm}/groups")
        available_map = {group["name"]: group["id"] for group in available_groups}

        missing = [name for name in desired if name not in available_map]
        if missing:
            raise IdentityAdminError(
                status_code=422,
                detail=f"unknown groups: {', '.join(sorted(missing))}",
            )

        for name, group_id in current_map.items():
            if name not in desired:
                self._request_json(
                    "DELETE",
                    f"/admin/realms/{self.realm}/users/{user_id}/groups/{group_id}",
                    expected_statuses={204},
                )

        for name in desired:
            if name not in current_map:
                self._request_json(
                    "PUT",
                    f"/admin/realms/{self.realm}/users/{user_id}/groups/{available_map[name]}",
                    expected_statuses={204},
                )

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, str] | None = None,
        payload: dict[str, Any] | list[dict[str, Any]] | None = None,
        expected_statuses: set[int] | None = None,
    ) -> Any:
        token = self._get_access_token()
        expected = expected_statuses or {200}
        url = f"{self.base_url}{path}"
        if query:
            url = f"{url}?{urlencode(query)}"

        body = None
        headers = {"Authorization": f"Bearer {token}"}
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        request = Request(url, data=body, headers=headers, method=method)
        try:
            with urlopen(request, timeout=20) as response:
                status_code = response.getcode()
                if status_code not in expected:
                    raise IdentityAdminError(
                        status_code=status_code,
                        detail="unexpected identity response",
                    )
                content = response.read()
                if not content:
                    return None
                return json.loads(content.decode("utf-8"))
        except HTTPError as error:
            detail = error.reason
            try:
                raw = error.read().decode("utf-8")
                parsed = json.loads(raw) if raw else {}
                detail = str(parsed.get("errorMessage") or parsed.get("error") or raw or detail)
            except Exception:
                detail = str(detail)
            raise IdentityAdminError(status_code=error.code, detail=detail) from error
        except URLError as error:
            raise IdentityAdminError(
                status_code=502,
                detail=f"identity service unavailable: {error.reason}",
            ) from error

    def _get_access_token(self) -> str:
        token_url = f"{self.base_url}/realms/master/protocol/openid-connect/token"
        form = urlencode(
            {
                "client_id": self.client_id,
                "username": self.username,
                "password": self.password,
                "grant_type": "password",
            }
        ).encode("utf-8")
        request = Request(
            token_url,
            data=form,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
                return str(payload["access_token"])
        except HTTPError as error:
            raise IdentityAdminError(
                status_code=error.code,
                detail="could not authenticate against identity service",
            ) from error
        except URLError as error:
            raise IdentityAdminError(
                status_code=502,
                detail=f"identity service unavailable: {error.reason}",
            ) from error
