"""WorkByLine V2 — Grounding & Runtime Citation Verification
Defines typed Pydantic models for model output parsing, strict citation validation,
and server-enforced provenance binding.
"""
from __future__ import annotations

import re
from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator, model_validator


ALLOWED_STATUSES = {"GROUNDED", "AMBIGUOUS", "DISAGREEMENT", "INSUFFICIENT_EVIDENCE"}
MANDATORY_DISCLAIMER = "PUBLIC_RESEARCH / NOT_EMPLOYER_APPROVED"


class CitationObject(BaseModel):
    """Pydantic validated citation object."""
    claim: str = Field(..., min_length=1, description="Specific factual claim asserted in the answer")
    source_id: str = Field(..., min_length=2, description="Source identifier, e.g. S01")
    span_id: str = Field(..., min_length=3, description="Database span identifier, e.g. span_...")
    quote: str = Field(..., min_length=1, description="Verbatim non-empty substring from cited span")
    source_url: str | None = Field(default=None, description="Provenance-verified source URL")
    is_verified: bool = Field(default=False, description="Whether citation passed runtime verification")

    @field_validator("quote")
    @classmethod
    def validate_non_empty_quote(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Citation quote must not be empty or whitespace-only.")
        return v.strip()

    @field_validator("claim")
    @classmethod
    def validate_non_empty_claim(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Citation claim must not be empty or whitespace-only.")
        return v.strip()


class RawModelCitation(BaseModel):
    """Permissive parser for model-generated JSON citations before verification."""
    claim: str | None = None
    source_id: str | None = None
    span_id: str | None = None
    quote: str | None = None
    source_url: str | None = None


class RawModelOutput(BaseModel):
    """Parser for raw JSON from LLM generation."""
    answer: str = Field(..., min_length=1)
    citations: list[dict[str, Any]] = Field(default_factory=list)
    status: str = Field(default="UNVERIFIED_STATUS")
    disclaimer: str | None = None
    abstention_reason: str | None = None


def validate_runtime_citations(
    citations_raw: list[dict[str, Any]],
    passages: list[Any],
) -> tuple[list[dict[str, Any]], list[str]]:
    """Strict runtime validation of model-generated citation objects.
    Verifies:
    1. Citation is a dict with nonempty claim and nonempty quote.
    2. span_id exists in authorized retrieved context passages.
    3. source_id matches the document source ID of the span.
    4. quote is an exact, non-empty verbatim substring of the cited span text.
    5. source_url is bound to the source's actual provenance URL (rejects invented/mismatched URLs).

    Returns:
        (valid_citations, validation_errors)
    """
    valid_citations: list[dict[str, Any]] = []
    validation_errors: list[str] = []

    passage_map = {getattr(p, "span_id", None): p for p in passages}

    for idx, c in enumerate(citations_raw):
        if not isinstance(c, dict):
            validation_errors.append(f"Citation {idx} is not a valid JSON object.")
            continue

        claim = str(c.get("claim") or "").strip()
        span_id = str(c.get("span_id") or "").strip()
        source_id = str(c.get("source_id") or "").strip()
        quote = str(c.get("quote") or "").strip()
        model_url = c.get("source_url")
        if model_url:
            model_url = str(model_url).strip()

        # Check nonempty claim
        if not claim:
            validation_errors.append(f"Citation {idx} has an empty or missing claim.")
            continue

        # Check nonempty quote
        if not quote:
            validation_errors.append(f"Citation {idx} has an empty or whitespace-only quote.")
            continue

        # Check span_id existence in authorized retrieved passages
        if not span_id or span_id not in passage_map:
            validation_errors.append(f"Citation {idx} references unknown/unauthorized span ID: '{span_id}'")
            continue

        target_passage = passage_map[span_id]
        expected_source_id = getattr(target_passage, "source_id", None)
        expected_url = getattr(target_passage, "source_url", None)
        passage_text = getattr(target_passage, "text", "")

        # Check source_id match
        if source_id and source_id != expected_source_id:
            validation_errors.append(
                f"Citation {idx} source_id mismatch: expected '{expected_source_id}', got '{source_id}'"
            )
            continue

        # Check exact quote substring match in span text
        if quote not in passage_text:
            validation_errors.append(
                f"Citation {idx} quote is not an exact substring of span '{span_id}'."
            )
            continue

        # Check and bind URL to source provenance
        if model_url and expected_url and model_url != expected_url:
            validation_errors.append(
                f"Citation {idx} source_url mismatch with provenance: expected '{expected_url}', got '{model_url}'"
            )
            continue
        elif model_url and not expected_url:
            validation_errors.append(
                f"Citation {idx} provided source_url '{model_url}' but source document has no verified URL."
            )
            continue

        # URL is strictly bound to provenance
        final_url = expected_url

        try:
            cit_obj = CitationObject(
                claim=claim,
                source_id=expected_source_id or source_id,
                span_id=span_id,
                quote=quote,
                source_url=final_url,
                is_verified=True,
            )
            valid_citations.append(cit_obj.model_dump())
        except Exception as exc:
            validation_errors.append(f"Citation {idx} failed schema validation: {exc}")

    return valid_citations, validation_errors
