from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO, StringIO
from pathlib import Path
import csv
import hashlib
import json
import os
import re

import pdfplumber
from docx import Document
from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ProposedRequirement, SourceAssertion, SourceConflict, SourceDocument, SourceSpan, Role, new_id

MAX_SOURCE_BYTES = 10 * 1024 * 1024
SOURCE_ROOT = Path(os.getenv("WORKBYLINE_SOURCE_ROOT", "/tmp/workbyline_pattern_engine_sources"))
ALLOWED_FORMATS = {"pdf", "docx", "xlsx", "csv", "txt", "md"}

EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
PHONE_RE = re.compile(r"(?<!\d)(?:\+?\d[\d\s().-]{7,}\d)(?!\d)")
ID_RE = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")

CRIT_PATTERNS = [
    re.compile(r"\b(?P<subject>[A-Za-z][A-Za-z0-9 .+#/\-]{0,80}?)\s+(?:is\s+)?(?P<crit>required|preferred)\b", re.I),
    re.compile(r"\b(?P<crit>required|preferred)\s*[:\-]\s*(?P<subject>[A-Za-z][A-Za-z0-9 .+#/\-]{0,80})\b", re.I),
]

REQ_HEADERS = {"requirement", "skill", "technology", "capability", "actual_work", "item"}
CRIT_HEADERS = {"criticality", "status", "priority"}


class IngestionError(Exception):
    def __init__(self, source_id: str, error_code: str, message: str):
        super().__init__(message)
        self.source_id = source_id
        self.error_code = error_code
        self.message = message


@dataclass
class ParsedSpan:
    locator: dict
    text: str


@dataclass
class StructuredAssertionCandidate:
    subject: str
    value: str
    locator_keys: list[str]


def locator_key(locator: dict) -> str:
    return json.dumps(locator, sort_keys=True, separators=(",", ":"))


def detect_pii_flags(text: str) -> list[str]:
    flags=[]
    if EMAIL_RE.search(text): flags.append("EMAIL")
    if PHONE_RE.search(text): flags.append("PHONE")
    if ID_RE.search(text): flags.append("US_SSN_LIKE")
    return flags


def safe_filename(name: str) -> str:
    base = Path(name or "upload.bin").name
    return re.sub(r"[^A-Za-z0-9._-]", "_", base)[:180]


def file_format(filename: str) -> str:
    ext = Path(filename).suffix.lower().lstrip(".")
    if ext not in ALLOWED_FORMATS:
        raise ValueError(f"unsupported file format: {ext or 'none'}")
    return ext


def _norm_header(value: str) -> str:
    return re.sub(r"\s+", "_", value.strip().lower())


def _criticality(value: str) -> str | None:
    """Conservative explicit criticality parser with negation precedence."""
    t = re.sub(r"\s+", " ", value.strip().lower())
    if re.search(r"\bpreferred\b", t) and re.search(r"\bnot\s+required\b", t):
        return "PREFERRED"
    if re.search(r"\bnot\s+required\b", t):
        return None
    if re.search(r"\b(required|must[- ]?have|must)\b", t):
        return "REQUIRED"
    if re.search(r"\b(preferred|nice[- ]?to[- ]?have|nice)\b", t):
        return "PREFERRED"
    return None


def _parse_pdf(data: bytes) -> tuple[list[ParsedSpan], list[StructuredAssertionCandidate]]:
    spans=[]
    with pdfplumber.open(BytesIO(data)) as pdf:
        for page_no, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            for line_no, line in enumerate(text.splitlines(), start=1):
                if line.strip():
                    spans.append(ParsedSpan({"type":"PDF_LINE","page":page_no,"line":line_no}, line.strip()))
    return spans, []


def _parse_docx(data: bytes) -> tuple[list[ParsedSpan], list[StructuredAssertionCandidate]]:
    doc=Document(BytesIO(data)); spans=[]
    for i,p in enumerate(doc.paragraphs, start=1):
        text=p.text.strip()
        if text:
            spans.append(ParsedSpan({"type":"DOCX_PARAGRAPH","paragraph":i}, text))
    for ti, table in enumerate(doc.tables, start=1):
        for ri,row in enumerate(table.rows, start=1):
            for ci,cell in enumerate(row.cells, start=1):
                text=cell.text.strip()
                if text:
                    spans.append(ParsedSpan({"type":"DOCX_TABLE_CELL","table":ti,"row":ri,"column":ci}, text))
    return spans, []


def _parse_xlsx(data: bytes) -> tuple[list[ParsedSpan], list[StructuredAssertionCandidate]]:
    wb=load_workbook(BytesIO(data), read_only=True, data_only=True)
    spans=[]; candidates=[]
    for ws in wb.worksheets:
        rows=list(ws.iter_rows())
        if not rows: continue
        headers={}
        for cell in rows[0]:
            if cell.value is not None:
                headers[cell.column] = _norm_header(str(cell.value))
        req_col=next((c for c,h in headers.items() if h in REQ_HEADERS), None)
        crit_col=next((c for c,h in headers.items() if h in CRIT_HEADERS), None)
        for row in rows:
            row_locators={}
            row_values={}
            for cell in row:
                if cell.value is None: continue
                text=str(cell.value).strip()
                if not text: continue
                loc={"type":"XLSX_CELL","sheet":ws.title,"cell":cell.coordinate,"row":cell.row,"column":cell.column,"header":headers.get(cell.column, f"column_{cell.column}")}
                spans.append(ParsedSpan(loc,text))
                row_locators[cell.column]=locator_key(loc)
                row_values[cell.column]=text
            if row and row[0].row > 1 and req_col and crit_col and req_col in row_values and crit_col in row_values:
                crit=_criticality(row_values[crit_col])
                if crit:
                    candidates.append(StructuredAssertionCandidate(
                        subject=row_values[req_col], value=crit,
                        locator_keys=[row_locators[req_col], row_locators[crit_col]],
                    ))
    return spans,candidates


def _parse_csv(data: bytes) -> tuple[list[ParsedSpan], list[StructuredAssertionCandidate]]:
    text=data.decode("utf-8-sig")
    rows=list(csv.reader(StringIO(text)))
    spans=[]; candidates=[]
    if not rows: return spans,candidates
    headers={i:_norm_header(v) for i,v in enumerate(rows[0]) if v.strip()}
    req_col=next((i for i,h in headers.items() if h in REQ_HEADERS),None)
    crit_col=next((i for i,h in headers.items() if h in CRIT_HEADERS),None)
    for r_idx,row in enumerate(rows,start=1):
        locs={}; vals={}
        for c_idx,value in enumerate(row,start=1):
            v=value.strip()
            if not v: continue
            header=headers.get(c_idx-1, f"column_{c_idx}")
            loc={"type":"CSV_CELL","row":r_idx,"column":header,"column_index":c_idx}
            spans.append(ParsedSpan(loc,v)); locs[c_idx-1]=locator_key(loc); vals[c_idx-1]=v
        if r_idx>1 and req_col is not None and crit_col is not None and req_col in vals and crit_col in vals:
            crit=_criticality(vals[crit_col])
            if crit:
                candidates.append(StructuredAssertionCandidate(vals[req_col],crit,[locs[req_col],locs[crit_col]]))
    return spans,candidates


def _parse_text(data: bytes, fmt: str) -> tuple[list[ParsedSpan], list[StructuredAssertionCandidate]]:
    text=data.decode("utf-8-sig")
    spans=[ParsedSpan({"type":"TEXT_LINE","line":i},line.strip()) for i,line in enumerate(text.splitlines(),start=1) if line.strip()]
    return spans,[]


def parse_source(data: bytes, fmt: str) -> tuple[list[ParsedSpan], list[StructuredAssertionCandidate]]:
    if fmt=="pdf": return _parse_pdf(data)
    if fmt=="docx": return _parse_docx(data)
    if fmt=="xlsx": return _parse_xlsx(data)
    if fmt=="csv": return _parse_csv(data)
    if fmt in {"txt","md"}: return _parse_text(data,fmt)
    raise ValueError("unsupported parser")


def normalize_subject(subject: str) -> str:
    s=subject.strip().lower()
    s=re.sub(r"^(the|a|an)\s+", "", s)
    s=re.sub(r"[^a-z0-9+#/.-]+", " ", s)
    return " ".join(s.split())


def unstructured_assertions(text: str) -> list[tuple[str,str]]:
    """Extract only explicit criticality assertions; this is not semantic recognition."""
    out=[]
    working=text
    pref_not_req = re.compile(
        r"\b(?P<subject>[A-Za-z][A-Za-z0-9 .+#/\-]{0,80}?)\s+(?:is\s+)?preferred\s*,?\s*not\s+required\b",
        re.I,
    )
    consumed=[]
    for m in pref_not_req.finditer(text):
        subject=m.group("subject").strip(" .:-")
        if subject:
            out.append((subject,"PREFERRED"))
            consumed.append(m.span())
    if consumed:
        chars=list(working)
        for a,b in consumed:
            for i in range(a,b): chars[i]=" "
        working="".join(chars)
    # Mask negative-only 'not required' so it cannot become a positive REQUIRED assertion.
    working=re.sub(r"\bnot\s+required\b", "NOT_REQUIRED", working, flags=re.I)
    for pat in CRIT_PATTERNS:
        for m in pat.finditer(working):
            subject=m.group("subject").strip(" .:-")
            crit=_criticality(m.group("crit"))
            if subject and crit:
                out.append((subject,crit))
    dedup=[]
    seen=set()
    for item in out:
        key=(normalize_subject(item[0]),item[1])
        if key not in seen:
            seen.add(key); dedup.append(item)
    return dedup


def _create_assertion(db: Session, source: SourceDocument, span_ids: list[str], subject: str, value: str, method: str) -> SourceAssertion:
    a=SourceAssertion(
        id=new_id("ast"), workspace_id=source.workspace_id, role_id=source.role_id,
        source_document_id=source.id, source_span_ids=span_ids,
        subject=subject, normalized_subject=normalize_subject(subject), attribute="CRITICALITY",
        value=value, method=method, semantic_support="NOT_APPLICABLE_EXPLICIT_ASSERTION",
    )
    db.add(a); db.flush(); return a


def detect_conflicts(db: Session, role: Role) -> list[SourceConflict]:
    assertions=db.scalars(select(SourceAssertion).where(SourceAssertion.role_id==role.id)).all()
    by_key={}
    for a in assertions:
        source=db.get(SourceDocument, a.source_document_id)
        if not source or not source.is_current or source.parse_status != "PARSED":
            continue
        by_key.setdefault((a.normalized_subject,a.attribute),[]).append(a)
    created=[]
    for (subject,attribute), rows in by_key.items():
        for i,left in enumerate(rows):
            for right in rows[i+1:]:
                if left.value==right.value: continue
                ids=sorted([left.id,right.id])
                fp=hashlib.sha256(f"{role.id}|{subject}|{attribute}|{ids[0]}|{ids[1]}".encode()).hexdigest()
                existing=db.scalar(select(SourceConflict).where(SourceConflict.role_id==role.id,SourceConflict.fingerprint==fp))
                if existing: continue
                c=SourceConflict(
                    id=new_id("conf"),workspace_id=role.workspace_id,role_id=role.id,fingerprint=fp,
                    topic=subject,attribute=attribute,left_assertion_id=left.id,right_assertion_id=right.id,
                    conflict_type="EXPLICIT_VALUE_CONTRADICTION",status="OPEN",
                )
                db.add(c); db.flush(); created.append(c)
    return created


def ingest_source(db: Session, role: Role, actor_id: str, filename: str, media_type: str | None, source_kind: str, data: bytes):
    if len(data)>MAX_SOURCE_BYTES:
        raise ValueError("file exceeds 10 MiB synthetic limit")
    fmt=file_format(filename)
    digest=hashlib.sha256(data).hexdigest()
    existing=db.scalar(select(SourceDocument).where(
        SourceDocument.workspace_id==role.workspace_id,
        SourceDocument.role_id==role.id,
        SourceDocument.sha256==digest,
    ))
    if existing:
        return existing, True, []

    normalized_filename=safe_filename(filename)
    previous=db.scalar(select(SourceDocument).where(
        SourceDocument.workspace_id==role.workspace_id,
        SourceDocument.role_id==role.id,
        SourceDocument.source_kind==source_kind,
        SourceDocument.filename==normalized_filename,
        SourceDocument.is_current.is_(True),
    ).order_by(SourceDocument.source_version.desc()))
    source=SourceDocument(
        id=new_id("src"),workspace_id=role.workspace_id,role_id=role.id,source_kind=source_kind,
        filename=normalized_filename,source_version=(previous.source_version+1 if previous else 1),
        is_current=False,supersedes_id=(previous.id if previous else None),
        media_type=media_type,file_format=fmt,sha256=digest,byte_size=len(data),
        parse_status="PARSING",created_by=actor_id,
    )
    db.add(source); db.flush()

    try:
        parsed,candidates=parse_source(data,fmt)
    except Exception as exc:
        source.parse_status="FAILED"; source.error_code="PARSE_ERROR"; db.flush()
        raise IngestionError(source.id,"PARSE_ERROR",f"unable to parse {fmt} source") from exc

    target=SOURCE_ROOT/role.workspace_id/role.id/source.id
    target.mkdir(parents=True,exist_ok=True)
    path=target/source.filename
    path.write_bytes(data)
    source.storage_path=str(path)

    span_by_locator={}
    pii_count=0
    for p in parsed:
        flags=detect_pii_flags(p.text); pii_count+=len(flags)
        span=SourceSpan(
            id=new_id("span"),workspace_id=role.workspace_id,role_id=role.id,source_document_id=source.id,
            locator=p.locator,text=p.text,text_hash=hashlib.sha256(p.text.encode("utf-8")).hexdigest(),pii_flags=flags,
        )
        db.add(span); db.flush(); span_by_locator[locator_key(p.locator)]=span
        for subject,value in unstructured_assertions(p.text):
            _create_assertion(db,source,[span.id],subject,value,"DETERMINISTIC_TEXT_CRITICALITY")

    for c in candidates:
        span_ids=[span_by_locator[k].id for k in c.locator_keys if k in span_by_locator]
        _create_assertion(db,source,span_ids,c.subject,c.value,"DETERMINISTIC_STRUCTURED_ROW")

    source.span_count=len(parsed); source.pii_flag_count=pii_count; source.parse_status="PARSED"
    source.is_current=True
    if previous:
        previous.is_current=False
    role.source_revision += 1
    role.compiled_source_revision = None
    stale=db.scalars(select(ProposedRequirement).where(
        ProposedRequirement.role_id==role.id,
        ProposedRequirement.questionnaire_id.is_(None),
        ProposedRequirement.status.in_(["PROPOSED","APPROVED"]),
    )).all()
    for pr in stale:
        pr.status="STALE_SOURCE"
    conflicts=detect_conflicts(db,role)
    db.flush()
    return source,False,conflicts
