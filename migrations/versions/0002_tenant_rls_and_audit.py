"""Tenant row-level security and append-only audit events.

Revision ID: 0002
Revises: 0001
"""
from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TENANT_TABLES = (
    "users", "roles", "requirements", "candidates", "documents", "chunks", "model_runs",
    "evidence_refs", "claims", "claim_edges", "requirement_matches", "trust_packets",
    "workflow_runs", "workflow_steps", "audit_events", "outbox_events",
)


def upgrade() -> None:
    for table in TENANT_TABLES:
        op.execute(f'alter table "{table}" enable row level security')
        op.execute(f'alter table "{table}" force row level security')
        op.execute(
            f'''create policy tenant_isolation on "{table}"
                using (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
                with check (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)'''
        )

    op.execute(
        """
        create function prevent_audit_event_mutation() returns trigger
        language plpgsql as $$
        begin
          raise exception 'audit_events are append-only';
        end;
        $$
        """
    )
    op.execute(
        """
        create trigger audit_events_append_only
        before update or delete on audit_events
        for each row execute function prevent_audit_event_mutation()
        """
    )


def downgrade() -> None:
    op.execute("drop trigger if exists audit_events_append_only on audit_events")
    op.execute("drop function if exists prevent_audit_event_mutation")
    for table in reversed(TENANT_TABLES):
        op.execute(f'drop policy if exists tenant_isolation on "{table}"')
        op.execute(f'alter table "{table}" disable row level security')

