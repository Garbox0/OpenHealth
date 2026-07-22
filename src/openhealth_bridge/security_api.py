from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from openhealth_bridge.auth import ActorContext, require_roles
from openhealth_bridge.config import Settings, get_settings
from openhealth_bridge.identity_admin import IdentityAdminError, KeycloakIdentityAdmin
from openhealth_bridge.tenancy import TenantContext, get_tenant_context

router = APIRouter(prefix="/api/v1/security", tags=["security"])


class SecurityGroupRead(BaseModel):
    id: str
    name: str
    path: str
    roles: list[str]
    member_count: int


class SecurityUserRead(BaseModel):
    id: str
    username: str
    email: str | None
    first_name: str | None
    last_name: str | None
    enabled: bool
    groups: list[str]
    roles: list[str]


class SecurityUserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    email: str | None = Field(default=None, max_length=255)
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    password: str = Field(min_length=6, max_length=100)
    enabled: bool = True
    group_names: list[str] = Field(default_factory=list)


class SecurityUserUpdate(BaseModel):
    enabled: bool | None = None
    password: str | None = Field(default=None, min_length=6, max_length=100)
    group_names: list[str] | None = None


def get_identity_admin(
    settings: Annotated[Settings, Depends(get_settings)],
) -> KeycloakIdentityAdmin:
    return KeycloakIdentityAdmin(settings)


AdminActor = Annotated[ActorContext, Depends(require_roles("admin"))]
IdentityAdminDep = Annotated[KeycloakIdentityAdmin, Depends(get_identity_admin)]
TenantDep = Annotated[TenantContext, Depends(get_tenant_context)]


def translate_identity_error(error: IdentityAdminError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=error.detail)


@router.get("/groups", response_model=list[SecurityGroupRead])
async def list_security_groups(
    _: AdminActor,
    __: TenantDep,
    identity_admin: IdentityAdminDep,
) -> list[dict[str, object]]:
    try:
        return await run_in_threadpool(identity_admin.list_groups)
    except IdentityAdminError as error:
        raise translate_identity_error(error) from error


@router.get("/users", response_model=list[SecurityUserRead])
async def list_security_users(
    _: AdminActor,
    __: TenantDep,
    identity_admin: IdentityAdminDep,
    search: str | None = Query(default=None, min_length=1),
) -> list[dict[str, object]]:
    try:
        return await run_in_threadpool(identity_admin.list_users, search)
    except IdentityAdminError as error:
        raise translate_identity_error(error) from error


@router.post("/users", response_model=SecurityUserRead, status_code=status.HTTP_201_CREATED)
async def create_security_user(
    payload: SecurityUserCreate,
    _: AdminActor,
    __: TenantDep,
    identity_admin: IdentityAdminDep,
) -> dict[str, object]:
    try:
        return await run_in_threadpool(
            identity_admin.create_user,
            username=payload.username,
            email=payload.email,
            first_name=payload.first_name,
            last_name=payload.last_name,
            password=payload.password,
            group_names=payload.group_names,
            enabled=payload.enabled,
        )
    except IdentityAdminError as error:
        raise translate_identity_error(error) from error


@router.patch("/users/{user_id}", response_model=SecurityUserRead)
async def update_security_user(
    user_id: str,
    payload: SecurityUserUpdate,
    _: AdminActor,
    __: TenantDep,
    identity_admin: IdentityAdminDep,
) -> dict[str, object]:
    try:
        return await run_in_threadpool(
            identity_admin.update_user,
            user_id,
            enabled=payload.enabled,
            group_names=payload.group_names,
            password=payload.password,
        )
    except IdentityAdminError as error:
        raise translate_identity_error(error) from error
