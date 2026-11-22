from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:16]}"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SyntheticPrincipal(Base):
    __tablename__ = "synthetic_principals"
    principal_id: Mapped[str] = mapped_column(String, primary_key=True)
    username: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    password_salt: Mapped[str] = mapped_column(String, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    principal_id: Mapped[str] = mapped_column(ForeignKey("synthetic_principals.principal_id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Workspace(Base):
    __tablename__ = "workspaces"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WorkspaceMembership(Base):
    __tablename__ = "workspace_memberships"
    __table_args__ = (UniqueConstraint("workspace_id", "principal_id", name="uq_workspace_principal"),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    principal_id: Mapped[str] = mapped_column(String, index=True)
    member_class: Mapped[str] = mapped_column(String, nullable=False)
    permissions: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Role(Base):
    __tablename__ = "roles"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    intake_mode: Mapped[str] = mapped_column(String, nullable=False)
    source_revision: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    compiled_source_revision: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class QuestionnaireSession(Base):
    __tablename__ = "questionnaire_sessions"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), index=True)
    state: Mapped[str] = mapped_column(String, default="IN_PROGRESS")
    revision: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    compiled_revision: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class QuestionnaireAnswer(Base):
    __tablename__ = "questionnaire_answers"
    __table_args__ = (UniqueConstraint("questionnaire_id", "key", "version", name="uq_questionnaire_key_version"),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), index=True)
    questionnaire_id: Mapped[str] = mapped_column(ForeignKey("questionnaire_sessions.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String, nullable=False)
    value: Mapped[Any] = mapped_column(JSON, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    content_hash: Mapped[str] = mapped_column(String, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    supersedes_id: Mapped[str | None] = mapped_column(ForeignKey("questionnaire_answers.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ProposedRequirement(Base):
    __tablename__ = "proposed_requirements"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), index=True)
    questionnaire_id: Mapped[str | None] = mapped_column(ForeignKey("questionnaire_sessions.id", ondelete="SET NULL"), index=True)
    questionnaire_revision: Mapped[int | None] = mapped_column(Integer)
    source_revision: Mapped[int | None] = mapped_column(Integer)
    source_document_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    source_wordings: Mapped[list[str]] = mapped_column(JSON, default=list)
    extraction_method: Mapped[str] = mapped_column(String, default="QUESTIONNAIRE_A1")
    actual_work: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    reason_state: Mapped[str] = mapped_column(String, default="UNKNOWN")
    criticality: Mapped[str] = mapped_column(String, default="UNKNOWN")
    alternatives: Mapped[list[str]] = mapped_column(JSON, default=list)
    acceptable_proof: Mapped[str | None] = mapped_column(Text)
    proof_state: Mapped[str] = mapped_column(String, default="UNKNOWN")
    uncertainty: Mapped[str | None] = mapped_column(Text)
    source_answer_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String, default="PROPOSED")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FieldSupportLink(Base):
    __tablename__ = "field_support_links"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    proposed_requirement_id: Mapped[str] = mapped_column(ForeignKey("proposed_requirements.id", ondelete="CASCADE"), index=True)
    field_name: Mapped[str] = mapped_column(String, nullable=False)
    source_type: Mapped[str] = mapped_column(String, nullable=False)
    source_id: Mapped[str] = mapped_column(String, nullable=False)
    relation: Mapped[str] = mapped_column(String, nullable=False)
    semantic_support: Mapped[str] = mapped_column(String, default="NOT_ESTABLISHED")


class ApprovedRequirement(Base):
    __tablename__ = "approved_requirements"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), index=True)
    proposed_requirement_id: Mapped[str] = mapped_column(ForeignKey("proposed_requirements.id", ondelete="CASCADE"), unique=True)
    questionnaire_id: Mapped[str | None] = mapped_column(String, index=True)
    questionnaire_revision: Mapped[int | None] = mapped_column(Integer)
    source_revision: Mapped[int | None] = mapped_column(Integer)
    source_document_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    source_wordings: Mapped[list[str]] = mapped_column(JSON, default=list)
    extraction_method: Mapped[str] = mapped_column(String, default="QUESTIONNAIRE_A1")
    actual_work: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    reason_state: Mapped[str] = mapped_column(String, default="UNKNOWN")
    criticality: Mapped[str] = mapped_column(String, default="UNKNOWN")
    alternatives: Mapped[list[str]] = mapped_column(JSON, default=list)
    acceptable_proof: Mapped[str | None] = mapped_column(Text)
    proof_state: Mapped[str] = mapped_column(String, default="UNKNOWN")
    uncertainty: Mapped[str | None] = mapped_column(Text)
    source_answer_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    approved_by: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class HumanReview(Base):
    __tablename__ = "human_reviews"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    entity_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    decision: Mapped[str] = mapped_column(String, nullable=False)
    reviewer_id: Mapped[str] = mapped_column(String, nullable=False)
    rationale: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ContextVersion(Base):
    __tablename__ = "context_versions"
    __table_args__ = (UniqueConstraint("role_id", "version_number", name="uq_role_context_version"),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), index=True)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    pattern_state: Mapped[str] = mapped_column(String, nullable=False)
    approved_requirement_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    approved_review_prompt_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_by: Mapped[str] = mapped_column(String, nullable=False)
    supersedes_id: Mapped[str | None] = mapped_column(ForeignKey("context_versions.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Observation(Base):
    __tablename__ = "observations"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String, default="PENDING")
    created_by: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PatternRun(Base):
    __tablename__ = "pattern_runs"
    __table_args__ = (UniqueConstraint("role_id", "input_fingerprint", name="uq_role_pattern_input"),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), index=True)
    input_fingerprint: Mapped[str] = mapped_column(String, nullable=False)
    eligible_observation_count: Mapped[int] = mapped_column(Integer, default=0)
    state: Mapped[str] = mapped_column(String, nullable=False)
    method: Mapped[str] = mapped_column(String, default="DETERMINISTIC_V1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PatternSuggestion(Base):
    __tablename__ = "pattern_suggestions"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("pattern_runs.id", ondelete="CASCADE"), index=True)
    suggestion_type: Mapped[str] = mapped_column(String, nullable=False)
    topic: Mapped[str] = mapped_column(String, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    support_count: Mapped[int] = mapped_column(Integer, nullable=False)
    scope: Mapped[str] = mapped_column(String, default="PROCESS_REVIEW_ONLY")
    small_sample_warning: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String, default="PROPOSED")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PatternEvidenceLink(Base):
    __tablename__ = "pattern_evidence_links"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    suggestion_id: Mapped[str] = mapped_column(ForeignKey("pattern_suggestions.id", ondelete="CASCADE"), index=True)
    evidence_type: Mapped[str] = mapped_column(String, nullable=False)
    evidence_id: Mapped[str] = mapped_column(String, nullable=False)
    relation: Mapped[str] = mapped_column(String, nullable=False)
    semantic_support: Mapped[str] = mapped_column(String, default="NOT_ESTABLISHED")


class ShareRequest(Base):
    __tablename__ = "share_requests"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    target_workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    source_role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), index=True)
    target_role_id: Mapped[str | None] = mapped_column(ForeignKey("roles.id", ondelete="SET NULL"), index=True)
    requested_by: Mapped[str] = mapped_column(String, nullable=False)
    purpose: Mapped[str] = mapped_column(Text, nullable=False)
    sharing_authority_attested: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="PENDING_EMPLOYER_ACCEPTANCE")
    accepted_by: Mapped[str | None] = mapped_column(String)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ShareItem(Base):
    __tablename__ = "share_items"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    share_request_id: Mapped[str] = mapped_column(ForeignKey("share_requests.id", ondelete="CASCADE"), index=True)
    source_workspace_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    source_entity_type: Mapped[str] = mapped_column(String, nullable=False)
    source_entity_id: Mapped[str] = mapped_column(String, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    snapshot_hash: Mapped[str] = mapped_column(String, nullable=False)
    copied_proposed_requirement_id: Mapped[str | None] = mapped_column(String, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SourceDocument(Base):
    __tablename__ = "source_documents"
    __table_args__ = (UniqueConstraint("workspace_id", "role_id", "sha256", name="uq_role_source_hash"),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), index=True)
    source_kind: Mapped[str] = mapped_column(String, nullable=False)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    source_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    supersedes_id: Mapped[str | None] = mapped_column(ForeignKey("source_documents.id"))
    media_type: Mapped[str | None] = mapped_column(String)
    file_format: Mapped[str] = mapped_column(String, nullable=False)
    sha256: Mapped[str] = mapped_column(String, nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    parse_status: Mapped[str] = mapped_column(String, nullable=False)
    span_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pii_flag_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_code: Mapped[str | None] = mapped_column(String)
    storage_path: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SourceSpan(Base):
    __tablename__ = "source_spans"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), index=True)
    source_document_id: Mapped[str] = mapped_column(ForeignKey("source_documents.id", ondelete="CASCADE"), index=True)
    locator: Mapped[dict] = mapped_column(JSON, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    text_hash: Mapped[str] = mapped_column(String, nullable=False)
    pii_flags: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SourceAssertion(Base):
    __tablename__ = "source_assertions"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), index=True)
    source_document_id: Mapped[str] = mapped_column(ForeignKey("source_documents.id", ondelete="CASCADE"), index=True)
    source_span_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_subject: Mapped[str] = mapped_column(String, nullable=False, index=True)
    attribute: Mapped[str] = mapped_column(String, nullable=False)
    value: Mapped[str] = mapped_column(String, nullable=False)
    method: Mapped[str] = mapped_column(String, nullable=False)
    semantic_support: Mapped[str] = mapped_column(String, default="NOT_APPLICABLE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SourceConflict(Base):
    __tablename__ = "source_conflicts"
    __table_args__ = (UniqueConstraint("role_id", "fingerprint", name="uq_role_conflict_fingerprint"),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), index=True)
    fingerprint: Mapped[str] = mapped_column(String, nullable=False)
    topic: Mapped[str] = mapped_column(Text, nullable=False)
    attribute: Mapped[str] = mapped_column(String, nullable=False)
    left_assertion_id: Mapped[str] = mapped_column(ForeignKey("source_assertions.id", ondelete="CASCADE"))
    right_assertion_id: Mapped[str] = mapped_column(ForeignKey("source_assertions.id", ondelete="CASCADE"))
    conflict_type: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="OPEN")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
