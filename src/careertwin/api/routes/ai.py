from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status

from careertwin.ai.contracts import AITask
from careertwin.ai.gemini import (
    GeminiConfigurationError,
    GeminiResponseError,
    GeminiStructuredClient,
    configured_task_models,
    key_is_configured,
)
from careertwin.api.auth import AuthContext, get_auth_context, require_write_role
from careertwin.api.dependencies import get_gemini_client
from careertwin.api.schemas import AIConfigResponse, AITestRequest, EmbeddingTestRequest
from careertwin.config import get_settings

router = APIRouter(prefix="/v1/ai", tags=["Gemini AI testing"])


@router.get("/config", response_model=AIConfigResponse)
async def read_ai_config() -> AIConfigResponse:
    settings = get_settings()
    return AIConfigResponse(
        provider=settings.ai_provider,
        api_key_configured=key_is_configured(settings),
        task_models=configured_task_models(settings),
        embedding_model=settings.gemini_embedding_model,
        embedding_dimension=settings.embedding_dimension,
        provider_storage_enabled=settings.gemini_store_interactions,
    )


def provider_error(error: Exception) -> HTTPException:
    status_code = (
        status.HTTP_503_SERVICE_UNAVAILABLE
        if isinstance(error, GeminiConfigurationError)
        else status.HTTP_502_BAD_GATEWAY
    )
    return HTTPException(status_code=status_code, detail=str(error))


COMMON_RESPONSES = {
    status.HTTP_401_UNAUTHORIZED: {"description": "Unauthorized: valid development identity headers are required"},
    status.HTTP_403_FORBIDDEN: {"description": "Forbidden: write access denied"},
    status.HTTP_422_UNPROCESSABLE_ENTITY: {"description": "Validation Error: invalid input or task schema"},
    status.HTTP_502_BAD_GATEWAY: {"description": "Bad Gateway: Gemini request failed or schema validation failed"},
    status.HTTP_503_SERVICE_UNAVAILABLE: {"description": "Service Unavailable: Gemini configuration error or production identity restriction"},
}


@router.post("/tasks/{task}/test", response_model=dict[str, Any], responses=COMMON_RESPONSES)
async def test_task(
    task: AITask,
    request: AITestRequest,
    client: Annotated[GeminiStructuredClient, Depends(get_gemini_client)],
    auth: Annotated[AuthContext, Depends(get_auth_context)],
) -> dict[str, Any]:
    require_write_role(auth)
    try:
        return await client.execute(task, request.input_text, request.context)
    except (GeminiConfigurationError, GeminiResponseError) as error:
        raise provider_error(error) from error


@router.post("/embeddings/test", response_model=dict[str, Any], responses=COMMON_RESPONSES)
async def test_embedding(
    request: EmbeddingTestRequest,
    client: Annotated[GeminiStructuredClient, Depends(get_gemini_client)],
    auth: Annotated[AuthContext, Depends(get_auth_context)],
) -> dict[str, Any]:
    require_write_role(auth)
    try:
        return await client.embed(request.text)
    except (GeminiConfigurationError, GeminiResponseError) as error:
        raise provider_error(error) from error
