"""Initial evidence and trust schema.

Revision ID: 0001
Revises: None
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)


def tenant_columns() -> list[sa.Column[object]]:
    return [sa.Column("org_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)]


def upgrade() -> None:
    op.execute("create extension if not exists vector")
    op.execute("create extension if not exists pgcrypto")

    op.create_table(
        "organizations",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "users",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *tenant_columns(),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.String(500), nullable=False),
        sa.Column("role", sa.String(40), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("org_id", "email", name="uq_users_org_email"),
    )
    op.create_table(
        "roles",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *tenant_columns(),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(40), server_default="draft", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "requirements",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *tenant_columns(),
        sa.Column("role_id", UUID, sa.ForeignKey("roles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(240), nullable=False),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("evidence_expectation", sa.Text(), nullable=False),
        sa.Column("approved", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.CheckConstraint("weight >= 0 and weight <= 1", name="requirement_weight_range"),
    )
    op.create_table(
        "candidates",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *tenant_columns(),
        sa.Column("role_id", UUID, sa.ForeignKey("roles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("external_reference", sa.String(200)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "documents",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *tenant_columns(),
        sa.Column("candidate_id", UUID, sa.ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("object_key", sa.String(1_000), nullable=False),
        sa.Column("original_filename", sa.String(500), nullable=False),
        sa.Column("media_type", sa.String(200), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("scan_status", sa.String(40), server_default="quarantined", nullable=False),
        sa.Column("parser_version", sa.String(100)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("org_id", "sha256", name="uq_documents_org_sha256"),
    )
    op.create_table(
        "chunks",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *tenant_columns(),
        sa.Column("document_id", UUID, sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("page_number", sa.Integer()),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("attributes", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("embedding", Vector(1024)),
        sa.UniqueConstraint("document_id", "ordinal", name="uq_chunks_document_ordinal"),
    )
    op.create_table(
        "model_runs",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *tenant_columns(),
        sa.Column("operation", sa.String(100), nullable=False),
        sa.Column("model_name", sa.String(200), nullable=False),
        sa.Column("prompt_version", sa.String(100), nullable=False),
        sa.Column("input_hash", sa.String(64), nullable=False),
        sa.Column("output_hash", sa.String(64), nullable=False),
        sa.Column("token_usage", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "evidence_refs",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *tenant_columns(),
        sa.Column("document_id", UUID, sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("page_number", sa.Integer()),
        sa.Column("start_offset", sa.Integer()),
        sa.Column("end_offset", sa.Integer()),
        sa.Column("bounding_box", postgresql.ARRAY(sa.Float())),
        sa.Column("excerpt", sa.Text(), nullable=False),
        sa.Column("excerpt_sha256", sa.String(64), nullable=False),
        sa.Column("parser_version", sa.String(100), nullable=False),
        sa.CheckConstraint(
            "end_offset is null or start_offset is null or end_offset >= start_offset",
            name="evidence_offset_order",
        ),
    )
    op.create_table(
        "claims",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *tenant_columns(),
        sa.Column("candidate_id", UUID, sa.ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("predicate", sa.String(120), nullable=False),
        sa.Column("object_text", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("evidence_ids", postgresql.ARRAY(UUID), nullable=False),
        sa.Column("model_run_id", UUID, sa.ForeignKey("model_runs.id"), nullable=False),
        sa.CheckConstraint("confidence >= 0 and confidence <= 1", name="claim_confidence_range"),
    )
    op.create_table(
        "claim_edges",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *tenant_columns(),
        sa.Column("source_claim_id", UUID, sa.ForeignKey("claims.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_claim_id", UUID, sa.ForeignKey("claims.id", ondelete="CASCADE"), nullable=False),
        sa.Column("relation", sa.String(40), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.CheckConstraint("source_claim_id <> target_claim_id", name="claim_edge_not_self"),
    )
    op.create_table(
        "requirement_matches",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *tenant_columns(),
        sa.Column("candidate_id", UUID, sa.ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("requirement_id", UUID, sa.ForeignKey("requirements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(40), nullable=False),
        sa.Column("evidence_strength", sa.String(40), nullable=False),
        sa.Column("evidence_ids", postgresql.ARRAY(UUID), server_default="{}", nullable=False),
        sa.Column("reason_codes", postgresql.ARRAY(sa.String(100)), server_default="{}", nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("rubric_version", sa.String(50), nullable=False),
        sa.UniqueConstraint("candidate_id", "requirement_id", name="uq_matches_candidate_requirement"),
    )
    op.create_table(
        "trust_packets",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *tenant_columns(),
        sa.Column("role_id", UUID, sa.ForeignKey("roles.id"), nullable=False),
        sa.Column("candidate_id", UUID, sa.ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("packet", postgresql.JSONB(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("released", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("released_by", UUID, sa.ForeignKey("users.id")),
        sa.Column("released_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("candidate_id", "version", name="uq_packets_candidate_version"),
    )
    op.create_table(
        "workflow_runs",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *tenant_columns(),
        sa.Column("role_id", UUID, sa.ForeignKey("roles.id"), nullable=False),
        sa.Column("candidate_ids", postgresql.ARRAY(UUID), nullable=False),
        sa.Column("status", sa.String(40), nullable=False),
        sa.Column("version", sa.Integer(), server_default="0", nullable=False),
        sa.Column("rubric_version", sa.String(50), nullable=False),
        sa.Column("ontology_version", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "workflow_steps",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *tenant_columns(),
        sa.Column("run_id", UUID, sa.ForeignKey("workflow_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stage", sa.String(40), nullable=False),
        sa.Column("run_version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(40), nullable=False),
        sa.Column("artifact_key", sa.String(1_000)),
        sa.Column("error", postgresql.JSONB()),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("run_id", "stage", "run_version", name="uq_steps_run_stage_version"),
    )
    op.create_table(
        "audit_events",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *tenant_columns(),
        sa.Column("actor_id", UUID),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("object_type", sa.String(100), nullable=False),
        sa.Column("object_id", UUID, nullable=False),
        sa.Column("before", postgresql.JSONB()),
        sa.Column("after", postgresql.JSONB()),
        sa.Column("trace_id", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "outbox_events",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *tenant_columns(),
        sa.Column("topic", sa.String(100), nullable=False),
        sa.Column("aggregate_id", UUID, nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    for table in (
        "users", "roles", "requirements", "candidates", "documents", "chunks", "model_runs",
        "evidence_refs", "claims", "claim_edges", "requirement_matches", "trust_packets",
        "workflow_runs", "workflow_steps", "audit_events", "outbox_events",
    ):
        op.create_index(f"ix_{table}_org_id", table, ["org_id"])


def downgrade() -> None:
    for table in (
        "outbox_events", "audit_events", "workflow_steps", "workflow_runs", "trust_packets",
        "requirement_matches", "claim_edges", "claims", "evidence_refs", "model_runs", "chunks",
        "documents", "candidates", "requirements", "roles", "users", "organizations",
    ):
        op.drop_table(table)

