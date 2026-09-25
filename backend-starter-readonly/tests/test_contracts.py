import inspect
import unittest
from hashlib import sha256
from uuid import UUID

from pydantic import ValidationError

from careertwin.domain.enums import EvidenceStrength, MatchStatus
from careertwin.domain.models import EvidenceRef, RequirementMatch
from careertwin.domain import models
from careertwin.ai.prompts import PROMPTS


class ContractTests(unittest.TestCase):
    def test_evidence_requires_valid_sha256(self) -> None:
        excerpt = "Built an idempotent event processor and reduced duplicate processing."
        evidence = EvidenceRef(
            document_id=UUID("00000000-0000-0000-0000-000000000001"),
            page_number=1,
            start_offset=10,
            end_offset=80,
            excerpt=excerpt,
            excerpt_sha256=sha256(excerpt.encode()).hexdigest(),
            parser_version="docling-test",
        )
        self.assertEqual(len(evidence.excerpt_sha256), 64)

    def test_supported_match_without_evidence_is_invalid(self) -> None:
        with self.assertRaises(ValidationError):
            RequirementMatch(
                candidate_id=UUID("00000000-0000-0000-0000-000000000001"),
                requirement_id=UUID("00000000-0000-0000-0000-000000000002"),
                status=MatchStatus.SUPPORTED,
                evidence_strength=EvidenceStrength.SELF_ASSERTION,
                rationale="Unsupported test record.",
                confidence=0.5,
                rubric_version="0.1.0",
            )

    def test_scoring_contract_has_no_protected_trait_fields(self) -> None:
        source = inspect.getsource(models.ScoreBreakdown).lower()
        for prohibited in ("gender", "race", "religion", "disability", "nationality", "photo"):
            self.assertNotIn(prohibited, source)

    def test_every_ai_prompt_treats_documents_as_untrusted(self) -> None:
        for prompt in PROMPTS.values():
            rendered = prompt.render().lower()
            self.assertIn("untrusted evidence", rendered)
            self.assertIn("do not extract, infer, rank, score", rendered)
            self.assertIn("return only the requested schema", rendered)


if __name__ == "__main__":
    unittest.main()
