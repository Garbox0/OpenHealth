from __future__ import annotations

from collections.abc import AsyncIterator, Generator
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from openhealth_bridge.auth import ActorContext, get_actor_context
from openhealth_bridge.db import create_session_factory, get_db_session
from openhealth_bridge.main import create_app
from openhealth_bridge.models import Base
from openhealth_bridge.security_api import get_identity_admin
from openhealth_bridge.tenancy import ensure_system_tenants


class FakeIdentityAdmin:
    def __init__(self) -> None:
        self.groups = [
            {"id": "g-it", "name": "IT", "path": "/IT", "roles": ["admin"], "member_count": 1},
            {
                "id": "g-med",
                "name": "Medicos",
                "path": "/Medicos",
                "roles": ["doctor"],
                "member_count": 1,
            },
        ]
        self.users = [
            {
                "id": "u-admin",
                "username": "admin",
                "email": "admin@openhealth.local",
                "first_name": "Admin",
                "last_name": "OpenHealth",
                "enabled": True,
                "groups": ["IT"],
                "roles": ["admin"],
            }
        ]

    def list_groups(self) -> list[dict[str, object]]:
        return self.groups

    def list_users(self, search: str | None = None) -> list[dict[str, object]]:
        if not search:
            return self.users
        return [user for user in self.users if search in str(user["username"])]

    def create_user(self, **payload: object) -> dict[str, object]:
        group_names = list(cast(list[str], payload["group_names"]))
        user = {
            "id": "u-new",
            "username": payload["username"],
            "email": payload["email"],
            "first_name": payload["first_name"],
            "last_name": payload["last_name"],
            "enabled": payload["enabled"],
            "groups": group_names,
            "roles": ["doctor"] if "Medicos" in group_names else [],
        }
        self.users.append(user)
        return user

    def update_user(self, user_id: str, **payload: object) -> dict[str, object]:
        user = next(user for user in self.users if user["id"] == user_id)
        if payload["enabled"] is not None:
            user["enabled"] = payload["enabled"]
        if payload["group_names"] is not None:
            user["groups"] = payload["group_names"]
        return user


def create_test_client() -> Generator[TestClient]:
    with TemporaryDirectory() as tmp_dir:
        db_path = Path(tmp_dir) / "test.db"
        engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
        session_factory = create_session_factory(engine)

        async def create_tables() -> None:
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)

        async def drop_tables() -> None:
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.drop_all)

        async def override_db_session() -> AsyncIterator[AsyncSession]:
            async with session_factory() as session:
                yield session

        import asyncio

        asyncio.run(create_tables())

        async def seed_tenants() -> None:
            async with session_factory() as session:
                await ensure_system_tenants(session)

        asyncio.run(seed_tenants())
        app = create_app()
        app.dependency_overrides[get_db_session] = override_db_session
        app.dependency_overrides[get_actor_context] = lambda: ActorContext(
            actor_id="admin",
            username="admin",
            roles=frozenset({"admin"}),
            subject="admin-subject",
        )

        with TestClient(app, base_url="https://www.aerosftp.com") as test_client:
            yield test_client

        app.dependency_overrides.clear()
        asyncio.run(drop_tables())
        asyncio.run(engine.dispose())


@pytest.fixture
def client() -> Generator[TestClient]:
    yield from create_test_client()


def test_security_endpoints_require_admin(client: TestClient) -> None:
    cast(FastAPI, client.app).dependency_overrides[get_actor_context] = lambda: ActorContext(
        actor_id="doctor",
        username="doctor",
        roles=frozenset({"doctor"}),
        subject="doctor-subject",
    )
    response = client.get("/api/v1/security/groups")

    assert response.status_code == 403
    assert response.json()["detail"] == "insufficient role"


def test_security_lists_groups(client: TestClient) -> None:
    cast(FastAPI, client.app).dependency_overrides[get_identity_admin] = lambda: FakeIdentityAdmin()
    response = client.get("/api/v1/security/groups")

    assert response.status_code == 200
    assert response.json()[0]["name"] == "IT"


def test_security_creates_user(client: TestClient) -> None:
    cast(FastAPI, client.app).dependency_overrides[get_identity_admin] = lambda: FakeIdentityAdmin()
    local_only_secret = "local-only-" + "credential"
    response = client.post(
        "/api/v1/security/users",
        json={
            "username": "doctor2",
            "email": "doctor2@openhealth.local",
            "first_name": "Doctor",
            "last_name": "Dos",
            "password": local_only_secret,
            "enabled": True,
            "group_names": ["Medicos"],
        },
    )

    assert response.status_code == 201
    assert response.json()["username"] == "doctor2"
    assert response.json()["groups"] == ["Medicos"]


def test_security_updates_user(client: TestClient) -> None:
    cast(FastAPI, client.app).dependency_overrides[get_identity_admin] = lambda: FakeIdentityAdmin()
    response = client.patch(
        "/api/v1/security/users/u-admin",
        json={"enabled": False, "group_names": ["Medicos"]},
    )

    assert response.status_code == 200
    assert response.json()["enabled"] is False
    assert response.json()["groups"] == ["Medicos"]
