import csv
import json
import unittest
from pathlib import Path
from zipfile import BadZipFile, ZipFile

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "samples" / "ingestion"


class IngestionFixtureTests(unittest.TestCase):
    def test_manifest_references_valid_pdf_and_docx_files(self) -> None:
        manifest = PACK / "generated" / "candidate_manifest.csv"
        with manifest.open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))

        self.assertEqual(
            {row["candidate_id"] for row in rows}, {"CAND-001", "CAND-002", "CAND-003", "CAND-004"}
        )
        for row in rows:
            for column in ("resume_file", "supporting_file"):
                filename = row[column]
                if not filename:
                    continue
                path = PACK / "generated" / "candidates" / filename
                self.assertTrue(path.is_file(), path)
                if path.suffix == ".pdf":
                    self.assertEqual(path.read_bytes()[:5], b"%PDF-")
                elif path.suffix == ".docx":
                    try:
                        with ZipFile(path) as archive:
                            self.assertIn("word/document.xml", archive.namelist())
                    except BadZipFile as error:
                        self.fail(f"invalid DOCX fixture {path}: {error}")

    def test_expected_results_cover_security_and_ranking_cases(self) -> None:
        expected = json.loads(
            (PACK / "expected" / "expected_results.json").read_text(encoding="utf-8")
        )

        self.assertEqual(
            expected["ranking"],
            ["CAND-001", "CAND-003", "CAND-002", "CAND-004"],
        )
        self.assertTrue(expected["candidates"]["CAND-004"]["prompt_injection_detected"])
        self.assertTrue(expected["candidates"]["CAND-003"]["human_review_required"])


if __name__ == "__main__":
    unittest.main()
