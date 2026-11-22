from __future__ import annotations
from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field

class AuthLogin(BaseModel):
    username: str
    password: str

class WorkspaceCreate(BaseModel):
    kind: Literal["EMPLOYER", "PERSONAL"]
    display_name: str

class MemberCreate(BaseModel):
    principal_id: str
    member_class: Literal["INTERNAL", "EXTERNAL"]
    permissions: list[str] = Field(default_factory=list)

class RoleCreate(BaseModel):
    title: str
    intake_mode: Literal["GUIDED_QUESTIONNAIRE", "FILE_BACKED", "SCATTERED_SOURCES", "HANDOFF_REVIEW"]

class ShareRequestCreate(BaseModel):
    target_employer_workspace_id: str
    source_role_id: str
    approved_requirement_ids: list[str] = Field(min_length=1)
    purpose: str = Field(min_length=1, max_length=1000)
    sharing_authority_attested: bool

class ShareAcceptRequest(BaseModel):
    target_role_id: str | None = None
    rationale: str | None = None

class AnswersUpsert(BaseModel):
    answers: dict[str, Any]

class RequirementPatch(BaseModel):
    actual_work: str | None = None
    reason: str | None = None
    reason_state: Literal["KNOWN", "UNKNOWN"] | None = None
    criticality: Literal["REQUIRED", "PREFERRED", "UNKNOWN"] | None = None
    alternatives: list[str] | None = None
    acceptable_proof: str | None = None
    proof_state: Literal["KNOWN", "UNKNOWN"] | None = None
    uncertainty: str | None = None

class ReviewRequest(BaseModel):
    decision: Literal["APPROVE", "REJECT", "DISMISS"]
    rationale: str | None = None

class ObservationCreate(BaseModel):
    text: str

class ContextCreate(BaseModel):
    kind: Literal["STARTER", "REVIEW_UPDATE"] = "STARTER"

class ResearchQARequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    mode: Literal["retrieval_augmented", "full_context", "retrieval_only"] = "retrieval_augmented"
    limit: int = Field(default=5, ge=1, le=20)
    role_id: str | None = None
    model_id: str | None = None
    as_of: datetime | None = None
