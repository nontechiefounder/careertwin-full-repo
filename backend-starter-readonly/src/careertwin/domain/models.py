from datetime import datetime, timezone
from typing import Annotated, Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from careertwin.domain.enums import (
    EvidenceStrength,
    MatchStatus,
    RequirementKind,
    RiskSeverity,
    WorkflowStatus,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


Confidence = Annotated[float, Field(ge=0.0, le=1.0)]
Score = Annotated[float, Field(ge=0.0, le=100.0)]


class DomainModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, use_enum_values=False)


class Role(DomainModel):
    id: UUID = Field(default_factory=uuid4)
    org_id: UUID
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(min_length=20, max_length=50_000)
    created_at: datetime = Field(default_factory=utc_now)


class Requirement(DomainModel):
    id: UUID = Field(default_factory=uuid4)
    role_id: UUID
    label: str = Field(min_length=2, max_length=240)
    kind: RequirementKind
    weight: float = Field(ge=0.0, le=1.0)
    evidence_expectation: str = Field(min_length=2, max_length=1_000)
    approved: bool = False


class Candidate(DomainModel):
    id: UUID = Field(default_factory=uuid4)
    org_id: UUID
    role_id: UUID
    external_reference: str | None = Field(default=None, max_length=200)
    created_at: datetime = Field(default_factory=utc_now)


class Document(DomainModel):
    id: UUID = Field(default_factory=uuid4)
    org_id: UUID
    candidate_id: UUID
    object_key: str = Field(min_length=1, max_length=1_000)
    original_filename: str = Field(min_length=1, max_length=500)
    media_type: str = Field(min_length=1, max_length=200)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    scan_status: str = Field(default="quarantined", max_length=40)
    parser_version: str | None = Field(default=None, max_length=100)
    created_at: datetime = Field(default_factory=utc_now)



class EvidenceRef(DomainModel):
    id: UUID = Field(default_factory=uuid4)
    document_id: UUID
    page_number: int | None = Field(default=None, ge=1)
    start_offset: int | None = Field(default=None, ge=0)
    end_offset: int | None = Field(default=None, ge=0)
    bounding_box: tuple[float, float, float, float] | None = None
    excerpt: str = Field(min_length=1, max_length=2_000)
    excerpt_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    parser_version: str = Field(min_length=1, max_length=100)

    @field_validator("end_offset")
    @classmethod
    def end_must_follow_start(cls, value: int | None, info: Any) -> int | None:
        start = info.data.get("start_offset")
        if value is not None and start is not None and value < start:
            raise ValueError("end_offset must be greater than or equal to start_offset")
        return value


class Claim(DomainModel):
    id: UUID = Field(default_factory=uuid4)
    candidate_id: UUID
    predicate: str = Field(min_length=2, max_length=120)
    object_text: str = Field(min_length=1, max_length=2_000)
    confidence: Confidence
    evidence_ids: tuple[UUID, ...] = Field(min_length=1)
    model_run_id: UUID


class RequirementMatch(DomainModel):
    id: UUID = Field(default_factory=uuid4)
    candidate_id: UUID
    requirement_id: UUID
    status: MatchStatus
    evidence_strength: EvidenceStrength
    evidence_ids: tuple[UUID, ...] = ()
    reason_codes: tuple[str, ...] = ()
    rationale: str = Field(min_length=1, max_length=2_000)
    confidence: Confidence
    rubric_version: str = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def supported_matches_need_evidence(self) -> "RequirementMatch":
        if self.status == MatchStatus.SUPPORTED and not self.evidence_ids:
            raise ValueError("supported matches require at least one evidence reference")
        return self


class RiskFlag(DomainModel):
    id: UUID = Field(default_factory=uuid4)
    candidate_id: UUID
    code: str = Field(min_length=2, max_length=100)
    severity: RiskSeverity
    summary: str = Field(min_length=2, max_length=1_000)
    evidence_ids: tuple[UUID, ...] = ()


class ScoreBreakdown(DomainModel):
    final_score: Score
    confidence: Confidence
    gate_passed: bool
    proof_coverage: float = Field(ge=0.0, le=1.0)
    relevance: float = Field(ge=0.0, le=1.0)
    evidence_strength: float = Field(ge=0.0, le=1.0)
    consistency: float = Field(ge=0.0, le=1.0)
    uncertainty_penalty: float = Field(ge=0.0, le=1.0)
    rubric_version: str


class TrustPacket(DomainModel):
    id: UUID = Field(default_factory=uuid4)
    org_id: UUID
    role_id: UUID
    candidate_id: UUID
    score: ScoreBreakdown
    match_ids: tuple[UUID, ...]
    risk_ids: tuple[UUID, ...] = ()
    proof_requests: tuple[str, ...] = ()
    interview_probes: tuple[str, ...] = ()
    released: bool = False
    version: int = Field(default=1, ge=1)
    created_at: datetime = Field(default_factory=utc_now)


class WorkflowRun(DomainModel):
    id: UUID = Field(default_factory=uuid4)
    org_id: UUID
    role_id: UUID
    candidate_ids: tuple[UUID, ...] = Field(min_length=1, max_length=50)
    status: WorkflowStatus = WorkflowStatus.CREATED
    version: int = Field(default=0, ge=0)
    rubric_version: str = "0.1.0"
    ontology_version: str = "0.1.0"
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
