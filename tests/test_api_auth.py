import unittest
from uuid import UUID
from fastapi.testclient import TestClient
from fastapi import status

from careertwin.api.main import app
from careertwin.api.dependencies import get_gemini_client
from careertwin.ai.contracts import AITask
from careertwin.ai.gemini import GeminiStructuredClient
from careertwin.config import Settings

class FakeModels:
    def list(self):
        class Model:
            def __init__(self, name):
                self.name = name
        return [Model("models/gemini-2.5-flash")]

class FakeClient:
    def __init__(self):
        self.models = FakeModels()
    def close(self):
        pass

class APIAuthTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        app.dependency_overrides.clear()
        
    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def settings(self, **overrides: object) -> Settings:
        values = {
            "gemini_api_key": "test-key",
            "session_secret": "x" * 64,
            "environment": "development",
        }
        values.update(overrides)
        return Settings(**values)

    def test_missing_header_returns_401(self) -> None:
        response = self.client.post(
            "/v1/ai/tasks/role_decomposer/test",
            json={"input_text": "this is a valid long input text", "context": {}}
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("valid development identity headers are required", response.json()["detail"])

    def test_invalid_role_returns_401(self) -> None:
        headers = {
            "X-CareerTwin-Org-ID": "00000000-0000-0000-0000-000000000001",
            "X-CareerTwin-User-ID": "00000000-0000-0000-0000-000000000002",
            "X-CareerTwin-Role": "invalid-role",
        }
        response = self.client.post(
            "/v1/ai/tasks/role_decomposer/test",
            json={"input_text": "this is a valid long input text", "context": {}},
            headers=headers
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("valid development identity headers are required", response.json()["detail"])

    def test_auditor_write_returns_403(self) -> None:
        headers = {
            "X-CareerTwin-Org-ID": "00000000-0000-0000-0000-000000000001",
            "X-CareerTwin-User-ID": "00000000-0000-0000-0000-000000000002",
            "X-CareerTwin-Role": "auditor",
        }
        response = self.client.post(
            "/v1/ai/tasks/role_decomposer/test",
            json={"input_text": "this is a valid long input text", "context": {}},
            headers=headers
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("write access denied", response.json()["detail"])

    def test_production_auth_fails_closed_returns_503(self) -> None:
        prod_settings = self.settings(environment="production")
        def get_prod_settings():
            return prod_settings
            
        from careertwin.api import auth
        original_get_settings = auth.get_settings
        auth.get_settings = get_prod_settings
        
        try:
            headers = {
                "X-CareerTwin-Org-ID": "00000000-0000-0000-0000-000000000001",
                "X-CareerTwin-User-ID": "00000000-0000-0000-0000-000000000002",
                "X-CareerTwin-Role": "reviewer",
            }
            response = self.client.post(
                "/v1/ai/tasks/role_decomposer/test",
                json={"input_text": "this is a valid long input text", "context": {}},
                headers=headers
            )
            self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
            self.assertIn("production identity adapter is not configured", response.json()["detail"])
        finally:
            auth.get_settings = original_get_settings

    def test_unsupported_evidence_id_returns_502(self) -> None:
        headers = {
            "X-CareerTwin-Org-ID": "00000000-0000-0000-0000-000000000001",
            "X-CareerTwin-User-ID": "00000000-0000-0000-0000-000000000002",
            "X-CareerTwin-Role": "reviewer",
        }
        
        bad_context = {
            "evidence": [
                {
                    "id": "not-a-uuid",
                    "excerpt": "some text",
                    "page": 1
                }
            ]
        }
        
        adapter_client = GeminiStructuredClient(self.settings(), client_factory=lambda _: FakeClient())
        app.dependency_overrides[get_gemini_client] = lambda: adapter_client
        
        response = self.client.post(
            "/v1/ai/tasks/evidence_extractor/test",
            json={"input_text": "this is a valid long input text", "context": bad_context},
            headers=headers
        )
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertIn("not a valid UUID", response.json()["detail"])
