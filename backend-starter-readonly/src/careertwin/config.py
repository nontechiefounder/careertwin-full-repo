from functools import lru_cache

from pydantic import Field

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
except ImportError:  # Keeps core domain tests runnable before full dependency sync.
    from pydantic import BaseModel as BaseSettings

    class SettingsConfigDict(dict):
        pass


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = "development"
    log_level: str = "INFO"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    database_url: str = "postgresql+psycopg://careertwin:careertwin@localhost:5432/careertwin"
    redis_url: str = "redis://localhost:6379/0"
    object_store_endpoint: str = "http://localhost:9000"
    object_store_access_key: str = "careertwin"
    object_store_secret_key: str = "development-only"
    object_store_bucket: str = "careertwin-evidence"
    ai_provider: str = "gemini"
    gemini_api_key: str = ""
    gemini_role_decomposer_model: str = "gemini-2.5-pro"
    gemini_evidence_extractor_model: str = "gemini-2.5-flash"
    gemini_match_analyst_model: str = "gemini-2.5-pro"
    gemini_risk_analyst_model: str = "gemini-2.5-flash"
    gemini_probe_writer_model: str = "gemini-2.5-flash-lite"
    gemini_embedding_model: str = "gemini-embedding-2"
    gemini_store_interactions: bool = False
    gemini_allow_model_fallback: bool = False
    model_base_url: str = "http://localhost:11434/v1"
    model_api_key: str = "local-development"
    model_name: str = "local-structured-model"
    embedding_base_url: str = "http://localhost:11434/v1"
    embedding_api_key: str = "local-development"
    embedding_model_name: str = "local-embedding-model"
    embedding_dimension: int = 1024
    session_secret: str = Field(default="development-only-change-me", min_length=16)


@lru_cache
def get_settings() -> Settings:
    return Settings()
