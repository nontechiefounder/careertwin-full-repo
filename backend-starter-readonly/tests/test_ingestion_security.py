import io
from uuid import uuid4

from fastapi.testclient import TestClient

from careertwin.api.main import app
from careertwin.ingestion.validation import validate_file_content

VALID_PDF_BYTES = b"%PDF-1.4 sample pdf content for testing document ingestion."
VALID_DOCX_BYTES = b"PK\x03\x04 sample docx content for testing document ingestion."
VALID_CSV_BYTES = b"name,role,years\nAlice,Backend,5\n"
EICAR_BYTES = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"

HEADERS_WRITE = {
    "X-CareerTwin-Org-ID": "00000000-0000-0000-0000-000000000001",
    "X-CareerTwin-User-ID": "00000000-0000-0000-0000-000000000002",
    "X-CareerTwin-Role": "reviewer",
}


class TestIngestionSecurity:
    def test_validate_file_content_valid_pdf(self) -> None:
        res = validate_file_content("resume.pdf", VALID_PDF_BYTES)
        assert res.valid is True
        assert res.media_type == "application/pdf"
        assert len(res.sha256) == 64

    def test_validate_file_content_valid_docx(self) -> None:
        res = validate_file_content("resume.docx", VALID_DOCX_BYTES)
        assert res.valid is True
        assert res.media_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    def test_validate_file_content_valid_csv(self) -> None:
        res = validate_file_content("data.csv", VALID_CSV_BYTES)
        assert res.valid is True
        assert res.media_type == "text/csv"

    def test_validate_file_content_disallowed_extension(self) -> None:
        res = validate_file_content("script.exe", b"binary content")
        assert res.valid is False
        assert res.error_message is not None
        assert "not permitted" in res.error_message

    def test_validate_file_content_magic_bytes_mismatch(self) -> None:
        res = validate_file_content("fake.pdf", b"This is plain text not pdf")
        assert res.valid is False
        assert res.error_message is not None
        assert "magic bytes do not match" in res.error_message

    def test_validate_file_content_oversized_file(self) -> None:
        huge_bytes = b"0" * (25 * 1024 * 1024 + 1)
        res = validate_file_content("huge.pdf", huge_bytes)
        assert res.valid is False
        assert res.error_message is not None
        assert "exceeds size limit" in res.error_message

    def test_upload_intent_and_clean_file_ingestion_flow(self) -> None:
        client = TestClient(app)
        candidate_id = str(uuid4())

        # 1. Create upload intent
        intent_res = client.post(
            "/v1/documents/upload-intent",
            headers=HEADERS_WRITE,
            json={
                "candidate_id": candidate_id,
                "original_filename": "candidate_resume.pdf",
                "media_type": "application/pdf",
            },
        )
        assert intent_res.status_code == 201
        intent_data = intent_res.json()
        doc_id = intent_data["document_id"]
        assert intent_data["scan_status"] == "quarantined"

        # 2. Upload clean PDF file
        file_obj = io.BytesIO(VALID_PDF_BYTES)
        upload_res = client.post(
            f"/v1/documents/{doc_id}/upload",
            headers=HEADERS_WRITE,
            files={"file": ("candidate_resume.pdf", file_obj, "application/pdf")},
        )
        assert upload_res.status_code == 200
        doc_data = upload_res.json()
        assert doc_data["scan_status"] == "accepted"
        assert len(doc_data["sha256"]) == 64

    def test_upload_eicar_infected_file_rejected(self) -> None:
        client = TestClient(app)
        candidate_id = str(uuid4())

        # 1. Create upload intent
        intent_res = client.post(
            "/v1/documents/upload-intent",
            headers=HEADERS_WRITE,
            json={
                "candidate_id": candidate_id,
                "original_filename": "test_eicar.pdf",
                "media_type": "application/pdf",
            },
        )
        assert intent_res.status_code == 201
        doc_id = intent_res.json()["document_id"]

        # 2. Upload EICAR file with PDF magic header
        infected_pdf = b"%PDF-1.4 " + EICAR_BYTES
        file_obj = io.BytesIO(infected_pdf)
        upload_res = client.post(
            f"/v1/documents/{doc_id}/upload",
            headers=HEADERS_WRITE,
            files={"file": ("test_eicar.pdf", file_obj, "application/pdf")},
        )
        assert upload_res.status_code == 422
        assert "Malware detected" in upload_res.json()["detail"]

        # 3. Check document status is updated to rejected
        get_res = client.get(f"/v1/documents/{doc_id}", headers=HEADERS_WRITE)
        assert get_res.status_code == 200
        assert get_res.json()["scan_status"] == "rejected"
