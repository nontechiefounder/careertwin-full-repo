import unittest

from scripts.check_config import validate
from scripts.configure_env import render_env


def parse_env(text: str) -> dict[str, str]:
    return {
        key: value
        for line in text.splitlines()
        if line and not line.startswith("#")
        for key, value in [line.split("=", 1)]
    }


class ConfigurationTests(unittest.TestCase):
    def test_local_profile_with_explicit_models_is_structurally_valid(self) -> None:
        values = parse_env(
            render_env(
                "local",
                True,
                local_model_name="local-structured-model",
                local_embedding_model_name="local-1024d-embedding-model",
            )
        )

        self.assertEqual(validate(values), [])
        self.assertEqual(values["EMBEDDING_DIMENSION"], "1024")
        self.assertNotEqual(values["POSTGRES_PASSWORD"], values["OBJECT_STORE_SECRET_KEY"])

    def test_local_profile_without_model_selection_fails_closed(self) -> None:
        values = parse_env(render_env("local", True))

        errors = validate(values)

        self.assertIn("MODEL_NAME still contains a placeholder", errors)
        self.assertIn("EMBEDDING_MODEL_NAME still contains a placeholder", errors)

    def test_embedding_dimension_cannot_change_silently(self) -> None:
        values = parse_env(
            render_env(
                "local",
                True,
                local_model_name="local-structured-model",
                local_embedding_model_name="local-embedding-model",
            )
        )
        values["EMBEDDING_DIMENSION"] = "768"

        self.assertIn(
            "EMBEDDING_DIMENSION must remain 1024 until a database migration changes vector size",
            validate(values),
        )

    def test_gemini_profile_requires_only_the_api_key_to_be_replaced(self) -> None:
        values = parse_env(render_env("gemini", True))

        errors = validate(values)

        self.assertEqual(errors, ["GEMINI_API_KEY still contains a placeholder"])
        values["GEMINI_API_KEY"] = "test-key-entered-locally"
        self.assertEqual(validate(values), [])

    def test_gemini_provider_storage_must_remain_disabled(self) -> None:
        values = parse_env(render_env("gemini", True))
        values["GEMINI_API_KEY"] = "test-key-entered-locally"
        values["GEMINI_STORE_INTERACTIONS"] = "true"

        self.assertIn(
            "GEMINI_STORE_INTERACTIONS must be false for candidate test data",
            validate(values),
        )


if __name__ == "__main__":
    unittest.main()
