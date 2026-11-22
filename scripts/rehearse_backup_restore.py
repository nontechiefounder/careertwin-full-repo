#!/usr/bin/env python3
"""Genuine multi-source, multi-revision PostgreSQL + private storage backup & restore
rehearsal on verified disposable databases with writer quiescing, access-control checks,
hybrid vector provenance verification, idempotency replay, and pending-job recovery.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
import zipfile
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from service.core import Binding, Fault, Kernel, sign
from service.hybrid import HybridRetriever
from service.provider_factory import LocalBGEEmbedder


def make_valid_pdf(text_str: str) -> bytes:
    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject, ArrayObject

    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    font_dict = DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"),
    })
    font_ref = writer._add_object(font_dict)
    page[NameObject("/Resources")] = DictionaryObject({
        NameObject("/Font"): DictionaryObject({NameObject("/F1"): font_ref})
    })
    safe_txt = text_str.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    content_stream = DecodedStreamObject()
    content_stream.set_data(f"BT /F1 12 Tf 72 720 Td ({safe_txt}) Tj ET".encode("latin-1"))
    stream_ref = writer._add_object(content_stream)
    page[NameObject("/Contents")] = ArrayObject([stream_ref])
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def make_valid_docx(paragraphs: list[str]) -> bytes:
    buf = io.BytesIO()
    body_xml = "".join(
        f"<w:p><w:r><w:t>{p}</w:t></w:r></w:p>" for p in paragraphs
    )
    doc_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body_xml}</w:body></w:document>"
    )
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("word/document.xml", doc_xml.encode("utf-8"))
    return buf.getvalue()


def make_token(claims: dict, operation: str, secret: str) -> str:
    now = int(time.time())
    payload = {
        "iss": "workbyline-v2-web",
        "aud": "workbyline-context-evidence",
        "actor": claims["actor"],
        "org": claims["org"],
        "run": claims["run"],
        "workspace": claims["workspace"],
        "role": claims["role"],
        "operation": operation,
        "iat": now,
        "exp": now + 120,
        "jti": str(uuid.uuid4()),
    }
    return sign(payload, secret)


def run_rehearsal() -> dict:
    guard = ROOT / "infra" / "deployment" / "db_target_guard.sh"
    src_db_name = "disposable_v3_backup_src_db"
    dst_db_name = "disposable_v3_restore_target_db"
    src_db_url = f"postgresql://postgres:postgres@127.0.0.1:54399/{src_db_name}"
    dst_db_url = f"postgresql://postgres:postgres@127.0.0.1:54399/{dst_db_name}"
    src_sqla_url = f"postgresql+psycopg://postgres:postgres@127.0.0.1:54399/{src_db_name}"
    dst_sqla_url = f"postgresql+psycopg://postgres:postgres@127.0.0.1:54399/{dst_db_name}"
    secret = "backup_restore_rehearsal_secret_32_chars_min"
    weights_dir = os.environ.get("WORKBYLINE_EMBEDDING_WEIGHTS", "/tmp/workbyline_bge_small_en_v1_5")
    os.environ["WORKBYLINE_EMBEDDING_WEIGHTS"] = weights_dir

    log_lines: list[str] = []

    def log(msg: str) -> None:
        print(msg, flush=True)
        log_lines.append(msg)

    log("=== WorkByLine V3: Multi-Source Quiesced Backup & Fresh-Target Restore Rehearsal ===")

    # 1. Verify both source and destination targets are disposable via db_target_guard.sh
    for url in (src_db_url, dst_db_url):
        subprocess.run(
            ["bash", "-c", f'source "{guard}" && assert_disposable_db_target "{url}"'],
            check=True,
        )
    log("[PASS] Verified source and restore target databases via db_target_guard.sh")

    # 2. Create fresh disposable source and destination databases on port 54399
    with psycopg.connect("postgresql://postgres:postgres@127.0.0.1:54399/postgres", autocommit=True) as admin_conn:
        with admin_conn.cursor() as cur:
            for dbn in (src_db_name, dst_db_name):
                cur.execute(f"DROP DATABASE IF EXISTS {dbn} WITH (FORCE)")
                cur.execute(f"CREATE DATABASE {dbn} OWNER postgres")

    for url in (src_db_url, dst_db_url):
        with psycopg.connect(url, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("ALTER SCHEMA public OWNER TO postgres; GRANT ALL ON SCHEMA public TO postgres;")
                cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    # 3. Apply forward migrations 000 -> 008 to source database
    mig_res = subprocess.run(
        [
            str(ROOT / ".venv" / "bin" / "python"),
            str(ROOT / "scripts" / "run_forward_migrations.py"),
            "--db-url",
            src_db_url,
            "--migrations-dir",
            str(ROOT / "migrations"),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    log(mig_res.stdout.strip())

    tmp_root = Path(tempfile.mkdtemp(prefix="wbctx_backup_rehearsal_"))
    src_storage_dir = tmp_root / "src_storage"
    dst_storage_dir = tmp_root / "dst_storage"
    backup_sql = tmp_root / "backup_source_db.sql"
    backup_tar = tmp_root / "backup_storage.tar.gz"
    src_storage_dir.mkdir(parents=True, exist_ok=True)
    dst_storage_dir.mkdir(parents=True, exist_ok=True)

    try:
        embedder = LocalBGEEmbedder(weights_dir)
        src_kernel = Kernel(src_sqla_url, str(src_storage_dir), secret)
        src_hybrid = HybridRetriever(src_kernel, embedder.model_id, embedder)

        claims_alpha = {
            "actor": "actor_alpha_recruiter",
            "org": "org_alpha",
            "run": "run_alpha_1",
            "workspace": "ws_alpha",
            "role": "recruiter",
        }
        claims_auditor = {
            "actor": "actor_alpha_auditor",
            "org": "org_alpha",
            "run": "run_alpha_1",
            "workspace": "ws_alpha",
            "role": "auditor",
        }
        claims_beta = {
            "actor": "actor_beta_recruiter",
            "org": "org_beta",
            "run": "run_beta_1",
            "workspace": "ws_beta",
            "role": "recruiter",
        }

        with src_kernel.session.begin() as db:
            db.add(Binding(**claims_alpha, active=True, can_write=True))
            db.add(Binding(**claims_auditor, active=True, can_write=False))
            db.add(Binding(**claims_beta, active=True, can_write=True))

        # Source A: TXT with v1 and v2
        txt_v1_bytes = b"Candidate Jane Roe v1: Built early monolithic billing service in Python."
        ing_a_v1 = src_kernel.ingest(
            claims_alpha,
            "Jane_Roe_Architecture.txt",
            "Jane_Roe_Architecture.txt",
            txt_v1_bytes,
            idempotency_key="idem-backup-txt-v1",
        )
        c1 = src_kernel.claim()
        assert c1 and src_kernel.process(c1)["ok"]
        src_hybrid.index_version(ing_a_v1["version_id"])
        v1_observed_at = src_kernel.inspect(claims_alpha, ing_a_v1["source_id"])["observed_at"]
        time.sleep(0.05)

        txt_v2_bytes = b"Candidate Jane Roe v2: Architected multi-region Raft consensus replication and pgvector hybrid search."
        ing_a_v2 = src_kernel.ingest(
            claims_alpha,
            "Jane_Roe_Architecture.txt",
            "Jane_Roe_Architecture.txt",
            txt_v2_bytes,
            target_source_id=ing_a_v1["source_id"],
            idempotency_key="idem-backup-txt-v2",
        )
        c2 = src_kernel.claim()
        assert c2 and src_kernel.process(c2)["ok"]
        src_hybrid.index_version(ing_a_v2["version_id"])

        # Source B: Native PDF
        pdf_bytes = make_valid_pdf("PDF Portfolio: Led Kubernetes zero-downtime cluster upgrades and Envoy mTLS mesh.")
        ing_b_pdf = src_kernel.ingest(
            claims_alpha,
            "Kubernetes_Portfolio.pdf",
            "Kubernetes_Portfolio.pdf",
            pdf_bytes,
            idempotency_key="idem-backup-pdf",
        )
        c3 = src_kernel.claim()
        assert c3 and src_kernel.process(c3)["ok"]
        src_hybrid.index_version(ing_b_pdf["version_id"])

        # Source C: DOCX
        docx_bytes = make_valid_docx([
            "DOCX Evaluation Notes: Demonstrated deep expertise in Temporal workflow determinism and lease fencing.",
            "Verified clean failover recovery across worker process crashes.",
        ])
        ing_c_docx = src_kernel.ingest(
            claims_alpha,
            "Temporal_Design_Review.docx",
            "Temporal_Design_Review.docx",
            docx_bytes,
            idempotency_key="idem-backup-docx",
        )
        c4 = src_kernel.claim()
        assert c4 and src_kernel.process(c4)["ok"]
        src_hybrid.index_version(ing_c_docx["version_id"])

        # Source D: In-flight / Pending job at the moment of backup
        pending_bytes = b"Pending Document at Backup Time: High-throughput Kafka consumer backpressure and dead-letter queue recovery."
        ing_d_pending = src_kernel.ingest(
            claims_alpha,
            "Pending_Backpressure_Spec.txt",
            "Pending_Backpressure_Spec.txt",
            pending_bytes,
            idempotency_key="idem-backup-pending",
        )
        assert ing_d_pending["state"] == "pending"

        log("[PASS] Seeded 4 sources (5 versions: TXT v1+v2, PDF, DOCX, and 1 pending job) + embeddings + bindings + idempotency keys")

        # 4. Quiesce writers on source DB before coordinated snapshot
        src_kernel.engine.dispose()
        with psycopg.connect(src_db_url, autocommit=True) as qconn:
            with qconn.cursor() as cur:
                cur.execute(f"ALTER DATABASE {src_db_name} SET default_transaction_read_only = on;")
                cur.execute(
                    "SELECT count(*) FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid() AND state = 'active'",
                    (src_db_name,),
                )
                active_writers = cur.fetchone()[0]
                assert active_writers == 0, f"Expected 0 active writers after quiesce, got {active_writers}"
        log("[PASS] Quiesced writers (default_transaction_read_only=on, active_writers=0)")

        # 5. Coordinated Backup (pg_dump + tar of private storage)
        dump_cmd = [
            "docker",
            "exec",
            "workbyline_v3_disposable_db",
            "pg_dump",
            "-U",
            "postgres",
            "-d",
            src_db_name,
            "--no-owner",
            "--no-privileges",
        ]
        with open(backup_sql, "wb") as f:
            subprocess.run(dump_cmd, stdout=f, check=True)
        subprocess.run(["tar", "-czf", str(backup_tar), "-C", str(src_storage_dir), "."], check=True)
        log(f"[PASS] Captured coordinated SQL dump ({backup_sql.stat().st_size} bytes) and storage archive ({backup_tar.stat().st_size} bytes)")

        # 6. Restore into FRESH disposable target database (dst_db_name) and fresh dst_storage_dir
        with open(backup_sql, "rb") as f:
            subprocess.run(
                [
                    "docker",
                    "exec",
                    "-i",
                    "workbyline_v3_disposable_db",
                    "psql",
                    "-v",
                    "ON_ERROR_STOP=1",
                    "-U",
                    "postgres",
                    "-d",
                    dst_db_name,
                ],
                stdin=f,
                check=True,
                stdout=subprocess.DEVNULL,
            )
        subprocess.run(["tar", "-xzf", str(backup_tar), "-C", str(dst_storage_dir)], check=True)

        # Relocate stored paths from src_storage_dir to dst_storage_dir on the restored DB
        with psycopg.connect(dst_db_url, autocommit=True) as rconn:
            with rconn.cursor() as cur:
                cur.execute(f"ALTER DATABASE {dst_db_name} SET default_transaction_read_only = off;")
                cur.execute(
                    "UPDATE wbctx_versions SET path = replace(path, %s, %s)",
                    (str(src_storage_dir.resolve()), str(dst_storage_dir.resolve())),
                )
        log(f"[PASS] Restored SQL dump and storage archive into fresh target {dst_db_name}")

        # 7. Verify Restored Target Integrity, Access Controls, Provenance, Retrieval & Pending Job Recovery
        dst_kernel = Kernel(dst_sqla_url, str(dst_storage_dir), secret)
        dst_hybrid = HybridRetriever(dst_kernel, embedder.model_id, embedder)

        # 7a. Storage reconciliation & SHA-256 verification across all 5 version files
        recon = dst_kernel.reconcile_storage(dry_run=True)
        assert recon["scanned_disk_files"] == 5, f"Expected 5 disk files, got {recon['scanned_disk_files']}"
        assert recon["db_tracked_versions"] == 5, f"Expected 5 DB versions, got {recon['db_tracked_versions']}"
        assert recon["orphaned_files"] == []
        assert recon["missing_files"] == []
        assert recon["hash_mismatches"] == []
        log("[PASS] Storage reconciliation verified: 5/5 version files intact, 0 orphans, 0 missing, 0 hash mismatches")

        # 7b. Access control verification via signed delegation JWTs
        tok_alpha_read = make_token(claims_alpha, "read", secret)
        auth_alpha = dst_kernel.authorize(tok_alpha_read, "ws_alpha", "read")
        assert auth_alpha["org"] == "org_alpha"

        tok_auditor_read = make_token(claims_auditor, "read", secret)
        dst_kernel.authorize(tok_auditor_read, "ws_alpha", "read")

        tok_auditor_upload = make_token(claims_auditor, "upload", secret)
        try:
            dst_kernel.authorize(tok_auditor_upload, "ws_alpha", "upload")
            raise AssertionError("Expected auditor upload to be denied")
        except Fault as exc:
            assert exc.status == 403 and exc.code == "ACCESS_DENIED"

        try:
            dst_kernel.inspect(claims_beta, ing_a_v1["source_id"])
            raise AssertionError("Expected Tenant B inspect of Tenant A source to fail")
        except Fault as exc:
            assert exc.status == 404 and exc.code == "SOURCE_NOT_FOUND"
        log("[PASS] Restored authorization bindings verified (Recruiter R/W, Auditor Read-Only 403 on write, Tenant B isolated)")

        # 7c. Inspect current (v2) and historical (v1) revisions on restored target
        doc_a_v2 = dst_kernel.inspect(claims_alpha, ing_a_v1["source_id"])
        assert doc_a_v2["version"] == 2
        assert doc_a_v2["indexing_state"] == "indexed"
        assert doc_a_v2["inference_backend"] == embedder.inference_backend
        assert "multi-region Raft consensus" in doc_a_v2["normalized_text"]

        doc_a_v1 = dst_kernel.inspect(claims_alpha, ing_a_v1["source_id"], version=1)
        assert doc_a_v1["version"] == 1
        assert "monolithic billing service" in doc_a_v1["normalized_text"]

        doc_a_as_of = dst_kernel.inspect(claims_alpha, ing_a_v1["source_id"], as_of=v1_observed_at + 0.001)
        assert doc_a_as_of["version"] == 1
        log("[PASS] Current (v2) and historical (v1 by version and as_of) inspection verified on restored target")

        # 7d. Verify PDF and DOCX sources on restored target
        doc_b_pdf = dst_kernel.inspect(claims_alpha, ing_b_pdf["source_id"])
        assert doc_b_pdf["parsing_state"] == "completed" and doc_b_pdf["indexing_state"] == "indexed"
        assert "Kubernetes zero-downtime" in doc_b_pdf["normalized_text"]

        doc_c_docx = dst_kernel.inspect(claims_alpha, ing_c_docx["source_id"])
        assert doc_c_docx["parsing_state"] == "partial" and doc_c_docx["indexing_state"] == "indexed"
        assert "Temporal workflow determinism" in doc_c_docx["normalized_text"]
        log("[PASS] Restored PDF and DOCX artifacts, spans, and indexing provenance verified")

        # 7e. Verify Idempotency Key Replay on restored target
        replay_v2 = dst_kernel.ingest(
            claims_alpha,
            "Jane_Roe_Architecture.txt",
            "Jane_Roe_Architecture.txt",
            txt_v2_bytes,
            target_source_id=ing_a_v1["source_id"],
            idempotency_key="idem-backup-txt-v2",
        )
        assert replay_v2["replayed"] is True and replay_v2["version_id"] == ing_a_v2["version_id"]
        log("[PASS] Restored idempotency key replay verified without duplicate version creation")

        # 7f. Verify Hybrid Retrieval across restored embeddings (v2 current vs v1 historical as_of)
        ret_current = dst_hybrid.retrieve(claims_alpha, "Raft consensus state replication", limit=5)
        assert any(p["version_id"] == ing_a_v2["version_id"] for p in ret_current["passages"])
        assert all(p["version_id"] != ing_a_v1["version_id"] for p in ret_current["passages"])

        ret_hist = dst_hybrid.retrieve(claims_alpha, "monolithic billing service", limit=5, as_of=v1_observed_at + 0.001)
        assert any(p["version_id"] == ing_a_v1["version_id"] for p in ret_hist["passages"])
        log("[PASS] Restored hybrid dense+lexical retrieval verified for current and historical as_of queries")

        # 7g. Recover & complete the in-flight/pending job (source_d_pending) on the restored target
        doc_d_before = dst_kernel.inspect(claims_alpha, ing_d_pending["source_id"])
        assert doc_d_before["state"] == "pending"
        claim_d = dst_kernel.claim()
        assert claim_d is not None, "Expected pending job to be claimable on restored target"
        proc_d = dst_kernel.process(claim_d)
        assert proc_d["ok"] is True and proc_d["state"] == "completed"
        idx_d = dst_hybrid.index_version(ing_d_pending["version_id"])
        assert idx_d["indexed_spans"] >= 1

        ret_d = dst_hybrid.retrieve(claims_alpha, "Kafka consumer backpressure dead-letter queue", limit=5)
        assert any(p["version_id"] == ing_d_pending["version_id"] for p in ret_d["passages"])
        log("[PASS] In-flight/pending job recovered, parsed, indexed, and retrieved on restored target")

        summary = {
            "status": "PASS",
            "source_disposable_db": f"127.0.0.1:54399/{src_db_name}",
            "restored_disposable_db": f"127.0.0.1:54399/{dst_db_name}",
            "writers_quiesced": True,
            "sources_backed_up": 4,
            "versions_backed_up": 5,
            "formats_covered": ["txt_v1_v2", "pdf", "docx", "pending_txt_job"],
            "reconcile_storage": recon,
            "inference_backend": embedder.inference_backend,
            "access_controls_verified": True,
            "idempotency_replay_verified": True,
            "historical_and_current_retrieval_verified": True,
            "pending_job_recovered_and_indexed": True,
        }
        log(json.dumps(summary, indent=2))
        (ROOT / "logs" / "verification" / "backup_restore_rehearsal.log").write_text(
            "\n".join(log_lines) + "\n", encoding="utf-8"
        )
        (ROOT / "evidence" / "backup_restore_rehearsal.json").write_text(
            json.dumps(summary, indent=2) + "\n", encoding="utf-8"
        )
        return summary
    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)
        with psycopg.connect("postgresql://postgres:postgres@127.0.0.1:54399/postgres", autocommit=True) as admin_conn:
            with admin_conn.cursor() as cur:
                for dbn in (src_db_name, dst_db_name):
                    cur.execute(f"DROP DATABASE IF EXISTS {dbn} WITH (FORCE)")


if __name__ == "__main__":
    run_rehearsal()
