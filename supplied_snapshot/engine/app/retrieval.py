from __future__ import annotations

import json
import math
import time
import importlib.metadata
from dataclasses import dataclass
from typing import Iterable, Sequence

from rapidfuzz import fuzz
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ApprovedRequirement, FieldSupportLink, QuestionnaireAnswer, Role, ShareItem, SourceDocument

RETRIEVAL_DOCUMENT_VERSION = "WORKBYLINE_APPROVED_REQUIREMENT_RETRIEVAL_V1"
BGE_MODEL_ID = "BAAI/bge-small-en-v1.5"
BGE_MODEL_REVISION = "5c38ec7c405ec4b44b94cc5a9bb96e735b38267a"
BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


def _scalar(value: str | None, fallback: str = "UNKNOWN") -> str:
    if value is None:
        return fallback
    value = " ".join(str(value).split())
    return value if value else fallback


def _list(values: Sequence[str] | None) -> str:
    clean = [" ".join(str(v).split()) for v in (values or []) if str(v).strip()]
    return json.dumps(clean, ensure_ascii=False, separators=(",", ":"))


@dataclass(frozen=True)
class RetrievalRecord:
    id: str
    workspace_id: str
    role_id: str
    actual_work: str
    criticality: str = "UNKNOWN"
    alternatives: tuple[str, ...] = ()
    reason: str | None = None
    reason_state: str = "UNKNOWN"
    acceptable_proof: str | None = None
    proof_state: str = "UNKNOWN"
    uncertainty: str | None = None
    source_ids: tuple[str, ...] = ()
    source_wordings: tuple[str, ...] = ()
    document_version: str = RETRIEVAL_DOCUMENT_VERSION

    @classmethod
    def from_mapping(cls, data: dict) -> "RetrievalRecord":
        return cls(
            id=data["id"],
            workspace_id=data["workspace_id"],
            role_id=data.get("role_id", "UNKNOWN"),
            actual_work=data["actual_work"],
            criticality=data.get("criticality") or "UNKNOWN",
            alternatives=tuple(data.get("alternatives") or []),
            reason=data.get("reason"),
            reason_state=data.get("reason_state") or "UNKNOWN",
            acceptable_proof=data.get("acceptable_proof"),
            proof_state=data.get("proof_state") or "UNKNOWN",
            uncertainty=data.get("uncertainty"),
            source_ids=tuple(data.get("source_ids") or []),
            source_wordings=tuple(data.get("source_wordings") or []),
            document_version=data.get("document_version") or RETRIEVAL_DOCUMENT_VERSION,
        )

    @property
    def retrieval_document(self) -> str:
        """Canonical candidate representation used by API and every evaluator.

        Field labels are intentionally retained so criticality/negation-sensitive
        information is not erased before lexical or embedding retrieval. Source IDs
        are provenance identifiers only; their presence does not establish semantic support.
        """
        return "\n".join([
            f"DOCUMENT_VERSION: {self.document_version}",
            f"ACTUAL_WORK: {_scalar(self.actual_work)}",
            f"CRITICALITY: {_scalar(self.criticality)}",
            f"ALTERNATIVES: {_list(self.alternatives)}",
            f"REASON: {_scalar(self.reason)}",
            f"REASON_STATE: {_scalar(self.reason_state)}",
            f"ACCEPTABLE_PROOF: {_scalar(self.acceptable_proof)}",
            f"PROOF_STATE: {_scalar(self.proof_state)}",
            f"UNCERTAINTY: {_scalar(self.uncertainty, 'NONE')}",
            f"SOURCE_IDS: {_list(sorted(self.source_ids))}",
        ])


@dataclass(frozen=True)
class RetrievalHit:
    record: RetrievalRecord
    score: float
    rank: int
    method: str
    disposition: str = "RELATED_FOR_HUMAN_REVIEW"

    @property
    def id(self) -> str:
        return self.record.id

    @property
    def workspace_id(self) -> str:
        return self.record.workspace_id

    @property
    def text(self) -> str:
        return self.record.retrieval_document


def approved_requirement_records(db: Session, workspace_id: str) -> list[RetrievalRecord]:
    """Scope in SQL before any candidate representation is constructed or scored."""
    rows = db.scalars(
        select(ApprovedRequirement).where(ApprovedRequirement.workspace_id == workspace_id)
    ).all()
    return approved_requirement_records_for_rows(rows)


def scope_records(records: Iterable[RetrievalRecord], workspace_id: str) -> list[RetrievalRecord]:
    """Synthetic-eval equivalent of the SQL workspace predicate; called before scoring."""
    return [r for r in records if r.workspace_id == workspace_id]


def rapidfuzz_score(query: str, retrieval_document: str) -> float:
    # Deliberately lexical. It does not establish semantic equivalence or entailment.
    return float(fuzz.WRatio(query, retrieval_document)) / 100.0


def rank_rapidfuzz(query: str, candidates: Sequence[RetrievalRecord], k: int = 5) -> list[RetrievalHit]:
    scored = [(r, rapidfuzz_score(query, r.retrieval_document)) for r in candidates]
    scored.sort(key=lambda item: (-item[1], item[0].id))
    return [
        RetrievalHit(record=r, score=score, rank=i + 1, method="RAPIDFUZZ_WRATIO_RETRIEVAL_DOC_V1")
        for i, (r, score) in enumerate(scored[:k])
    ]


NEGATION_PATTERNS = (
    "not required",
    "not mandatory",
    "isn't required",
    "is not required",
    "not a requirement",
)


def normalize_work(value: str) -> str:
    return " ".join(value.lower().split())


def explicit_negation_profile(record: RetrievalRecord) -> dict:
    """Conservative structured view derived only from approved wording/uncertainty.

    Absence of a matched phrase is NOT evidence that no negation exists; it is reported
    as NOT_OBSERVED_IN_APPROVED_WORDING rather than FALSE.
    """
    evidence: list[str] = []
    texts = []
    if record.uncertainty:
        texts.append(record.uncertainty)
    texts.extend(record.source_wordings)
    for text in texts:
        low = text.lower()
        if any(pattern in low for pattern in NEGATION_PATTERNS):
            evidence.append(text)
    if evidence:
        return {"state": "EXPLICIT_NOT_REQUIRED", "evidence": list(dict.fromkeys(evidence))}
    return {"state": "NOT_OBSERVED_IN_APPROVED_WORDING", "evidence": []}


def _source_references(db: Session, req: ApprovedRequirement) -> list[dict]:
    refs: list[dict] = []
    for source_id in req.source_document_ids or []:
        doc = db.get(SourceDocument, source_id)
        refs.append({
            "type": "SOURCE_DOCUMENT",
            "source_id": source_id,
            "filename": doc.filename if doc else None,
            "source_version": doc.source_version if doc else None,
        })
    for answer_id in req.source_answer_ids or []:
        answer = db.get(QuestionnaireAnswer, answer_id)
        refs.append({
            "type": "QUESTIONNAIRE_ANSWER_VERSION",
            "source_id": answer_id,
            "key": answer.key if answer else None,
            "version": answer.version if answer else None,
        })
    # Handoff copies intentionally do not inherit raw personal source_wordings.
    # The share item provides opaque provenance without exposing its snapshot payload.
    links = db.scalars(
        select(FieldSupportLink).where(
            FieldSupportLink.proposed_requirement_id == req.proposed_requirement_id,
            FieldSupportLink.source_type == "SHARE_ITEM",
        )
    ).all()
    seen = set()
    for link in links:
        item = db.get(ShareItem, link.source_id)
        if not item or item.id in seen:
            continue
        seen.add(item.id)
        refs.append({
            "type": "SHARE_ITEM",
            "share_item_id": item.id,
            "share_request_id": item.share_request_id,
            "source_entity_type": item.source_entity_type,
            "source_entity_id": item.source_entity_id,
            "snapshot_hash": item.snapshot_hash,
        })
    return refs


def _role_scope(db: Session, anchor: RetrievalRecord, candidate: RetrievalRecord) -> dict:
    a_role = db.get(Role, anchor.role_id)
    c_role = db.get(Role, candidate.role_id)
    return {
        "anchor_role_id": anchor.role_id,
        "anchor_role_title": a_role.title if a_role else None,
        "candidate_role_id": candidate.role_id,
        "candidate_role_title": c_role.title if c_role else None,
        "relation": "SAME_ROLE" if anchor.role_id == candidate.role_id else "DIFFERENT_ROLE_SAME_WORKSPACE",
    }


def _criticality_relation(anchor: str, candidate: str) -> str:
    if anchor == candidate:
        return "SAME"
    if "UNKNOWN" in {anchor, candidate}:
        return "UNRESOLVED"
    if {anchor, candidate} == {"REQUIRED", "PREFERRED"}:
        return "REQUIRED_VS_PREFERRED_CONFLICT"
    return "DIFFERENT"


def _comparison(db: Session, anchor_req: ApprovedRequirement, anchor: RetrievalRecord,
                candidate_req: ApprovedRequirement, candidate: RetrievalRecord,
                lexical_rank: int | None, lexical_score: float | None,
                included_by: list[str]) -> dict:
    anchor_neg = explicit_negation_profile(anchor)
    candidate_neg = explicit_negation_profile(candidate)
    conflict_reasons: list[str] = []
    same_work = normalize_work(anchor.actual_work) == normalize_work(candidate.actual_work)
    crit_relation = _criticality_relation(anchor.criticality, candidate.criticality)
    if same_work and crit_relation == "REQUIRED_VS_PREFERRED_CONFLICT":
        conflict_reasons.append("SAME_WORK_REQUIRED_VS_PREFERRED")
    if same_work:
        states = {anchor_neg["state"], candidate_neg["state"]}
        criticalities = {anchor.criticality, candidate.criticality}
        if "EXPLICIT_NOT_REQUIRED" in states and "REQUIRED" in criticalities:
            conflict_reasons.append("SAME_WORK_REQUIRED_VS_EXPLICIT_NOT_REQUIRED")

    return {
        "candidate_requirement_id": candidate.id,
        "disposition": (
            "CONFLICTING_RELATED_RECORDS_FOR_HUMAN_REVIEW"
            if conflict_reasons else "POTENTIALLY_RELATED_FOR_HUMAN_REVIEW"
        ),
        "conflict_reasons": conflict_reasons,
        "candidate_generation": {
            "included_by": included_by,
            "lexical_rank": lexical_rank,
            "lexical_score": lexical_score,
            "missed_by_lexical_top_k": lexical_rank is None,
        },
        "side_by_side": {
            "criticality": {
                "anchor": anchor.criticality,
                "candidate": candidate.criticality,
                "relation": crit_relation,
            },
            "explicit_negation": {
                "anchor": anchor_neg,
                "candidate": candidate_neg,
            },
            "alternatives": {
                "anchor": list(anchor.alternatives),
                "candidate": list(candidate.alternatives),
            },
            "role_scope": _role_scope(db, anchor, candidate),
            "uncertainty": {
                "anchor": anchor.uncertainty,
                "candidate": candidate.uncertainty,
            },
            "source_references": {
                "anchor": _source_references(db, anchor_req),
                "candidate": _source_references(db, candidate_req),
            },
            "source_wordings": {
                "anchor": list(anchor.source_wordings),
                "candidate": list(candidate.source_wordings),
            },
        },
        "not_authorized_to_do": [
            "MERGE_REQUIREMENTS",
            "CHOOSE_WINNER",
            "RESOLVE_CONFLICT",
            "CREATE_LEARNED_PATTERN",
        ],
    }


def field_aware_review(db: Session, anchor_requirement_id: str, workspace_id: str,
                       lexical_k: int = 5) -> dict:
    """Build a deterministic human-review view from one approved requirement.

    Candidate generation is lexical only in the verified runtime. Structured expansion
    then guarantees exact-same-work records are shown even when outside lexical top-k.
    No merge or conflict resolution is performed.
    """
    anchor_req = db.get(ApprovedRequirement, anchor_requirement_id)
    if not anchor_req or anchor_req.workspace_id != workspace_id:
        raise LookupError("approved requirement not found in workspace")

    all_reqs = db.scalars(
        select(ApprovedRequirement).where(ApprovedRequirement.workspace_id == workspace_id)
    ).all()
    by_id = {r.id: r for r in all_reqs}
    records = {r.id: rec for r in all_reqs for rec in approved_requirement_records_for_rows([r])}
    anchor = records[anchor_req.id]
    candidates = [records[r.id] for r in all_reqs if r.id != anchor_req.id]

    lexical_hits = rank_rapidfuzz(anchor.retrieval_document, candidates, k=lexical_k)
    lexical_map = {h.id: h for h in lexical_hits}
    selected_ids = set(lexical_map)
    same_work_ids = {
        r.id for r in candidates
        if normalize_work(r.actual_work) == normalize_work(anchor.actual_work)
    }
    selected_ids.update(same_work_ids)

    comparisons = []
    for cid in selected_ids:
        candidate = records[cid]
        hit = lexical_map.get(cid)
        included_by = []
        if hit:
            included_by.append("LEXICAL_TOP_K")
        if cid in same_work_ids:
            included_by.append("STRUCTURED_SAME_ACTUAL_WORK")
        comparisons.append(_comparison(
            db, anchor_req, anchor, by_id[cid], candidate,
            hit.rank if hit else None, hit.score if hit else None, included_by,
        ))

    comparisons.sort(key=lambda x: (
        0 if x["conflict_reasons"] else 1,
        x["candidate_generation"]["lexical_rank"] if x["candidate_generation"]["lexical_rank"] is not None else 10**9,
        x["candidate_requirement_id"],
    ))
    return {
        "anchor_requirement_id": anchor_req.id,
        "workspace_id": workspace_id,
        "candidate_generation_method": "RAPIDFUZZ_WRATIO_RETRIEVAL_DOC_V1_PLUS_STRUCTURED_SAME_ACTUAL_WORK_EXPANSION",
        "lexical_top_k": lexical_k,
        "disposition": "HUMAN_REVIEW_VIEW_ONLY",
        "anchor": {
            "actual_work": anchor.actual_work,
            "criticality": anchor.criticality,
            "alternatives": list(anchor.alternatives),
            "explicit_negation": explicit_negation_profile(anchor),
            "role_scope": _role_scope(db, anchor, anchor),
            "uncertainty": anchor.uncertainty,
            "source_references": _source_references(db, anchor_req),
            "source_wordings": list(anchor.source_wordings),
        },
        "related_records": comparisons,
        "not_authorized_to_do": [
            "MERGE_REQUIREMENTS",
            "CHOOSE_WINNER",
            "RESOLVE_CONFLICT",
            "CREATE_LEARNED_PATTERN",
        ],
    }


def approved_requirement_records_for_rows(rows: Sequence[ApprovedRequirement]) -> list[RetrievalRecord]:
    records: list[RetrievalRecord] = []
    for r in rows:
        source_ids = tuple(sorted(set((r.source_document_ids or []) + (r.source_answer_ids or []))))
        records.append(RetrievalRecord(
            id=r.id,
            workspace_id=r.workspace_id,
            role_id=r.role_id,
            actual_work=r.actual_work,
            criticality=r.criticality or "UNKNOWN",
            alternatives=tuple(r.alternatives or []),
            reason=r.reason,
            reason_state=r.reason_state or "UNKNOWN",
            acceptable_proof=r.acceptable_proof,
            proof_state=r.proof_state or "UNKNOWN",
            uncertainty=r.uncertainty,
            source_ids=source_ids,
            source_wordings=tuple(r.source_wordings or []),
        ))
    return records


class BGERetriever:
    def __init__(self) -> None:
        try:
            installed = importlib.metadata.version("sentence-transformers")
            if installed != "6.1.0":
                raise RuntimeError(
                    f"sentence-transformers==6.1.0 is required; found {installed}"
                )
            from sentence_transformers import SentenceTransformer
        except Exception as exc:  # pragma: no cover - environment dependent
            raise RuntimeError(
                "sentence-transformers==6.1.0 is required for the pinned BGE retrieval benchmark; "
                "no lexical fallback is allowed"
            ) from exc
        self._SentenceTransformer = SentenceTransformer
        self.model = None
        self.load_seconds: float | None = None

    def load(self) -> None:
        if self.model is not None:
            return
        start = time.perf_counter()
        self.model = self._SentenceTransformer(BGE_MODEL_ID, revision=BGE_MODEL_REVISION)
        self.load_seconds = time.perf_counter() - start

    def rank(self, query: str, candidates: Sequence[RetrievalRecord], k: int = 5) -> list[RetrievalHit]:
        self.load()
        if not candidates:
            return []
        import numpy as np

        docs = [r.retrieval_document for r in candidates]
        doc_vecs = self.model.encode(docs, normalize_embeddings=True, convert_to_numpy=True)
        query_vec = self.model.encode(
            [BGE_QUERY_PREFIX + query], normalize_embeddings=True, convert_to_numpy=True
        )[0]
        scores = np.asarray(doc_vecs) @ np.asarray(query_vec)
        order = sorted(range(len(candidates)), key=lambda i: (-float(scores[i]), candidates[i].id))
        return [
            RetrievalHit(
                record=candidates[i],
                score=float(scores[i]),
                rank=rank,
                method=f"BGE_SMALL_EN_V1_5_RETRIEVAL_DOC_V1@{BGE_MODEL_REVISION[:7]}",
            )
            for rank, i in enumerate(order[:k], start=1)
        ]


def reciprocal_rank(ranked_ids: Sequence[str], relevant: set[str]) -> float:
    for i, rid in enumerate(ranked_ids, start=1):
        if rid in relevant:
            return 1.0 / i
    return 0.0


def recall_at_k(ranked_ids: Sequence[str], relevant: set[str], k: int) -> float:
    if not relevant:
        return 1.0
    return len(set(ranked_ids[:k]) & relevant) / len(relevant)


def ndcg_at_k(ranked_ids: Sequence[str], relevant: set[str], k: int) -> float:
    if not relevant:
        return 1.0
    dcg = 0.0
    for i, rid in enumerate(ranked_ids[:k], start=1):
        if rid in relevant:
            dcg += 1.0 / math.log2(i + 1)
    ideal_hits = min(k, len(relevant))
    idcg = sum(1.0 / math.log2(i + 1) for i in range(1, ideal_hits + 1))
    return dcg / idcg if idcg else 0.0
