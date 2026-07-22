from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated, Any, Literal

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from openhealth_bridge.config import Settings, get_settings

ApplicationRole = Literal["admin", "administrative", "doctor"]
LegacyRole = Literal[
    "admission",
    "medical_auditor",
    "billing",
    "support",
]
UserRole = ApplicationRole | LegacyRole

ALLOWED_ROLES: set[ApplicationRole] = {
    "admin",
    "administrative",
    "doctor",
}

# Older case data still carries these routing names. They are not login roles anymore.
ROLE_ALIASES: dict[UserRole, ApplicationRole] = {
    "admin": "admin",
    "administrative": "administrative",
    "doctor": "doctor",
    "admission": "administrative",
    "medical_auditor": "administrative",
    "billing": "administrative",
    "support": "administrative",
}

http_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class ActorContext:
    actor_id: str
    username: str
    roles: frozenset[ApplicationRole]
    subject: str


@lru_cache
def get_jwk_client(jwks_url: str) -> PyJWKClient:
    return PyJWKClient(jwks_url)


def get_jwks_url(settings: Settings) -> str:
    if settings.oidc_jwks_url:
        return settings.oidc_jwks_url
    issuer = settings.oidc_issuer_url.rstrip("/")
    return f"{issuer}/protocol/openid-connect/certs"


def decode_access_token(token: str, settings: Settings) -> dict[str, Any]:
    jwk_client = get_jwk_client(get_jwks_url(settings))
    signing_key = jwk_client.get_signing_key_from_jwt(token)
    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        issuer=settings.oidc_issuer_url,
        options={"verify_aud": False},
    )

    token_client_id = payload.get("azp")
    token_audience = payload.get("aud", [])
    audience_values = token_audience if isinstance(token_audience, list) else [token_audience]

    if (
        token_client_id != settings.oidc_client_id
        and settings.oidc_client_id not in audience_values
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="token client is not allowed for this API",
        )

    return payload


async def get_actor_context(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(http_bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ActorContext:
    if not settings.require_auth:
        return ActorContext(
            actor_id="dev-bypass",
            username="dev-bypass",
            roles=frozenset({"admin"}),
            subject="dev-bypass",
        )

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
        )

    payload = decode_access_token(credentials.credentials, settings)
    realm_access = payload.get("realm_access", {})
    raw_roles = realm_access.get("roles", []) if isinstance(realm_access, dict) else []
    user_roles = frozenset(
        role for role in raw_roles if isinstance(role, str) and role in ALLOWED_ROLES
    )

    if not user_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="token does not carry an allowed application role",
        )

    subject = str(payload["sub"])
    username = str(payload.get("preferred_username", subject))

    return ActorContext(
        actor_id=username,
        username=username,
        roles=user_roles,
        subject=subject,
    )


ActorDep = Annotated[ActorContext, Depends(get_actor_context)]


def require_roles(*roles: UserRole) -> Callable[[ActorDep], Awaitable[ActorContext]]:
    allowed_roles = {ROLE_ALIASES[role] for role in roles}

    async def dependency(actor: ActorDep) -> ActorContext:
        if actor.roles.isdisjoint(allowed_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="insufficient role",
            )
        return actor

    return dependency
