import json
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from careertwin.domain.models import Role, WorkflowRun


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateRoleRequest(ApiModel):
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(min_length=20, max_length=50_000)

    def to_domain(self, org_id: UUID) -> Role:
        return Role(org_id=org_id, title=self.title, description=self.description)


class CreateRunRequest(ApiModel):
    role_id: UUID
    candidate_ids: tuple[UUID, ...] = Field(min_length=1, max_length=50)

    def to_domain(self, org_id: UUID) -> WorkflowRun:
        return WorkflowRun(
            org_id=org_id,
            role_id=self.role_id,
            candidate_ids=self.candidate_ids,
        )


class UploadIntentRequest(ApiModel):
    candidate_id: UUID
    original_filename: str = Field(min_length=1, max_length=500)
    media_type: str = Field(min_length=1, max_length=200)


class UploadIntentResponse(ApiModel):
    document_id: UUID
    candidate_id: UUID
    object_key: str
    scan_status: str



class HealthResponse(ApiModel):
    status: str
    service: str = "careertwin-api"


class AITestRequest(ApiModel):
    input_text: str = Field(min_length=10, max_length=50_000)
    context: dict[str, Any] = Field(default_factory=dict)

    @field_validator("context")
    @classmethod
    def context_must_be_bounded(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value, ensure_ascii=False)) > 100_000:
            raise ValueError("context must not exceed 100,000 encoded characters")
        return value


class EmbeddingTestRequest(ApiModel):
    text: str = Field(min_length=2, max_length=8_000)


class AIConfigResponse(ApiModel):
    provider: str
    api_key_configured: bool
    task_models: dict[str, str]
    embedding_model: str
    embedding_dimension: int
    provider_storage_enabled: bool
    interactive_docs_url: str = "/docs"
