import asyncio
import json
import unittest
from types import SimpleNamespace
from typing import Any

from careertwin.ai.contracts import AITask
from careertwin.ai.gemini import (
    GeminiStructuredClient,
    GeminiResponseError,
    OUTPUT_SCHEMAS,
    model_for_task,
    configured_task_models,
    key_is_configured,
    sanitize_provider_error,
)
from careertwin.config import Settings


class FakeModels:
    def __init__(self) -> None:
        self.last_model = None
        self.last_contents = None
        self.last_config = None
        self.custom_output_text = None

    def generate_content(self, model: str, contents: str, config: Any) -> SimpleNamespace:
        self.last_model = model
        self.last_contents = contents
        self.last_config = config

        if self.custom_output_text is not None:
            text = self.custom_output_text
        else:
            import uuid
            dummy_uuid = str(uuid.UUID("00000000-0000-0000-0000-000000000001"))
            schema = config.response_schema
            schema_name = "RoleDecompositionOutput"
            if schema:
                if hasattr(schema, "title") and schema.title:
                    schema_name = schema.title
                elif hasattr(schema, "__name__"):
                    schema_name = schema.__name__

            mock_data = {
                "RoleDecompositionOutput": {
                    "requirements": [
                        {
                            "label": "Own a production backend service",
                            "kind": "must_have",
                            "proposed_weight": 0.4,
                            "evidence_expectation": "Concrete ownership and production outcome",
                            "source_excerpt": "Own backend services from design through operations",
                        }
                    ],
                    "ambiguities": [],
                },
                "ClaimExtractionOutput": {
                    "claims": [
                        {
                            "predicate": "worked_as",
                            "object_text": "Senior Backend Engineer",
                            "evidence_ids": [dummy_uuid],
                            "confidence": 0.9,
                        }
                    ],
                    "rejected_uncited_statements": [],
                },
                "MatchAnalysisOutput": {
                    "matches": [
                        {
                            "requirement_id": dummy_uuid,
                            "status": "supported",
                            "evidence_strength": "direct_artifact",
                            "evidence_ids": [dummy_uuid],
                            "reason_codes": ["match"],
                            "rationale": "Matches requirement perfectly",
                            "confidence": 0.9,
                        }
                    ]
                },
                "RiskAnalysisOutput": {
                    "risks": [
                        {
                            "code": "employment_gap",
                            "severity": "review",
                            "summary": "Gap in employment detected",
                            "evidence_ids": [dummy_uuid],
                            "verification_action": "Verify gap in candidate interview",
                        }
                    ]
                },
                "ProbeGenerationOutput": {
                    "probes": [
                        {
                            "requirement_id": dummy_uuid,
                            "question": "Can you describe a production incident you managed?",
                            "why_ask": "To test incident management capability",
                            "strong_signal": "Demonstrated quick recovery and postmortem analysis",
                            "evidence_ids": [dummy_uuid],
                        }
                    ]
                }
            }
            text = json.dumps(mock_data.get(schema_name, {}))

        usage = SimpleNamespace(
            total_token_count=120,
            prompt_token_count=80,
            candidates_token_count=40,
        )
        return SimpleNamespace(
            text=text,
            parsed=None,
            usage_metadata=usage,
        )


class FakeClient:
    def __init__(self) -> None:
        self.models = FakeModels()


class GeminiTests(unittest.TestCase):
    def settings(self, **overrides: object) -> Settings:
        values: dict[str, object] = {
            "gemini_api_key": "test-gemini-key",
            "session_secret": "x" * 64,
        }
        values.update(overrides)
        return Settings(**values)

    def test_task_models_use_three_stable_model_tiers(self) -> None:
        models = configured_task_models(self.settings())

        self.assertEqual(models["role_decomposer"], "gemini-2.5-pro")
        self.assertEqual(models["evidence_extractor"], "gemini-2.5-flash")
        self.assertEqual(models["probe_writer"], "gemini-2.5-flash-lite")

    def test_structured_call_is_schema_validated_and_not_stored(self) -> None:
        fake_client = FakeClient()
        client = GeminiStructuredClient(self.settings(), client_factory=lambda _: fake_client)

        result = asyncio.run(
            client.execute(
                AITask.ROLE_DECOMPOSER,
                "Own backend services from design through operations.",
                {"role_title": "Senior Backend Engineer"},
            )
        )

        self.assertEqual(result["model"], "gemini-2.5-pro")
        self.assertFalse(result["conversation_state_requested"])
        self.assertEqual(result["output"]["requirements"][0]["kind"], "must_have")

        # Verify GenerateContentConfig properties
        config = fake_client.models.last_config
        self.assertEqual(config.response_mime_type, "application/json")
        self.assertEqual(config.response_schema.title, OUTPUT_SCHEMAS[AITask.ROLE_DECOMPOSER].__name__)
        self.assertIn("untrusted evidence", config.system_instruction)

    def test_each_task_selects_its_configured_model(self) -> None:
        fake_client = FakeClient()
        client = GeminiStructuredClient(self.settings(), client_factory=lambda _: fake_client)
        for task in AITask:
            result = asyncio.run(
                client.execute(
                    task,
                    "Some input text to test model selection.",
                    {"context_key": "context_value"},
                )
            )
            expected_model = model_for_task(self.settings(), task)
            self.assertEqual(result["model"], expected_model)

    def test_invalid_gemini_json_is_rejected(self) -> None:
        fake_client = FakeClient()
        fake_client.models.custom_output_text = "{"  # Invalid JSON
        client = GeminiStructuredClient(self.settings(), client_factory=lambda _: fake_client)

        with self.assertRaises(GeminiResponseError):
            asyncio.run(
                client.execute(
                    AITask.ROLE_DECOMPOSER,
                    "Own backend services from design through operations.",
                    {"role_title": "Senior Backend Engineer"},
                )
            )

    def test_real_sdk_contract(self) -> None:
        try:
            from google import genai
            client = genai.Client(api_key="fake-key-for-contract-test")
            self.assertTrue(hasattr(client, "models"))
            self.assertTrue(callable(getattr(client.models, "generate_content", None)))
        except ImportError:
            pass

    def test_placeholder_key_is_not_considered_configured(self) -> None:
        settings = self.settings(gemini_api_key="replace-with-your-gemini-api-key")

        self.assertFalse(key_is_configured(settings))

    def test_provider_error_redacts_api_key(self) -> None:
        error = RuntimeError("request using test-gemini-key failed")

        message = sanitize_provider_error(error, "test-gemini-key")

        self.assertNotIn("test-gemini-key", message)
        self.assertIn("[REDACTED]", message)


if __name__ == "__main__":
    unittest.main()
