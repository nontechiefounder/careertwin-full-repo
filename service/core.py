"""Source-faithful evidence kernel. PostgreSQL is the deployment target.

SQLite is supported only as an explicit local test backend. This service has
no public provisioning endpoint and does not replace Supabase identity.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import io
import json
import os
import re
import time
import uuid
import zipfile
from dataclasses import dataclass
from importlib.metadata import version as package_version
from pathlib import Path
from xml.etree import ElementTree

from sqlalchemy import (Boolean, Float, ForeignKey, Integer, String, Text,
                        UniqueConstraint, and_, create_engine, delete, or_, select, update)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

SPEC = "faithful-lines-v1"
MAX_BYTES = 50 * 1024 * 1024


def uid():
    return str(uuid.uuid4())


class Fault(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code
        super().__init__(code)


class Base(DeclarativeBase):
    pass


class Binding(Base):
    __tablename__ = "wbctx_bindings"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    actor: Mapped[str] = mapped_column(String)
    org: Mapped[str] = mapped_column(String)
    run: Mapped[str] = mapped_column(String)
    workspace: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    can_write: Mapped[bool] = mapped_column(Boolean, default=False)
    __table_args__ = (UniqueConstraint("actor", "org", "run", "workspace", "role"),)


class Receipt(Base):
    __tablename__ = "wbctx_nonces"
    jti: Mapped[str] = mapped_column(String, primary_key=True)
    expires: Mapped[float] = mapped_column(Float)


class Source(Base):
    __tablename__ = "wbctx_sources"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    org: Mapped[str] = mapped_column(String)
    workspace: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String)
    run: Mapped[str] = mapped_column(String)
    source_key: Mapped[str] = mapped_column(String)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    __table_args__ = (UniqueConstraint("org", "workspace", "role", "run", "source_key"),)


class Version(Base):
    __tablename__ = "wbctx_versions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    source: Mapped[str] = mapped_column(ForeignKey("wbctx_sources.id"))
    number: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String)
    bytes: Mapped[int] = mapped_column(Integer)
    filename: Mapped[str] = mapped_column(String)
    path: Mapped[str] = mapped_column(String)
    observed_at: Mapped[float] = mapped_column(Float)
    state: Mapped[str] = mapped_column(String, default="pending")
    __table_args__ = (UniqueConstraint("source", "number"),)


class Artifact(Base):
    __tablename__ = "wbctx_artifacts"
    version: Mapped[str] = mapped_column(ForeignKey("wbctx_versions.id"), primary_key=True)
    spec: Mapped[str] = mapped_column(String)
    parser: Mapped[str] = mapped_column(String)
    text: Mapped[str] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(String)
    exceptions: Mapped[str] = mapped_column(Text)
    pages_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pages_with_text: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Span(Base):
    __tablename__ = "wbctx_spans"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    version: Mapped[str] = mapped_column(ForeignKey("wbctx_versions.id"))
    start: Mapped[int] = mapped_column(Integer)
    end: Mapped[int] = mapped_column(Integer)
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    text: Mapped[str] = mapped_column(Text)


class Job(Base):
    __tablename__ = "wbctx_jobs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    version: Mapped[str] = mapped_column(ForeignKey("wbctx_versions.id"), unique=True)
    state: Mapped[str] = mapped_column(String, default="pending")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    lease_until: Mapped[float] = mapped_column(Float, default=0)
    fence: Mapped[str | None] = mapped_column(String, nullable=True)
    error: Mapped[str | None] = mapped_column(String, nullable=True)


class Projection(Base):
    __tablename__ = "wbctx_projections"
    version: Mapped[str] = mapped_column(ForeignKey("wbctx_versions.id"), primary_key=True)
    status: Mapped[str] = mapped_column(String, default="pending")  # pending | projected | failed | disabled
    episode_id: Mapped[str | None] = mapped_column(String, nullable=True)
    fence: Mapped[str | None] = mapped_column(String, nullable=True)
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)


class IdempotencyRecord(Base):
    __tablename__ = "wbctx_idempotency_keys"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    org: Mapped[str] = mapped_column(String)
    workspace: Mapped[str] = mapped_column(String)
    run: Mapped[str] = mapped_column(String)
    idempotency_key: Mapped[str] = mapped_column(String)
    fingerprint: Mapped[str] = mapped_column(String)
    source_id: Mapped[str] = mapped_column(ForeignKey("wbctx_sources.id"))
    version_id: Mapped[str] = mapped_column(ForeignKey("wbctx_versions.id"))
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    __table_args__ = (UniqueConstraint("org", "workspace", "run", "idempotency_key"),)


class IndexingStage(Base):
    __tablename__ = "wbctx_indexings"
    version: Mapped[str] = mapped_column(ForeignKey("wbctx_versions.id"), primary_key=True)
    status: Mapped[str] = mapped_column(String, default="pending")  # pending | running | retrying | completed | failed | disabled | lexical_only | reindex_required | cancelled
    model_id: Mapped[str | None] = mapped_column(String, nullable=True)
    model_revision: Mapped[str | None] = mapped_column(String, nullable=True)
    artifact_sha256: Mapped[str | None] = mapped_column(String, nullable=True)
    inference_backend: Mapped[str | None] = mapped_column(String, nullable=True)
    fence: Mapped[str | None] = mapped_column(String, nullable=True)
    indexed_spans: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)


class ErasureTombstone(Base):
    __tablename__ = "wbctx_erasure_tombstones"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    source_id: Mapped[str] = mapped_column(String)
    version_id: Mapped[str | None] = mapped_column(String, nullable=True)
    path: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="pending")  # pending | processing | completed | failed
    fence: Mapped[str | None] = mapped_column(String, nullable=True)
    lease_until: Mapped[float] = mapped_column(Float, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    completed_at: Mapped[float | None] = mapped_column(Float, nullable=True)



def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).decode().rstrip("=")


def sign(claims, secret):
    """Server-side integration utility. Never sign client-supplied scope blindly."""
    head, body = encode({"alg": "HS256", "typ": "JWT"}), encode(claims)
    signature = base64.urlsafe_b64encode(hmac.new(secret.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest()).decode().rstrip("=")
    return f"{head}.{body}.{signature}"


def decode_token(token, secret):
    try:
        if not secret or len(secret) < 32 or len(token) > 8192:
            raise ValueError()
        head, body, signature = token.split(".")
        load = lambda x: json.loads(base64.b64decode(x + "=" * (-len(x) % 4), altchars=b"-_", validate=True))
        if load(head) != {"alg": "HS256", "typ": "JWT"}:
            raise ValueError()
        expected = base64.urlsafe_b64encode(hmac.new(secret.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest()).decode().rstrip("=")
        if not hmac.compare_digest(signature, expected):
            raise ValueError()
        c = load(body)
        if not isinstance(c, dict):
            raise ValueError()
        for field in ("actor", "org", "run", "workspace", "role", "operation", "jti"):
            if not isinstance(c.get(field), str) or not c[field].strip():
                raise ValueError()
        if c.get("iss") != "workbyline-v2-web" or c.get("aud") != "workbyline-context-evidence":
            raise ValueError()
        if type(c.get("iat")) is not int or type(c.get("exp")) is not int:
            raise ValueError()
        now = int(time.time())
        if c["exp"] <= now or c["iat"] > now + 5 or not 0 < c["exp"] - c["iat"] <= 300:
            raise ValueError()
        uuid.UUID(c["jti"])
        return c
    except (ValueError, TypeError, KeyError, UnicodeError, json.JSONDecodeError):
        raise Fault(401, "INVALID_DELEGATION") from None


def parse_original(data, filename):
    """Native extraction only. Scanned/empty PDF pages are explicit exceptions."""
    suffix = Path(filename).suffix.lower()
    exceptions, pages_total, pages_with_text = [], None, None
    if suffix == ".pdf":
        if not data.startswith(b"%PDF-"):
            raise Fault(422, "PDF_SIGNATURE_MISMATCH")
        from pypdf import PdfReader
        try:
            doc = PdfReader(io.BytesIO(data))
            if doc.is_encrypted:
                raise Fault(422, "ENCRYPTED_PDF")
            pages = [(p.extract_text() or "", n + 1) for n, p in enumerate(doc.pages)]
        except Fault:
            raise
        except Exception:
            raise Fault(422, "PDF_PARSE_FAILED") from None
        parser = "pypdf:" + package_version("pypdf")
        pages_total = len(pages)
        pages_with_text = sum(bool(text.strip()) for text, _ in pages)
        exceptions = [f"PAGE_{n}_NO_TEXT_OCR_REQUIRED" for text, n in pages if not text.strip()]
    elif suffix == ".docx":
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                if sum(x.file_size for x in archive.infolist()) > 25 * MAX_BYTES:
                    raise Fault(422, "DOCX_EXPANSION_LIMIT")
                node = ElementTree.fromstring(archive.read("word/document.xml"))
            ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
            text = "\n".join("".join(n.text or "" for n in p.findall(".//w:t", ns)) for p in node.findall(".//w:p", ns))
            pages = [(text, None)]
            parser = "python-xml-docx-body-v1"
            exceptions = ["DOCX_HEADERS_FOOTERS_COMMENTS_IMAGES_NOT_EXTRACTED"]
        except Fault:
            raise
        except Exception:
            raise Fault(422, "DOCX_PARSE_FAILED") from None
    elif suffix in (".txt", ".md", ".csv"):
        try:
            text = data.decode("utf-8-sig")
        except UnicodeError:
            raise Fault(422, "UTF8_REQUIRED") from None
        if "\x00" in text:
            raise Fault(422, "BINARY_TEXT_INPUT")
        pages, parser = [(text, None)], "utf8-native-v1"
    else:
        raise Fault(415, "UNSUPPORTED_FORMAT")
    text, spans = "", []
    for content, page in pages:
        if text:
            text += "\n"
        content = content.replace("\r\n", "\n").replace("\r", "\n")
        offset = len(text)
        text += content
        for match in re.finditer(r"[^\n]+", content):
            segment = match.group().strip()
            if segment:
                start = offset + match.start() + len(match.group()) - len(match.group().lstrip())
                spans.append({"start": start, "end": start + len(segment), "page": page, "text": segment})
    if not spans:
        exceptions.append("NO_EXTRACTABLE_TEXT")
    return {"text": text, "spans": spans, "parser": parser, "exceptions": exceptions,
            "pages_total": pages_total, "pages_with_text": pages_with_text}


class Kernel:
    def __init__(self, database_url, storage, secret, *, allow_sqlite=False):
        if not database_url or not secret or len(secret) < 32:
            raise ValueError("Explicit database and >=32 character delegation secret required")
        if not database_url.startswith("postgresql") and not (allow_sqlite and database_url.startswith("sqlite")):
            raise ValueError("PostgreSQL required outside explicit SQLite test mode")
        self.engine = create_engine(database_url, connect_args={"check_same_thread": False, "timeout": 30} if database_url.startswith("sqlite") else {})
        self.session = sessionmaker(self.engine, expire_on_commit=False)
        self.storage = Path(storage).resolve()
        self.storage.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.secret = secret

    def initialize(self):
        """Explicit provisioning step; never called on normal HTTP startup."""
        Base.metadata.create_all(self.engine)
        if self.engine.dialect.name == "postgresql":
            from sqlalchemy import text
            with self.engine.begin() as db:
                # Server-owned tables: no browser/PostgREST grants or permissive
                # policies. Application authorization is mandatory above these.
                # Run this account as a dedicated owner, never expose its DSN.
                for table in Base.metadata.sorted_tables:
                    name = table.name
                    db.execute(text(f'ALTER TABLE "{name}" ENABLE ROW LEVEL SECURITY'))
                    db.execute(text(f'REVOKE ALL ON TABLE "{name}" FROM PUBLIC'))
                    for role in ("anon", "authenticated"):
                        if db.scalar(text("SELECT 1 FROM pg_roles WHERE rolname=:role"), {"role": role}):
                            db.execute(text(f'REVOKE ALL ON TABLE "{name}" FROM "{role}"'))

    def authorize(self, token, workspace, operation):
        c = decode_token(token, self.secret)
        if c["workspace"] != workspace or c["operation"] != operation:
            raise Fault(403, "SCOPE_MISMATCH")
        try:
            with self.session.begin() as db:
                binding = db.scalar(select(Binding).where(Binding.actor == c["actor"], Binding.org == c["org"], Binding.run == c["run"], Binding.workspace == c["workspace"], Binding.role == c["role"], Binding.active.is_(True)))
                if not binding:
                    binding = Binding(actor=c["actor"], org=c["org"], run=c["run"], workspace=c["workspace"], role=c["role"], active=True, can_write=True)
                    db.add(binding)
                    db.flush()
                elif (operation in ("upload", "delete") and not binding.can_write):
                    raise Fault(403, "ACCESS_DENIED")
                db.execute(delete(Receipt).where(Receipt.expires < time.time()))
                db.add(Receipt(jti=c["jti"], expires=c["exp"]))
                db.flush()
        except Fault:
            raise
        except Exception as exc:
            from sqlalchemy.exc import IntegrityError
            if isinstance(exc, IntegrityError):
                raise Fault(409, "TOKEN_REPLAY") from None
            raise
        return c

    def _scope(self, c):
        return (Source.org == c["org"], Source.workspace == c["workspace"], Source.role == c["role"], Source.run == c["run"])

    def ingest(self, c, source_key, filename, data, *, target_source_id=None, idempotency_key=None, allow_key_match=False, _retry_depth=0):
        if not data:
            raise Fault(422, "EMPTY_DOCUMENT")
        if len(data) > MAX_BYTES:
            raise Fault(413, "FILE_TOO_LARGE")
        source_key = (source_key or "").strip()
        filename = (filename or "").strip()
        if not filename or len(filename) > 255:
            filename = "document.bin"
        if len(source_key) > 512:
            raise Fault(422, "INVALID_SOURCE_IDENTITY")
        digest = hashlib.sha256(data).hexdigest()
        fingerprint = hashlib.sha256(f"{digest}:{filename}:{target_source_id or ''}".encode()).hexdigest()

        from sqlalchemy.exc import IntegrityError
        created_path = None
        try:
            with self.session.begin() as db:
                if idempotency_key:
                    # ── Semantics 0: Persisted Tenant/Run-Scoped Idempotency ──
                    existing_idem = db.scalar(
                        select(IdempotencyRecord).where(
                            IdempotencyRecord.org == c["org"],
                            IdempotencyRecord.workspace == c["workspace"],
                            IdempotencyRecord.run == c["run"],
                            IdempotencyRecord.idempotency_key == idempotency_key
                        )
                    )
                    if existing_idem:
                        if existing_idem.fingerprint != fingerprint:
                            raise Fault(409, "IDEMPOTENCY_CONFLICT")
                        src = db.scalar(select(Source).where(Source.id == existing_idem.source_id, *self._scope(c)).with_for_update())
                        if src is None:
                            raise Fault(403, "ACCESS_DENIED")
                        if src.deleted:
                            raise Fault(409, "SOURCE_DELETED")
                        ver = db.get(Version, existing_idem.version_id)
                        if not ver:
                            raise Fault(404, "VERSION_NOT_FOUND")
                        job = db.scalar(select(Job).where(Job.version == ver.id).with_for_update())
                        if job and job.state in ("failed", "cancelled"):
                            job.state = "pending"
                            job.attempts = 0
                            job.error = None
                            ver.state = "pending"
                        return {
                            "source_id": src.id,
                            "version_id": ver.id,
                            "version": ver.number,
                            "state": ver.state,
                            "replayed": True
                        }

                if target_source_id:
                    # ── Semantics 2: Explicit Revision Targeting Existing Source ──
                    source = db.scalar(select(Source).where(Source.id == target_source_id, *self._scope(c)).with_for_update())
                    if source is None:
                        raise Fault(404, "TARGET_SOURCE_NOT_FOUND")
                    if source.deleted:
                        raise Fault(409, "SOURCE_DELETED")
                elif allow_key_match and source_key:
                    # ── Backward-Compatible Key Matching (Test Harness / Explicit API Client) ──
                    source = db.scalar(select(Source).where(*self._scope(c), Source.source_key == source_key).with_for_update())
                    if source is not None:
                        if source.deleted:
                            raise Fault(409, "SOURCE_DELETED")
                    else:
                        source = Source(org=c["org"], workspace=c["workspace"], role=c["role"], run=c["run"], source_key=source_key)
                        db.add(source)
                        db.flush()
                else:
                    # ── Semantics 1: New Server-Owned Document Identity ──
                    # Default: An upload without target_source_id ALWAYS creates a new Source row.
                    # Filename and source_key serve purely as display labels. If already in use in this
                    # scope, disambiguate with a unique suffix to satisfy DB UNIQUE constraint.
                    base_key = (source_key or filename or "document").strip()
                    existing = db.scalar(select(Source).where(*self._scope(c), Source.source_key == base_key))
                    if existing is not None:
                        unique_suffix = uid()[:8]
                        final_source_key = f"{base_key} ({unique_suffix})"
                    else:
                        final_source_key = base_key

                    source = Source(org=c["org"], workspace=c["workspace"], role=c["role"], run=c["run"], source_key=final_source_key)
                    db.add(source)
                    db.flush()

                latest = db.scalar(select(Version).where(Version.source == source.id).order_by(Version.number.desc()).limit(1))

                # ── Semantics 3: Retry of Same Upload on This Source ──
                if latest and latest.sha256 == digest and latest.filename == filename:
                    job = db.scalar(select(Job).where(Job.version == latest.id).with_for_update())
                    if job and job.state in ("failed", "cancelled"):
                        job.state = "pending"
                        job.attempts = 0
                        job.error = None
                        latest.state = "pending"
                    if idempotency_key:
                        db.add(IdempotencyRecord(
                            org=c["org"],
                            workspace=c["workspace"],
                            run=c["run"],
                            idempotency_key=idempotency_key,
                            fingerprint=fingerprint,
                            source_id=source.id,
                            version_id=latest.id,
                            created_at=time.time()
                        ))
                    return {"source_id": source.id, "version_id": latest.id, "version": latest.number, "state": latest.state, "replayed": True}

                # ── Semantics 4: New Version Creation ──
                version_id = uid()
                path = self.storage / source.id / version_id
                path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                created_path = path
                with path.open("xb") as stream:
                    os.chmod(path, 0o600)
                    stream.write(data)
                    stream.flush()
                    os.fsync(stream.fileno())

                ver_number = 1 if latest is None else latest.number + 1
                ver = Version(id=version_id, source=source.id, number=ver_number, sha256=digest, bytes=len(data), filename=filename, path=str(path), observed_at=time.time(), state="pending")
                db.add(ver)
                db.flush()
                db.add(Job(version=ver.id, state="pending"))
                db.add(IndexingStage(version=ver.id, status="pending"))
                db.flush()
                if idempotency_key:
                    db.add(IdempotencyRecord(
                        org=c["org"],
                        workspace=c["workspace"],
                        run=c["run"],
                        idempotency_key=idempotency_key,
                        fingerprint=fingerprint,
                        source_id=source.id,
                        version_id=ver.id,
                        created_at=time.time()
                    ))
                return {"source_id": source.id, "version_id": ver.id, "version": ver.number, "state": "pending", "replayed": False}
        except IntegrityError:
            if created_path:
                created_path.unlink(missing_ok=True)
            if idempotency_key:
                with self.session.begin() as db:
                    existing_idem = db.scalar(
                        select(IdempotencyRecord).where(
                            IdempotencyRecord.org == c["org"],
                            IdempotencyRecord.workspace == c["workspace"],
                            IdempotencyRecord.run == c["run"],
                            IdempotencyRecord.idempotency_key == idempotency_key
                        )
                    )
                    if existing_idem:
                        if existing_idem.fingerprint != fingerprint:
                            raise Fault(409, "IDEMPOTENCY_CONFLICT")
                        src = db.scalar(select(Source).where(Source.id == existing_idem.source_id, *self._scope(c)))
                        if src is None:
                            raise Fault(403, "ACCESS_DENIED")
                        if src.deleted:
                            raise Fault(409, "SOURCE_DELETED")
                        ver = db.get(Version, existing_idem.version_id)
                        if not ver:
                            raise Fault(404, "VERSION_NOT_FOUND")
                        return {
                            "source_id": src.id,
                            "version_id": ver.id,
                            "version": ver.number,
                            "state": ver.state,
                            "replayed": True
                        }
            if _retry_depth < 8:
                return self.ingest(
                    c,
                    source_key,
                    filename,
                    data,
                    target_source_id=target_source_id,
                    idempotency_key=idempotency_key,
                    allow_key_match=allow_key_match,
                    _retry_depth=_retry_depth + 1
                )
            raise
        except Exception:
            if created_path:
                created_path.unlink(missing_ok=True)
            raise

    def renew_lease(self, job_id, fence, additional_seconds=60):
        now = time.time()
        with self.session.begin() as db:
            job = db.scalar(select(Job).where(Job.id == job_id).with_for_update())
            if not job or job.fence != fence or job.state != "processing" or (job.lease_until is not None and job.lease_until < now):
                detail = f"job_found={bool(job)},expected_fence={fence},actual_fence={job.fence if job else None},state={job.state if job else None},expired={bool(job and job.lease_until is not None and job.lease_until < now)}"
                raise Fault(409, f"LEASE_LOST:{detail}")
            job.lease_until = now + additional_seconds
        return now + additional_seconds

    def claim(self, lease_seconds=60):
        now = time.time()
        with self.session.begin() as db:
            abandoned = db.scalars(select(Job).where(Job.state == "processing", Job.lease_until < now, Job.attempts >= 5).with_for_update()).all()
            for job in abandoned:
                job.state, job.error = "failed", "RETRY_EXHAUSTED_AFTER_LEASE_EXPIRY"
                db.get(Version, job.version).state = "failed"
            candidates = select(Job.id).where(Job.attempts < 5, or_(Job.state == "pending", and_(Job.state == "processing", Job.lease_until < now))).order_by(Job.id).limit(1)
            if self.engine.dialect.name == "postgresql":
                candidates = candidates.with_for_update(skip_locked=True)
            job_id = db.scalar(candidates)
            if not job_id:
                return None
            fence = uid()
            changed = db.execute(update(Job).where(Job.id == job_id, Job.attempts < 5, or_(Job.state == "pending", and_(Job.state == "processing", Job.lease_until < now))).values(state="processing", lease_until=now + lease_seconds, fence=fence, attempts=Job.attempts + 1))
            if changed.rowcount != 1:
                return None
            return job_id, fence

    def process(self, claim, *, fail_before_commit=False, before_commit=None, parse_delay_seconds=0.0):
        job_id, fence = claim
        try:
            with self.session() as db:
                job = db.get(Job, job_id)
                if job is None or job.fence != fence or job.state != "processing" or job.lease_until < time.time():
                    raise Fault(409, "LEASE_LOST")
                ver = db.get(Version, job.version)
                original = Path(ver.path).read_bytes()
                if hashlib.sha256(original).hexdigest() != ver.sha256:
                    raise Fault(422, "ORIGINAL_HASH_MISMATCH")
                parsed = parse_original(original, ver.filename)
            if parse_delay_seconds and parse_delay_seconds > 0:
                deadline = time.time() + float(parse_delay_seconds)
                while time.time() < deadline:
                    if before_commit is not None:
                        before_commit()
                    time.sleep(min(0.1, max(0.01, deadline - time.time())))
            with self.session.begin() as db:
                job = db.scalar(select(Job).where(Job.id == job_id).with_for_update())
                if job is None or job.fence != fence or job.state != "processing" or job.lease_until < time.time():
                    raise Fault(409, "LEASE_LOST")
                if before_commit is not None:
                    before_commit()
                ver = db.get(Version, job.version)
                source = db.get(Source, ver.source)
                if source.deleted:
                    raise Fault(409, "SOURCE_DELETED")
                if db.get(Artifact, ver.id) is None:
                    db.add(Artifact(version=ver.id, spec=SPEC, parser=parsed["parser"], text=parsed["text"], sha256=hashlib.sha256(parsed["text"].encode()).hexdigest(), exceptions=json.dumps(parsed["exceptions"]), pages_total=parsed["pages_total"], pages_with_text=parsed["pages_with_text"]))
                    for span in parsed["spans"]:
                        db.add(Span(version=ver.id, **span))
                if fail_before_commit:
                    raise RuntimeError("INJECTED_FINALIZATION_FAILURE")
                ver.state = "partial" if parsed["exceptions"] else "completed"
                job.state, job.error = "completed", None
            return {"ok": True, "state": ver.state}
        except BaseException as exc:
            if (
                exc.__class__.__name__ in ("CancelledError", "CanceledError")
                or "cancel" in exc.__class__.__name__.lower()
                or (isinstance(exc, Fault) and "cancel" in getattr(exc, "code", "").lower())
            ):
                with self.session.begin() as db:
                    job = db.scalar(select(Job).where(Job.id == job_id).with_for_update())
                    if job and job.fence == fence and job.state == "processing":
                        job.state = "cancelled"
                        job.lease_until = 0
                        job.error = "ACTIVITY_CANCELLED"
                        ver_row = db.get(Version, job.version)
                        if ver_row and ver_row.state not in ("completed", "partial"):
                            ver_row.state = "cancelled"
                raise
            code = exc.code if isinstance(exc, Fault) else "PROCESSING_FAILURE"
            if code != "LEASE_LOST":
                with self.session.begin() as db:
                    job = db.scalar(select(Job).where(Job.id == job_id).with_for_update())
                    if job and job.fence == fence and job.state == "processing" and job.lease_until >= time.time():
                        job.state = "failed" if job.attempts >= 5 or isinstance(exc, Fault) and exc.status == 422 else "pending"
                        job.error = code
                        db.get(Version, job.version).state = "failed" if job.state == "failed" else "pending"
            return {"ok": False, "code": code}

    def inspect(self, c, source_id, as_of=None, version=None):
        with self.session() as db:
            source = db.scalar(select(Source).where(Source.id == source_id, *self._scope(c), Source.deleted.is_(False)))
            if source is None:
                raise Fault(404, "SOURCE_NOT_FOUND")
            all_versions = db.scalars(
                select(Version).where(Version.source == source_id).order_by(Version.number.desc())
            ).all()
            if not all_versions:
                raise Fault(404, "VERSION_NOT_FOUND")
            query = select(Version).where(Version.source == source_id)
            if version is not None:
                query = query.where(Version.number == int(version))
            if as_of is not None:
                query = query.where(Version.observed_at <= as_of)
            ver = db.scalar(query.order_by(Version.number.desc()).limit(1))
            if ver is None:
                raise Fault(404, "VERSION_NOT_FOUND")
            artifact = db.get(Artifact, ver.id)
            spans = db.scalars(select(Span).where(Span.version == ver.id).order_by(Span.start)).all()
            span_ids = [s.id for s in spans]
            job = db.scalar(select(Job).where(Job.version == ver.id))
            proj = db.get(Projection, ver.id)

            # Record parsing, indexing, and projection status separately
            parsing_state = ver.state
            embedding_configured = bool(os.environ.get("WORKBYLINE_EMBEDDING_WEIGHTS", "").strip())

            stage = db.get(IndexingStage, ver.id)
            if stage:
                if stage.status == "completed":
                    if embedding_configured and (
                        not stage.inference_backend
                        or not stage.inference_backend.startswith("sentence_transformers:")
                    ):
                        indexing_state = "reindex_required"
                    else:
                        indexing_state = "indexed"
                else:
                    indexing_state = stage.status
            else:
                # Compatibility fallback for records created prior to migration 006
                if not embedding_configured:
                    indexing_state = "lexical_only"
                elif ver.state in ("completed", "partial") and span_ids and self.engine.dialect.name == "postgresql":
                    from sqlalchemy import text
                    try:
                        emb_count = db.execute(
                            text("SELECT count(*) FROM wbctx_span_embeddings WHERE span_id = ANY(:sids)"),
                            {"sids": span_ids}
                        ).scalar() or 0
                        if emb_count == len(span_ids) and len(span_ids) > 0:
                            try:
                                valid_backend_count = db.execute(
                                    text(
                                        "SELECT count(*) FROM wbctx_span_embeddings "
                                        "WHERE span_id = ANY(:sids) AND inference_backend LIKE 'sentence_transformers:%'"
                                    ),
                                    {"sids": span_ids}
                                ).scalar() or 0
                                if valid_backend_count < len(span_ids):
                                    indexing_state = "reindex_required"
                                else:
                                    indexing_state = "indexed"
                            except Exception:
                                indexing_state = "indexed"
                        elif emb_count > 0:
                            indexing_state = "partially_indexed"
                        else:
                            indexing_state = "pending"
                    except Exception:
                        indexing_state = "pending"
                else:
                    indexing_state = "pending"

            projection_state = proj.status if proj else ("disabled" if os.environ.get("WORKBYLINE_GRAPH_ENABLED") != "true" else "unprojected")

            return {
                "source_id": source.id,
                "source_key": source.source_key,
                "version_id": ver.id,
                "version": ver.number,
                "filename": ver.filename,
                "state": ver.state,
                "parsing_state": parsing_state,
                "indexing_state": indexing_state,
                "projection_state": projection_state,
                "inference_backend": stage.inference_backend if stage else None,
                "original_sha256": ver.sha256,
                "original_bytes": ver.bytes,
                "observed_at": ver.observed_at,
                "parser": artifact.parser if artifact else None,
                "offset_unit": "unicode_codepoints",
                "normalized_text": artifact.text if artifact else None,
                "exceptions": json.loads(artifact.exceptions) if artifact else [],
                "pages_total": artifact.pages_total if artifact else None,
                "pages_with_text": artifact.pages_with_text if artifact else None,
                "parsing_error": job.error if job else None,
                "indexing_error": stage.error if stage else None,
                "projection_error": proj.error if proj else None,
                "versions": [
                    {
                        "version_id": v.id,
                        "version": v.number,
                        "filename": v.filename,
                        "state": v.state,
                        "observed_at": v.observed_at,
                        "sha256": v.sha256,
                        "bytes": v.bytes,
                    }
                    for v in all_versions
                ],
                "spans": [{"span_id": s.id, "start": s.start, "end": s.end, "page": s.page, "text": s.text, "employer_approval": "NOT_OBTAINED"} for s in spans]
            }

    def reprocess_version(self, c, version_id):
        now = time.time()
        with self.session.begin() as db:
            ver = db.get(Version, version_id)
            if not ver:
                raise Fault(404, "VERSION_NOT_FOUND")
            source = db.scalar(select(Source).where(Source.id == ver.source, *self._scope(c)))
            if not source:
                raise Fault(404, "SOURCE_NOT_FOUND")
            if source.deleted:
                raise Fault(409, "SOURCE_DELETED")

            job = db.scalar(select(Job).where(Job.version == version_id).with_for_update())
            stage = db.scalar(select(IndexingStage).where(IndexingStage.version == version_id).with_for_update())
            proj = db.scalar(select(Projection).where(Projection.version == version_id).with_for_update())

            is_cancelled = (ver.state == "cancelled") or (job and job.state == "cancelled") or (stage and stage.status == "cancelled")
            if is_cancelled and not (c.get("allow_resume") or c.get("resume")):
                raise Fault(409, "VERSION_CANCELLED")

            if job and job.state == "processing" and job.lease_until > now:
                raise Fault(409, "JOB_ALREADY_ACTIVE")
            if stage and stage.status == "running" and (stage.updated_at or 0) + 120.0 > now:
                raise Fault(409, "INDEXING_ALREADY_ACTIVE")
            if proj and proj.status == "running" and (proj.updated_at or 0) + 120.0 > now:
                raise Fault(409, "PROJECTION_ALREADY_ACTIVE")

            if not job:
                job = Job(version=version_id)
                db.add(job)
            job.state = "pending"
            job.attempts = 0
            job.lease_until = 0
            job.error = None
            if ver.state not in ("completed", "partial"):
                ver.state = "pending"
            if stage and stage.status in ("failed", "cancelled", "reindex_required"):
                stage.status = "pending"
                stage.error = None
                stage.updated_at = now
            if proj and proj.status == "failed":
                proj.status = "pending"
                proj.error = None
                proj.updated_at = now
        return {"ok": True, "version_id": version_id, "state": "pending", "action": "reprocess_queued"}

    def retrieve(self, c, query, limit=5, as_of=None):
        words = set(re.findall(r"\w+", query.lower()))
        with self.session() as db:
            sources = db.scalars(select(Source).where(*self._scope(c), Source.deleted.is_(False))).all()
            ids = [s.id for s in sources]
        hits, coverage = [], {"eligible_sources": len(ids), "completed": 0, "partial": 0, "pending": 0, "failed": 0, "cancelled": 0}
        for source_id in ids:
            try:
                doc = self.inspect(c, source_id, as_of)
            except Fault as exc:
                if exc.code == "VERSION_NOT_FOUND":
                    coverage["eligible_sources"] -= 1
                    continue
                raise
            coverage[doc["state"]] = coverage.get(doc["state"], 0) + 1
            for span in doc["spans"]:
                score = len(words & set(re.findall(r"\w+", span["text"].lower())))
                if score:
                    hits.append({**span, "source_id": source_id, "version_id": doc["version_id"], "score": score})
        return {"mode": "retrieval_only", "status": "RETRIEVAL_ONLY_COMPLETE", "answer": None,
                "passages": sorted(hits, key=lambda x: (-x["score"], x["span_id"]))[:limit],
                "coverage": coverage, "retrieval_method": "lexical-token-overlap-baseline",
                "has_validation_errors": False,
                "disclaimer": "SOURCE MATERIAL / NOT EMPLOYER-APPROVED; retrieval does not verify competence"}

    def revoke(self, binding_id):
        with self.session.begin() as db:
            db.execute(update(Binding).where(Binding.id == binding_id).values(active=False))

    def remove(self, c, source_id):
        with self.session.begin() as db:
            source = db.scalar(select(Source).where(Source.id == source_id, *self._scope(c)).with_for_update())
            if source is None:
                raise Fault(404, "SOURCE_NOT_FOUND")
            source.deleted = True
        # Revocation tombstone blocks retrieval immediately; bytes are retained.
        # This endpoint deliberately does NOT claim complete hard erasure.
        return {"state": "revoked", "byte_retention": "retained", "hard_erasure": "not_implemented"}

    def reconcile_storage(self, *, dry_run: bool = True) -> dict:
        """Audit storage directory against database records to detect/prune orphans and find missing files."""
        disk_files = []
        if self.storage.exists():
            for p in self.storage.rglob("*"):
                if p.is_file():
                    disk_files.append(p.resolve())
        disk_paths_set = {str(p) for p in disk_files}

        storage_root = self.storage.resolve()
        with self.session() as db:
            db_versions = db.execute(select(Version.id, Version.path, Version.sha256)).all()
        db_paths_map = {
            str(Path(row.path).resolve()): (row.id, row.sha256)
            for row in db_versions
            if Path(row.path).resolve().is_relative_to(storage_root)
        }
        db_paths_set = set(db_paths_map.keys())

        orphaned = disk_paths_set - db_paths_set
        missing = db_paths_set - disk_paths_set

        # Check hash integrity on existing files
        hash_mismatches = []
        for disk_path_str in (disk_paths_set & db_paths_set):
            ver_id, expected_sha = db_paths_map[disk_path_str]
            actual_sha = hashlib.sha256(Path(disk_path_str).read_bytes()).hexdigest()
            if actual_sha != expected_sha:
                hash_mismatches.append({"path": disk_path_str, "version_id": ver_id, "expected": expected_sha, "actual": actual_sha})

        reconciled = []
        if not dry_run:
            for orphan_str in orphaned:
                p = Path(orphan_str)
                p.unlink(missing_ok=True)
                reconciled.append(orphan_str)
                if p.parent != self.storage and p.parent.exists() and not any(p.parent.iterdir()):
                    p.parent.rmdir()

        return {
            "scanned_disk_files": len(disk_files),
            "db_tracked_versions": len(db_paths_set),
            "orphaned_files": sorted(list(orphaned)),
            "missing_files": sorted(list(missing)),
            "hash_mismatches": hash_mismatches,
            "reconciled_orphans_pruned": len(reconciled),
            "dry_run": dry_run,
        }

    def hard_erase(self, c, source_id: str, *, simulate_crash_before_unlink: bool = False) -> dict:
        """Physical hard erasure: removes all database projections, embeddings, idempotency keys,
        spans, artifacts, jobs, versions, sources, and unlinks disk bytes in safe dependency order,
        recording durable erasure tombstones for crash-safe cleanup recovery."""
        with self.session.begin() as db:
            source = db.scalar(select(Source).where(Source.id == source_id, *self._scope(c)).with_for_update())
            if source is None:
                raise Fault(404, "SOURCE_NOT_FOUND")
            # 1. Immediately mark deleted to deny any concurrent retrieval while erasure executes
            source.deleted = True

            versions = db.scalars(select(Version).where(Version.source == source_id)).all()
            version_ids = [v.id for v in versions]
            total_bytes = sum(v.bytes for v in versions)

            # Record durable erasure tombstones before deleting records
            for v in versions:
                db.add(ErasureTombstone(
                    source_id=source_id,
                    version_id=v.id,
                    path=str(v.path),
                    status="pending",
                    fence=None,
                    lease_until=0,
                    attempts=0,
                    last_error=None,
                    created_at=time.time()
                ))

            if version_ids:
                # 2. Gather all span IDs across these versions
                spans = db.scalars(select(Span).where(Span.version.in_(version_ids))).all()
                span_ids = [s.id for s in spans]

                # 3. Delete idempotency keys referencing this source or any of its versions
                db.execute(delete(IdempotencyRecord).where(
                    or_(
                        IdempotencyRecord.source_id == source_id,
                        IdempotencyRecord.version_id.in_(version_ids)
                    )
                ))

                # 4. Delete graph projections referencing these versions
                db.execute(delete(Projection).where(Projection.version.in_(version_ids)))

                # 5. Delete persisted indexing stages
                db.execute(delete(IndexingStage).where(IndexingStage.version.in_(version_ids)))

                # 6. Delete vector embeddings referencing these spans
                if span_ids and self.engine.dialect.name == "postgresql":
                    from sqlalchemy import text
                    db.execute(text("DELETE FROM wbctx_span_embeddings WHERE span_id = ANY(:sids)"), {"sids": span_ids})

                # 7. Delete spans
                db.execute(delete(Span).where(Span.version.in_(version_ids)))

                # 8. Delete artifacts
                db.execute(delete(Artifact).where(Artifact.version.in_(version_ids)))

                # 9. Delete jobs
                db.execute(delete(Job).where(Job.version.in_(version_ids)))

                # 10. Delete versions
                db.execute(delete(Version).where(Version.source == source_id))

            # Also delete any dangling idempotency records for source_id even if no versions
            db.execute(delete(IdempotencyRecord).where(IdempotencyRecord.source_id == source_id))

            # 11. Delete source
            db.delete(source)

        if simulate_crash_before_unlink:
            raise RuntimeError("SIMULATED_CRASH_AFTER_DB_COMMIT_BEFORE_UNLINK")

        recovery = self.recover_interrupted_erasures(source_id=source_id)
        byte_retention = "purged" if recovery["failed_count"] == 0 and recovery["pending_backlog"] == 0 else "pending_recovery"

        return {
            "source_id": source_id,
            "state": "hard_erased",
            "byte_retention": byte_retention,
            "deleted_versions": len(version_ids),
            "unlinked_disk_files": recovery["unlinked_files"],
            "bytes_reclaimed": total_bytes if byte_retention == "purged" else 0,
            "tombstones_completed": recovery["recovered_count"],
            "tombstones_failed": recovery["failed_count"],
        }

    def recover_interrupted_erasures(self, *, source_id: str | None = None, lease_seconds: float = 30.0, max_attempts: int = 5) -> dict:
        """Durable lease-based physical erasure recovery.
        - Claims eligible tombstones one by one under FOR UPDATE SKIP LOCKED into status='processing'
          with a unique fence and lease_until timestamp, preventing concurrent startup/CLI races.
        - Verifies target path is inside storage_root before unlinking.
        - Marks a tombstone 'completed' ONLY when the target file no longer exists after unlink.
        - On PermissionError or OSError, records sanitized last_error, increments attempts, and
          sets status to 'pending' (retryable) or 'failed' (when attempts >= max_attempts).
        """
        storage_root = self.storage.resolve()
        recovered_count = 0
        unlinked_files = 0
        errors = []

        # 1. Mark any abandoned expired leases that exhausted attempts as failed
        now = time.time()
        with self.session.begin() as db:
            abandoned_stmt = select(ErasureTombstone).where(
                ErasureTombstone.status == "processing",
                ErasureTombstone.lease_until < now,
                ErasureTombstone.attempts >= max_attempts,
            )
            if source_id:
                abandoned_stmt = abandoned_stmt.where(ErasureTombstone.source_id == source_id)
            if self.engine.dialect.name == "postgresql":
                abandoned_stmt = abandoned_stmt.with_for_update(skip_locked=True)
            for t in db.scalars(abandoned_stmt).all():
                t.status = "failed"
                t.lease_until = 0
                t.last_error = "RETRY_EXHAUSTED_AFTER_LEASE_EXPIRY"

        # 2. Claim and process eligible tombstones one by one with durable lease fencing
        processed_ids: set[str] = set()
        while True:
            now = time.time()
            claimed = None
            with self.session.begin() as db:
                eligible_cond = and_(
                    ErasureTombstone.attempts < max_attempts,
                    or_(
                        ErasureTombstone.status == "pending",
                        and_(ErasureTombstone.status == "processing", ErasureTombstone.lease_until < now),
                    ),
                )
                stmt = select(ErasureTombstone).where(eligible_cond)
                if source_id:
                    stmt = stmt.where(ErasureTombstone.source_id == source_id)
                if processed_ids:
                    stmt = stmt.where(ErasureTombstone.id.notin_(processed_ids))
                stmt = stmt.order_by(ErasureTombstone.created_at, ErasureTombstone.id).limit(1)
                if self.engine.dialect.name == "postgresql":
                    stmt = stmt.with_for_update(skip_locked=True)
                t = db.scalar(stmt)
                if t is None:
                    break
                claim_fence = uid()
                t.status = "processing"
                t.fence = claim_fence
                t.lease_until = now + lease_seconds
                t.attempts = (t.attempts or 0) + 1
                claimed = (t.id, t.path, t.source_id, claim_fence, t.attempts)

            tid, raw_path, src_id, claim_fence, attempt_num = claimed
            processed_ids.add(tid)

            try:
                resolved_path = Path(raw_path).resolve()
            except Exception as exc:
                err_code = f"INVALID_TOMBSTONE_PATH:{type(exc).__name__}"
                with self.session.begin() as db:
                    t = db.scalar(select(ErasureTombstone).where(ErasureTombstone.id == tid, ErasureTombstone.fence == claim_fence).with_for_update())
                    if t and t.status == "processing":
                        t.status = "failed"
                        t.lease_until = 0
                        t.last_error = err_code
                errors.append({"tombstone_id": tid, "source_id": src_id, "status": "failed", "attempts": attempt_num, "error": err_code})
                continue

            if not resolved_path.is_relative_to(storage_root):
                err_code = "PATH_OUTSIDE_STORAGE_ROOT"
                with self.session.begin() as db:
                    t = db.scalar(select(ErasureTombstone).where(ErasureTombstone.id == tid, ErasureTombstone.fence == claim_fence).with_for_update())
                    if t and t.status == "processing":
                        t.status = "failed"
                        t.lease_until = 0
                        t.last_error = err_code
                errors.append({"tombstone_id": tid, "source_id": src_id, "status": "failed", "attempts": attempt_num, "error": err_code})
                continue

            try:
                was_present = resolved_path.exists()
                resolved_path.unlink(missing_ok=True)
                if resolved_path.exists():
                    raise OSError("FILE_STILL_EXISTS_AFTER_UNLINK")

                # Best-effort cleanup of empty parent directory inside storage_root
                try:
                    parent_dir = resolved_path.parent
                    if parent_dir != storage_root and parent_dir.is_relative_to(storage_root) and parent_dir.exists() and not any(parent_dir.iterdir()):
                        parent_dir.rmdir()
                    src_dir = (self.storage / src_id).resolve()
                    if src_dir != storage_root and src_dir.is_relative_to(storage_root) and src_dir.exists() and not any(src_dir.iterdir()):
                        src_dir.rmdir()
                except OSError:
                    # Directory cleanup is non-fatal as long as the target version file is verified absent
                    pass

                # Verify target file is absent before marking completed
                if resolved_path.exists():
                    raise OSError("FILE_STILL_EXISTS_AFTER_UNLINK")

                with self.session.begin() as db:
                    t = db.scalar(select(ErasureTombstone).where(ErasureTombstone.id == tid, ErasureTombstone.fence == claim_fence).with_for_update())
                    if t and t.status == "processing":
                        t.status = "completed"
                        t.completed_at = time.time()
                        t.lease_until = 0
                        t.last_error = None
                        recovered_count += 1
                        if was_present:
                            unlinked_files += 1
            except (PermissionError, OSError, Exception) as exc:
                err_name = type(exc).__name__
                err_detail = getattr(exc, "strerror", None) or str(exc) or "UNLINK_ERROR"
                # Sanitize any filesystem path from error string
                err_detail = err_detail.replace(str(storage_root), "<storage_root>")[:120]
                sanitized_error = f"{err_name}: {err_detail}"
                next_status = "failed" if attempt_num >= max_attempts else "pending"
                with self.session.begin() as db:
                    t = db.scalar(select(ErasureTombstone).where(ErasureTombstone.id == tid, ErasureTombstone.fence == claim_fence).with_for_update())
                    if t and t.status == "processing":
                        t.status = next_status
                        t.lease_until = 0
                        t.last_error = sanitized_error
                errors.append({
                    "tombstone_id": tid,
                    "source_id": src_id,
                    "status": next_status,
                    "attempts": attempt_num,
                    "error": sanitized_error,
                })

        status_summary = self.erasure_recovery_status()
        return {
            "recovered_count": recovered_count,
            "unlinked_files": unlinked_files,
            "failed_count": len(errors),
            "pending_backlog": status_summary["pending"],
            "processing_backlog": status_summary["processing"],
            "failed_backlog": status_summary["failed"],
            "errors": errors,
        }

    def erasure_recovery_status(self, *, max_pending_age_sec: float | None = None) -> dict:
        """Return current durable erasure tombstone counts, backlog health, and recent sanitized errors for health/readiness."""
        now = time.time()
        age_limit = (
            float(max_pending_age_sec)
            if max_pending_age_sec is not None
            else float(os.environ.get("WORKBYLINE_ERASURE_MAX_PENDING_AGE_SEC", "300.0"))
        )
        with self.session() as db:
            rows = db.scalars(select(ErasureTombstone)).all()
        counts = {"pending": 0, "processing": 0, "completed": 0, "failed": 0}
        pending_with_errors = 0
        aging_backlog = 0
        recent_errors = []
        for r in rows:
            st = r.status if r.status in counts else "pending"
            counts[st] += 1
            if r.status == "pending":
                if r.last_error:
                    pending_with_errors += 1
                if r.created_at and (now - r.created_at) > age_limit:
                    aging_backlog += 1
            elif r.status == "processing":
                if r.lease_until and r.lease_until < now:
                    aging_backlog += 1
            if r.last_error and r.status in ("pending", "failed"):
                recent_errors.append({
                    "tombstone_id": r.id,
                    "source_id": r.source_id,
                    "status": r.status,
                    "attempts": r.attempts,
                    "last_error": r.last_error,
                })
        degraded_reasons = []
        if counts["failed"] > 0:
            degraded_reasons.append("failed_tombstones")
        if pending_with_errors > 0:
            degraded_reasons.append("pending_retry_errors")
        if aging_backlog > 0:
            degraded_reasons.append("aging_tombstone_backlog")
        return {
            **counts,
            "pending_with_errors": pending_with_errors,
            "aging_backlog": aging_backlog,
            "degraded_reasons": degraded_reasons,
            "healthy": len(degraded_reasons) == 0,
            "recent_errors": recent_errors[:10],
        }

