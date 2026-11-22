from __future__ import annotations

from dataclasses import dataclass, field
import re
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from .ingestion import _criticality, normalize_subject
from .models import FieldSupportLink, ProposedRequirement, Role, SourceDocument, SourceSpan, new_id

UNKNOWN = "UNKNOWN"

FIELD_ALIASES = {
    "actual_work": {"actual_work", "requirement", "capability", "responsibility", "work", "item", "skill", "technology"},
    "criticality": {"criticality", "priority", "status"},
    "reason": {"reason", "why", "rationale"},
    "alternatives": {"alternatives", "acceptable_alternatives", "equivalents", "equivalent_experience"},
    "acceptable_proof": {"acceptable_proof", "proof", "proof_expectation", "evidence", "acceptable_evidence"},
    "uncertainty": {"uncertainty", "notes", "open_question"},
}

LABEL_RE = re.compile(r"\b(Reason|Alternatives|Proof|Acceptable Proof|Uncertainty)\s*:\s*", re.I)
NEGATIVE_ONLY_RE = re.compile(r"^(?P<work>.+?)\s+(?:is\s+)?not\s+required\.?$", re.I)
PREFERRED_NOT_REQUIRED_RE = re.compile(r"^(?P<work>.+?)\s+(?:is\s+)?preferred\s*,?\s*not\s+required\.?$", re.I)
IS_CRITICAL_RE = re.compile(r"^(?P<work>.+?)\s+(?:is\s+)?(?P<crit>required|preferred)\.?$", re.I)
PREFIX_RE = re.compile(r"^(?P<label>Required|Must[- ]?have|Preferred|Nice[- ]?to[- ]?have|Responsibility|Work|Requirement)\s*:\s*(?P<work>.+)$", re.I)
YOU_WILL_RE = re.compile(r"^(?:You|The\s+(?:engineer|person|role|candidate))\s+will\s+(?P<work>.+)$", re.I)


def _norm_header(value: str) -> str:
    return re.sub(r"\s+", "_", value.strip().lower())


def _canonical_field(header: str | None) -> str | None:
    if not header:
        return None
    h = _norm_header(header)
    for field_name, aliases in FIELD_ALIASES.items():
        if h in aliases:
            return field_name
    return None


def _split_alternatives(value: str) -> list[str]:
    values = re.split(r"\s*[|;]\s*", value.strip())
    return [v.strip() for v in values if v.strip()]


def _strip_terminal(value: str) -> str:
    return value.strip().strip(" \t-•*").rstrip(".").strip()


@dataclass
class Candidate:
    actual_work: str
    source_wording: str
    source_document_id: str
    method: str
    reason: str | None = None
    criticality: str = UNKNOWN
    alternatives: list[str] = field(default_factory=list)
    acceptable_proof: str | None = None
    source_uncertainty: str | None = None
    field_span_ids: dict[str, list[str]] = field(default_factory=dict)


def _labeled_parts(text: str) -> tuple[str, dict[str, str]]:
    matches = list(LABEL_RE.finditer(text))
    if not matches:
        return text.strip(), {}
    base = text[:matches[0].start()].strip()
    fields: dict[str, str] = {}
    for idx, match in enumerate(matches):
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        raw = _strip_terminal(text[match.end():end].strip().strip(" ;"))
        label = match.group(1).lower().replace(" ", "_")
        mapped = {
            "reason": "reason",
            "alternatives": "alternatives",
            "proof": "acceptable_proof",
            "acceptable_proof": "acceptable_proof",
            "uncertainty": "uncertainty",
        }[label]
        if raw:
            fields[mapped] = raw
    return base, fields


def text_candidate(span: SourceSpan, source: SourceDocument) -> Candidate | None:
    original = span.text.strip()
    base, fields = _labeled_parts(original)
    base = base.strip().strip("-•* ")
    if not base:
        return None

    # Negative-only statement is not a positive requirement proposal.
    if NEGATIVE_ONLY_RE.match(base) and not re.search(r"\bpreferred\b", base, re.I):
        return None

    criticality = UNKNOWN
    actual: str | None = None

    m = PREFERRED_NOT_REQUIRED_RE.match(base)
    if m:
        actual = _strip_terminal(m.group("work"))
        criticality = "PREFERRED"
    else:
        m = IS_CRITICAL_RE.match(base)
        if m:
            actual = _strip_terminal(m.group("work"))
            criticality = _criticality(m.group("crit")) or UNKNOWN
        else:
            m = PREFIX_RE.match(base)
            if m:
                actual = _strip_terminal(m.group("work"))
                criticality = _criticality(m.group("label")) or UNKNOWN
            else:
                m = YOU_WILL_RE.match(base)
                if m:
                    actual = _strip_terminal(m.group("work"))
                    if actual:
                        actual = actual[0].upper() + actual[1:]
                    criticality = UNKNOWN

    if not actual:
        return None

    field_spans: dict[str, list[str]] = {"actual_work": [span.id]}
    if criticality != UNKNOWN:
        field_spans["criticality"] = [span.id]
    reason = fields.get("reason")
    alternatives = _split_alternatives(fields["alternatives"]) if fields.get("alternatives") else []
    proof = fields.get("acceptable_proof")
    source_uncertainty = fields.get("uncertainty")
    if reason:
        field_spans["reason"] = [span.id]
    if alternatives:
        field_spans["alternatives"] = [span.id]
    if proof:
        field_spans["acceptable_proof"] = [span.id]
    if source_uncertainty:
        field_spans["uncertainty"] = [span.id]

    return Candidate(
        actual_work=actual,
        source_wording=original,
        source_document_id=source.id,
        method="DETERMINISTIC_A1_LABELED_TEXT",
        reason=reason,
        criticality=criticality,
        alternatives=alternatives,
        acceptable_proof=proof,
        source_uncertainty=source_uncertainty,
        field_span_ids=field_spans,
    )


def structured_candidates(spans: list[SourceSpan], source: SourceDocument) -> list[Candidate]:
    rows: dict[tuple, dict[str, SourceSpan]] = defaultdict(dict)
    for span in spans:
        loc = span.locator or {}
        if loc.get("type") == "XLSX_CELL":
            row_key = ("xlsx", loc.get("sheet"), loc.get("row"))
            field_name = _canonical_field(loc.get("header"))
        elif loc.get("type") == "CSV_CELL":
            row_key = ("csv", loc.get("row"))
            field_name = _canonical_field(loc.get("column"))
        else:
            continue
        if field_name:
            rows[row_key][field_name] = span

    out: list[Candidate] = []
    for fields in rows.values():
        actual_span = fields.get("actual_work")
        if not actual_span:
            continue
        actual = _strip_terminal(actual_span.text)
        if not actual or _norm_header(actual) in FIELD_ALIASES["actual_work"]:
            continue
        crit_span = fields.get("criticality")
        crit = _criticality(crit_span.text) if crit_span else None
        reason_span = fields.get("reason")
        alt_span = fields.get("alternatives")
        proof_span = fields.get("acceptable_proof")
        uncertainty_span = fields.get("uncertainty")
        field_span_ids = {"actual_work": [actual_span.id]}
        if crit:
            field_span_ids["criticality"] = [crit_span.id]
        if reason_span and reason_span.text.strip():
            field_span_ids["reason"] = [reason_span.id]
        if alt_span and alt_span.text.strip():
            field_span_ids["alternatives"] = [alt_span.id]
        if proof_span and proof_span.text.strip():
            field_span_ids["acceptable_proof"] = [proof_span.id]
        if uncertainty_span and uncertainty_span.text.strip():
            field_span_ids["uncertainty"] = [uncertainty_span.id]
        out.append(Candidate(
            actual_work=actual,
            source_wording=actual_span.text,
            source_document_id=source.id,
            method="DETERMINISTIC_A1_STRUCTURED_ROW",
            reason=reason_span.text.strip() if reason_span and reason_span.text.strip() else None,
            criticality=crit or UNKNOWN,
            alternatives=_split_alternatives(alt_span.text) if alt_span and alt_span.text.strip() else [],
            acceptable_proof=proof_span.text.strip() if proof_span and proof_span.text.strip() else None,
            source_uncertainty=uncertainty_span.text.strip() if uncertainty_span and uncertainty_span.text.strip() else None,
            field_span_ids=field_span_ids,
        ))
    return out


def collect_candidates(db: Session, role: Role) -> list[Candidate]:
    sources = db.scalars(select(SourceDocument).where(
        SourceDocument.role_id == role.id,
        SourceDocument.is_current.is_(True),
        SourceDocument.parse_status == "PARSED",
    ).order_by(SourceDocument.created_at)).all()
    out: list[Candidate] = []
    for source in sources:
        spans = db.scalars(select(SourceSpan).where(
            SourceSpan.source_document_id == source.id
        ).order_by(SourceSpan.created_at)).all()
        if source.file_format in {"xlsx", "csv"}:
            out.extend(structured_candidates(spans, source))
        else:
            for span in spans:
                c = text_candidate(span, source)
                if c:
                    out.append(c)
    return out


def _uniq(values: list[str]) -> list[str]:
    out=[]; seen=set()
    for v in values:
        if v not in seen:
            seen.add(v); out.append(v)
    return out


def _field_spans(candidates: list[Candidate], field_name: str, value: str | None = None) -> list[str]:
    ids=[]
    for c in candidates:
        current = getattr(c, field_name if field_name != "uncertainty" else "source_uncertainty", None)
        if value is not None and current != value:
            continue
        ids.extend(c.field_span_ids.get(field_name, []))
    return _uniq(ids)


def compile_source_requirements(db: Session, role: Role) -> list[ProposedRequirement]:
    """Compile conservative proposals from the current immutable source snapshot.

    Exact lexical normalization may merge identical wording. This function performs no
    embedding search and no semantic pattern recognition.
    """
    existing = db.scalars(select(ProposedRequirement).where(
        ProposedRequirement.role_id == role.id,
        ProposedRequirement.questionnaire_id.is_(None),
        ProposedRequirement.source_revision == role.source_revision,
        ProposedRequirement.status != "STALE_SOURCE",
    )).all()
    if role.compiled_source_revision == role.source_revision and existing:
        return existing

    candidates = collect_candidates(db, role)
    groups: dict[str, list[Candidate]] = defaultdict(list)
    for c in candidates:
        groups[normalize_subject(c.actual_work)].append(c)

    created: list[ProposedRequirement] = []
    for _, group in groups.items():
        actual_work = group[0].actual_work
        source_docs = _uniq([c.source_document_id for c in group])
        wordings = _uniq([c.source_wording for c in group])
        methods = _uniq([c.method for c in group])
        uncertainty_parts: list[str] = _uniq([c.source_uncertainty for c in group if c.source_uncertainty])

        known_criticalities = _uniq([c.criticality for c in group if c.criticality != UNKNOWN])
        if len(known_criticalities) == 1:
            criticality = known_criticalities[0]
        elif len(known_criticalities) > 1:
            criticality = UNKNOWN
            uncertainty_parts.append(
                "Conflicting explicit criticality across source spans: " + " vs ".join(sorted(known_criticalities)) + ". Human resolution required."
            )
        else:
            criticality = UNKNOWN
            uncertainty_parts.append("Criticality not explicitly established by the current source spans.")

        reasons = _uniq([c.reason for c in group if c.reason])
        if len(reasons) == 1:
            reason = reasons[0]
        elif len(reasons) > 1:
            reason = None
            uncertainty_parts.append("Conflicting explicit reasons across source spans. Human resolution required.")
        else:
            reason = None

        proofs = _uniq([c.acceptable_proof for c in group if c.acceptable_proof])
        if len(proofs) == 1:
            proof = proofs[0]
        elif len(proofs) > 1:
            proof = None
            uncertainty_parts.append("Conflicting explicit proof expectations across source spans. Human resolution required.")
        else:
            proof = None

        alternatives = _uniq([alt for c in group for alt in c.alternatives])
        uncertainty = " ".join(_uniq([u for u in uncertainty_parts if u])) or None

        pr = ProposedRequirement(
            id=new_id("pr"), workspace_id=role.workspace_id, role_id=role.id,
            questionnaire_id=None, questionnaire_revision=None,
            source_revision=role.source_revision, source_document_ids=source_docs,
            source_wordings=wordings, extraction_method="+".join(methods),
            actual_work=actual_work, reason=reason, reason_state="KNOWN" if reason else UNKNOWN,
            criticality=criticality, alternatives=alternatives,
            acceptable_proof=proof, proof_state="KNOWN" if proof else UNKNOWN,
            uncertainty=uncertainty, source_answer_ids=[], status="PROPOSED",
        )
        db.add(pr); db.flush()

        # Field-level citations establish provenance/exact extraction only. They do not establish semantic support.
        link_specs: list[tuple[str, list[str], str]] = [
            ("actual_work", _field_spans(group, "actual_work"), "EXPLICIT_SOURCE_SPAN"),
        ]
        if criticality != UNKNOWN:
            ids=[]
            for c in group:
                if c.criticality == criticality:
                    ids.extend(c.field_span_ids.get("criticality", []))
            link_specs.append(("criticality", _uniq(ids), "EXPLICIT_SOURCE_SPAN"))
        elif len(known_criticalities) > 1:
            ids=[]
            for c in group:
                if c.criticality != UNKNOWN:
                    ids.extend(c.field_span_ids.get("criticality", []))
            link_specs.append(("criticality", _uniq(ids), "CONFLICTING_EXPLICIT_VALUES"))
        if reason:
            link_specs.append(("reason", _field_spans(group, "reason", reason), "EXPLICIT_SOURCE_SPAN"))
        if alternatives:
            link_specs.append(("alternatives", _field_spans(group, "alternatives"), "EXPLICIT_SOURCE_SPAN"))
        if proof:
            link_specs.append(("acceptable_proof", _field_spans(group, "acceptable_proof", proof), "EXPLICIT_SOURCE_SPAN"))
        if any(c.source_uncertainty for c in group):
            link_specs.append(("uncertainty", _field_spans(group, "uncertainty"), "EXPLICIT_SOURCE_SPAN"))

        for field_name, span_ids, relation in link_specs:
            for span_id in span_ids:
                db.add(FieldSupportLink(
                    id=new_id("fsl"), workspace_id=role.workspace_id,
                    proposed_requirement_id=pr.id, field_name=field_name,
                    source_type="SOURCE_SPAN", source_id=span_id,
                    relation=relation, semantic_support="NOT_ESTABLISHED",
                ))
        created.append(pr)

    role.compiled_source_revision = role.source_revision
    db.flush()
    return created
