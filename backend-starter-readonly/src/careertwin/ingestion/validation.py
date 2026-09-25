import hashlib
from typing import NamedTuple

MAX_FILE_BYTES = 25 * 1024 * 1024  # 25 MB

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".csv"}
ALLOWED_MEDIA_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/csv",
    "text/plain",  # Allowed for CSV uploads
}

MAGIC_BYTES = {
    ".pdf": [b"%PDF-"],
    ".docx": [b"PK\x03\x04"],
}


class ValidationResult(NamedTuple):
    valid: bool
    sha256: str
    media_type: str
    error_message: str | None = None


def validate_file_content(
    filename: str, content: bytes, claimed_media_type: str | None = None
) -> ValidationResult:
    if len(content) == 0:
        return ValidationResult(
            valid=False,
            sha256="",
            media_type="",
            error_message="Uploaded file is empty (0 bytes)",
        )

    if len(content) > MAX_FILE_BYTES:
        return ValidationResult(
            valid=False,
            sha256="",
            media_type="",
            error_message=f"Uploaded file exceeds size limit of {MAX_FILE_BYTES} bytes",
        )

    # Check extension
    dot_idx = filename.rfind(".")
    if dot_idx == -1:
        return ValidationResult(
            valid=False,
            sha256="",
            media_type="",
            error_message="Filename missing extension",
        )

    ext = filename[dot_idx:].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return ValidationResult(
            valid=False,
            sha256="",
            media_type="",
            error_message=f"Extension '{ext}' is not permitted. Allowed: {ALLOWED_EXTENSIONS}",
        )

    # Verify magic bytes if applicable
    if ext in MAGIC_BYTES:
        matched = any(content.startswith(magic) for magic in MAGIC_BYTES[ext])
        if not matched:
            return ValidationResult(
                valid=False,
                sha256="",
                media_type="",
                error_message=f"File magic bytes do not match expected signature for extension '{ext}'",
            )

    # Compute SHA-256
    sha256_hash = hashlib.sha256(content).hexdigest()

    # Determine canonical media type
    if ext == ".pdf":
        media_type = "application/pdf"
    elif ext == ".docx":
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif ext == ".csv":
        media_type = "text/csv"
    else:
        media_type = claimed_media_type or "application/octet-stream"

    return ValidationResult(valid=True, sha256=sha256_hash, media_type=media_type)
