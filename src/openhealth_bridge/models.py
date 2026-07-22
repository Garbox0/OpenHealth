from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )


class Tenant(TimestampMixin, Base):
    __tablename__ = "tenants"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    hostname: Mapped[str] = mapped_column(String(255), unique=True)
    display_name: Mapped[str] = mapped_column(String(150))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    memberships: Mapped[list[TenantMembership]] = relationship(back_populates="tenant")
    patients: Mapped[list[Patient]] = relationship(back_populates="tenant")
    encounters: Mapped[list[Encounter]] = relationship(back_populates="tenant")
    incident_cases: Mapped[list[IncidentCase]] = relationship(back_populates="tenant")
    events: Mapped[list[CaseEvent]] = relationship(back_populates="tenant")
    documents: Mapped[list[CaseDocument]] = relationship(back_populates="tenant")


class TenantMembership(TimestampMixin, Base):
    __tablename__ = "tenant_memberships"
    __table_args__ = (
        UniqueConstraint("tenant_id", "actor_id", name="uq_tenant_memberships_actor"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    actor_id: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    tenant: Mapped[Tenant] = relationship(back_populates="memberships")


class Patient(TimestampMixin, Base):
    __tablename__ = "patients"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    document_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    document_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    family_name: Mapped[str] = mapped_column(String(100))
    given_names: Mapped[str] = mapped_column(String(100))
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    tenant: Mapped[Tenant] = relationship(back_populates="patients")
    encounters: Mapped[list[Encounter]] = relationship(back_populates="patient")
    incident_cases: Mapped[list[IncidentCase]] = relationship(back_populates="patient")


class Encounter(TimestampMixin, Base):
    __tablename__ = "encounters"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    patient_id: Mapped[UUID] = mapped_column(ForeignKey("patients.id"))
    status: Mapped[str] = mapped_column(String(30), default="open")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    chief_complaint: Mapped[str | None] = mapped_column(Text, nullable=True)
    practitioner_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    provider_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    tenant: Mapped[Tenant] = relationship(back_populates="encounters")
    patient: Mapped[Patient] = relationship(back_populates="encounters")
    incident_cases: Mapped[list[IncidentCase]] = relationship(back_populates="encounter")


class IncidentCase(TimestampMixin, Base):
    __tablename__ = "incident_cases"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    patient_id: Mapped[UUID] = mapped_column(ForeignKey("patients.id"))
    encounter_id: Mapped[UUID] = mapped_column(ForeignKey("encounters.id"))
    coverage_type: Mapped[str] = mapped_column(String(30))
    incident_type: Mapped[str] = mapped_column(String(30))
    incident_date: Mapped[date] = mapped_column(Date)
    employer_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    art_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    claim_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    reported_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="open")
    current_owner_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    tenant: Mapped[Tenant] = relationship(back_populates="incident_cases")
    patient: Mapped[Patient] = relationship(back_populates="incident_cases")
    encounter: Mapped[Encounter] = relationship(back_populates="incident_cases")
    events: Mapped[list[CaseEvent]] = relationship(back_populates="incident_case")
    documents: Mapped[list[CaseDocument]] = relationship(back_populates="incident_case")


class CaseEvent(Base):
    __tablename__ = "case_events"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    incident_case_id: Mapped[UUID] = mapped_column(ForeignKey("incident_cases.id"))
    event_type: Mapped[str] = mapped_column(String(50))
    from_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    actor_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    summary: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    tenant: Mapped[Tenant] = relationship(back_populates="events")
    incident_case: Mapped[IncidentCase] = relationship(back_populates="events")


class CaseDocument(Base):
    __tablename__ = "case_documents"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    incident_case_id: Mapped[UUID] = mapped_column(ForeignKey("incident_cases.id"))
    document_type: Mapped[str] = mapped_column(String(50))
    storage_key: Mapped[str] = mapped_column(String(255))
    file_name: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    uploaded_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    tenant: Mapped[Tenant] = relationship(back_populates="documents")
    incident_case: Mapped[IncidentCase] = relationship(back_populates="documents")
