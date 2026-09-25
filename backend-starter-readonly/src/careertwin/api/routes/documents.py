from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from careertwin.api.auth import AuthContext, get_auth_context, require_write_role
from careertwin.api.dependencies import (
    get_document_repository,
    get_malware_scanner,
    get_object_storage,
)
from careertwin.api.schemas import UploadIntentRequest, UploadIntentResponse
from careertwin.domain.models import Document
from careertwin.ingestion.scanner import MalwareScanner
from careertwin.ingestion.storage import ObjectStorageService
from careertwin.ingestion.validation import validate_file_content
from careertwin.persistence.repositories import PostgresDocumentRepository

router = APIRouter(prefix="/v1/documents", tags=["documents"])


@router.post(
    "/upload-intent",
    response_model=UploadIntentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_upload_intent(
    request: UploadIntentRequest,
    repo: PostgresDocumentRepository = Depends(get_document_repository),
    auth: AuthContext = Depends(get_auth_context),
) -> UploadIntentResponse:
    require_write_role(auth)
    doc_id = uuid4()
    object_key = f"{auth.org_id}/{request.candidate_id}/{doc_id}/{request.original_filename}"

    doc = Document(
        id=doc_id,
        org_id=auth.org_id,
        candidate_id=request.candidate_id,
        object_key=object_key,
        original_filename=request.original_filename,
        media_type=request.media_type,
        sha256="0" * 64,  # Computed upon binary upload
        scan_status="quarantined",
    )
    saved = await repo.create(doc)
    return UploadIntentResponse(
        document_id=saved.id,
        candidate_id=saved.candidate_id,
        object_key=saved.object_key,
        scan_status=saved.scan_status,
    )


@router.post("/{document_id}/upload", response_model=Document)
async def upload_document_file(
    document_id: UUID,
    file: UploadFile = File(...),
    repo: PostgresDocumentRepository = Depends(get_document_repository),
    storage: ObjectStorageService = Depends(get_object_storage),
    scanner: MalwareScanner = Depends(get_malware_scanner),
    auth: AuthContext = Depends(get_auth_context),
) -> Document:
    require_write_role(auth)
    doc = await repo.get(document_id)
    if doc is None or doc.org_id != auth.org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="document not found"
        )

    content = await file.read()

    # 1. Validate file extension, magic bytes, size limit, and SHA-256
    val_res = validate_file_content(
        filename=file.filename or doc.original_filename,
        content=content,
        claimed_media_type=file.content_type,
    )
    if not val_res.valid:
        await repo.update_scan_status(doc.id, "rejected")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=val_res.error_message
        )

    # Update computed SHA-256 and media_type
    doc = doc.model_copy(
        update={
            "sha256": val_res.sha256,
            "media_type": val_res.media_type,
        }
    )

    # 2. Save file to quarantine object storage
    quarantine_key = await storage.put_quarantined(doc.object_key, content)

    # 3. Malware scan via ClamAV interface
    scan_res = await scanner.scan(content)
    if not scan_res.clean:
        await repo.update_scan_status(doc.id, "rejected")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Malware detected: {scan_res.virus_name}",
        )

    # 4. Promote file from quarantine to accepted object storage
    await storage.promote_to_accepted(doc.object_key)
    return await repo.update_scan_status(doc.id, "accepted")


@router.get("/{document_id}", response_model=Document)
async def get_document(
    document_id: UUID,
    repo: PostgresDocumentRepository = Depends(get_document_repository),
    auth: AuthContext = Depends(get_auth_context),
) -> Document:
    doc = await repo.get(document_id)
    if doc is None or doc.org_id != auth.org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="document not found"
        )
    return doc
