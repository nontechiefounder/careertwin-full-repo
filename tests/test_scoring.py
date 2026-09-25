import unittest
from uuid import UUID

from careertwin.domain.enums import EvidenceStrength, MatchStatus, RequirementKind
from careertwin.domain.models import Requirement, RequirementMatch
from careertwin.domain.scoring import ScoringWeights, score_candidate

ROLE_ID = UUID("00000000-0000-0000-0000-000000000010")
CANDIDATE_ID = UUID("00000000-0000-0000-0000-000000000020")


def requirement(number: int, kind: RequirementKind, weight: float) -> Requirement:
    return Requirement(
        id=UUID(f"00000000-0000-0000-0000-{number:012d}"),
        role_id=ROLE_ID,
        label=f"Requirement {number}",
        kind=kind,
        weight=weight,
        evidence_expectation="A concrete example with scope and outcome",
        approved=True,
    )


def match(req: Requirement, status: MatchStatus, strength: EvidenceStrength, confidence: float) -> RequirementMatch:
    evidence_ids = (
        UUID(f"10000000-0000-0000-0000-{req.id.int % 10**12:012d}"),
    ) if status == MatchStatus.SUPPORTED else ()
    return RequirementMatch(
        candidate_id=CANDIDATE_ID,
        requirement_id=req.id,
        status=status,
        evidence_strength=strength,
        evidence_ids=evidence_ids,
        reason_codes=("synthetic_test",),
        rationale="Synthetic evidence used for deterministic verification.",
        confidence=confidence,
        rubric_version="0.1.0",
    )


class ScoringTests(unittest.TestCase):
    def test_weights_must_sum_to_one(self) -> None:
        with self.assertRaises(ValueError):
            ScoringWeights(0.4, 0.2, 0.2, 0.1).validate()

    def test_supported_candidate_passes_gate(self) -> None:
        must = requirement(1, RequirementKind.MUST_HAVE, 0.6)
        signal = requirement(2, RequirementKind.STRONG_SIGNAL, 0.4)
        result = score_candidate(
            [must, signal],
            [
                match(must, MatchStatus.SUPPORTED, EvidenceStrength.DIRECT_ARTIFACT, 0.95),
                match(signal, MatchStatus.SUPPORTED, EvidenceStrength.VERIFIED_OUTCOME, 0.85),
            ],
        )
        self.assertTrue(result.gate_passed)
        self.assertGreater(result.final_score, 90)
        self.assertAlmostEqual(result.confidence, 0.9)

    def test_missing_must_have_fails_gate_but_keeps_explanation_score(self) -> None:
        must = requirement(3, RequirementKind.MUST_HAVE, 0.7)
        optional = requirement(4, RequirementKind.NICE_TO_HAVE, 0.3)
        result = score_candidate(
            [must, optional],
            [match(optional, MatchStatus.SUPPORTED, EvidenceStrength.DETAILED_CLAIM, 0.8)],
        )
        self.assertFalse(result.gate_passed)
        self.assertGreater(result.final_score, 0)

    def test_triggered_disqualifier_fails_gate(self) -> None:
        must = requirement(5, RequirementKind.MUST_HAVE, 1.0)
        disqualifier = requirement(6, RequirementKind.DISQUALIFIER, 0.0)
        result = score_candidate(
            [must, disqualifier],
            [
                match(must, MatchStatus.SUPPORTED, EvidenceStrength.DIRECT_ARTIFACT, 0.9),
                match(disqualifier, MatchStatus.SUPPORTED, EvidenceStrength.DETAILED_CLAIM, 0.8),
            ],
        )
        self.assertFalse(result.gate_passed)

    def test_uncertainty_penalty_never_goes_below_zero(self) -> None:
        must = requirement(7, RequirementKind.MUST_HAVE, 1.0)
        result = score_candidate(
            [must],
            [],
            uncertainty_penalty=1.0,
        )
        self.assertEqual(result.final_score, 0)
        self.assertEqual(result.confidence, 0)


if __name__ == "__main__":
    unittest.main()

