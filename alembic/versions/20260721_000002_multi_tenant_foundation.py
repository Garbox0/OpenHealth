"""Add multi-tenant foundation.

Revision ID: 20260721_000002
Revises: 20260720_000001
Create Date: 2026-07-21 09:10:00
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260721_000002"
down_revision = "20260720_000001"
branch_labels = None
depends_on = None

SYSTEM_ACTORS = ("admin", "admission", "auditor", "billing", "doctor", "support")
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
CORE_TABLES = (
    "patients",
    "encounters",
    "incident_cases",
    "case_events",
    "case_documents",
)


def get_inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def has_table(table_name: str) -> bool:
    return get_inspector().has_table(table_name)


def has_column(table_name: str, column_name: str) -> bool:
    if not has_table(table_name):
        return False
    return column_name in {column["name"] for column in get_inspector().get_columns(table_name)}


def has_index(table_name: str, index_name: str) -> bool:
    if not has_table(table_name):
        return False
    return index_name in {index["name"] for index in get_inspector().get_indexes(table_name)}


def has_foreign_key(table_name: str, fk_name: str) -> bool:
    if not has_table(table_name):
        return False
    return fk_name in {fk["name"] for fk in get_inspector().get_foreign_keys(table_name)}


def ensure_core_tables() -> None:
    if not has_table("patients"):
        op.create_table(
            "patients",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("document_type", sa.String(length=20), nullable=True),
            sa.Column("document_number", sa.String(length=50), nullable=True),
            sa.Column("family_name", sa.String(length=100), nullable=False),
            sa.Column("given_names", sa.String(length=100), nullable=False),
            sa.Column("birth_date", sa.Date(), nullable=True),
            sa.Column("phone", sa.String(length=50), nullable=True),
            sa.Column("email", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    if not has_table("encounters"):
        op.create_table(
            "encounters",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("patient_id", sa.Uuid(), nullable=False),
            sa.Column("status", sa.String(length=30), nullable=False),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("chief_complaint", sa.Text(), nullable=True),
            sa.Column("practitioner_name", sa.String(length=100), nullable=True),
            sa.Column("provider_name", sa.String(length=100), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["patient_id"], ["patients.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not has_table("incident_cases"):
        op.create_table(
            "incident_cases",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("patient_id", sa.Uuid(), nullable=False),
            sa.Column("encounter_id", sa.Uuid(), nullable=False),
            sa.Column("coverage_type", sa.String(length=30), nullable=False),
            sa.Column("incident_type", sa.String(length=30), nullable=False),
            sa.Column("incident_date", sa.Date(), nullable=False),
            sa.Column("employer_name", sa.String(length=150), nullable=True),
            sa.Column("art_name", sa.String(length=150), nullable=True),
            sa.Column("claim_number", sa.String(length=100), nullable=True),
            sa.Column("reported_by", sa.String(length=100), nullable=True),
            sa.Column("status", sa.String(length=30), nullable=False),
            sa.Column("current_owner_role", sa.String(length=50), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["encounter_id"], ["encounters.id"]),
            sa.ForeignKeyConstraint(["patient_id"], ["patients.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not has_table("case_events"):
        op.create_table(
            "case_events",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("incident_case_id", sa.Uuid(), nullable=False),
            sa.Column("event_type", sa.String(length=50), nullable=False),
            sa.Column("from_status", sa.String(length=30), nullable=True),
            sa.Column("to_status", sa.String(length=30), nullable=True),
            sa.Column("actor_id", sa.String(length=100), nullable=True),
            sa.Column("summary", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["incident_case_id"], ["incident_cases.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not has_table("case_documents"):
        op.create_table(
            "case_documents",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("incident_case_id", sa.Uuid(), nullable=False),
            sa.Column("document_type", sa.String(length=50), nullable=False),
            sa.Column("storage_key", sa.String(length=255), nullable=False),
            sa.Column("file_name", sa.String(length=255), nullable=False),
            sa.Column("mime_type", sa.String(length=100), nullable=False),
            sa.Column("uploaded_by", sa.String(length=100), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["incident_case_id"], ["incident_cases.id"]),
            sa.PrimaryKeyConstraint("id"),
        )


def ensure_tenant_tables() -> None:
    if not has_table("tenants"):
        op.create_table(
            "tenants",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("slug", sa.String(length=80), nullable=False),
            sa.Column("hostname", sa.String(length=255), nullable=False),
            sa.Column("display_name", sa.String(length=150), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("hostname"),
            sa.UniqueConstraint("slug"),
        )

    if not has_table("tenant_memberships"):
        op.create_table(
            "tenant_memberships",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("tenant_id", sa.Uuid(), nullable=False),
            sa.Column("actor_id", sa.String(length=100), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("tenant_id", "actor_id", name="uq_tenant_memberships_actor"),
        )


def add_tenant_column(table_name: str) -> None:
    if not has_column(table_name, "tenant_id"):
        op.add_column(table_name, sa.Column("tenant_id", sa.Uuid(), nullable=True))


def create_tenant_foreign_key(table_name: str, fk_name: str) -> None:
    if not has_foreign_key(table_name, fk_name):
        op.create_foreign_key(fk_name, table_name, "tenants", ["tenant_id"], ["id"])


def create_tenant_index(table_name: str, index_name: str) -> None:
    if not has_index(table_name, index_name):
        op.create_index(index_name, table_name, ["tenant_id"])


def seed_system_tenants() -> uuid.UUID:
    tenant_table = sa.table(
        "tenants",
        sa.column("id", sa.Uuid()),
        sa.column("slug", sa.String()),
        sa.column("hostname", sa.String()),
        sa.column("display_name", sa.String()),
        sa.column("is_active", sa.Boolean()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    membership_table = sa.table(
        "tenant_memberships",
        sa.column("id", sa.Uuid()),
        sa.column("tenant_id", sa.Uuid()),
        sa.column("actor_id", sa.String()),
        sa.column("is_active", sa.Boolean()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    connection = op.get_bind()
    now = datetime.now(timezone.utc)

    existing_tenants = {
        row.slug: row.id
        for row in connection.execute(sa.select(tenant_table.c.slug, tenant_table.c.id))
    }

    for item in SYSTEM_TENANTS:
        tenant_id = existing_tenants.get(item["slug"], uuid.uuid4())
        if item["slug"] not in existing_tenants:
            connection.execute(
                sa.insert(tenant_table).values(
                    id=tenant_id,
                    slug=item["slug"],
                    hostname=item["hostname"],
                    display_name=item["display_name"],
                    is_active=True,
                    created_at=now,
                    updated_at=now,
                )
            )
        else:
            connection.execute(
                sa.update(tenant_table)
                .where(tenant_table.c.id == tenant_id)
                .values(
                    hostname=item["hostname"],
                    display_name=item["display_name"],
                    is_active=True,
                    updated_at=now,
                )
            )
        existing_tenants[item["slug"]] = tenant_id

    existing_memberships = {
        (row.tenant_id, row.actor_id)
        for row in connection.execute(
            sa.select(membership_table.c.tenant_id, membership_table.c.actor_id)
        )
    }

    for tenant_id in existing_tenants.values():
        for actor_id in SYSTEM_ACTORS:
            membership_key = (tenant_id, actor_id)
            if membership_key in existing_memberships:
                continue
            connection.execute(
                sa.insert(membership_table).values(
                    id=uuid.uuid4(),
                    tenant_id=tenant_id,
                    actor_id=actor_id,
                    is_active=True,
                    created_at=now,
                    updated_at=now,
                )
            )

    return existing_tenants["openhealth"]


def upgrade() -> None:
    ensure_core_tables()
    ensure_tenant_tables()

    for table_name in CORE_TABLES:
        add_tenant_column(table_name)

    openhealth_id = seed_system_tenants()

    for table_name in CORE_TABLES:
        op.execute(
            sa.text(
                f"UPDATE {table_name} SET tenant_id = :tenant_id WHERE tenant_id IS NULL"
            ).bindparams(tenant_id=openhealth_id)
        )

    op.alter_column("patients", "tenant_id", nullable=False)
    op.alter_column("encounters", "tenant_id", nullable=False)
    op.alter_column("incident_cases", "tenant_id", nullable=False)
    op.alter_column("case_events", "tenant_id", nullable=False)
    op.alter_column("case_documents", "tenant_id", nullable=False)

    create_tenant_foreign_key("patients", "fk_patients_tenant_id")
    create_tenant_foreign_key("encounters", "fk_encounters_tenant_id")
    create_tenant_foreign_key("incident_cases", "fk_incident_cases_tenant_id")
    create_tenant_foreign_key("case_events", "fk_case_events_tenant_id")
    create_tenant_foreign_key("case_documents", "fk_case_documents_tenant_id")

    create_tenant_index("patients", "ix_patients_tenant_id")
    create_tenant_index("encounters", "ix_encounters_tenant_id")
    create_tenant_index("incident_cases", "ix_incident_cases_tenant_id")
    create_tenant_index("case_events", "ix_case_events_tenant_id")
    create_tenant_index("case_documents", "ix_case_documents_tenant_id")


def downgrade() -> None:
    op.drop_index("ix_case_documents_tenant_id", table_name="case_documents")
    op.drop_index("ix_case_events_tenant_id", table_name="case_events")
    op.drop_index("ix_incident_cases_tenant_id", table_name="incident_cases")
    op.drop_index("ix_encounters_tenant_id", table_name="encounters")
    op.drop_index("ix_patients_tenant_id", table_name="patients")

    op.drop_constraint("fk_case_documents_tenant_id", "case_documents", type_="foreignkey")
    op.drop_constraint("fk_case_events_tenant_id", "case_events", type_="foreignkey")
    op.drop_constraint("fk_incident_cases_tenant_id", "incident_cases", type_="foreignkey")
    op.drop_constraint("fk_encounters_tenant_id", "encounters", type_="foreignkey")
    op.drop_constraint("fk_patients_tenant_id", "patients", type_="foreignkey")

    op.drop_column("case_documents", "tenant_id")
    op.drop_column("case_events", "tenant_id")
    op.drop_column("incident_cases", "tenant_id")
    op.drop_column("encounters", "tenant_id")
    op.drop_column("patients", "tenant_id")

    op.drop_table("tenant_memberships")
    op.drop_table("tenants")
