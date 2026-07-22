"""Simplify initial case routing roles.

Revision ID: 20260722_000003
Revises: 20260721_000002
Create Date: 2026-07-22 00:00:03
"""

from __future__ import annotations

from alembic import op

revision = "20260722_000003"
down_revision = "20260721_000002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE incident_cases
        SET current_owner_role = 'administrative'
        WHERE current_owner_role IN ('admission', 'medical_auditor', 'billing', 'support')
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE incident_cases
        SET current_owner_role = 'admission'
        WHERE current_owner_role = 'administrative'
        """
    )
