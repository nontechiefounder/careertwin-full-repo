import argparse
from pathlib import Path
from urllib.parse import urlparse

REQUIRED = {
    "ENVIRONMENT",
    "AI_PROVIDER",
    "DATABASE_URL",
    "REDIS_URL",
    "OBJECT_STORE_ENDPOINT",
    "OBJECT_STORE_ACCESS_KEY",
    "OBJECT_STORE_SECRET_KEY",
    "OBJECT_STORE_BUCKET",
    "MODEL_BASE_URL",
    "MODEL_API_KEY",
    "MODEL_NAME",
    "EMBEDDING_BASE_URL",
    "EMBEDDING_API_KEY",
    "EMBEDDING_MODEL_NAME",
    "EMBEDDING_DIMENSION",
    "SESSION_SECRET",
}

GEMINI_REQUIRED = {
    "GEMINI_API_KEY",
    "GEMINI_ROLE_DECOMPOSER_MODEL",
    "GEMINI_EVIDENCE_EXTRACTOR_MODEL",
    "GEMINI_MATCH_ANALYST_MODEL",
    "GEMINI_RISK_ANALYST_MODEL",
    "GEMINI_PROBE_WRITER_MODEL",
    "GEMINI_EMBEDDING_MODEL",
    "GEMINI_STORE_INTERACTIONS",
}

PLACEHOLDER_MARKERS = ("replace-with", "your-secret", "change-me", "placeholder")


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError(f"line {line_number} is not KEY=VALUE")
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def validate(values: dict[str, str]) -> list[str]:
    errors: list[str] = []
    missing = sorted(REQUIRED - values.keys())
    if missing:
        errors.append(f"missing keys: {', '.join(missing)}")

    provider = values.get("AI_PROVIDER")
    provider_required = GEMINI_REQUIRED if provider == "gemini" else set()
    provider_missing = sorted(provider_required - values.keys())
    if provider_missing:
        errors.append(f"missing Gemini keys: {', '.join(provider_missing)}")

    for key in (REQUIRED | provider_required) & values.keys():
        lowered = values[key].lower()
        if not values[key]:
            errors.append(f"{key} is empty")
        elif any(marker in lowered for marker in PLACEHOLDER_MARKERS):
            errors.append(f"{key} still contains a placeholder")

    for key in (
        "DATABASE_URL",
        "REDIS_URL",
        "OBJECT_STORE_ENDPOINT",
        "MODEL_BASE_URL",
        "EMBEDDING_BASE_URL",
    ):
        if key in values and not urlparse(values[key]).scheme:
            errors.append(f"{key} must be an absolute URL")

    if "SESSION_SECRET" in values and len(values["SESSION_SECRET"]) < 64:
        errors.append("SESSION_SECRET must contain at least 64 characters")
    if values.get("EMBEDDING_DIMENSION") != "1024":
        errors.append(
            "EMBEDDING_DIMENSION must remain 1024 until a database migration changes vector size"
        )
    if provider == "gemini" and values.get("GEMINI_STORE_INTERACTIONS") != "false":
        errors.append("GEMINI_STORE_INTERACTIONS must be false for candidate test data")
    if provider not in {"gemini", "generic"}:
        errors.append("AI_PROVIDER must be gemini or generic")
    return errors


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate CareerTWiN configuration without printing secrets"
    )
    parser.add_argument("path", nargs="?", default=".env")
    args = parser.parse_args()
    path = Path(args.path)
    if not path.exists():
        raise SystemExit(f"configuration file not found: {path}")
    errors = validate(read_env(path))
    if errors:
        print("Configuration is invalid:")
        for error in errors:
            print(f"- {error}")
        raise SystemExit(1)
    print(f"Configuration is structurally valid: {path}")
    print("Secret values were not displayed. Service connectivity was not tested.")


if __name__ == "__main__":
    main()
