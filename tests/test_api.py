from __future__ import annotations

from collections.abc import AsyncIterator, Generator
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from openhealth_bridge.auth import ActorContext, get_actor_context, get_jwks_url
from openhealth_bridge.config import Settings, get_settings
from openhealth_bridge.db import create_session_factory, get_db_session
from openhealth_bridge.main import create_app
from openhealth_bridge.models import Base
from openhealth_bridge.tenancy import ensure_system_tenants


@pytest.fixture
def client() -> Generator[TestClient]:
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
            actor_id="administrative",
            username="administrative",
            roles=frozenset({"administrative"}),
            subject="administrative-subject",
        )

        with TestClient(app, base_url="https://www.aerosftp.com") as test_client:
            yield test_client

        app.dependency_overrides.clear()
        asyncio.run(drop_tables())
        asyncio.run(engine.dispose())


def test_live_returns_ok(client: TestClient) -> None:
    response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_api_docs_can_be_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENHEALTH_ENABLE_API_DOCS", "false")
    get_settings.cache_clear()
    app = create_app()

    try:
        with TestClient(app) as test_client:
            assert test_client.get("/docs").status_code == 404
            assert test_client.get("/openapi.json").status_code == 404
    finally:
        get_settings.cache_clear()


def test_api_accepts_explicit_tenant_header_for_shared_api_domain(client: TestClient) -> None:
    response = client.get(
        "/api/v1/me",
        headers={
            "host": "api.aerosftp.com",
            "x-openhealth-tenant": "centralsalud.aerosftp.com",
        },
    )

    assert response.status_code == 200
    assert response.json()["tenant_slug"] == "centralsalud"


def test_create_and_read_incident_case_flow(client: TestClient) -> None:
    patient_response = client.post(
        "/api/v1/patients",
        json={
            "family_name": "Perez",
            "given_names": "Ana",
            "document_type": "dni",
            "document_number": "12345678",
        },
    )
    assert patient_response.status_code == 201
    patient_id = patient_response.json()["id"]

    encounter_response = client.post(
        "/api/v1/encounters",
        json={
            "patient_id": patient_id,
            "status": "open",
            "practitioner_name": "Dr. Test",
        },
    )
    assert encounter_response.status_code == 201
    encounter_id = encounter_response.json()["id"]
    assert encounter_response.json()["has_incident_case"] is False

    case_response = client.post(
        "/api/v1/incident-cases",
        json={
            "patient_id": patient_id,
            "encounter_id": encounter_id,
            "coverage_type": "art",
            "incident_type": "work_accident",
            "incident_date": "2026-07-20",
            "art_name": "ART Demo",
        },
    )
    assert case_response.status_code == 201
    incident_case = case_response.json()
    assert incident_case["status"] == "open"

    detail_response = client.get(
        f"/api/v1/incident-cases/{incident_case['id']}",
    )
    assert detail_response.status_code == 200
    assert detail_response.json()["art_name"] == "ART Demo"

    list_response = client.get("/api/v1/incident-cases")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1

    events_response = client.get(
        f"/api/v1/incident-cases/{incident_case['id']}/events",
    )
    assert events_response.status_code == 200
    assert events_response.json()[0]["event_type"] == "case_created"
    assert events_response.json()[0]["actor_id"] == "administrative"

    encounter_detail_response = client.get(
        f"/api/v1/encounters/{encounter_id}",
    )
    assert encounter_detail_response.status_code == 200
    assert encounter_detail_response.json()["has_incident_case"] is True


def test_list_patients_searches_by_name_and_document(client: TestClient) -> None:
    first_response = client.post(
        "/api/v1/patients",
        json={
            "family_name": "Ramos",
            "given_names": "Clara",
            "document_type": "dni",
            "document_number": "30111222",
            "email": "clara.ramos@example.com",
        },
    )
    second_response = client.post(
        "/api/v1/patients",
        json={
            "family_name": "Suarez",
            "given_names": "Mateo",
            "document_type": "dni",
            "document_number": "40999888",
        },
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 201

    by_name = client.get("/api/v1/patients?q=ram")
    by_document = client.get("/api/v1/patients?q=999888")

    assert by_name.status_code == 200
    assert [patient["document_number"] for patient in by_name.json()] == ["30111222"]
    assert by_document.status_code == 200
    assert [patient["family_name"] for patient in by_document.json()] == ["Suarez"]


def test_doctor_can_list_patients(client: TestClient) -> None:
    client.post(
        "/api/v1/patients",
        json={"family_name": "Medica", "given_names": "Visible"},
    )

    cast(FastAPI, client.app).dependency_overrides[get_actor_context] = lambda: ActorContext(
        actor_id="doctor",
        username="doctor",
        roles=frozenset({"doctor"}),
        subject="doctor-subject",
    )

    response = client.get("/api/v1/patients")

    assert response.status_code == 200
    assert response.json()[0]["family_name"] == "Medica"


def test_doctor_can_list_a_patients_encounters(client: TestClient) -> None:
    patient_id = client.post(
        "/api/v1/patients",
        json={"family_name": "Medica", "given_names": "Expediente"},
    ).json()["id"]
    encounter_id = client.post(
        "/api/v1/encounters",
        json={"patient_id": patient_id, "chief_complaint": "Control clinico"},
    ).json()["id"]

    cast(FastAPI, client.app).dependency_overrides[get_actor_context] = lambda: ActorContext(
        actor_id="doctor",
        username="doctor",
        roles=frozenset({"doctor"}),
        subject="doctor-subject",
    )

    response = client.get(f"/api/v1/encounters?patient_id={patient_id}")

    assert response.status_code == 200
    encounter = response.json()[0]
    assert encounter["id"] == encounter_id
    assert encounter["patient_id"] == patient_id
    assert encounter["chief_complaint"] == "Control clinico"
    assert encounter["has_incident_case"] is False


def test_encounter_list_is_isolated_by_tenant_host(client: TestClient) -> None:
    patient_id = client.post(
        "/api/v1/patients",
        json={"family_name": "Tenant", "given_names": "Atencion"},
    ).json()["id"]
    client.post("/api/v1/encounters", json={"patient_id": patient_id})

    same_tenant = client.get(f"/api/v1/encounters?patient_id={patient_id}")
    other_tenant = client.get(
        f"/api/v1/encounters?patient_id={patient_id}",
        headers={"host": "centralsalud.aerosftp.com"},
    )

    assert same_tenant.status_code == 200
    assert len(same_tenant.json()) == 1
    assert other_tenant.status_code == 200
    assert other_tenant.json() == []


def test_patient_list_is_isolated_by_tenant_host(client: TestClient) -> None:
    client.post(
        "/api/v1/patients",
        json={"family_name": "Tenant", "given_names": "Paciente"},
    )

    same_tenant = client.get("/api/v1/patients")
    other_tenant = client.get(
        "/api/v1/patients",
        headers={"host": "centralsalud.aerosftp.com"},
    )

    assert same_tenant.status_code == 200
    assert len(same_tenant.json()) == 1
    assert other_tenant.status_code == 200
    assert other_tenant.json() == []


def test_updating_case_status_creates_status_event(client: TestClient) -> None:
    patient_id = client.post(
        "/api/v1/patients",
        json={"family_name": "Lopez", "given_names": "Juan"},
    ).json()["id"]
    encounter_id = client.post(
        "/api/v1/encounters",
        json={"patient_id": patient_id},
    ).json()["id"]
    incident_case_id = client.post(
        "/api/v1/incident-cases",
        json={
            "patient_id": patient_id,
            "encounter_id": encounter_id,
            "coverage_type": "art",
            "incident_type": "commute_accident",
            "incident_date": "2026-07-20",
            "art_name": "ART Norte",
        },
    ).json()["id"]

    update_response = client.patch(
        f"/api/v1/incident-cases/{incident_case_id}",
        json={"status": "in_review", "current_owner_role": "administrative"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["status"] == "in_review"

    events_response = client.get(
        f"/api/v1/incident-cases/{incident_case_id}/events",
    )
    events = events_response.json()
    assert len(events) == 2
    assert events[1]["event_type"] == "status_changed"
    assert events[1]["to_status"] == "in_review"


def test_art_case_requires_art_name(client: TestClient) -> None:
    patient_id = client.post(
        "/api/v1/patients",
        json={"family_name": "Suarez", "given_names": "Elena"},
    ).json()["id"]
    encounter_id = client.post(
        "/api/v1/encounters",
        json={"patient_id": patient_id},
    ).json()["id"]

    response = client.post(
        "/api/v1/incident-cases",
        json={
            "patient_id": patient_id,
            "encounter_id": encounter_id,
            "coverage_type": "art",
            "incident_type": "work_accident",
            "incident_date": "2026-07-20",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "art_name is required when coverage_type is 'art'"


def test_case_requires_matching_patient_and_encounter(client: TestClient) -> None:
    patient_a = client.post(
        "/api/v1/patients",
        json={"family_name": "A", "given_names": "Paciente"},
    ).json()["id"]
    patient_b = client.post(
        "/api/v1/patients",
        json={"family_name": "B", "given_names": "Paciente"},
    ).json()["id"]
    encounter_b = client.post(
        "/api/v1/encounters",
        json={"patient_id": patient_b},
    ).json()["id"]

    response = client.post(
        "/api/v1/incident-cases",
        json={
            "patient_id": patient_a,
            "encounter_id": encounter_b,
            "coverage_type": "private",
            "incident_type": "other",
            "incident_date": "2026-07-20",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "encounter does not belong to the provided patient"


def test_invalid_status_transition_is_rejected(client: TestClient) -> None:
    patient_id = client.post(
        "/api/v1/patients",
        json={"family_name": "Mendez", "given_names": "Paula"},
    ).json()["id"]
    encounter_id = client.post(
        "/api/v1/encounters",
        json={"patient_id": patient_id},
    ).json()["id"]
    incident_case_id = client.post(
        "/api/v1/incident-cases",
        json={
            "patient_id": patient_id,
            "encounter_id": encounter_id,
            "coverage_type": "art",
            "incident_type": "work_accident",
            "incident_date": "2026-07-20",
            "art_name": "ART Demo",
        },
    ).json()["id"]

    response = client.patch(
        f"/api/v1/incident-cases/{incident_case_id}",
        json={"status": "authorized"},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "invalid status transition: open -> authorized"


def test_case_filters_by_patient_status_and_date(client: TestClient) -> None:
    patient_a = client.post(
        "/api/v1/patients",
        json={"family_name": "Rios", "given_names": "Julia"},
    ).json()["id"]
    patient_b = client.post(
        "/api/v1/patients",
        json={"family_name": "Campos", "given_names": "Luis"},
    ).json()["id"]
    encounter_a = client.post(
        "/api/v1/encounters",
        json={"patient_id": patient_a},
    ).json()["id"]
    encounter_b = client.post(
        "/api/v1/encounters",
        json={"patient_id": patient_b},
    ).json()["id"]

    case_a = client.post(
        "/api/v1/incident-cases",
        json={
            "patient_id": patient_a,
            "encounter_id": encounter_a,
            "coverage_type": "art",
            "incident_type": "work_accident",
            "incident_date": "2026-07-01",
            "art_name": "ART Uno",
        },
    ).json()["id"]
    client.post(
        "/api/v1/incident-cases",
        json={
            "patient_id": patient_b,
            "encounter_id": encounter_b,
            "coverage_type": "private",
            "incident_type": "other",
            "incident_date": "2026-07-15",
        },
    )
    client.patch(
        f"/api/v1/incident-cases/{case_a}",
        json={"status": "in_review"},
    )

    response = client.get(
        f"/api/v1/incident-cases?patient_id={patient_a}&status=in_review&incident_date_from=2026-07-01&incident_date_to=2026-07-10",
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["patient_id"] == patient_a
    assert data[0]["status"] == "in_review"


def test_missing_auth_headers_is_rejected(client: TestClient) -> None:
    cast(FastAPI, client.app).dependency_overrides.pop(get_actor_context, None)
    response = client.get("/api/v1/incident-cases")

    assert response.status_code == 401
    assert response.json()["detail"] == "missing bearer token"


def test_forbidden_role_is_rejected(client: TestClient) -> None:
    cast(FastAPI, client.app).dependency_overrides[get_actor_context] = lambda: ActorContext(
        actor_id="doctor",
        username="doctor",
        roles=frozenset({"doctor"}),
        subject="doctor-subject",
    )

    response = client.post(
        "/api/v1/patients",
        json={"family_name": "Perez", "given_names": "Ana"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "insufficient role"


def test_doctor_can_add_case_event(client: TestClient) -> None:
    patient_id = client.post(
        "/api/v1/patients",
        json={"family_name": "Moreno", "given_names": "Lucia"},
    ).json()["id"]
    encounter_id = client.post(
        "/api/v1/encounters",
        json={"patient_id": patient_id},
    ).json()["id"]
    incident_case_id = client.post(
        "/api/v1/incident-cases",
        json={
            "patient_id": patient_id,
            "encounter_id": encounter_id,
            "coverage_type": "private",
            "incident_type": "other",
            "incident_date": "2026-07-21",
        },
    ).json()["id"]

    cast(FastAPI, client.app).dependency_overrides[get_actor_context] = lambda: ActorContext(
        actor_id="doctor",
        username="doctor",
        roles=frozenset({"doctor"}),
        subject="doctor-subject",
    )

    response = client.post(
        f"/api/v1/incident-cases/{incident_case_id}/events",
        json={"event_type": "clinical_note", "summary": "Paciente evaluado sin signos de alarma."},
    )

    assert response.status_code == 201
    assert response.json()["actor_id"] == "doctor"
    assert response.json()["event_type"] == "clinical_note"


def test_doctor_can_attach_case_document_reference(client: TestClient) -> None:
    patient_id = client.post(
        "/api/v1/patients",
        json={"family_name": "Mendez", "given_names": "Rocio"},
    ).json()["id"]
    encounter_id = client.post(
        "/api/v1/encounters",
        json={"patient_id": patient_id},
    ).json()["id"]
    incident_case_id = client.post(
        "/api/v1/incident-cases",
        json={
            "patient_id": patient_id,
            "encounter_id": encounter_id,
            "coverage_type": "private",
            "incident_type": "other",
            "incident_date": "2026-07-21",
        },
    ).json()["id"]

    cast(FastAPI, client.app).dependency_overrides[get_actor_context] = lambda: ActorContext(
        actor_id="doctor",
        username="doctor",
        roles=frozenset({"doctor"}),
        subject="doctor-subject",
    )

    response = client.post(
        f"/api/v1/incident-cases/{incident_case_id}/documents",
        json={
            "document_type": "clinical_attachment",
            "storage_key": "tenant/centralsalud/cases/demo/evolucion.pdf",
            "file_name": "evolucion.pdf",
            "mime_type": "application/pdf",
        },
    )

    assert response.status_code == 201
    assert response.json()["uploaded_by"] == "doctor"
    assert response.json()["file_name"] == "evolucion.pdf"


def test_doctor_can_route_case_but_not_change_status(client: TestClient) -> None:
    patient_id = client.post(
        "/api/v1/patients",
        json={"family_name": "Buzon", "given_names": "Medico"},
    ).json()["id"]
    encounter_id = client.post(
        "/api/v1/encounters",
        json={"patient_id": patient_id},
    ).json()["id"]
    incident_case_id = client.post(
        "/api/v1/incident-cases",
        json={
            "patient_id": patient_id,
            "encounter_id": encounter_id,
            "coverage_type": "private",
            "incident_type": "other",
            "incident_date": "2026-07-21",
        },
    ).json()["id"]

    cast(FastAPI, client.app).dependency_overrides[get_actor_context] = lambda: ActorContext(
        actor_id="doctor",
        username="doctor",
        roles=frozenset({"doctor"}),
        subject="doctor-subject",
    )

    route_response = client.patch(
        f"/api/v1/incident-cases/{incident_case_id}",
        json={"current_owner_role": "administrative"},
    )
    status_response = client.patch(
        f"/api/v1/incident-cases/{incident_case_id}",
        json={"status": "in_review"},
    )

    assert route_response.status_code == 200
    assert route_response.json()["current_owner_role"] == "administrative"
    assert status_response.status_code == 403


def test_case_is_isolated_by_tenant_host(client: TestClient) -> None:
    patient_id = client.post(
        "/api/v1/patients",
        json={"family_name": "Tenant", "given_names": "OpenHealth"},
    ).json()["id"]
    encounter_id = client.post(
        "/api/v1/encounters",
        json={"patient_id": patient_id},
    ).json()["id"]
    incident_case_id = client.post(
        "/api/v1/incident-cases",
        json={
            "patient_id": patient_id,
            "encounter_id": encounter_id,
            "coverage_type": "private",
            "incident_type": "other",
            "incident_date": "2026-07-21",
        },
    ).json()["id"]

    same_tenant = client.get(f"/api/v1/incident-cases/{incident_case_id}")
    other_tenant = client.get(
        f"/api/v1/incident-cases/{incident_case_id}",
        headers={"host": "centralsalud.aerosftp.com"},
    )

    assert same_tenant.status_code == 200
    assert other_tenant.status_code == 404


def test_me_returns_actor_context(client: TestClient) -> None:
    response = client.get("/api/v1/me")

    assert response.status_code == 200
    assert response.json() == {
        "actor_id": "administrative",
        "username": "administrative",
        "roles": ["administrative"],
        "tenant_slug": "openhealth",
        "tenant_name": "OpenHealth Bridge",
    }


def test_get_jwks_url_defaults_to_issuer_certs_endpoint() -> None:
    settings = Settings(oidc_issuer_url="http://localhost:8081/realms/openhealth")

    assert (
        get_jwks_url(settings)
        == "http://localhost:8081/realms/openhealth/protocol/openid-connect/certs"
    )


def test_get_jwks_url_uses_override_when_provided() -> None:
    settings = Settings(
        oidc_issuer_url="http://localhost:8081/realms/openhealth",
        oidc_jwks_url="http://keycloak:8080/realms/openhealth/protocol/openid-connect/certs",
    )

    assert (
        get_jwks_url(settings)
        == "http://keycloak:8080/realms/openhealth/protocol/openid-connect/certs"
    )
