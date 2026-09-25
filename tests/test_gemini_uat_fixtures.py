import json
import unittest
from pathlib import Path

from careertwin.ai.contracts import AITask

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "samples" / "api" / "gemini"


class GeminiUATFixtureTests(unittest.TestCase):
    def test_every_task_has_valid_browser_request_json(self) -> None:
        for task in AITask:
            path = FIXTURES / f"{task.value}.json"
            self.assertTrue(path.is_file(), path)
            request = json.loads(path.read_text(encoding="utf-8"))
            self.assertGreaterEqual(len(request["input_text"]), 10)
            self.assertIsInstance(request["context"], dict)


if __name__ == "__main__":
    unittest.main()
