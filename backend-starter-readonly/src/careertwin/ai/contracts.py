from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from careertwin.domain.enums import EvidenceStrength, MatchStatus, RequirementKind, RiskSeverity


class AIOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AITask(StrEnum):
    ROLE_DECOMPOSER = "role_decomposer"
    EVIDENCE_EXTRACTOR = "evidence_extractor"
    MATCH_ANALYST = "match_analyst"
    RISK_ANALYST = "risk_analyst"
    PROBE_WRITER = "probe_writer"


class ProposedRequirement(AIOutput):
    label: str = Field(min_length=2, max_length=240)
    kind: RequirementKind
    proposed_weight: float = Field(ge=0.0, le=1.0)
    evidence_expectation: str = Field(min_length=2, max_length=1_000)
    source_excerpt: str = Field(min_length=1, max_length=2_000)


class RoleDecompositionOutput(AIOutput):
    requirements: tuple[ProposedRequirement, ...] = Field(min_length=1, max_length=30)
    ambiguities: tuple[str, ...] = ()


class ProposedClaim(AIOutput):
    predicate: str = Field(min_length=2, max_length=120)
    object_text: str = Field(min_length=1, max_length=2_000)
    evidence_ids: tuple[UUID, ...] = Field(min_length=1)
    confidence: float = Field(ge=0.0, le=1.0)


class ClaimExtractionOutput(AIOutput):
    claims: tuple[ProposedClaim, ...]
    rejected_uncited_statements: tuple[str, ...] = ()


class ProposedMatch(AIOutput):
    requirement_id: UUID
    status: MatchStatus
    evidence_strength: EvidenceStrength
    evidence_ids: tuple[UUID, ...] = ()
    reason_codes: tuple[str, ...] = ()
    rationale: str = Field(min_length=1, max_length=2_000)
    confidence: float = Field(ge=0.0, le=1.0)


class MatchAnalysisOutput(AIOutput):
    matches: tuple[ProposedMatch, ...]


class ProposedRisk(AIOutput):
    code: str = Field(min_length=2, max_length=100)
    severity: RiskSeverity
    summary: str = Field(min_length=2, max_length=1_000)
    evidence_ids: tuple[UUID, ...] = ()
    verification_action: str = Field(min_length=2, max_length=1_000)


class RiskAnalysisOutput(AIOutput):
    risks: tuple[ProposedRisk, ...]


class InterviewProbe(AIOutput):
    requirement_id: UUID
    question: str = Field(min_length=5, max_length=2_000)
    why_ask: str = Field(min_length=5, max_length=1_000)
    strong_signal: str = Field(min_length=5, max_length=1_000)
    evidence_ids: tuple[UUID, ...] = ()


class ProbeGenerationOutput(AIOutput):
    probes: tuple[InterviewProbe, ...] = Field(max_length=20)
