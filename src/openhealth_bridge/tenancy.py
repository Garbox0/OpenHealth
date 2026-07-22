from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openhealth_bridge.auth import ActorContext, get_actor_context
from openhealth_bridge.db import get_db_session
from openhealth_bridge.models import Tenant, TenantMembership

SYSTEM_TENANTS = (
    {
        "slug": "openhealth",
        "hostname": "www.aerosftp.com",
        "display_name": "OpenHealth Bridge",
    },
    {
        "slug": "centralsalud",
        "hostname": "centralsalud.aerosftp.com",
        "display_name": "Central Salud",
    },
)

SYSTEM_ACTORS = ("admin", "admission", "auditor", "billing", "doctor", "support")
SessionDep = Annotated[AsyncSession, Depends(get_db_session)]
ActorDep = Annotated[ActorContext, Depends(get_actor_context)]


@dataclass(frozen=True)
class TenantContext:
    id: UUID
    slug: str
    hostname: str
    display_name: str


async def ensure_system_tenants(session: AsyncSession) -> None:
    slugs = [item["slug"] for item in SYSTEM_TENANTS]
    existing = {
        tenant.slug: tenant
        for tenant in (await session.scalars(select(Tenant).where(Tenant.slug.in_(slugs)))).all()
    }

    for item in SYSTEM_TENANTS:
        tenant = existing.get(item["slug"])
        if tenant is None:
            tenant = Tenant(**item)
            session.add(tenant)
            await session.flush()
            existing[item["slug"]] = tenant
        else:
            tenant.hostname = item["hostname"]
            tenant.display_name = item["display_name"]
            tenant.is_active = True

        for actor_id in SYSTEM_ACTORS:
            membership = await session.scalar(
                select(TenantMembership).where(
                    TenantMembership.tenant_id == tenant.id,
                    TenantMembership.actor_id == actor_id,
                )
            )
            if membership is None:
                session.add(
                    TenantMembership(
                        tenant_id=tenant.id,
                        actor_id=actor_id,
                        is_active=True,
                    )
                )
            else:
                membership.is_active = True

    await session.commit()


def normalize_hostname(value: str | None) -> str:
    if not value:
        return ""
    return value.split(",", 1)[0].strip().split(":", 1)[0].lower()


async def get_tenant_context(
    request: Request,
    session: SessionDep,
    actor: ActorDep,
) -> TenantContext:
    raw_host = (
        request.headers.get("x-openhealth-tenant")
        or request.headers.get("x-forwarded-host")
        or request.headers.get("host")
        or request.url.hostname
    )
    hostname = normalize_hostname(raw_host)

    tenant = await session.scalar(
        select(Tenant).where(Tenant.hostname == hostname, Tenant.is_active.is_(True))
    )
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="unknown tenant workspace",
        )

    if actor.actor_id == "dev-bypass":
        return TenantContext(
            id=tenant.id,
            slug=tenant.slug,
            hostname=tenant.hostname,
            display_name=tenant.display_name,
        )

    membership = await session.scalar(
        select(TenantMembership).where(
            TenantMembership.tenant_id == tenant.id,
            TenantMembership.actor_id == actor.actor_id,
            TenantMembership.is_active.is_(True),
        )
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="actor does not belong to this tenant",
        )

    return TenantContext(
        id=tenant.id,
        slug=tenant.slug,
        hostname=tenant.hostname,
        display_name=tenant.display_name,
    )
