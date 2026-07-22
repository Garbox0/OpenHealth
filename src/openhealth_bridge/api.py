from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal, TypeVar, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openhealth_bridge.auth import ActorContext, require_roles
from openhealth_bridge.db import get_db_session
from openhealth_bridge.models import CaseDocument, CaseEvent, Encounter, IncidentCase, Patient
from openhealth_bridge.tenancy import TenantContext, get_tenant_context

router = APIRouter(prefix="/api/v1")
SessionDep = Annotated[AsyncSession, Depends(get_db_session)]
TenantDep = Annotated[TenantContext, Depends(get_tenant_context)]
EntityModel = TypeVar("EntityModel", Patient, Encounter, IncidentCase)

CoverageType = Literal["art", "private", "unknown"]
EncounterStatus = Literal["open", "in_progress", "closed"]
IncidentType = Literal["work_accident", "commute_accident", "occupational_exposure", "other"]
IncidentStatus = Literal["open", "in_review", "authorized", "rejected", "closed"]
IncidentCaseOwnerRole = Literal["admission", "medical_auditor", "billing", "support"]
IncidentStatusFilter = Annotated[IncidentStatus | None, Query(alias="status")]

ALLOWED_STATUS_TRANSITIONS: dict[IncidentStatus, set[IncidentStatus]] = {
    "open": {"in_review"},
    "in_review": {"authorized", "rejected"},
    "authorized": {"closed"},
    "rejected": {"closed"},
    "closed": set(),
}


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class PatientCreate(BaseModel):
    family_name: str = Field(min_length=1, max_length=100)
    given_names: str = Field(min_length=1, max_length=100)
    document_type: str | None = Field(default=None, max_length=20)
    document_number: str | None = Field(default=None, max_length=50)
    birth_date: date | None = None
    phone: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=255)


class PatientRead(APIModel):
    id: UUID
    family_name: str
    given_names: str
    document_type: str | None
    document_number: str | None
    birth_date: date | None
    phone: str | None
    email: str | None
    created_at: datetime
    updated_at: datetime


class EncounterCreate(BaseModel):
    patient_id: UUID
    status: EncounterStatus = "open"
    started_at: datetime | None = None
    chief_complaint: str | None = None
    practitioner_name: str | None = Field(default=None, max_length=100)
    provider_name: str | None = Field(default=None, max_length=100)


class EncounterRead(APIModel):
    id: UUID
    patient_id: UUID
    status: str
    started_at: datetime
    chief_complaint: str | None
    practitioner_name: str | None
    provider_name: str | None
    has_incident_case: bool
    created_at: datetime
    updated_at: datetime


class IncidentCaseCreate(BaseModel):
    patient_id: UUID
    encounter_id: UUID
    coverage_type: CoverageType
    incident_type: IncidentType
    incident_date: date
    employer_name: str | None = Field(default=None, max_length=150)
    art_name: str | None = Field(default=None, max_length=150)
    claim_number: str | None = Field(default=None, max_length=100)
    reported_by: str | None = Field(default=None, max_length=100)
    current_owner_role: str | None = Field(default=None, max_length=50)
    notes: str | None = None


class IncidentCaseUpdate(BaseModel):
    status: IncidentStatus | None = None
    current_owner_role: IncidentCaseOwnerRole | None = None
    claim_number: str | None = Field(default=None, max_length=100)
    reported_by: str | None = Field(default=None, max_length=100)
    notes: str | None = None


class IncidentCaseRead(APIModel):
    id: UUID
    patient_id: UUID
    encounter_id: UUID
    coverage_type: str
    incident_type: str
    incident_date: date
    employer_name: str | None
    art_name: str | None
    claim_number: str | None
    reported_by: str | None
    status: str
    current_owner_role: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class CaseEventCreate(BaseModel):
    event_type: str = Field(min_length=1, max_length=50)
    summary: str = Field(min_length=1)
    actor_id: str | None = Field(default=None, max_length=100)


class CaseEventRead(APIModel):
    id: UUID
    incident_case_id: UUID
    event_type: str
    from_status: str | None
    to_status: str | None
    actor_id: str | None
    summary: str
    created_at: datetime


class CaseDocumentCreate(BaseModel):
    document_type: str = Field(min_length=1, max_length=50)
    storage_key: str = Field(min_length=1, max_length=255)
    file_name: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=100)
    uploaded_by: str | None = Field(default=None, max_length=100)


class CaseDocumentRead(APIModel):
    id: UUID
    incident_case_id: UUID
    document_type: str
    storage_key: str
    file_name: str
    mime_type: str
    uploaded_by: str | None
    created_at: datetime


class ActorRead(BaseModel):
    actor_id: str
    username: str
    roles: list[str]
    tenant_slug: str
    tenant_name: str


async def get_or_404(
    session: AsyncSession,
    model: type[EntityModel],
    entity_id: UUID,
) -> EntityModel:
    entity = await session.get(model, entity_id)
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return entity


async def get_tenant_entity_or_404(
    session: AsyncSession,
    model: type[EntityModel],
    entity_id: UUID,
    tenant_id: UUID,
) -> EntityModel:
    entity = await session.scalar(
        select(model).where(model.id == entity_id, model.tenant_id == tenant_id)
    )
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return entity


def build_case_event(
    incident_case_id: UUID,
    event_type: str,
    summary: str,
    *,
    tenant_id: UUID,
    from_status: str | None = None,
    to_status: str | None = None,
    actor_id: str | None = None,
) -> CaseEvent:
    return CaseEvent(
        tenant_id=tenant_id,
        incident_case_id=incident_case_id,
        event_type=event_type,
        from_status=from_status,
        to_status=to_status,
        actor_id=actor_id,
        summary=summary,
    )


def ensure_art_requirements(payload: IncidentCaseCreate | IncidentCaseUpdate) -> None:
    coverage_type = getattr(payload, "coverage_type", None)
    art_name = getattr(payload, "art_name", None)
    if coverage_type == "art" and not art_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="art_name is required when coverage_type is 'art'",
        )


def ensure_case_matches_encounter(patient_id: UUID, encounter: Encounter) -> None:
    if encounter.patient_id != patient_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="encounter does not belong to the provided patient",
        )


def ensure_status_transition(
    current_status: IncidentStatus,
    next_status: IncidentStatus,
) -> None:
    if current_status == next_status:
        return
    allowed = ALLOWED_STATUS_TRANSITIONS[current_status]
    if next_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"invalid status transition: {current_status} -> {next_status}",
        )


def serialize_encounter(encounter: Encounter) -> EncounterRead:
    return EncounterRead(
        id=encounter.id,
        patient_id=encounter.patient_id,
        status=encounter.status,
        started_at=encounter.started_at,
        chief_complaint=encounter.chief_complaint,
        practitioner_name=encounter.practitioner_name,
        provider_name=encounter.provider_name,
        has_incident_case=bool(encounter.incident_cases),
        created_at=encounter.created_at,
        updated_at=encounter.updated_at,
    )


def get_effective_actor_id(explicit_actor_id: str | None, actor: ActorContext) -> str:
    return explicit_actor_id or actor.actor_id


def ensure_update_allowed_for_actor(actor: ActorContext, changes: dict[str, object]) -> None:
    if "doctor" not in actor.roles or actor.roles.intersection(
        {"admin", "admission", "medical_auditor", "billing", "support"}
    ):
        return

    if set(changes) <= {"current_owner_role"}:
        return

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient role")


@router.get("/me", response_model=ActorRead)
async def get_me(
    actor: Annotated[
        ActorContext,
        Depends(
            require_roles(
                "admin",
                "admission",
                "medical_auditor",
                "billing",
                "support",
                "doctor",
                "patient",
            )
        ),
    ],
    tenant: TenantDep,
) -> ActorRead:
    return ActorRead(
        actor_id=actor.actor_id,
        username=actor.username,
        roles=sorted(actor.roles),
        tenant_slug=tenant.slug,
        tenant_name=tenant.display_name,
    )


@router.post("/patients", response_model=PatientRead, status_code=status.HTTP_201_CREATED)
async def create_patient(
    payload: PatientCreate,
    session: SessionDep,
    tenant: TenantDep,
    _: Annotated[ActorContext, Depends(require_roles("admin", "admission", "support"))],
) -> Patient:
    patient = Patient(tenant_id=tenant.id, **payload.model_dump())
    session.add(patient)
    await session.commit()
    await session.refresh(patient)
    return patient


@router.get("/patients/{patient_id}", response_model=PatientRead)
async def get_patient(
    patient_id: UUID,
    session: SessionDep,
    tenant: TenantDep,
    _: Annotated[
        ActorContext,
        Depends(
            require_roles(
                "admin",
                "admission",
                "medical_auditor",
                "billing",
                "support",
                "doctor",
            )
        ),
    ],
) -> Patient:
    patient = await get_tenant_entity_or_404(session, Patient, patient_id, tenant.id)
    return patient


@router.post("/encounters", response_model=EncounterRead, status_code=status.HTTP_201_CREATED)
async def create_encounter(
    payload: EncounterCreate,
    session: SessionDep,
    tenant: TenantDep,
    _: Annotated[ActorContext, Depends(require_roles("admin", "admission", "support"))],
) -> EncounterRead:
    await get_tenant_entity_or_404(session, Patient, payload.patient_id, tenant.id)

    encounter = Encounter(tenant_id=tenant.id, **payload.model_dump())
    session.add(encounter)
    await session.commit()
    await session.refresh(encounter, attribute_names=["incident_cases"])
    return serialize_encounter(encounter)


@router.get("/encounters/{encounter_id}", response_model=EncounterRead)
async def get_encounter(
    encounter_id: UUID,
    session: SessionDep,
    tenant: TenantDep,
    _: Annotated[
        ActorContext,
        Depends(
            require_roles(
                "admin",
                "admission",
                "medical_auditor",
                "billing",
                "support",
                "doctor",
            )
        ),
    ],
) -> EncounterRead:
    encounter = await get_tenant_entity_or_404(session, Encounter, encounter_id, tenant.id)
    await session.refresh(encounter, attribute_names=["incident_cases"])
    return serialize_encounter(encounter)


@router.post(
    "/incident-cases",
    response_model=IncidentCaseRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_incident_case(
    payload: IncidentCaseCreate,
    session: SessionDep,
    tenant: TenantDep,
    actor: Annotated[ActorContext, Depends(require_roles("admin", "admission", "support"))],
) -> IncidentCase:
    await get_tenant_entity_or_404(session, Patient, payload.patient_id, tenant.id)
    encounter = await get_tenant_entity_or_404(session, Encounter, payload.encounter_id, tenant.id)
    ensure_case_matches_encounter(payload.patient_id, encounter)
    ensure_art_requirements(payload)

    incident_case = IncidentCase(tenant_id=tenant.id, status="open", **payload.model_dump())
    session.add(incident_case)
    await session.flush()
    session.add(
        build_case_event(
            incident_case.id,
            "case_created",
            "Case created",
            tenant_id=tenant.id,
            to_status=incident_case.status,
            actor_id=actor.actor_id,
        )
    )
    await session.commit()
    await session.refresh(incident_case)
    return incident_case


@router.get("/incident-cases", response_model=list[IncidentCaseRead])
async def list_incident_cases(
    session: SessionDep,
    tenant: TenantDep,
    _: Annotated[
        ActorContext,
        Depends(
            require_roles(
                "admin",
                "admission",
                "medical_auditor",
                "billing",
                "support",
                "doctor",
            )
        ),
    ],
    patient_id: UUID | None = None,
    encounter_id: UUID | None = None,
    status_filter: IncidentStatusFilter = None,
    coverage_type: CoverageType | None = None,
    incident_type: IncidentType | None = None,
    incident_date_from: date | None = None,
    incident_date_to: date | None = None,
) -> list[IncidentCase]:
    statement = select(IncidentCase).where(IncidentCase.tenant_id == tenant.id)

    if patient_id is not None:
        statement = statement.where(IncidentCase.patient_id == patient_id)
    if encounter_id is not None:
        statement = statement.where(IncidentCase.encounter_id == encounter_id)
    if status_filter is not None:
        statement = statement.where(IncidentCase.status == status_filter)
    if coverage_type is not None:
        statement = statement.where(IncidentCase.coverage_type == coverage_type)
    if incident_type is not None:
        statement = statement.where(IncidentCase.incident_type == incident_type)
    if incident_date_from is not None:
        statement = statement.where(IncidentCase.incident_date >= incident_date_from)
    if incident_date_to is not None:
        statement = statement.where(IncidentCase.incident_date <= incident_date_to)

    result = await session.scalars(statement.order_by(IncidentCase.created_at.desc()))
    return list(result.all())


@router.get("/incident-cases/{incident_case_id}", response_model=IncidentCaseRead)
async def get_incident_case(
    incident_case_id: UUID,
    session: SessionDep,
    tenant: TenantDep,
    _: Annotated[
        ActorContext,
        Depends(
            require_roles(
                "admin",
                "admission",
                "medical_auditor",
                "billing",
                "support",
                "doctor",
            )
        ),
    ],
) -> IncidentCase:
    incident_case = await get_tenant_entity_or_404(
        session, IncidentCase, incident_case_id, tenant.id
    )
    return incident_case


@router.patch("/incident-cases/{incident_case_id}", response_model=IncidentCaseRead)
async def update_incident_case(
    incident_case_id: UUID,
    payload: IncidentCaseUpdate,
    session: SessionDep,
    tenant: TenantDep,
    actor: Annotated[
        ActorContext,
        Depends(
            require_roles(
                "admin",
                "admission",
                "medical_auditor",
                "billing",
                "support",
                "doctor",
            )
        ),
    ],
) -> IncidentCase:
    incident_case = await get_tenant_entity_or_404(
        session, IncidentCase, incident_case_id, tenant.id
    )
    changes = payload.model_dump(exclude_unset=True)
    ensure_update_allowed_for_actor(actor, changes)
    previous_status = cast(IncidentStatus, incident_case.status)

    if "status" in changes:
        ensure_status_transition(previous_status, cast(IncidentStatus, changes["status"]))

    for field, value in changes.items():
        setattr(incident_case, field, value)

    if "status" in changes and previous_status != incident_case.status:
        session.add(
            build_case_event(
                incident_case.id,
                "status_changed",
                f"Status changed from {previous_status} to {incident_case.status}",
                tenant_id=tenant.id,
                from_status=previous_status,
                to_status=incident_case.status,
                actor_id=actor.actor_id,
            )
        )

    await session.commit()
    await session.refresh(incident_case)
    return incident_case


@router.post(
    "/incident-cases/{incident_case_id}/events",
    response_model=CaseEventRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_case_event(
    incident_case_id: UUID,
    payload: CaseEventCreate,
    session: SessionDep,
    tenant: TenantDep,
    actor: Annotated[
        ActorContext,
        Depends(
            require_roles("admin", "admission", "medical_auditor", "billing", "support", "doctor")
        ),
    ],
) -> CaseEvent:
    await get_tenant_entity_or_404(session, IncidentCase, incident_case_id, tenant.id)

    event = build_case_event(
        incident_case_id,
        payload.event_type,
        payload.summary,
        tenant_id=tenant.id,
        actor_id=get_effective_actor_id(payload.actor_id, actor),
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return event


@router.get("/incident-cases/{incident_case_id}/events", response_model=list[CaseEventRead])
async def list_case_events(
    incident_case_id: UUID,
    session: SessionDep,
    tenant: TenantDep,
    _: Annotated[
        ActorContext,
        Depends(
            require_roles(
                "admin",
                "admission",
                "medical_auditor",
                "billing",
                "support",
                "doctor",
            )
        ),
    ],
) -> list[CaseEvent]:
    await get_tenant_entity_or_404(session, IncidentCase, incident_case_id, tenant.id)
    result = await session.scalars(
        select(CaseEvent)
        .where(CaseEvent.incident_case_id == incident_case_id, CaseEvent.tenant_id == tenant.id)
        .order_by(CaseEvent.created_at.asc())
    )
    return list(result.all())


@router.post(
    "/incident-cases/{incident_case_id}/documents",
    response_model=CaseDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_case_document(
    incident_case_id: UUID,
    payload: CaseDocumentCreate,
    session: SessionDep,
    tenant: TenantDep,
    actor: Annotated[
        ActorContext,
        Depends(
            require_roles(
                "admin",
                "admission",
                "medical_auditor",
                "billing",
                "support",
                "doctor",
            )
        ),
    ],
) -> CaseDocument:
    await get_tenant_entity_or_404(session, IncidentCase, incident_case_id, tenant.id)

    document = CaseDocument(
        tenant_id=tenant.id,
        incident_case_id=incident_case_id,
        **(
            payload.model_dump()
            | {"uploaded_by": get_effective_actor_id(payload.uploaded_by, actor)}
        ),
    )
    session.add(document)
    await session.commit()
    await session.refresh(document)
    return document


@router.get(
    "/incident-cases/{incident_case_id}/documents",
    response_model=list[CaseDocumentRead],
)
async def list_case_documents(
    incident_case_id: UUID,
    session: SessionDep,
    tenant: TenantDep,
    _: Annotated[
        ActorContext,
        Depends(
            require_roles(
                "admin",
                "admission",
                "medical_auditor",
                "billing",
                "support",
                "doctor",
            )
        ),
    ],
) -> list[CaseDocument]:
    await get_tenant_entity_or_404(session, IncidentCase, incident_case_id, tenant.id)
    result = await session.scalars(
        select(CaseDocument)
        .where(
            CaseDocument.incident_case_id == incident_case_id,
            CaseDocument.tenant_id == tenant.id,
        )
        .order_by(CaseDocument.created_at.desc())
    )
    return list(result.all())


@router.delete("/incident-cases/{incident_case_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_incident_case(
    incident_case_id: UUID,
    session: SessionDep,
    tenant: TenantDep,
    _: Annotated[ActorContext, Depends(require_roles("admin"))],
) -> Response:
    incident_case = await get_tenant_entity_or_404(
        session, IncidentCase, incident_case_id, tenant.id
    )
    await session.delete(incident_case)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
