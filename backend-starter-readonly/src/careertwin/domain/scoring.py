from dataclasses import dataclass
from math import fsum
from typing import Iterable, Mapping
from uuid import UUID

from careertwin.domain.enums import EvidenceStrength, MatchStatus, RequirementKind
from careertwin.domain.models import Requirement, RequirementMatch, ScoreBreakdown


STATUS_VALUE: Mapping[MatchStatus, float] = {
    MatchStatus.SUPPORTED: 1.0,
    MatchStatus.PARTIAL: 0.5,
    MatchStatus.UNSUPPORTED: 0.0,
    MatchStatus.CONTRADICTED: 0.0,
}

EVIDENCE_VALUE: Mapping[EvidenceStrength, float] = {
    EvidenceStrength.DIRECT_ARTIFACT: 1.0,
    EvidenceStrength.VERIFIED_OUTCOME: 0.9,
    EvidenceStrength.DETAILED_CLAIM: 0.7,
    EvidenceStrength.SELF_ASSERTION: 0.4,
    EvidenceStrength.INFERENCE: 0.2,
}


@dataclass(frozen=True)
class ScoringWeights:
    proof_coverage: float = 0.40
    relevance: float = 0.25
    evidence_strength: float = 0.20
    consistency: float = 0.15

    def validate(self) -> None:
        total = fsum((self.proof_coverage, self.relevance, self.evidence_strength, self.consistency))
        if abs(total - 1.0) > 1e-9:
            raise ValueError(f"scoring weights must sum to 1.0, got {total}")


def score_candidate(
    requirements: Iterable[Requirement],
    matches: Iterable[RequirementMatch],
    *,
    uncertainty_penalty: float = 0.0,
    rubric_version: str = "0.1.0",
    weights: ScoringWeights = ScoringWeights(),
) -> ScoreBreakdown:
    """Aggregate requirement matches without using identity or historical-hire similarity."""

    weights.validate()
    requirements_by_id = {requirement.id: requirement for requirement in requirements}
    matches_by_requirement: dict[UUID, RequirementMatch] = {
        match.requirement_id: match for match in matches
    }
    if not requirements_by_id:
        raise ValueError("at least one requirement is required")
    if not 0.0 <= uncertainty_penalty <= 1.0:
        raise ValueError("uncertainty_penalty must be between 0 and 1")

    considered = [
        requirement
        for requirement in requirements_by_id.values()
        if requirement.kind != RequirementKind.DISQUALIFIER
    ]
    total_weight = fsum(requirement.weight for requirement in considered)
    if total_weight <= 0:
        raise ValueError("non-disqualifier requirement weights must sum to more than zero")

    weighted_status = 0.0
    weighted_evidence = 0.0
    confidences: list[float] = []
    contradiction_weight = 0.0

    for requirement in considered:
        match = matches_by_requirement.get(requirement.id)
        if match is None:
            continue
        weighted_status += requirement.weight * STATUS_VALUE[match.status]
        weighted_evidence += requirement.weight * EVIDENCE_VALUE[match.evidence_strength]
        confidences.append(match.confidence)
        if match.status == MatchStatus.CONTRADICTED:
            contradiction_weight += requirement.weight

    proof_coverage = weighted_status / total_weight
    evidence_strength = weighted_evidence / total_weight
    relevance = proof_coverage
    consistency = max(0.0, 1.0 - (contradiction_weight / total_weight))

    must_haves = [r for r in considered if r.kind == RequirementKind.MUST_HAVE]
    must_have_pass = all(
        matches_by_requirement.get(requirement.id) is not None
        and matches_by_requirement[requirement.id].status in {MatchStatus.SUPPORTED, MatchStatus.PARTIAL}
        for requirement in must_haves
    )

    disqualifier_triggered = any(
        requirement.kind == RequirementKind.DISQUALIFIER
        and (match := matches_by_requirement.get(requirement.id)) is not None
        and match.status == MatchStatus.SUPPORTED
        for requirement in requirements_by_id.values()
    )
    gate_passed = must_have_pass and not disqualifier_triggered

    raw = (
        proof_coverage * weights.proof_coverage
        + relevance * weights.relevance
        + evidence_strength * weights.evidence_strength
        + consistency * weights.consistency
    )
    adjusted = max(0.0, raw - uncertainty_penalty)
    confidence = fsum(confidences) / len(confidences) if confidences else 0.0

    return ScoreBreakdown(
        final_score=round(adjusted * 100.0, 2),
        confidence=round(confidence, 4),
        gate_passed=gate_passed,
        proof_coverage=round(proof_coverage, 4),
        relevance=round(relevance, 4),
        evidence_strength=round(evidence_strength, 4),
        consistency=round(consistency, 4),
        uncertainty_penalty=uncertainty_penalty,
        rubric_version=rubric_version,
    )

