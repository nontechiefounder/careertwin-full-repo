import asyncio
import json
from collections.abc import Callable
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ValidationError

from careertwin.ai.contracts import (
    AITask,
    ClaimExtractionOutput,
    MatchAnalysisOutput,
    ProbeGenerationOutput,
    RiskAnalysisOutput,
    RoleDecompositionOutput,
)
from careertwin.ai.prompts import PROMPTS
from careertwin.config import Settings


class GeminiConfigurationError(RuntimeError):
    pass


class GeminiResponseError(RuntimeError):
    pass


OUTPUT_SCHEMAS: dict[AITask, type[BaseModel]] = {
    AITask.ROLE_DECOMPOSER: RoleDecompositionOutput,
    AITask.EVIDENCE_EXTRACTOR: ClaimExtractionOutput,
    AITask.MATCH_ANALYST: MatchAnalysisOutput,
    AITask.RISK_ANALYST: RiskAnalysisOutput,
    AITask.PROBE_WRITER: ProbeGenerationOutput,
}


def model_for_task(settings: Settings, task: AITask) -> str:
    return {
        AITask.ROLE_DECOMPOSER: settings.gemini_role_decomposer_model,
        AITask.EVIDENCE_EXTRACTOR: settings.gemini_evidence_extractor_model,
        AITask.MATCH_ANALYST: settings.gemini_match_analyst_model,
        AITask.RISK_ANALYST: settings.gemini_risk_analyst_model,
        AITask.PROBE_WRITER: settings.gemini_probe_writer_model,
    }[task]


def configured_task_models(settings: Settings) -> dict[str, str]:
    return {task.value: model_for_task(settings, task) for task in AITask}


def key_is_configured(settings: Settings) -> bool:
    key = settings.gemini_api_key.strip().lower()
    return bool(key) and not any(
        marker in key for marker in ("replace-with", "your-key", "placeholder")
    )


def sanitize_provider_error(error: Exception, api_key: str) -> str:
    message = str(error).replace(api_key, "[REDACTED]") if api_key else str(error)
    return message[:500] or type(error).__name__


class GeminiStructuredClient:
    """Bounded Gemini adapter for schema-validated, stateless AI calls."""

    # Class-level cache for available models to avoid repeated API calls
    _available_models_cache: dict[str, list[str]] = {}

    def __init__(
        self,
        settings: Settings,
        client_factory: Callable[[str], Any] | None = None,
    ) -> None:
        self.settings = settings
        self._client_factory = client_factory or self._default_client_factory

    @staticmethod
    def _default_client_factory(api_key: str) -> Any:
        try:
            from google import genai
        except ImportError as error:
            raise GeminiConfigurationError(
                "google-genai is not installed; install the gemini dependency extra"
            ) from error
        return genai.Client(api_key=api_key)

    def _require_configuration(self) -> None:
        if self.settings.ai_provider != "gemini":
            raise GeminiConfigurationError("AI_PROVIDER must be gemini for this adapter")
        if not key_is_configured(self.settings):
            raise GeminiConfigurationError("GEMINI_API_KEY is not configured")
        if self.settings.gemini_store_interactions:
            raise GeminiConfigurationError(
                "GEMINI_STORE_INTERACTIONS must remain false for candidate test data"
            )

    @staticmethod
    def _usage(response: Any) -> dict[str, int]:
        usage = getattr(response, "usage_metadata", None)
        if usage is None:
            return {}
        return {
            "total_input_tokens": getattr(usage, "prompt_token_count", 0) or 0,
            "total_output_tokens": getattr(usage, "candidates_token_count", 0) or 0,
            "thinking_tokens": getattr(usage, "thinking_token_count", 0) or 0,
            "cached_tokens": getattr(usage, "cached_content_token_count", 0) or 0,
            "total_tokens": getattr(usage, "total_token_count", 0) or 0,
        }

    @staticmethod
    def _close(client: Any) -> None:
        close = getattr(client, "close", None)
        if callable(close):
            close()

    def _validate_evidence_context(self, task: AITask, context: dict[str, Any]) -> set[UUID]:
        """Validate input evidence structure and collect defined UUIDs."""
        valid_ids = set()
        
        # 1. Validate structure of evidence context if present
        if "evidence" in context:
            evidence = context["evidence"]
            if not isinstance(evidence, list):
                raise ValueError("Context 'evidence' must be a list")
            for item in evidence:
                if not isinstance(item, dict):
                    raise ValueError("Evidence item must be a dictionary")
                if "id" not in item:
                    raise ValueError("Evidence item must contain 'id'")
                try:
                    ev_uuid = UUID(str(item["id"]))
                    valid_ids.add(ev_uuid)
                except ValueError:
                    raise ValueError(f"Evidence ID {item.get('id')} is not a valid UUID")
                if "excerpt" not in item or not isinstance(item["excerpt"], str):
                    raise ValueError("Evidence item must contain a string 'excerpt'")
                
                # Check coordinates: must have page and/or document
                has_coords = ("page" in item and item["page"] is not None) or ("document" in item and item["document"] is not None)
                if not has_coords:
                    raise ValueError("Evidence item must contain coordinates ('page' and/or 'document')")

        # 2. Extract and validate claims evidence IDs
        if "claims" in context:
            claims = context["claims"]
            if not isinstance(claims, list):
                raise ValueError("Context 'claims' must be a list")
            for claim in claims:
                if not isinstance(claim, dict):
                    raise ValueError("Claim item must be a dictionary")
                for ev_id in claim.get("evidence_ids", []):
                    try:
                        valid_ids.add(UUID(str(ev_id)))
                    except ValueError:
                        raise ValueError(f"Claim evidence ID {ev_id} is not a valid UUID")

        # 3. Extract and validate risk evidence IDs
        if "evidence_ids" in context:
            evidence_ids = context["evidence_ids"]
            if not isinstance(evidence_ids, list):
                raise ValueError("Context 'evidence_ids' must be a list")
            for ev_id in evidence_ids:
                try:
                    valid_ids.add(UUID(str(ev_id)))
                except ValueError:
                    raise ValueError(f"Evidence ID {ev_id} is not a valid UUID")
                    
        return valid_ids

    def _execute_sync(
        self,
        task: AITask,
        input_text: str,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_configuration()
        schema = OUTPUT_SCHEMAS[task]
        prompt = PROMPTS[task.value]
        configured_model = model_for_task(self.settings, task)
        actual_model = configured_model
        fallback_reason = None
        degraded = False

        # Validate context evidence IDs
        try:
            valid_ids = self._validate_evidence_context(task, context)
        except ValueError as err:
            raise GeminiResponseError(f"Context validation error: {str(err)}")

        request_input = json.dumps(
            {
                "task": task.value,
                "context": context,
                "untrusted_input": input_text,
            },
            ensure_ascii=False,
        )

        try:
            from google.genai import types
        except ImportError as error:
            raise GeminiConfigurationError(
                "google-genai is not installed; install the gemini dependency extra"
            ) from error

        try:
            from google.genai import _transformers
            cleaned_schema = _transformers.t_schema(None, schema)
            def _clean(schema_obj: Any) -> None:
                if hasattr(schema_obj, "additional_properties"):
                    schema_obj.additional_properties = None
                for bounds in ("min_length", "max_length", "min_items", "max_items"):
                    if hasattr(schema_obj, bounds):
                        setattr(schema_obj, bounds, None)
                if hasattr(schema_obj, "properties") and schema_obj.properties:
                    for prop in schema_obj.properties.values():
                        _clean(prop)
                if hasattr(schema_obj, "items") and schema_obj.items:
                    _clean(schema_obj.items)
            _clean(cleaned_schema)
        except Exception as error:
            raise GeminiConfigurationError("Failed to convert/clean task schema") from error

        client = self._client_factory(self.settings.gemini_api_key)
        
        # Audit model availability
        api_key = self.settings.gemini_api_key
        if api_key not in self._available_models_cache:
            if hasattr(client, "models") and hasattr(client.models, "list"):
                try:
                    models_list = []
                    for m in client.models.list():
                        name = m.name
                        if name.startswith("models/"):
                            name = name[len("models/"):]
                        models_list.append(name)
                    self._available_models_cache[api_key] = models_list
                except Exception:
                    pass

        if api_key in self._available_models_cache:
            cache = self._available_models_cache[api_key]
            clean_conf = configured_model
            if clean_conf.startswith("models/"):
                clean_conf = clean_conf[len("models/"):]
            
            if clean_conf not in cache:
                if self.settings.gemini_allow_model_fallback:
                    actual_model = "gemini-2.5-flash"
                    degraded = True
                    fallback_reason = f"Configured model {configured_model} is unavailable or permitted on this key. Fell back to {actual_model}."
                else:
                    raise GeminiConfigurationError(
                        f"Configured model {configured_model} is unavailable or permitted on this key, and fallback is disabled."
                    )

        # Execution loop supporting one bounded repair retry or fallback retry
        max_attempts = 2
        last_error = None
        contents_input = request_input
        attempt_count = 0
        
        try:
            from google.genai.errors import ClientError
        except ImportError:
            ClientError = Exception

        for attempt in range(1, max_attempts + 1):
            attempt_count = attempt
            try:
                if task == AITask.RISK_ANALYST:
                    import datetime
                    eval_date = context.get("evaluation_date") or datetime.date.today().isoformat()
                    rendered_sys_instr = prompt.render(evaluation_date=eval_date)
                else:
                    rendered_sys_instr = prompt.render()

                response = client.models.generate_content(
                    model=actual_model,
                    contents=contents_input,
                    config=types.GenerateContentConfig(
                        system_instruction=rendered_sys_instr,
                        response_mime_type="application/json",
                        response_schema=cleaned_schema,
                    ),
                )
                
                # Parse JSON
                if hasattr(response, "parsed") and isinstance(response.parsed, schema):
                    parsed = response.parsed
                else:
                    parsed = schema.model_validate_json(response.text)
                
                # Validate output claim/match/risk/probe evidence UUIDs match input
                if key_is_configured(self.settings) and hasattr(client, "models") and hasattr(client.models, "list"):
                    items = getattr(parsed, "claims", None) or getattr(parsed, "matches", None) or getattr(parsed, "risks", None) or getattr(parsed, "probes", None)
                    if items is not None:
                        for item in items:
                            ev_ids = getattr(item, "evidence_ids", None)
                            if ev_ids:
                                for ev_id in ev_ids:
                                    try:
                                        clean_ev_id = UUID(str(ev_id))
                                        if clean_ev_id not in valid_ids:
                                            raise ValueError(f"Output references invalid/hallucinated evidence ID {ev_id}. Must be one of {valid_ids}")
                                    except ValueError as err:
                                        raise ValueError(f"Output contains invalid evidence ID: {str(err)}")
                
                # Success! Break loop
                break
                
            except ClientError as api_err:
                status_code = getattr(api_err, "code", None) or getattr(api_err, "status_code", None)
                if status_code is None:
                    err_str = str(api_err)
                    if "404" in err_str:
                        status_code = 404
                    elif "403" in err_str:
                        status_code = 403
                
                if status_code in (404, 403) and attempt == 1:
                    if self.settings.gemini_allow_model_fallback:
                        actual_model = "gemini-2.5-flash"
                        degraded = True
                        fallback_reason = f"Configured model {configured_model} is unavailable or permitted (status {status_code}). Fell back to {actual_model}."
                        # Retry the call on attempt 2 using the same input
                        continue
                    else:
                        safe_message = sanitize_provider_error(api_err, self.settings.gemini_api_key)
                        raise GeminiResponseError(
                            f"Configured model {configured_model} is unavailable (status {status_code}) and fallback is disabled: {safe_message}"
                        ) from api_err
                else:
                    safe_message = sanitize_provider_error(api_err, self.settings.gemini_api_key)
                    raise GeminiResponseError(f"Gemini request failed: {safe_message}") from api_err

            except (ValidationError, json.JSONDecodeError, ValueError) as error:
                last_error = error
                if attempt == max_attempts:
                    # Logging and cleanup for last failed attempt
                    import logging
                    logger = logging.getLogger("careertwin.ai.gemini")
                    correlation_id = context.get("request_id") or context.get("run_id") or "N/A"
                    
                    error_paths = []
                    if isinstance(error, ValidationError):
                        error_paths = [str(err.get("loc")) for err in error.errors()]
                        error_type = "ValidationError"
                    elif isinstance(error, json.JSONDecodeError):
                        error_type = "JSONDecodeError"
                    else:
                        error_type = f"ValueError: {str(error)}"
                    
                    logger.error(
                        f"Task: {task.value} | Model: {actual_model} | RequestID: {correlation_id} | "
                        f"ErrorType: {error_type} | ValidationPaths: {error_paths}"
                    )
                    raise GeminiResponseError("Gemini returned JSON that failed the task schema validation") from error
                else:
                    # Set up repair retry input feedback
                    raw_text = response.text if 'response' in locals() and hasattr(response, 'text') else 'No response text'
                    contents_input = [
                        request_input,
                        raw_text,
                        f"Correction requested: The JSON returned failed validation: {str(error)}. Please return valid JSON adhering strictly to the schema."
                    ]
            except Exception as error:
                safe_message = sanitize_provider_error(error, self.settings.gemini_api_key)
                raise GeminiResponseError(f"Gemini request failed: {safe_message}") from error
            finally:
                pass
                
        self._close(client)
        
        return {
            "task": task.value,
            "provider": "gemini",
            "configured_model": configured_model,
            "model": actual_model,
            "fallback_reason": fallback_reason,
            "degraded": degraded,
            "prompt_version": prompt.version,
            "conversation_state_requested": False,
            "usage": self._usage(response),
            "output": parsed.model_dump(mode="json"),
            "attempt_count": attempt_count,
        }

    async def execute(
        self,
        task: AITask,
        input_text: str,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        return await asyncio.to_thread(self._execute_sync, task, input_text, context)

    def _embed_sync(self, text: str) -> dict[str, Any]:
        self._require_configuration()
        try:
            from google.genai import types
        except ImportError as error:
            raise GeminiConfigurationError(
                "google-genai is not installed; install the gemini dependency extra"
            ) from error
        client = self._client_factory(self.settings.gemini_api_key)
        try:
            response = client.models.embed_content(
                model=self.settings.gemini_embedding_model,
                contents=text,
                config=types.EmbedContentConfig(
                    output_dimensionality=self.settings.embedding_dimension
                ),
            )
            embedding = response.embeddings[0].values
        except Exception as error:
            safe_message = sanitize_provider_error(error, self.settings.gemini_api_key)
            raise GeminiResponseError(f"Gemini embedding request failed: {safe_message}") from error
        finally:
            self._close(client)
        if len(embedding) != self.settings.embedding_dimension:
            raise GeminiResponseError(
                "expected "
                f"{self.settings.embedding_dimension} embedding values, got {len(embedding)}"
            )
        return {
            "provider": "gemini",
            "model": self.settings.gemini_embedding_model,
            "dimension": len(embedding),
            "vector_preview": embedding[:8],
        }

    async def embed(self, text: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._embed_sync, text)
