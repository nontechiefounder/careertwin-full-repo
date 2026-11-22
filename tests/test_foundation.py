import hashlib
import io
import json
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from service.api import create_app
from service.core import Artifact, Binding, Fault, Job, Kernel, Source, Span, Version, decode_token, parse_original, sign


@pytest.fixture
def kernel(tmp_path):
    url = os.environ.get("WB_TEST_DATABASE_URL", "sqlite:///" + str(tmp_path / "test.db"))
    k = Kernel(url, tmp_path / "files", "test-only-" + "x" * 40, allow_sqlite=True)
    # A unique scope per test isolates records even on the shared disposable test server.
    k.test_org = str(uuid.uuid4())
    k.initialize()
    k.test_claims = {"actor": "actor", "org": k.test_org, "run": "run-a", "workspace": "ws-a", "role": "role-a"}
    with k.session.begin() as db:
        grant = Binding(**k.test_claims, active=True, can_write=True)
        db.add(grant)
        db.flush()
        k.binding_id = grant.id
    yield k
    try:
        with k.session.begin() as db:
            src_ids = db.scalars(select(Source.id).where(Source.org == k.test_org)).all()
            if src_ids:
                ver_ids = db.scalars(select(Version.id).where(Version.source.in_(src_ids))).all()
                if ver_ids:
                    db.execute(update(Job).where(Job.version.in_(ver_ids), Job.state.in_(("pending", "processing"))).values(state="completed"))
    except Exception:
        pass
    k.engine.dispose()


def claims(k, operation="read", **changes):
    now = int(time.time())
    return {**k.test_claims, "iss": "workbyline-v2-web", "aud": "workbyline-context-evidence", "iat": now,
            "exp": now + 120, "jti": str(uuid.uuid4()), "operation": operation, **changes}


def headers(k, operation="read", **changes):
    return {"Authorization": "Bearer " + sign(claims(k, operation, **changes), k.secret)}


def put(client, k, data=b"Python\nNo sponsorship\nKafka optional", filename="test.txt", key="resume", allow_key_match=True):
    return client.post("/v1/workspaces/ws-a/sources", headers=headers(k, "upload"), files={"file": (filename, data)}, data={"source_key": key, "allow_key_match": str(allow_key_match).lower()})


def drain(k, **kwargs):
    while c := k.claim():
        result = k.process(c, **kwargs)
        if not result["ok"]:
            return result
    return {"ok": True}


def test_original_bytes_short_facts_and_retrieval(kernel):
    k = kernel
    with TestClient(create_app(k)) as client:
        original = "Python\r\nNo sponsorship\r\nKafka optional\nCafé 🚀".encode()
        response = put(client, k, original)
        assert response.status_code == 202
        obj = response.json()
        assert obj["state"] == "pending"
        assert drain(k)["ok"]
        doc = client.get(f"/v1/workspaces/ws-a/sources/{obj['source_id']}", headers=headers(k)).json()
        assert doc["original_sha256"] == hashlib.sha256(original).hexdigest()
        assert doc["state"] == "completed"
        assert doc["parser"] == "utf8-native-v1"
        assert [s["text"] for s in doc["spans"]] == ["Python", "No sponsorship", "Kafka optional", "Café 🚀"]
        assert all(doc["normalized_text"][s["start"]:s["end"]] == s["text"] for s in doc["spans"])
        assert all(s["page"] is None for s in doc["spans"])
        result = client.post("/v1/workspaces/ws-a/research-qa", headers=headers(k, "retrieve"), json={"question": "Kafka optional"})
        assert result.status_code == 200
        assert result.json()["passages"][0]["text"] == "Kafka optional"
        assert result.json()["passages"][0]["employer_approval"] == "NOT_OBTAINED"


def test_two_distinct_pdfs_and_page_two_offsets(kernel):
    from reportlab.pdfgen import canvas
    k = kernel
    def pdf(name):
        stream = io.BytesIO()
        c = canvas.Canvas(stream)
        c.drawString(40, 750, name + " frontend experience")
        c.showPage()
        c.drawString(40, 750, name + " owns database migrations")
        c.save()
        return stream.getvalue()
    with TestClient(create_app(k)) as client:
        a = put(client, k, pdf("Alice"), "alice.pdf", "alice").json()
        b = put(client, k, pdf("Bob"), "bob.pdf", "bob").json()
        drain(k)
        da, db = [k.inspect(k.test_claims, x["source_id"]) for x in (a, b)]
        assert da["original_sha256"] != db["original_sha256"]
        assert da["normalized_text"] != db["normalized_text"]
        assert "Sarah" not in da["normalized_text"] + db["normalized_text"]
        assert da["pages_total"] == da["pages_with_text"] == 2
        span = next(s for s in da["spans"] if "migrations" in s["text"])
        assert span["page"] == 2
        assert da["normalized_text"][span["start"]:span["end"]] == span["text"]


def test_replay_and_two_version_history(kernel):
    k = kernel
    with TestClient(create_app(k)) as client:
        a = put(client, k, b"Office San Francisco\nFive networks").json()
        drain(k)
        moment = time.time()
        replay = put(client, k, b"Office San Francisco\nFive networks").json()
        assert replay["version_id"] == a["version_id"] and replay["replayed"]
        b = put(client, k, b"Office Sunnyvale").json()
        assert b["version"] == 2
        assert k.inspect(k.test_claims, a["source_id"])["state"] == "pending"
        drain(k)
        current = k.inspect(k.test_claims, a["source_id"])
        previous = k.inspect(k.test_claims, a["source_id"], moment)
        assert "Sunnyvale" in current["normalized_text"] and "Five networks" not in current["normalized_text"]
        assert "Five networks" in previous["normalized_text"]


@pytest.mark.parametrize("field", ["actor", "org", "run", "workspace", "role", "operation", "jti", "exp", "iat"])
def test_missing_required_claim_rejected(kernel, field):
    c = claims(kernel)
    del c[field]
    with pytest.raises(Fault):
        decode_token(sign(c, kernel.secret), kernel.secret)


@pytest.mark.parametrize("change", [{"exp": 1}, {"iat": int(time.time()) + 1000}, {"aud": "foreign"}, {"iss": "foreign"}, {"jti": "not-uuid"}])
def test_invalid_claim_rejected(kernel, change):
    with pytest.raises(Fault):
        decode_token(sign(claims(kernel, **change), kernel.secret), kernel.secret)


def test_replay_persists_across_service_instances(kernel, tmp_path):
    k = kernel
    c = claims(k)
    token = sign(c, k.secret)
    k.authorize(token, "ws-a", "read")
    other = Kernel(str(k.engine.url), tmp_path / "other", k.secret, allow_sqlite=True)
    # SQLAlchemy hides passwords when stringifying URLs; explicit URL needed for PG.
    if k.engine.dialect.name == "postgresql":
        other.engine.dispose()
        other = Kernel(k.engine.url.render_as_string(hide_password=False), tmp_path / "other", k.secret)
    with pytest.raises(Fault, match="TOKEN_REPLAY"):
        other.authorize(token, "ws-a", "read")
    other.engine.dispose()


@pytest.mark.parametrize("change", [{"org": "foreign"}, {"role": "foreign"}, {"run": "foreign"}, {"actor": "foreign"}])
def test_wrong_scope_denied(kernel, change):
    k = kernel
    with TestClient(create_app(k)) as client:
        response = client.get("/v1/workspaces/ws-a/sources/anything", headers=headers(k, **change))
        assert response.status_code == 403


def test_revoked_membership_immediate(kernel):
    k = kernel
    token = headers(k)
    k.revoke(k.binding_id)
    with TestClient(create_app(k)) as client:
        assert client.get("/v1/workspaces/ws-a/sources/x", headers=token).status_code == 403


def test_failure_before_commit_is_atomic_and_retryable(kernel):
    k = kernel
    with TestClient(create_app(k)) as client:
        obj = put(client, k).json()
        first = k.claim()
        assert not k.process(first, fail_before_commit=True)["ok"]
        with k.session() as db:
            assert db.get(Artifact, obj["version_id"]) is None
            assert db.scalar(select(func.count()).select_from(Span).where(Span.version == obj["version_id"])) == 0
        assert k.process(k.claim())["ok"]
        assert k.inspect(k.test_claims, obj["source_id"])["state"] == "completed"
        assert k.claim() is None


def test_expired_lease_reclaimed_and_old_worker_fenced(kernel):
    k = kernel
    with TestClient(create_app(k)) as client:
        put(client, k)
        first = k.claim()
        with k.session.begin() as db:
            db.execute(update(Job).where(Job.id == first[0]).values(lease_until=0))
        second = k.claim()
        assert second[0] == first[0] and second[1] != first[1]
        assert not k.process(first)["ok"]
        assert k.process(second)["ok"]


def test_original_tampering_fails_closed(kernel):
    k = kernel
    with TestClient(create_app(k)) as client:
        obj = put(client, k).json()
        with k.session() as db:
            from pathlib import Path
            Path(db.get(Version, obj["version_id"]).path).write_bytes(b"tampered")
        result = k.process(k.claim())
        assert result == {"ok": False, "code": "ORIGINAL_HASH_MISMATCH"}
        assert k.inspect(k.test_claims, obj["source_id"])["state"] == "failed"


def test_empty_and_unsupported_uploads(kernel):
    with TestClient(create_app(kernel)) as client:
        assert put(client, kernel, b"").status_code == 422
        assert put(client, kernel, b"binary", "malware.exe").status_code == 415


def test_fake_pdf_is_not_completed(kernel):
    k = kernel
    with TestClient(create_app(k)) as client:
        obj = put(client, k, b"not a pdf", "fake.pdf").json()
        assert obj["state"] == "pending"
        assert k.process(k.claim())["code"] == "PDF_SIGNATURE_MISMATCH"
        doc = k.inspect(k.test_claims, obj["source_id"])
        assert doc["state"] == "failed" and not doc["spans"]


def test_blank_pdf_explicit_ocr_exception():
    from pypdf import PdfWriter
    writer, stream = PdfWriter(), io.BytesIO()
    writer.add_blank_page(500, 700)
    writer.write(stream)
    parsed = parse_original(stream.getvalue(), "scan.pdf")
    assert parsed["pages_total"] == 1 and parsed["pages_with_text"] == 0
    assert "PAGE_1_NO_TEXT_OCR_REQUIRED" in parsed["exceptions"]


@pytest.mark.parametrize("value", ["5junk", "5", 1.9, True, 0, 21])
def test_strict_retrieval_limit(kernel, value):
    with TestClient(create_app(kernel)) as client:
        assert client.post("/v1/workspaces/ws-a/research-qa", headers=headers(kernel, "retrieve"), json={"question": "database", "limit": value}).status_code == 422


def test_generation_is_explicitly_unimplemented(kernel):
    with TestClient(create_app(kernel)) as client:
        r = client.post("/v1/workspaces/ws-a/research-qa", headers=headers(kernel, "retrieve"), json={"question": "database", "mode": "retrieval_augmented"})
        assert r.status_code == 503 and r.json()["error"] == "GENERATION_NOT_IMPLEMENTED"


def test_revocation_excludes_current_and_historical_retrieval(kernel):
    k = kernel
    with TestClient(create_app(k)) as client:
        obj = put(client, k).json()
        drain(k)
        response = client.delete(f"/v1/workspaces/ws-a/sources/{obj['source_id']}", headers=headers(k, "delete"))
        assert response.json()["hard_erasure"] == "not_implemented"
        assert not k.retrieve(k.test_claims, "Python")["passages"]
        assert not k.retrieve(k.test_claims, "Python", as_of=time.time())["passages"]
        assert client.get(f"/v1/workspaces/ws-a/sources/{obj['source_id']}", headers=headers(k)).status_code == 404


def test_postgres_concurrent_first_ingest_and_replay(kernel):
    k = kernel
    if k.engine.dialect.name != "postgresql":
        pytest.skip("Requires real disposable PostgreSQL")
    def ingest(n):
        return k.ingest(k.test_claims, "concurrent", "input.txt", b"Same real source", allow_key_match=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(ingest, range(8)))
    assert len({r["version_id"] for r in results}) == 1
    def revised(n):
        return k.ingest(k.test_claims, "concurrent", "input.txt", f"Revision number {n}".encode(), allow_key_match=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(revised, range(6)))
    assert sorted(r["version"] for r in results) == list(range(2, 8))
