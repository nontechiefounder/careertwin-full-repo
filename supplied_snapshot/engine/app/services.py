from __future__ import annotations

import hashlib
import json
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    ApprovedRequirement, ContextVersion, FieldSupportLink, HumanReview, Observation,
    PatternEvidenceLink, PatternRun, PatternSuggestion, ProposedRequirement,
    QuestionnaireAnswer, QuestionnaireSession, Role, ShareRequest, ShareItem, Workspace, new_id,
)

UNKNOWN = "UNKNOWN"


def canonical_hash(value) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def current_answers(db: Session, questionnaire_id: str) -> dict[str, QuestionnaireAnswer]:
    rows = db.scalars(select(QuestionnaireAnswer).where(
        QuestionnaireAnswer.questionnaire_id == questionnaire_id,
        QuestionnaireAnswer.is_current.is_(True),
    )).all()
    return {r.key: r for r in rows}


def upsert_answer_versions(db: Session, q: QuestionnaireSession, answers: dict) -> tuple[int, list[QuestionnaireAnswer]]:
    """Create immutable answer rows only for changed keys. One request = one questionnaire revision."""
    current = current_answers(db, q.id)
    changed: list[tuple[str, object, QuestionnaireAnswer | None, str]] = []
    for key, value in answers.items():
        digest = canonical_hash(value)
        prior = current.get(key)
        if prior and prior.content_hash == digest:
            continue
        changed.append((key, value, prior, digest))

    if not changed:
        return q.revision, []

    q.revision += 1
    q.state = "DIRTY"
    created: list[QuestionnaireAnswer] = []
    for key, value, prior, digest in changed:
        if prior:
            prior.is_current = False
            next_version = prior.version + 1
        else:
            next_version = 1
        row = QuestionnaireAnswer(
            id=new_id("qa"), workspace_id=q.workspace_id, role_id=q.role_id,
            questionnaire_id=q.id, key=key, value=value, version=next_version,
            content_hash=digest, is_current=True, supersedes_id=prior.id if prior else None,
        )
        db.add(row)
        created.append(row)

    # Existing proposals are historical snapshots and cannot remain current after source change.
    old_props = db.scalars(select(ProposedRequirement).where(
        ProposedRequirement.questionnaire_id == q.id,
        ProposedRequirement.questionnaire_revision < q.revision,
        ProposedRequirement.status.in_(["PROPOSED", "APPROVED"]),
    )).all()
    for pr in old_props:
        pr.status = "STALE_SOURCE"

    db.flush()
    return q.revision, created


def compile_questionnaire(db: Session, q: QuestionnaireSession) -> list[ProposedRequirement]:
    """Deterministic A1 compiler. It does not infer unstated fields."""
    answers = current_answers(db, q.id)

    existing = db.scalars(select(ProposedRequirement).where(
        ProposedRequirement.questionnaire_id == q.id,
        ProposedRequirement.questionnaire_revision == q.revision,
    )).all()
    if q.compiled_revision == q.revision and existing:
        return existing

    work_items = answers.get("work_items")
    if not work_items or not isinstance(work_items.value, list):
        q.state = "COMPILED"
        q.compiled_revision = q.revision
        db.flush()
        return []

    created: list[ProposedRequirement] = []
    for item in work_items.value:
        if not isinstance(item, dict) or not str(item.get("actual_work", "")).strip():
            continue
        actual_work = str(item["actual_work"]).strip()
        reason = str(item["reason"]).strip() if item.get("reason") not in (None, "") else None
        criticality = item.get("criticality") if item.get("criticality") in {"REQUIRED", "PREFERRED"} else UNKNOWN
        alternatives = [str(x).strip() for x in (item.get("alternatives") or []) if str(x).strip()]
        proof = str(item["acceptable_proof"]).strip() if item.get("acceptable_proof") not in (None, "") else None
        uncertainty = str(item["uncertainty"]).strip() if item.get("uncertainty") not in (None, "") else None

        pr = ProposedRequirement(
            id=new_id("pr"), workspace_id=q.workspace_id, role_id=q.role_id,
            questionnaire_id=q.id, questionnaire_revision=q.revision,
            actual_work=actual_work,
            reason=reason, reason_state="KNOWN" if reason else UNKNOWN,
            criticality=criticality,
            alternatives=alternatives,
            acceptable_proof=proof, proof_state="KNOWN" if proof else UNKNOWN,
            uncertainty=uncertainty,
            source_answer_ids=[work_items.id],
            status="PROPOSED",
        )
        db.add(pr)
        db.flush()
        for field_name in ["actual_work", "reason", "criticality", "alternatives", "acceptable_proof", "uncertainty"]:
            value = getattr(pr, field_name)
            if value not in (None, [], "") and not (field_name == "criticality" and value == UNKNOWN):
                db.add(FieldSupportLink(
                    id=new_id("fsl"), workspace_id=q.workspace_id,
                    proposed_requirement_id=pr.id, field_name=field_name,
                    source_type="QUESTIONNAIRE_ANSWER_VERSION", source_id=work_items.id,
                    relation="EXPLICIT_FIELD_MAPPING", semantic_support="NOT_ESTABLISHED",
                ))
        created.append(pr)

    q.state = "COMPILED"
    q.compiled_revision = q.revision
    db.flush()
    return created


def ensure_requirement_current(db: Session, pr: ProposedRequirement) -> None:
    if pr.status == "STALE_SOURCE":
        raise ValueError("requirement source has changed; recompile and review the latest source revision")
    if pr.questionnaire_id:
        q = db.get(QuestionnaireSession, pr.questionnaire_id)
        if not q or q.state != "COMPILED" or q.compiled_revision != q.revision or pr.questionnaire_revision != q.revision:
            raise ValueError("requirement is not from the current compiled questionnaire revision")
    elif pr.source_revision is not None:
        role = db.get(Role, pr.role_id)
        if not role or role.compiled_source_revision != role.source_revision or pr.source_revision != role.source_revision:
            raise ValueError("requirement is not from the current compiled source revision")


def approve_requirement(db: Session, pr: ProposedRequirement, reviewer_id: str, rationale: str | None) -> ApprovedRequirement:
    ensure_requirement_current(db, pr)
    if pr.status == "APPROVED":
        existing = db.scalar(select(ApprovedRequirement).where(ApprovedRequirement.proposed_requirement_id == pr.id))
        if existing:
            return existing
    pr.status = "APPROVED"
    ar = ApprovedRequirement(
        id=new_id("ar"), workspace_id=pr.workspace_id, role_id=pr.role_id,
        proposed_requirement_id=pr.id, questionnaire_id=pr.questionnaire_id,
        questionnaire_revision=pr.questionnaire_revision, source_revision=pr.source_revision,
        source_document_ids=pr.source_document_ids or [], source_wordings=pr.source_wordings or [],
        extraction_method=pr.extraction_method, actual_work=pr.actual_work,
        reason=pr.reason, reason_state=pr.reason_state, criticality=pr.criticality,
        alternatives=pr.alternatives or [], acceptable_proof=pr.acceptable_proof,
        proof_state=pr.proof_state, uncertainty=pr.uncertainty,
        source_answer_ids=pr.source_answer_ids or [], approved_by=reviewer_id,
    )
    db.add(ar)
    db.add(HumanReview(id=new_id("rev"), workspace_id=pr.workspace_id, entity_type="PROPOSED_REQUIREMENT",
                       entity_id=pr.id, decision="APPROVE", reviewer_id=reviewer_id, rationale=rationale))
    db.flush()
    return ar


def reject_requirement(db: Session, pr: ProposedRequirement, reviewer_id: str, rationale: str | None) -> None:
    ensure_requirement_current(db, pr)
    pr.status = "REJECTED"
    db.add(HumanReview(id=new_id("rev"), workspace_id=pr.workspace_id, entity_type="PROPOSED_REQUIREMENT",
                       entity_id=pr.id, decision="REJECT", reviewer_id=reviewer_id, rationale=rationale))
    db.flush()


def _latest_questionnaire(db: Session, role_id: str) -> QuestionnaireSession | None:
    return db.scalar(select(QuestionnaireSession).where(
        QuestionnaireSession.role_id == role_id
    ).order_by(QuestionnaireSession.created_at.desc()))


def create_context_version(db: Session, role: Role, actor_id: str, kind: str) -> ContextVersion:
    prior = db.scalar(select(ContextVersion).where(ContextVersion.role_id == role.id).order_by(ContextVersion.version_number.desc()))
    q = _latest_questionnaire(db, role.id)
    if role.intake_mode == "GUIDED_QUESTIONNAIRE" and q:
        if q.state != "COMPILED" or q.compiled_revision != q.revision:
            raise ValueError("questionnaire changed after compilation; recompile and re-review before creating a new context")
        approved_reqs = db.scalars(select(ApprovedRequirement).where(
            ApprovedRequirement.role_id == role.id,
            (
                (
                    (ApprovedRequirement.questionnaire_id == q.id)
                    & (ApprovedRequirement.questionnaire_revision == q.revision)
                )
                | ApprovedRequirement.questionnaire_id.is_(None)
            ),
        )).all()
    elif role.intake_mode in {"FILE_BACKED", "SCATTERED_SOURCES"}:
        if role.compiled_source_revision != role.source_revision:
            raise ValueError("sources changed after compilation; recompile and re-review before creating a new context")
        approved_reqs = db.scalars(select(ApprovedRequirement).where(
            ApprovedRequirement.role_id == role.id,
            ApprovedRequirement.source_revision == role.source_revision,
        )).all()
    else:
        approved_reqs = db.scalars(select(ApprovedRequirement).where(ApprovedRequirement.role_id == role.id)).all()

    if role.intake_mode == "GUIDED_QUESTIONNAIRE" and q:
        pending = db.scalars(select(ProposedRequirement).where(
            ProposedRequirement.role_id == role.id,
            (
                (
                    (ProposedRequirement.questionnaire_id == q.id)
                    & (ProposedRequirement.questionnaire_revision == q.revision)
                )
                | ProposedRequirement.questionnaire_id.is_(None)
            ),
            ProposedRequirement.status == "PROPOSED",
        )).all()
    elif role.intake_mode in {"FILE_BACKED", "SCATTERED_SOURCES"}:
        pending = db.scalars(select(ProposedRequirement).where(
            ProposedRequirement.role_id == role.id,
            ProposedRequirement.source_revision == role.source_revision,
            ProposedRequirement.status == "PROPOSED",
        )).all()
    else:
        pending = db.scalars(select(ProposedRequirement).where(
            ProposedRequirement.role_id == role.id,
            ProposedRequirement.status == "PROPOSED",
        )).all()
    if pending:
        raise ValueError("all current proposed requirements require explicit human review before creating context")

    approved_prompts = db.scalars(select(PatternSuggestion).where(
        PatternSuggestion.role_id == role.id,
        PatternSuggestion.status == "APPROVED",
        PatternSuggestion.suggestion_type == "REVIEW_PROMPT",
    )).all()
    pattern_state = "NO_PATTERNS_LEARNED" if kind == "STARTER" else (
        "REVIEW_PROMPTS_AVAILABLE" if approved_prompts else "NO_PATTERNS_LEARNED"
    )
    cv = ContextVersion(
        id=new_id("ctx"), workspace_id=role.workspace_id, role_id=role.id,
        version_number=(prior.version_number + 1) if prior else 1,
        kind=kind, pattern_state=pattern_state,
        approved_requirement_ids=[r.id for r in approved_reqs],
        approved_review_prompt_ids=[s.id for s in approved_prompts],
        created_by=actor_id, supersedes_id=prior.id if prior else None,
    )
    db.add(cv)
    db.flush()
    return cv


def review_observation(db: Session, obs: Observation, reviewer_id: str, decision: str, rationale: str | None) -> None:
    obs.status = "APPROVED_FOR_PATTERN_ANALYSIS" if decision == "APPROVE" else "EXCLUDED"
    db.add(HumanReview(id=new_id("rev"), workspace_id=obs.workspace_id, entity_type="OBSERVATION",
                       entity_id=obs.id, decision=decision, reviewer_id=reviewer_id, rationale=rationale))
    db.flush()


def _rollback_requirement(req: ApprovedRequirement) -> bool:
    t = req.actual_work.lower()
    proof = (req.acceptable_proof or "").lower()
    return ("rollback" in t or "rollback" in proof) and ("migration" in t or "database" in t or "schema" in t)


def _rollback_observation(obs: Observation) -> bool:
    t = obs.text.lower()
    return "rollback" in t and any(k in t for k in ["ownership", "owned", "designed", "who", "asked", "unclear"])


def _pattern_input_fingerprint(role: Role, reqs: list[ApprovedRequirement], observations: list[Observation]) -> str:
    payload = {
        "method": "DETERMINISTIC_V1",
        "role_id": role.id,
        "approved_requirement_ids": sorted(r.id for r in reqs),
        "approved_observation_ids": sorted(o.id for o in observations),
    }
    return canonical_hash(payload)


def run_review_prompt_discovery(db: Session, role: Role) -> tuple[PatternRun, list[PatternSuggestion], bool]:
    observations = db.scalars(select(Observation).where(
        Observation.role_id == role.id,
        Observation.status == "APPROVED_FOR_PATTERN_ANALYSIS",
    )).all()
    reqs = db.scalars(select(ApprovedRequirement).where(ApprovedRequirement.role_id == role.id)).all()
    fingerprint = _pattern_input_fingerprint(role, reqs, observations)

    existing_run = db.scalar(select(PatternRun).where(
        PatternRun.role_id == role.id,
        PatternRun.input_fingerprint == fingerprint,
    ))
    if existing_run:
        suggestions = db.scalars(select(PatternSuggestion).where(PatternSuggestion.run_id == existing_run.id)).all()
        return existing_run, suggestions, True

    state = "NO_ELIGIBLE_OBSERVATIONS" if not observations else "EARLY_OBSERVATION"
    suggestions: list[PatternSuggestion] = []
    rollback_obs = [o for o in observations if _rollback_observation(o)]
    rollback_req = next((r for r in reqs if _rollback_requirement(r)), None)
    if rollback_req and len(rollback_obs) >= 2:
        state = "REVIEW_PROMPT_AVAILABLE"

    run = PatternRun(
        id=new_id("run"), workspace_id=role.workspace_id, role_id=role.id,
        input_fingerprint=fingerprint, eligible_observation_count=len(observations),
        state=state, method="DETERMINISTIC_V1",
    )
    db.add(run)
    db.flush()

    if state == "REVIEW_PROMPT_AVAILABLE":
        s = PatternSuggestion(
            id=new_id("sug"), workspace_id=role.workspace_id, role_id=role.id, run_id=run.id,
            suggestion_type="REVIEW_PROMPT", topic="rollback_ownership",
            text="Review whether rollback ownership should be asked earlier in the interview process.",
            support_count=len(rollback_obs), scope="PROCESS_REVIEW_ONLY",
            small_sample_warning=(
                f"Based on {len(rollback_obs)} approved synthetic observations. This is a review prompt, "
                "not a statistically reliable company-wide pattern and not evidence of candidate capability."
            ),
            status="PROPOSED",
        )
        db.add(s)
        db.flush()
        for obs in rollback_obs:
            db.add(PatternEvidenceLink(
                id=new_id("pel"), workspace_id=role.workspace_id, suggestion_id=s.id,
                evidence_type="OBSERVATION", evidence_id=obs.id,
                relation="RELATED_FOR_REVIEW", semantic_support="NOT_ESTABLISHED",
            ))
        db.add(PatternEvidenceLink(
            id=new_id("pel"), workspace_id=role.workspace_id, suggestion_id=s.id,
            evidence_type="APPROVED_REQUIREMENT", evidence_id=rollback_req.id,
            relation="RELATED_FOR_REVIEW", semantic_support="NOT_ESTABLISHED",
        ))
        suggestions.append(s)

    db.flush()
    return run, suggestions, False


def review_suggestion(db: Session, s: PatternSuggestion, reviewer_id: str, decision: str, rationale: str | None) -> None:
    s.status = "APPROVED" if decision == "APPROVE" else "DISMISSED"
    db.add(HumanReview(id=new_id("rev"), workspace_id=s.workspace_id, entity_type="PATTERN_SUGGESTION",
                       entity_id=s.id, decision=decision, reviewer_id=reviewer_id, rationale=rationale))
    db.flush()



HANDOFF_SNAPSHOT_SCHEMA_VERSION = "WORKBYLINE_PERSONAL_TO_EMPLOYER_REQUIREMENT_V1"
HANDOFF_STRUCTURED_FIELDS = (
    "actual_work", "reason", "reason_state", "criticality", "alternatives",
    "acceptable_proof", "proof_state", "uncertainty",
)


def _approved_requirement_snapshot(req: ApprovedRequirement) -> dict:
    """Minimized, allowlisted copy-for-review payload.

    Raw personal source_wordings and personal source IDs intentionally do not cross the
    employer boundary in v1. The ShareItem itself retains opaque provenance back to the
    selected approved requirement and a snapshot hash.
    """
    return {
        "snapshot_schema_version": HANDOFF_SNAPSHOT_SCHEMA_VERSION,
        "actual_work": req.actual_work,
        "reason": req.reason,
        "reason_state": req.reason_state,
        "criticality": req.criticality,
        "alternatives": list(req.alternatives or []),
        "acceptable_proof": req.acceptable_proof,
        "proof_state": req.proof_state,
        "uncertainty": req.uncertainty,
        "source_role_id": req.role_id,
        "approved_requirement_id": req.id,
        "source_wording_count_not_copied": len(req.source_wordings or []),
        "source_reference_count_not_copied": len(set((req.source_document_ids or []) + (req.source_answer_ids or []))),
    }


def create_share_request(db: Session, source_workspace_id: str, actor_id: str, payload) -> ShareRequest:
    source_ws = db.get(Workspace, source_workspace_id)
    target_ws = db.get(Workspace, payload.target_employer_workspace_id)
    if not source_ws or source_ws.kind != "PERSONAL":
        raise ValueError("share requests can only originate from a PERSONAL workspace")
    if not target_ws or target_ws.kind != "EMPLOYER":
        raise ValueError("target must be an EMPLOYER workspace")
    if not payload.sharing_authority_attested:
        raise ValueError("explicit sharing-authority attestation is required")
    role = db.get(Role, payload.source_role_id)
    if not role or role.workspace_id != source_workspace_id:
        raise ValueError("source role is not in the personal workspace")

    reqs = db.scalars(select(ApprovedRequirement).where(
        ApprovedRequirement.id.in_(payload.approved_requirement_ids),
        ApprovedRequirement.workspace_id == source_workspace_id,
        ApprovedRequirement.role_id == role.id,
    )).all()
    by_id = {r.id: r for r in reqs}
    if set(by_id) != set(payload.approved_requirement_ids):
        raise ValueError("all shared requirements must be approved records in the selected personal role")

    request = ShareRequest(
        id=new_id("share"), source_workspace_id=source_workspace_id,
        target_workspace_id=target_ws.id, source_role_id=role.id,
        requested_by=actor_id, purpose=payload.purpose,
        sharing_authority_attested=True, status="PENDING_EMPLOYER_ACCEPTANCE",
    )
    db.add(request)
    db.flush()
    for rid in payload.approved_requirement_ids:
        req = by_id[rid]
        snapshot = _approved_requirement_snapshot(req)
        db.add(ShareItem(
            id=new_id("shareitem"), share_request_id=request.id,
            source_workspace_id=source_workspace_id,
            source_entity_type="APPROVED_REQUIREMENT", source_entity_id=req.id,
            snapshot=snapshot, snapshot_hash=canonical_hash(snapshot),
        ))
    db.flush()
    return request


def accept_share_request(
    db: Session,
    request: ShareRequest,
    actor_id: str,
    target_role_id: str | None,
    rationale: str | None,
) -> dict:
    if request.status == "ACCEPTED_FOR_EMPLOYER_REVIEW":
        items = db.scalars(select(ShareItem).where(ShareItem.share_request_id == request.id)).all()
        return {
            "share_request_id": request.id,
            "status": request.status,
            "target_role_id": request.target_role_id,
            "copied_proposed_requirement_ids": [i.copied_proposed_requirement_id for i in items],
            "approval_state": "EMPLOYER_REVIEW_REQUIRED",
            "idempotent_reuse": True,
        }
    if request.status != "PENDING_EMPLOYER_ACCEPTANCE":
        raise ValueError("share request is not pending employer acceptance")

    source_role = db.get(Role, request.source_role_id)
    if target_role_id:
        target_role = db.get(Role, target_role_id)
        if not target_role or target_role.workspace_id != request.target_workspace_id:
            raise ValueError("target role is not in the employer workspace")
    else:
        target_role = Role(
            id=new_id("role"), workspace_id=request.target_workspace_id,
            title=source_role.title if source_role else "Shared role",
            intake_mode="HANDOFF_REVIEW",
            source_revision=0, compiled_source_revision=0,
        )
        db.add(target_role)
        db.flush()

    items = db.scalars(select(ShareItem).where(ShareItem.share_request_id == request.id)).all()
    copied_ids: list[str] = []
    for item in items:
        snap = item.snapshot
        pr = ProposedRequirement(
            id=new_id("pr"), workspace_id=request.target_workspace_id, role_id=target_role.id,
            questionnaire_id=None, questionnaire_revision=None, source_revision=None,
            source_document_ids=[], source_wordings=[],
            extraction_method="PERSONAL_HANDOFF_COPY_FOR_REVIEW",
            actual_work=snap["actual_work"], reason=snap.get("reason"),
            reason_state=snap.get("reason_state") or "UNKNOWN",
            criticality=snap.get("criticality") or "UNKNOWN",
            alternatives=list(snap.get("alternatives") or []),
            acceptable_proof=snap.get("acceptable_proof"),
            proof_state=snap.get("proof_state") or "UNKNOWN",
            uncertainty=snap.get("uncertainty"), source_answer_ids=[], status="PROPOSED",
        )
        db.add(pr)
        db.flush()
        item.copied_proposed_requirement_id = pr.id
        copied_ids.append(pr.id)
        for field in ["actual_work", "reason", "criticality", "alternatives", "acceptable_proof", "uncertainty"]:
            value = snap.get(field)
            if value in (None, [], ""):
                continue
            db.add(FieldSupportLink(
                id=new_id("fsl"), workspace_id=request.target_workspace_id,
                proposed_requirement_id=pr.id, field_name=field,
                source_type="SHARE_ITEM", source_id=item.id,
                relation="COPIED_FOR_EMPLOYER_REVIEW", semantic_support="NOT_ESTABLISHED",
            ))

    request.target_role_id = target_role.id
    request.status = "ACCEPTED_FOR_EMPLOYER_REVIEW"
    request.accepted_by = actor_id
    from datetime import datetime, timezone
    request.accepted_at = datetime.now(timezone.utc)
    db.add(HumanReview(
        id=new_id("rev"), workspace_id=request.target_workspace_id,
        entity_type="SHARE_REQUEST", entity_id=request.id,
        decision="ACCEPT_FOR_REVIEW", reviewer_id=actor_id, rationale=rationale,
    ))
    db.flush()
    return {
        "share_request_id": request.id,
        "status": request.status,
        "target_role_id": target_role.id,
        "copied_proposed_requirement_ids": copied_ids,
        "approval_state": "EMPLOYER_REVIEW_REQUIRED",
        "idempotent_reuse": False,
    }
