from __future__ import annotations

import os
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, File, Form, UploadFile, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db, init_database
from .models import (
    ContextVersion, FieldSupportLink, PatternEvidenceLink, PatternRun, PatternSuggestion,
    ProposedRequirement, QuestionnaireAnswer, QuestionnaireSession, Role, Workspace,
    WorkspaceMembership, SourceAssertion, SourceConflict, SourceDocument, SourceSpan, ShareRequest, ShareItem, ApprovedRequirement, new_id,
)
from .schemas import (
    AnswersUpsert, AuthLogin, ContextCreate, MemberCreate, ObservationCreate,
    RequirementPatch, ReviewRequest, RoleCreate, WorkspaceCreate, ShareRequestCreate, ShareAcceptRequest,
    ResearchQARequest,
)
from .research_qa import (
    search_research_passages, execute_research_qa, DEFAULT_GEMINI_MODEL, QuotaOrLimitExceeded,
)
from .auth import (
    authenticated_principal,
    issue_session,
    require_membership,
    require_permission,
    verify_delegated_authorization,
)
from .services import (
    approve_requirement, compile_questionnaire, create_context_version, current_answers,
    ensure_requirement_current, reject_requirement, review_observation, review_suggestion,
    run_review_prompt_discovery, upsert_answer_versions, create_share_request, accept_share_request,
)
from .models import Observation
from .ingestion import IngestionError, ingest_source
from .extraction import compile_source_requirements
from .retrieval import (
    BGE_MODEL_ID, BGE_MODEL_REVISION, RETRIEVAL_DOCUMENT_VERSION, BGERetriever,
    approved_requirement_records, field_aware_review, rank_rapidfuzz,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database()
    yield


app = FastAPI(title="WorkByline Pattern Engine — Synthetic Vertical", version="0.4.0", lifespan=lifespan)


def role_for_actor(db: Session, role_id: str, principal_id: str) -> tuple[Role, object]:
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(404, "role not found")
    ctx = require_membership(db, role.workspace_id, principal_id)
    return role, ctx


@app.get("/health")
def health():
    return {
        "status": "ok",
        "scope": "synthetic-only",
        "auth": "opaque-bearer-session",
        "ml": "not-in-this-vertical",
        "source_requirement_extraction": "deterministic-a1-synthetic",
    }


@app.post("/v1/auth/token")
def login(payload: AuthLogin, db: Session = Depends(get_db)):
    token, principal = issue_session(db, payload.username, payload.password)
    db.commit()
    return {"access_token": token, "token_type": "bearer", "principal_id": principal.principal_id}


@app.post("/v1/workspaces")
def create_workspace(
    payload: WorkspaceCreate,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    ws = Workspace(id=new_id("ws"), kind=payload.kind, display_name=payload.display_name)
    db.add(ws)
    db.flush()
    permissions = [
        "ROLE_CREATE", "CONTRIBUTE", "REVIEW_REQUIREMENT", "CONTEXT_APPROVE",
        "OBSERVATION_REVIEW", "SUGGESTION_REVIEW", "MEMBER_ADMIN",
    ]
    if payload.kind == "PERSONAL":
        permissions.append("HANDOFF_CREATE")
    else:
        permissions.append("HANDOFF_ACCEPT")
    db.add(WorkspaceMembership(
        id=new_id("mem"), workspace_id=ws.id, principal_id=principal_id,
        member_class="INTERNAL", permissions=permissions,
    ))
    db.commit()
    return {"workspace_id": ws.id, "kind": ws.kind, "display_name": ws.display_name}


@app.post("/v1/workspaces/{workspace_id}/members")
def add_member(
    workspace_id: str,
    payload: MemberCreate,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    ctx = require_membership(db, workspace_id, principal_id)
    require_permission(ctx, "MEMBER_ADMIN", internal_only=True)
    m = WorkspaceMembership(
        id=new_id("mem"), workspace_id=workspace_id, principal_id=payload.principal_id,
        member_class=payload.member_class, permissions=payload.permissions,
    )
    db.add(m)
    db.commit()
    return {"member_id": m.id}


@app.post("/v1/workspaces/{workspace_id}/roles")
def create_role(
    workspace_id: str,
    payload: RoleCreate,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    ctx = require_membership(db, workspace_id, principal_id)
    require_permission(ctx, "ROLE_CREATE")
    role = Role(id=new_id("role"), workspace_id=workspace_id, title=payload.title, intake_mode=payload.intake_mode)
    db.add(role)
    db.commit()
    return {"role_id": role.id, "title": role.title, "intake_mode": role.intake_mode}


@app.post("/v1/roles/{role_id}/questionnaires")
def create_questionnaire(
    role_id: str,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    role, ctx = role_for_actor(db, role_id, principal_id)
    require_permission(ctx, "CONTRIBUTE")
    if role.intake_mode != "GUIDED_QUESTIONNAIRE":
        raise HTTPException(409, "role is not configured for guided questionnaire intake")
    q = QuestionnaireSession(id=new_id("q"), workspace_id=role.workspace_id, role_id=role.id)
    db.add(q)
    db.commit()
    return {"questionnaire_id": q.id, "state": q.state, "revision": q.revision}


@app.put("/v1/questionnaires/{questionnaire_id}/answers")
def put_answers(
    questionnaire_id: str,
    payload: AnswersUpsert,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    q = db.get(QuestionnaireSession, questionnaire_id)
    if not q:
        raise HTTPException(404, "questionnaire not found")
    ctx = require_membership(db, q.workspace_id, principal_id)
    require_permission(ctx, "CONTRIBUTE")
    revision, created = upsert_answer_versions(db, q, payload.answers)
    db.commit()
    return {
        "questionnaire_id": q.id,
        "submitted_key_count": len(payload.answers),
        "new_answer_version_count": len(created),
        "revision": revision,
        "state": q.state,
    }


@app.get("/v1/questionnaires/{questionnaire_id}/answers/history")
def answer_history(
    questionnaire_id: str,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    q = db.get(QuestionnaireSession, questionnaire_id)
    if not q:
        raise HTTPException(404, "questionnaire not found")
    require_membership(db, q.workspace_id, principal_id)
    rows = db.scalars(select(QuestionnaireAnswer).where(
        QuestionnaireAnswer.questionnaire_id == q.id
    ).order_by(QuestionnaireAnswer.key, QuestionnaireAnswer.version)).all()
    return {
        "questionnaire_id": q.id,
        "revision": q.revision,
        "compiled_revision": q.compiled_revision,
        "state": q.state,
        "answers": [{
            "id": r.id,
            "key": r.key,
            "version": r.version,
            "is_current": r.is_current,
            "supersedes_id": r.supersedes_id,
            "content_hash": r.content_hash,
            "value": r.value,
        } for r in rows],
    }


@app.post("/v1/questionnaires/{questionnaire_id}/compile")
def compile_answers(
    questionnaire_id: str,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    q = db.get(QuestionnaireSession, questionnaire_id)
    if not q:
        raise HTTPException(404, "questionnaire not found")
    ctx = require_membership(db, q.workspace_id, principal_id)
    require_permission(ctx, "CONTRIBUTE")
    rows = compile_questionnaire(db, q)
    db.commit()
    return {
        "proposed_requirement_ids": [r.id for r in rows],
        "count": len(rows),
        "questionnaire_revision": q.revision,
        "compiled_revision": q.compiled_revision,
        "state": q.state,
    }


def requirement_json(db: Session, pr: ProposedRequirement):
    links = db.scalars(select(FieldSupportLink).where(FieldSupportLink.proposed_requirement_id == pr.id)).all()
    rendered_links=[]
    for x in links:
        item={
            "field": x.field_name, "source_type": x.source_type, "source_id": x.source_id,
            "relation": x.relation, "semantic_support": x.semantic_support,
        }
        if x.source_type == "SOURCE_SPAN":
            span=db.get(SourceSpan, x.source_id)
            if span:
                doc=db.get(SourceDocument, span.source_document_id)
                if doc:
                    item["citation"]={
                        "source_document_id": doc.id, "source_version": doc.source_version,
                        "filename": doc.filename, "span_id": span.id, "locator": span.locator,
                        "quoted_text": span.text, "text_hash": span.text_hash,
                    }
        elif x.source_type == "SHARE_ITEM":
            share_item = db.get(ShareItem, x.source_id)
            if share_item:
                item["share_provenance"] = {
                    "share_request_id": share_item.share_request_id,
                    "source_workspace_id": share_item.source_workspace_id,
                    "source_entity_type": share_item.source_entity_type,
                    "source_entity_id": share_item.source_entity_id,
                    "snapshot_hash": share_item.snapshot_hash,
                }
        rendered_links.append(item)
    return {
        "id": pr.id,
        "questionnaire_id": pr.questionnaire_id,
        "questionnaire_revision": pr.questionnaire_revision,
        "source_revision": pr.source_revision,
        "source_document_ids": pr.source_document_ids or [],
        "source_wordings": pr.source_wordings or [],
        "extraction_method": pr.extraction_method,
        "actual_work": pr.actual_work,
        "reason": pr.reason,
        "reason_state": pr.reason_state,
        "criticality": pr.criticality,
        "alternatives": pr.alternatives,
        "acceptable_proof": pr.acceptable_proof,
        "proof_state": pr.proof_state,
        "uncertainty": pr.uncertainty,
        "status": pr.status,
        "source_answer_ids": pr.source_answer_ids,
        "field_support_links": rendered_links,
    }


@app.get("/v1/roles/{role_id}/proposed-requirements")
def list_requirements(
    role_id: str,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    role, _ = role_for_actor(db, role_id, principal_id)
    q = db.scalar(select(QuestionnaireSession).where(
        QuestionnaireSession.role_id == role.id
    ).order_by(QuestionnaireSession.created_at.desc()))
    query = select(ProposedRequirement).where(ProposedRequirement.role_id == role.id)
    if role.intake_mode == "GUIDED_QUESTIONNAIRE" and q:
        query = query.where(
            (ProposedRequirement.questionnaire_revision == q.revision)
            | ProposedRequirement.questionnaire_revision.is_(None)
        )
    elif role.intake_mode in {"FILE_BACKED", "SCATTERED_SOURCES"}:
        query = query.where(ProposedRequirement.source_revision == role.source_revision)
    rows = db.scalars(query).all()
    return {"requirements": [requirement_json(db, r) for r in rows]}


@app.patch("/v1/proposed-requirements/{requirement_id}")
def patch_requirement(
    requirement_id: str,
    payload: RequirementPatch,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    pr = db.get(ProposedRequirement, requirement_id)
    if not pr:
        raise HTTPException(404, "requirement not found")
    ctx = require_membership(db, pr.workspace_id, principal_id)
    require_permission(ctx, "CONTRIBUTE")
    if pr.status != "PROPOSED":
        raise HTTPException(409, "only current proposed requirements can be edited")
    try:
        ensure_requirement_current(db, pr)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    changed = payload.model_dump(exclude_unset=True)
    for k, v in changed.items():
        setattr(pr, k, v)
        links=db.scalars(select(FieldSupportLink).where(
            FieldSupportLink.proposed_requirement_id == pr.id, FieldSupportLink.field_name == k
        )).all()
        for link in links:
            link.relation="HUMAN_EDIT_SOURCE_CONTEXT"
            link.semantic_support="NOT_ESTABLISHED"
    db.commit()
    return requirement_json(db, pr)


@app.post("/v1/proposed-requirements/{requirement_id}/reviews")
def review_requirement(
    requirement_id: str,
    payload: ReviewRequest,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    pr = db.get(ProposedRequirement, requirement_id)
    if not pr:
        raise HTTPException(404, "requirement not found")
    ctx = require_membership(db, pr.workspace_id, principal_id)
    require_permission(ctx, "REVIEW_REQUIREMENT", internal_only=True)
    try:
        if payload.decision == "APPROVE":
            ar = approve_requirement(db, pr, principal_id, payload.rationale)
            out = {"approved_requirement_id": ar.id}
        elif payload.decision == "REJECT":
            reject_requirement(db, pr, principal_id, payload.rationale)
            out = {"status": "REJECTED"}
        else:
            raise HTTPException(422, "DISMISS is not valid for requirements")
    except ValueError as exc:
        db.rollback()
        raise HTTPException(409, str(exc)) from exc
    db.commit()
    return out


@app.post("/v1/roles/{role_id}/context-versions")
def make_context(
    role_id: str,
    payload: ContextCreate,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    role, ctx = role_for_actor(db, role_id, principal_id)
    require_permission(ctx, "CONTEXT_APPROVE", internal_only=True)
    try:
        cv = create_context_version(db, role, principal_id, payload.kind)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(409, str(exc)) from exc
    db.commit()
    return {
        "context_version_id": cv.id,
        "version": cv.version_number,
        "kind": cv.kind,
        "pattern_state": cv.pattern_state,
        "approved_requirement_ids": cv.approved_requirement_ids,
        "approved_review_prompt_ids": cv.approved_review_prompt_ids,
    }


@app.get("/v1/roles/{role_id}/context-versions/latest")
def latest_context(
    role_id: str,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    role, _ = role_for_actor(db, role_id, principal_id)
    cv = db.scalar(select(ContextVersion).where(ContextVersion.role_id == role.id).order_by(ContextVersion.version_number.desc()))
    if not cv:
        raise HTTPException(404, "no context version")
    return {
        "context_version_id": cv.id,
        "version": cv.version_number,
        "kind": cv.kind,
        "pattern_state": cv.pattern_state,
        "approved_requirement_ids": cv.approved_requirement_ids,
        "approved_review_prompt_ids": cv.approved_review_prompt_ids,
        "supersedes_id": cv.supersedes_id,
    }


@app.post("/v1/roles/{role_id}/observations")
def add_observation(
    role_id: str,
    payload: ObservationCreate,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    role, ctx = role_for_actor(db, role_id, principal_id)
    require_permission(ctx, "CONTRIBUTE")
    obs = Observation(id=new_id("obs"), workspace_id=role.workspace_id, role_id=role.id, text=payload.text, created_by=principal_id)
    db.add(obs)
    db.commit()
    return {"observation_id": obs.id, "status": obs.status}


@app.post("/v1/observations/{observation_id}/reviews")
def obs_review(
    observation_id: str,
    payload: ReviewRequest,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    obs = db.get(Observation, observation_id)
    if not obs:
        raise HTTPException(404, "observation not found")
    ctx = require_membership(db, obs.workspace_id, principal_id)
    require_permission(ctx, "OBSERVATION_REVIEW", internal_only=True)
    if payload.decision not in {"APPROVE", "REJECT"}:
        raise HTTPException(422, "invalid observation review")
    review_observation(db, obs, principal_id, payload.decision, payload.rationale)
    db.commit()
    return {"status": obs.status}


@app.post("/v1/roles/{role_id}/pattern-runs")
def pattern_run(
    role_id: str,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    role, ctx = role_for_actor(db, role_id, principal_id)
    require_permission(ctx, "CONTRIBUTE")
    run, suggestions, reused = run_review_prompt_discovery(db, role)
    db.commit()
    return {
        "run_id": run.id,
        "input_fingerprint": run.input_fingerprint,
        "reused": reused,
        "state": run.state,
        "eligible_observation_count": run.eligible_observation_count,
        "suggestion_ids": [s.id for s in suggestions],
    }


@app.get("/v1/pattern-runs/{run_id}/suggestions")
def get_suggestions(
    run_id: str,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    run = db.get(PatternRun, run_id)
    if not run:
        raise HTTPException(404, "pattern run not found")
    require_membership(db, run.workspace_id, principal_id)
    rows = db.scalars(select(PatternSuggestion).where(PatternSuggestion.run_id == run.id)).all()
    out = []
    for s in rows:
        links = db.scalars(select(PatternEvidenceLink).where(PatternEvidenceLink.suggestion_id == s.id)).all()
        out.append({
            "id": s.id,
            "suggestion_type": s.suggestion_type,
            "topic": s.topic,
            "text": s.text,
            "support_count": s.support_count,
            "scope": s.scope,
            "small_sample_warning": s.small_sample_warning,
            "status": s.status,
            "evidence_links": [{
                "evidence_type": x.evidence_type,
                "evidence_id": x.evidence_id,
                "relation": x.relation,
                "semantic_support": x.semantic_support,
            } for x in links],
        })
    return {"suggestions": out}


@app.post("/v1/pattern-suggestions/{suggestion_id}/review")
def suggestion_review(
    suggestion_id: str,
    payload: ReviewRequest,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    s = db.get(PatternSuggestion, suggestion_id)
    if not s:
        raise HTTPException(404, "suggestion not found")
    ctx = require_membership(db, s.workspace_id, principal_id)
    require_permission(ctx, "SUGGESTION_REVIEW", internal_only=True)
    if payload.decision not in {"APPROVE", "DISMISS"}:
        raise HTTPException(422, "invalid suggestion decision")
    review_suggestion(db, s, principal_id, payload.decision, payload.rationale)
    db.commit()
    return {"status": s.status, "scope": s.scope}


@app.post("/v1/roles/{role_id}/sources")
async def upload_source(
    role_id: str,
    file: UploadFile = File(...),
    source_kind: str = Form(default="OTHER"),
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    role, ctx = role_for_actor(db, role_id, principal_id)
    require_permission(ctx, "CONTRIBUTE")
    if role.intake_mode not in {"FILE_BACKED", "SCATTERED_SOURCES"}:
        raise HTTPException(409, "role is not configured for file-backed/scattered-source intake")
    data = await file.read()
    try:
        source, deduplicated, conflicts = ingest_source(
            db, role, principal_id, file.filename or "upload.bin", file.content_type, source_kind, data
        )
        db.commit()
    except IngestionError as exc:
        db.commit()  # preserve the quarantined source record; raw content is not logged.
        raise HTTPException(status_code=422, detail={"source_id": exc.source_id, "error_code": exc.error_code}) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    return {
        "source_id": source.id,
        "source_version": source.source_version,
        "is_current": source.is_current,
        "deduplicated": deduplicated,
        "parse_status": source.parse_status,
        "file_format": source.file_format,
        "sha256": source.sha256,
        "span_count": source.span_count,
        "pii_flag_count": source.pii_flag_count,
        "new_conflict_ids": [c.id for c in conflicts],
        "role_source_revision": role.source_revision,
    }


@app.post("/v1/roles/{role_id}/source-requirements/compile")
def compile_sources_to_requirements(
    role_id: str,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    role, ctx = role_for_actor(db, role_id, principal_id)
    require_permission(ctx, "CONTRIBUTE")
    if role.intake_mode not in {"FILE_BACKED", "SCATTERED_SOURCES"}:
        raise HTTPException(409, "role is not configured for source-backed requirement compilation")
    rows = compile_source_requirements(db, role)
    db.commit()
    return {
        "proposed_requirement_ids": [r.id for r in rows],
        "count": len(rows),
        "source_revision": role.source_revision,
        "compiled_source_revision": role.compiled_source_revision,
        "method": "DETERMINISTIC_A1_SOURCE",
        "semantic_pattern_recognition": False,
    }


@app.get("/v1/roles/{role_id}/sources")
def list_sources(
    role_id: str,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    role, _ = role_for_actor(db, role_id, principal_id)
    rows = db.scalars(select(SourceDocument).where(SourceDocument.role_id == role.id).order_by(SourceDocument.created_at)).all()
    return {"sources": [{
        "id": r.id,
        "source_kind": r.source_kind,
        "filename": r.filename,
        "source_version": r.source_version,
        "is_current": r.is_current,
        "supersedes_id": r.supersedes_id,
        "file_format": r.file_format,
        "sha256": r.sha256,
        "byte_size": r.byte_size,
        "parse_status": r.parse_status,
        "span_count": r.span_count,
        "pii_flag_count": r.pii_flag_count,
        "error_code": r.error_code,
    } for r in rows]}


@app.get("/v1/sources/{source_id}/spans")
def source_spans(
    source_id: str,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    source = db.get(SourceDocument, source_id)
    if not source:
        raise HTTPException(404, "source not found")
    require_membership(db, source.workspace_id, principal_id)
    rows = db.scalars(select(SourceSpan).where(SourceSpan.source_document_id == source.id).order_by(SourceSpan.created_at)).all()
    return {"source_id": source.id, "spans": [{
        "id": r.id,
        "locator": r.locator,
        "text": r.text,
        "text_hash": r.text_hash,
        "pii_flags": r.pii_flags,
    } for r in rows]}


@app.delete("/v1/sources/{source_id}")
def delete_source_document(
    source_id: str,
    soft: bool = False,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    source = db.get(SourceDocument, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="source not found")
    
    # Strictly require workspace membership AND internal employer authority with SOURCE_DELETE permission
    ctx = require_membership(db, source.workspace_id, principal_id)
    require_permission(ctx, "SOURCE_DELETE", internal_only=True)

    if soft:
        source.is_current = False
        source.error_code = "SOFT_DELETED"
        db.commit()
        return {"status": "SOFT_DELETED", "source_id": source_id, "byte_retention": "RETAINED_FOR_AUDIT"}
    else:
        storage_path = source.storage_path
        db.query(SourceSpan).filter(SourceSpan.source_document_id == source_id).delete(synchronize_session=False)
        db.delete(source)
        db.commit()

        # Hard delete removes persisted file bytes and empty directory from storage
        file_erased = False
        if storage_path and os.path.exists(storage_path):
            try:
                os.remove(storage_path)
                file_erased = True
                parent_dir = os.path.dirname(storage_path)
                if os.path.isdir(parent_dir) and not os.listdir(parent_dir):
                    os.rmdir(parent_dir)
            except OSError:
                pass

        return {"status": "HARD_DELETED", "source_id": source_id, "file_erased": file_erased}


def _assertion_with_citations(db: Session, assertion: SourceAssertion):
    spans = []
    for span_id in assertion.source_span_ids or []:
        span = db.get(SourceSpan, span_id)
        if span:
            spans.append({"source_id": span.source_document_id, "span_id": span.id, "locator": span.locator, "text": span.text})
    return {
        "id": assertion.id,
        "subject": assertion.subject,
        "normalized_subject": assertion.normalized_subject,
        "attribute": assertion.attribute,
        "value": assertion.value,
        "method": assertion.method,
        "semantic_support": assertion.semantic_support,
        "citations": spans,
    }


@app.get("/v1/roles/{role_id}/conflicts")
def list_conflicts(
    role_id: str,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    role, _ = role_for_actor(db, role_id, principal_id)
    conflicts = db.scalars(select(SourceConflict).where(SourceConflict.role_id == role.id).order_by(SourceConflict.created_at)).all()
    out = []
    for c in conflicts:
        left = db.get(SourceAssertion, c.left_assertion_id)
        right = db.get(SourceAssertion, c.right_assertion_id)
        out.append({
            "id": c.id,
            "topic": c.topic,
            "attribute": c.attribute,
            "conflict_type": c.conflict_type,
            "status": c.status,
            "left": _assertion_with_citations(db, left),
            "right": _assertion_with_citations(db, right),
        })
    return {"conflicts": out}


@app.post("/v1/personal-workspaces/{workspace_id}/share-requests")
def make_share_request(
    workspace_id: str,
    payload: ShareRequestCreate,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    ctx = require_membership(db, workspace_id, principal_id)
    require_permission(ctx, "HANDOFF_CREATE", internal_only=True)
    try:
        request = create_share_request(db, workspace_id, principal_id, payload)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(409, str(exc)) from exc
    db.commit()
    items = db.scalars(select(ShareItem).where(ShareItem.share_request_id == request.id)).all()
    return {
        "share_request_id": request.id,
        "status": request.status,
        "source_workspace_id": request.source_workspace_id,
        "target_workspace_id": request.target_workspace_id,
        "source_role_id": request.source_role_id,
        "item_count": len(items),
        "sharing_authority_attested": request.sharing_authority_attested,
        "transfer_mode": "COPY_FOR_EMPLOYER_REVIEW",
    }


@app.post("/v1/share-requests/{share_request_id}/accept")
def accept_share(
    share_request_id: str,
    payload: ShareAcceptRequest,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    request = db.get(ShareRequest, share_request_id)
    if not request:
        raise HTTPException(404, "share request not found")
    ctx = require_membership(db, request.target_workspace_id, principal_id)
    require_permission(ctx, "HANDOFF_ACCEPT", internal_only=True)
    try:
        result = accept_share_request(db, request, principal_id, payload.target_role_id, payload.rationale)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(409, str(exc)) from exc
    db.commit()
    return result


@app.get("/v1/share-requests/{share_request_id}")
def get_share_request(
    share_request_id: str,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    request = db.get(ShareRequest, share_request_id)
    if not request:
        raise HTTPException(404, "share request not found")
    # Either source owner or target employer may inspect the request.
    source_member = db.scalar(select(WorkspaceMembership).where(
        WorkspaceMembership.workspace_id == request.source_workspace_id,
        WorkspaceMembership.principal_id == principal_id,
    ))
    target_member = db.scalar(select(WorkspaceMembership).where(
        WorkspaceMembership.workspace_id == request.target_workspace_id,
        WorkspaceMembership.principal_id == principal_id,
    ))
    if not source_member and not target_member:
        raise HTTPException(404, "share request not found")
    items = db.scalars(select(ShareItem).where(ShareItem.share_request_id == request.id)).all()
    return {
        "share_request_id": request.id,
        "status": request.status,
        "source_workspace_id": request.source_workspace_id,
        "target_workspace_id": request.target_workspace_id,
        "source_role_id": request.source_role_id,
        "target_role_id": request.target_role_id,
        "purpose": request.purpose,
        "sharing_authority_attested": request.sharing_authority_attested,
        "items": [{
            "share_item_id": i.id,
            "source_entity_type": i.source_entity_type,
            "source_entity_id": i.source_entity_id,
            "snapshot_hash": i.snapshot_hash,
            "copied_proposed_requirement_id": i.copied_proposed_requirement_id,
        } for i in items],
    }


@app.get("/v1/approved-requirements/{requirement_id}/human-review-view")
def approved_requirement_human_review_view(
    requirement_id: str,
    lexical_k: int = Query(default=5, ge=1, le=20),
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    # Resolve the anchor only through a membership join so an unrelated actor does not
    # learn whether a requirement ID exists. Workspace scoping happens before candidate search.
    anchor = db.scalar(
        select(ApprovedRequirement)
        .join(WorkspaceMembership, WorkspaceMembership.workspace_id == ApprovedRequirement.workspace_id)
        .where(
            ApprovedRequirement.id == requirement_id,
            WorkspaceMembership.principal_id == principal_id,
        )
    )
    if not anchor:
        raise HTTPException(404, "approved requirement not found")
    try:
        return field_aware_review(db, anchor.id, anchor.workspace_id, lexical_k=lexical_k)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.get("/v1/approved-requirements/{requirement_id}/related-review")
@app.get("/v1/workspaces/{workspace_id}/approved-requirements/{requirement_id}/related-review")
def approved_requirement_related_review_alias(
    requirement_id: str,
    workspace_id: str | None = None,
    lexical_k: int = Query(default=5, ge=1, le=20),
    k: int | None = Query(default=None, ge=1, le=20),
    method: str | None = None,
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    eff_k = k if k is not None else lexical_k
    anchor = db.scalar(
        select(ApprovedRequirement)
        .join(WorkspaceMembership, WorkspaceMembership.workspace_id == ApprovedRequirement.workspace_id)
        .where(
            ApprovedRequirement.id == requirement_id,
            WorkspaceMembership.principal_id == principal_id,
        )
    )
    if not anchor:
        raise HTTPException(404, "approved requirement not found")
    if workspace_id and workspace_id != anchor.workspace_id:
        raise HTTPException(404, "approved requirement not found in specified workspace")
    try:
        return field_aware_review(db, anchor.id, anchor.workspace_id, lexical_k=eff_k)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.get("/v1/workspaces/{workspace_id}/related-requirements")
def related_requirements(
    workspace_id: str,
    query: str = Query(min_length=1, max_length=1000),
    method: str = Query(default="rapidfuzz", pattern="^(rapidfuzz|bge)$"),
    k: int = Query(default=5, ge=1, le=20),
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    # Authorization occurs before candidates are loaded. Candidate SQL is then workspace-scoped
    # before any lexical score or embedding is computed.
    require_membership(db, workspace_id, principal_id)
    candidates = approved_requirement_records(db, workspace_id)
    if method == "rapidfuzz":
        hits = rank_rapidfuzz(query, candidates, k=k)
        model = None
    else:
        try:
            hits = BGERetriever().rank(query, candidates, k=k)
        except RuntimeError as exc:
            raise HTTPException(503, detail=str(exc)) from exc
        model = {"id": BGE_MODEL_ID, "revision": BGE_MODEL_REVISION}
    return {
        "workspace_id": workspace_id,
        "query": query,
        "method": method,
        "model": model,
        "retrieval_document_version": RETRIEVAL_DOCUMENT_VERSION,
        "disposition": "RELATED_RECORDS_FOR_HUMAN_REVIEW_ONLY",
        "not_authorized_to_do": [
            "MERGE_REQUIREMENTS", "RESOLVE_CONFLICTS", "CLAIM_LEARNED_COMPANY_PATTERN"
        ],
        "results": [
            {
                "requirement_id": h.id,
                "retrieval_document_version": h.record.document_version,
                "retrieval_document": h.record.retrieval_document,
                "approved_fields": {
                    "actual_work": h.record.actual_work,
                    "criticality": h.record.criticality,
                    "alternatives": list(h.record.alternatives),
                    "reason": h.record.reason,
                    "reason_state": h.record.reason_state,
                    "acceptable_proof": h.record.acceptable_proof,
                    "proof_state": h.record.proof_state,
                    "uncertainty": h.record.uncertainty,
                    "source_ids": list(h.record.source_ids),
                },
                "score": h.score,
                "rank": h.rank,
                "disposition": h.disposition,
            }
            for h in hits
        ],
    }


@app.get("/v1/workspaces/{workspace_id}/research-passages")
def get_research_passages(
    workspace_id: str,
    query: str = Query(min_length=1, max_length=1000),
    limit: int = Query(default=5, ge=1, le=20),
    role_id: str | None = Query(default=None),
    as_of: datetime | None = Query(default=None),
    principal_id: str = Depends(authenticated_principal),
    db: Session = Depends(get_db),
):
    require_membership(db, workspace_id, principal_id)
    if role_id:
        role = db.get(Role, role_id)
        if not role or role.workspace_id != workspace_id:
            raise HTTPException(status_code=404, detail="role not found in workspace")
    passages = search_research_passages(db, workspace_id, query, limit=limit, role_id=role_id, as_of=as_of)
    return {
        "workspace_id": workspace_id,
        "query": query,
        "disposition": "PUBLIC_RESEARCH / NOT_EMPLOYER_APPROVED",
        "employer_approval": "NOT_OBTAINED",
        "retrieved_count": len(passages),
        "passages": [
            {
                "span_id": p.span_id,
                "document_id": p.document_id,
                "source_id": p.source_id,
                "filename": p.filename,
                "text": p.text,
                "score": p.score,
                "source_url": p.source_url,
                "status": p.status,
                "employer_approval": p.employer_approval,
            }
            for p in passages
        ],
    }


@app.post("/v1/workspaces/{workspace_id}/research-qa")
def post_research_qa(
    workspace_id: str,
    payload: ResearchQARequest,
    principal_id: str = Depends(authenticated_principal),
    delegated_auth: str | None = Header(default=None, alias="X-Delegated-Authorization"),
    db: Session = Depends(get_db),
):
    if principal_id == "prin_v2_web_user":
        expected_op = "retrieve" if payload.mode == "retrieval_only" else "research_qa"
        verify_delegated_authorization(
            delegated_header=delegated_auth,
            expected_workspace_id=workspace_id,
            expected_role_id=payload.role_id,
            expected_operation=expected_op,
        )
    else:
        require_membership(db, workspace_id, principal_id)

    if payload.role_id:
        role = db.get(Role, payload.role_id)
        if not role or role.workspace_id != workspace_id:
            raise HTTPException(status_code=404, detail="role not found in workspace")
    try:
        result = execute_research_qa(
            db=db,
            workspace_id=workspace_id,
            question=payload.question,
            mode=payload.mode,
            limit=payload.limit,
            role_id=payload.role_id,
            model_id=payload.model_id or DEFAULT_GEMINI_MODEL,
            as_of=payload.as_of,
        )
        return result
    except QuotaOrLimitExceeded as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Research QA execution failed: {exc}") from exc


