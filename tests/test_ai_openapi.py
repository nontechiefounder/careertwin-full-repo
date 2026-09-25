import json
import unittest

try:
    from careertwin.api.main import app
except ModuleNotFoundError as error:
    if error.name != "fastapi":
        raise
    app = None


@unittest.skipIf(app is None, "FastAPI is not installed in the dependency-light core test mode")
class AIOpenAPITests(unittest.TestCase):
    def test_browser_schema_exposes_gemini_test_endpoints(self) -> None:
        schema = app.openapi()
        paths = schema["paths"]

        self.assertIn("/v1/ai/config", paths)
        self.assertIn("/v1/ai/tasks/{task}/test", paths)
        self.assertIn("/v1/ai/embeddings/test", paths)
        self.assertIn("/docs", app.docs_url)

    def test_openapi_never_contains_the_api_key_value(self) -> None:
        serialized = json.dumps(app.openapi())

        self.assertNotIn("GEMINI_API_KEY", serialized)
        self.assertNotIn("gemini_api_key", serialized)


if __name__ == "__main__":
    unittest.main()
