"""Create core phase 1 tables.

Revision ID: 20260720_000001
Revises:
Create Date: 2026-07-20 17:20:00
"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260720_000001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
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


def downgrade() -> None:
    op.drop_table("case_documents")
    op.drop_table("case_events")
    op.drop_table("incident_cases")
    op.drop_table("encounters")
    op.drop_table("patients")
