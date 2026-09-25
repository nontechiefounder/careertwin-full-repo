import argparse
import getpass
import os
import secrets
from pathlib import Path


def prompt(label: str, default: str | None = None, *, secret: bool = False) -> str:
    suffix = f" [{default}]" if default else ""
    reader = getpass.getpass if secret else input
    value = reader(f"{label}{suffix}: ").strip()
    if value:
        return value
    if default is not None:
        return default
    raise SystemExit(f"A value is required for {label}")


def render_env(
    profile: str,
    non_interactive: bool,
    *,
    local_model_name: str | None = None,
    local_embedding_model_name: str | None = None,
) -> str:
    postgres_password = secrets.token_urlsafe(32)
    object_secret = secrets.token_urlsafe(32)
    session_secret = secrets.token_hex(32)

    if profile == "gemini":
        ai_provider = "gemini"
        gemini_api_key = "replace-with-your-gemini-api-key"
        model_base_url = "https://generativelanguage.googleapis.com"
        model_api_key = "unused-gemini-direct-sdk"
        model_name = "gemini-2.5-flash"
        embedding_base_url = "https://generativelanguage.googleapis.com"
        embedding_api_key = "unused-gemini-direct-sdk"
        embedding_model_name = "gemini-embedding-2"
    elif profile == "local":
        ai_provider = "generic"
        gemini_api_key = ""
        model_base_url = "http://ollama:11434/v1"
        model_api_key = "local-development"
        model_name = local_model_name or "replace-with-pulled-local-structured-model"
        embedding_base_url = "http://ollama:11434/v1"
        embedding_api_key = "local-development"
        embedding_model_name = (
            local_embedding_model_name or "replace-with-pulled-1024d-embedding-model"
        )
    elif non_interactive:
        raise SystemExit("Hosted configuration requires interactive secret entry")
    else:
        ai_provider = "generic"
        gemini_api_key = ""
        model_base_url = prompt("Hosted model base URL", "https://api.openai.com/v1")
        model_api_key = prompt("Hosted model API key", secret=True)
        model_name = prompt("Structured-output model name")
        same_embedding = prompt("Use the same provider for embeddings? yes/no", "yes").lower()
        if same_embedding in {"yes", "y"}:
            embedding_base_url = model_base_url
            embedding_api_key = model_api_key
        else:
            embedding_base_url = prompt("Embedding API base URL")
            embedding_api_key = prompt("Embedding API key", secret=True)
        embedding_model_name = prompt("1024-dimension embedding model name")

    values = {
        "ENVIRONMENT": "development",
        "LOG_LEVEL": "INFO",
        "API_HOST": "0.0.0.0",
        "API_PORT": "8000",
        "POSTGRES_DB": "careertwin",
        "POSTGRES_USER": "careertwin",
        "POSTGRES_PASSWORD": postgres_password,
        "DATABASE_URL": f"postgresql+psycopg://careertwin:{postgres_password}@postgres:5432/careertwin",
        "REDIS_URL": "redis://redis:6379/0",
        "OBJECT_STORE_ENDPOINT": "http://minio:9000",
        "OBJECT_STORE_ACCESS_KEY": "careertwin",
        "OBJECT_STORE_SECRET_KEY": object_secret,
        "OBJECT_STORE_BUCKET": "careertwin-evidence",
        "CLAMAV_HOST": "clamav",
        "CLAMAV_PORT": "3310",
        "AI_PROVIDER": ai_provider,
        "MODEL_BASE_URL": model_base_url,
        "MODEL_API_KEY": model_api_key,
        "MODEL_NAME": model_name,
        "EMBEDDING_BASE_URL": embedding_base_url,
        "EMBEDDING_API_KEY": embedding_api_key,
        "EMBEDDING_MODEL_NAME": embedding_model_name,
        "EMBEDDING_DIMENSION": "1024",
        "OTEL_EXPORTER_OTLP_ENDPOINT": "http://otel-collector:4317",
        "SESSION_SECRET": session_secret,
    }
    if profile == "gemini":
        values.update(
            {
                "GEMINI_API_KEY": gemini_api_key,
                "GEMINI_ROLE_DECOMPOSER_MODEL": "gemini-2.5-pro",
                "GEMINI_EVIDENCE_EXTRACTOR_MODEL": "gemini-2.5-flash",
                "GEMINI_MATCH_ANALYST_MODEL": "gemini-2.5-pro",
                "GEMINI_RISK_ANALYST_MODEL": "gemini-2.5-flash",
                "GEMINI_PROBE_WRITER_MODEL": "gemini-2.5-flash-lite",
                "GEMINI_EMBEDDING_MODEL": "gemini-embedding-2",
                "GEMINI_STORE_INTERACTIONS": "false",
            }
        )
    header = [
        "# Generated locally by scripts/configure_env.py",
        f"# Profile: {profile}",
        "# Do not commit this file.",
        "",
    ]
    return "\n".join(header + [f"{key}={value}" for key, value in values.items()]) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a safe local CareerTWiN .env file")
    parser.add_argument("--profile", choices=("local", "hosted", "gemini"), required=True)
    parser.add_argument("--output", default=".env")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--non-interactive", action="store_true")
    parser.add_argument("--model-name", help="Exact locally installed structured-output model")
    parser.add_argument(
        "--embedding-model-name",
        help="Exact locally installed model that returns 1024-dimension embeddings",
    )
    args = parser.parse_args()

    output = Path(args.output)
    if output.exists() and not args.force:
        raise SystemExit(f"{output} already exists; use --force only if replacement is intentional")
    output.write_text(
        render_env(
            args.profile,
            args.non_interactive,
            local_model_name=args.model_name,
            local_embedding_model_name=args.embedding_model_name,
        ),
        encoding="utf-8",
    )
    os.chmod(output, 0o600)
    print(f"Created {output} with mode 0600. Secrets were not printed.")
    print("Run: python scripts/check_config.py .env")


if __name__ == "__main__":
    main()
