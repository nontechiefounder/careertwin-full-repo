import json
import unittest
from pathlib import Path
from uuid import UUID, uuid5, NAMESPACE_URL

from careertwin.domain.enums import EvidenceStrength, MatchStatus, RequirementKind
from careertwin.domain.models import Requirement, RequirementMatch
from careertwin.domain.scoring import score_candidate

GOLDEN = Path(__file__).parent / "golden"


class GoldenCorpusTests(unittest.TestCase):
    def test_expected_ranking_and_gates(self) -> None:
        role = json.loads((GOLDEN / "role_backend_engineer.json").read_text())
        expected = json.loads((GOLDEN / "expected_ranking.json").read_text())
        requirements = [
            Requirement(
                id=UUID(item["id"]),
                role_id=UUID(role["role_id"]),
                label=item["label"],
                kind=RequirementKind(item["kind"]),
                weight=item["weight"],
                evidence_expectation=item["evidence_expectation"],
                approved=True,
            )
            for item in role["requirements"]
        ]

        results: list[tuple[str, float, bool]] = []
        for filename in ("candidate_strong.json", "candidate_missing_gate.json"):
            candidate = json.loads((GOLDEN / filename).read_text())
            candidate_id = UUID(candidate["candidate_id"])
            matches = []
            for item in candidate["matches"]:
                status = MatchStatus(item["status"])
                evidence_ids = (
                    uuid5(NAMESPACE_URL, f"{candidate_id}:{item['requirement_id']}"),
                ) if status == MatchStatus.SUPPORTED else ()
                matches.append(
                    RequirementMatch(
                        candidate_id=candidate_id,
                        requirement_id=UUID(item["requirement_id"]),
                        status=status,
                        evidence_strength=EvidenceStrength(item["evidence_strength"]),
                        evidence_ids=evidence_ids,
                        rationale="Synthetic golden-corpus match.",
                        confidence=item["confidence"],
                        rubric_version="0.1.0",
                    )
                )
            score = score_candidate(requirements, matches)
            results.append((str(candidate_id), score.final_score, score.gate_passed))

        ranking = [item[0] for item in sorted(results, key=lambda item: item[1], reverse=True)]
        self.assertEqual(ranking, expected["expected_order"])
        for candidate_id, _, gate in results:
            self.assertEqual(gate, expected["required_gate_status"][candidate_id])


if __name__ == "__main__":
    unittest.main()

