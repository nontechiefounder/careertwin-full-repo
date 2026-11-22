"""HTTP boundary; provisioning and worker execution are not public endpoints."""
from fastapi import FastAPI, File, Form, Header, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from .core import Fault, Kernel, MAX_BYTES


class Question(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=3, max_length=1000)
    limit: StrictInt = Field(default=5, ge=1, le=20)
    mode: str = "retrieval_only"
    as_of: float | str | None = None


def create_app(kernel: Kernel):
    app = FastAPI(title="workBYLiNE Context Evidence Repair", docs_url=None, redoc_url=None)

    @app.exception_handler(Fault)
    async def fault_handler(request, exc):
        return JSONResponse(status_code=exc.status, content={"error": exc.code})

    @app.exception_handler(Exception)
    async def unexpected_handler(request, exc):
        return JSONResponse(status_code=503, content={"error": "CONTEXT_SERVICE_UNAVAILABLE"})

    def scope(authorization, workspace, operation):
        if not authorization or not authorization.startswith("Bearer "):
            raise Fault(401, "AUTH_REQUIRED")
        return kernel.authorize(authorization[7:], workspace, operation)

    @app.get("/health")
    def health():
        return {"service": "workbyline-context-evidence", "generation": "not_implemented",
                "temporal": "not_implemented", "retrieval": "lexical-baseline"}

    @app.post("/v1/workspaces/{workspace}/sources", status_code=202)
    async def upload(
        workspace: str,
        file: UploadFile = File(),
        source_key: str = Form(default=""),
        target_source_id: str | None = Form(default=None),
        allow_key_match: bool = Form(default=False),
        allow_key_match_header: str | None = Header(default=None, alias="X-Allow-Key-Match"),
        idempotency_key_form: str | None = Form(default=None, alias="idempotency_key"),
        idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
        authorization: str | None = Header(default=None)
    ):
        c = scope(authorization, workspace, "upload")
        data = bytearray()
        while chunk := await file.read(64 * 1024):
            data.extend(chunk)
            if len(data) > MAX_BYTES:
                raise Fault(413, "FILE_TOO_LARGE")
        filename = file.filename or ""
        suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if suffix not in ("pdf", "docx", "txt", "md", "csv"):
            raise Fault(415, "UNSUPPORTED_FORMAT")
        if suffix in ("txt", "md", "csv"):
            try:
                bytes(data).decode("utf-8-sig")
            except UnicodeError:
                raise Fault(422, "UTF8_REQUIRED")
        actual_key = (idempotency_key or idempotency_key_form or "").strip() or None
        key_match = allow_key_match or (bool(allow_key_match_header) and allow_key_match_header.lower() in ("true", "1", "yes"))
        return kernel.ingest(
            c,
            source_key,
            filename,
            bytes(data),
            target_source_id=target_source_id.strip() if target_source_id else None,
            idempotency_key=actual_key,
            allow_key_match=bool(key_match)
        )

    @app.post("/v1/workspaces/{workspace}/sources/{source_id}/retry")
    def retry_source(workspace: str, source_id: str, authorization: str | None = Header(default=None)):
        c = scope(authorization, workspace, "upload")
        doc = kernel.inspect(c, source_id)
        return kernel.reprocess_version(c, doc["version_id"])

    @app.get("/v1/workspaces/{workspace}/sources/{source_id}")
    def inspect(
        workspace: str,
        source_id: str,
        as_of: float | str | None = None,
        version: int | None = None,
        authorization: str | None = Header(default=None),
    ):
        parsed_as_of = None
        if as_of is not None:
            if isinstance(as_of, (int, float)):
                parsed_as_of = float(as_of)
            elif isinstance(as_of, str):
                try:
                    parsed_as_of = float(as_of)
                except ValueError:
                    from datetime import datetime
                    parsed_as_of = datetime.fromisoformat(as_of.replace("Z", "+00:00")).timestamp()
        return kernel.inspect(scope(authorization, workspace, "read"), source_id, parsed_as_of, version=version)

    @app.get("/v1/workspaces/{workspace}/sources")
    def list_sources(workspace: str, authorization: str | None = Header(default=None)):
        from sqlalchemy import select
        from .core import Source
        c = scope(authorization, workspace, "read")
        with kernel.session() as db:
            ids = db.scalars(select(Source.id).where(*kernel._scope(c), Source.deleted.is_(False))).all()
        return {"sources": [kernel.inspect(c, source_id) for source_id in ids]}

    @app.post("/v1/workspaces/{workspace}/research-qa")
    def retrieve(workspace: str, body: Question, authorization: str | None = Header(default=None)):
        c = scope(authorization, workspace, "retrieve")
        if body.mode != "retrieval_only":
            raise Fault(503, "GENERATION_NOT_IMPLEMENTED")
        parsed_as_of = None
        if body.as_of is not None:
            if isinstance(body.as_of, (int, float)):
                parsed_as_of = float(body.as_of)
            elif isinstance(body.as_of, str):
                try:
                    parsed_as_of = float(body.as_of)
                except ValueError:
                    from datetime import datetime
                    parsed_as_of = datetime.fromisoformat(body.as_of.replace("Z", "+00:00")).timestamp()
        return kernel.retrieve(c, body.question, body.limit, parsed_as_of)

    @app.delete("/v1/workspaces/{workspace}/sources/{source_id}")
    def remove(workspace: str, source_id: str, authorization: str | None = Header(default=None)):
        return kernel.remove(scope(authorization, workspace, "delete"), source_id)

    return app
