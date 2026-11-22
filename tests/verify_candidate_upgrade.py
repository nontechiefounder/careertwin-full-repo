#!/usr/bin/env python3
"""Verify forward schema & data upgrade compatibility from previous candidates:
  1. f41e503 (untracked 000-006 schema without schema_migrations + existing records)
  2. 1f40f9f (tracked schema_migrations with 1f40f9f historical checksums + existing records)
  3. Fail-closed rejection when 1f40f9f 004 fell back to 'embedding text' or when an unknown checksum is present
  4. 870e3d2 (tracked 000-007 schema with unvalidated _SafetensorsBertModel vectors quarantined to reindex_required)
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
import psycopg

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from service.core import Binding, Kernel, IndexingStage
from service.hybrid import HybridRetriever, vector_literal
from service.provider_factory import LocalBGEEmbedder

ADMIN_DB_URL = os.environ.get(
    "WORKBYLINE_ADMIN_DISPOSABLE_DB_URL",
    "postgresql://postgres:postgres@127.0.0.1:54399/postgres",
)
BASE_HOST_URL = "postgresql://postgres:postgres@127.0.0.1:54399"
SECRET = "disposable_upgrade_test_secret_32_bytes_minimum_length"
WEIGHTS_DIR = os.environ.get("WORKBYLINE_EMBEDDING_WEIGHTS", "/tmp/workbyline_bge_small_en_v1_5")
LOG_PATH = ROOT / "logs" / "verification" / "upgrade_reconciliation.log"


def recreate_disposable_db(db_name: str) -> str:
    assert "disposable" in db_name, "Refusing non-disposable DB name"
    conn = psycopg.connect(ADMIN_DB_URL, autocommit=True)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid()",
            (db_name,),
        )
        cur.execute(f'DROP DATABASE IF EXISTS "{db_name}"')
        cur.execute(f'CREATE DATABASE "{db_name}"')
    conn.close()
    return f"{BASE_HOST_URL}/{db_name}"


def drop_disposable_db(db_name: str) -> None:
    assert "disposable" in db_name
    conn = psycopg.connect(ADMIN_DB_URL, autocommit=True)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid()",
            (db_name,),
        )
        cur.execute(f'DROP DATABASE IF EXISTS "{db_name}"')
    conn.close()


def git_show_file(commit: str, rel_path: str) -> str:
    res = subprocess.run(
        ["git", "show", f"{commit}:{rel_path}"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=True,
    )
    return res.stdout


def seed_pre_upgrade_records(db_url: str, storage_dir: Path, *, include_007_cols: bool = False) -> dict:
    import time
    import uuid
    claims_alpha = {
        "actor": "user-alpha",
        "org": "org-alpha",
        "run": "run-1",
        "workspace": "ws-alpha",
        "role": "recruiter",
    }
    claims_beta = {
        "actor": "user-beta",
        "org": "org-beta",
        "run": "run-2",
        "workspace": "ws-beta",
        "role": "recruiter",
    }

    source_id = str(uuid.uuid4())
    v1_id = str(uuid.uuid4())
    v2_id = str(uuid.uuid4())
    span1_id = str(uuid.uuid4())
    span2_id = str(uuid.uuid4())
    now = time.time()

    v1_bytes = b"Version 1: Legacy monolith migration and PostgreSQL partitioning."
    v1_text = v1_bytes.decode("utf-8")
    v1_sha = hashlib.sha256(v1_bytes).hexdigest()
    v1_fp = hashlib.sha256(f"{v1_sha}:candidate_arch.txt:".encode()).hexdigest()
    v1_path = storage_dir / source_id / v1_id
    v1_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    v1_path.write_bytes(v1_bytes)

    v2_bytes = b"Version 2: Raft consensus state machine replication and multi-region failover."
    v2_text = v2_bytes.decode("utf-8")
    v2_sha = hashlib.sha256(v2_bytes).hexdigest()
    v2_fp = hashlib.sha256(f"{v2_sha}:candidate_arch.txt:{source_id}".encode()).hexdigest()
    v2_path = storage_dir / source_id / v2_id
    v2_path.write_bytes(v2_bytes)

    dummy_vec = vector_literal([0.05] * 384)
    conn = psycopg.connect(db_url, autocommit=True)
    with conn.cursor() as cur:
        for c in (claims_alpha, claims_beta):
            cur.execute(
                """
                INSERT INTO wbctx_bindings(id, actor, org, run, workspace, role, active, can_write)
                VALUES (%s, %s, %s, %s, %s, %s, true, true)
                """,
                (str(uuid.uuid4()), c["actor"], c["org"], c["run"], c["workspace"], c["role"]),
            )

        cur.execute(
            """
            INSERT INTO wbctx_sources(id, org, workspace, role, run, source_key, deleted)
            VALUES (%s, %s, %s, %s, %s, 'candidate_arch.txt', false)
            """,
            (source_id, claims_alpha["org"], claims_alpha["workspace"], claims_alpha["role"], claims_alpha["run"]),
        )

        for num, vid, sha, bdata, txt, path_obj, sid, idem_key, fp, ts in [
            (1, v1_id, v1_sha, v1_bytes, v1_text, v1_path, span1_id, "idem-upgrade-v1", v1_fp, now - 60),
            (2, v2_id, v2_sha, v2_bytes, v2_text, v2_path, span2_id, "idem-upgrade-v2", v2_fp, now - 10),
        ]:
            cur.execute(
                """
                INSERT INTO wbctx_versions(id, source, number, sha256, bytes, filename, path, observed_at, state)
                VALUES (%s, %s, %s, %s, %s, 'candidate_arch.txt', %s, %s, 'completed')
                """,
                (vid, source_id, num, sha, len(bdata), str(path_obj), ts),
            )
            cur.execute(
                """
                INSERT INTO wbctx_jobs(id, version, state, attempts, lease_until, fence, error)
                VALUES (%s, %s, 'completed', 1, 0, NULL, NULL)
                """,
                (str(uuid.uuid4()), vid),
            )
            cur.execute(
                """
                INSERT INTO wbctx_artifacts(version, spec, parser, text, sha256, exceptions, pages_total, pages_with_text)
                VALUES (%s, 'faithful-lines-v1', 'utf8-native-v1', %s, %s, '[]', NULL, NULL)
                """,
                (vid, txt, hashlib.sha256(txt.encode()).hexdigest()),
            )
            cur.execute(
                """
                INSERT INTO wbctx_spans(id, version, start, "end", page, text)
                VALUES (%s, %s, 0, %s, NULL, %s)
                """,
                (sid, vid, len(txt), txt),
            )
            cur.execute(
                """
                INSERT INTO wbctx_idempotency_keys(id, org, workspace, run, idempotency_key, fingerprint, source_id, version_id, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    str(uuid.uuid4()),
                    claims_alpha["org"],
                    claims_alpha["workspace"],
                    claims_alpha["run"],
                    idem_key,
                    fp,
                    source_id,
                    vid,
                    ts,
                ),
            )
            if include_007_cols:
                cur.execute(
                    """
                    INSERT INTO wbctx_span_embeddings(span_id, model_id, model_revision, artifact_sha256, embedding)
                    VALUES (%s, 'bge-small-en-v1.5', '5c38ec7c405ec4b44b94cc5a9bb96e735b38267a',
                            '5650b43c69a52dc94d243256be3a974a8836090b043531cec56ae64ac2fc3d0a', %s::vector)
                    """,
                    (sid, dummy_vec),
                )
                cur.execute(
                    """
                    INSERT INTO wbctx_indexings(version, status, model_id, model_revision, artifact_sha256, indexed_spans, updated_at)
                    VALUES (%s, 'completed', 'bge-small-en-v1.5', '5c38ec7c405ec4b44b94cc5a9bb96e735b38267a',
                            '5650b43c69a52dc94d243256be3a974a8836090b043531cec56ae64ac2fc3d0a', 1, %s)
                    """,
                    (vid, ts),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO wbctx_span_embeddings(span_id, model_id, embedding)
                    VALUES (%s, 'bge-small-en-v1.5', %s::vector)
                    """,
                    (sid, dummy_vec),
                )
                cur.execute(
                    """
                    INSERT INTO wbctx_indexings(version, status, model_id, indexed_spans, updated_at)
                    VALUES (%s, 'completed', 'bge-small-en-v1.5', 1, %s)
                    """,
                    (vid, ts),
                )
    conn.close()
    return {
        "claims_alpha": claims_alpha,
        "claims_beta": claims_beta,
        "source_id": source_id,
        "v1_id": v1_id,
        "v2_id": v2_id,
    }


def verify_post_upgrade_behavior(db_url: str, storage_dir: Path, seeded: dict, embedder: LocalBGEEmbedder, log) -> None:
    os.environ["WORKBYLINE_EMBEDDING_WEIGHTS"] = WEIGHTS_DIR
    kernel = Kernel(db_url, str(storage_dir), SECRET)
    hybrid = HybridRetriever(kernel, embedder.model_id, embedder)
    claims_alpha = seeded["claims_alpha"]
    claims_beta = seeded["claims_beta"]
    source_id = seeded["source_id"]

    # 1. Verify pre-existing unvalidated vectors are quarantined to reindex_required
    doc_before = kernel.inspect(claims_alpha, source_id)
    assert doc_before["version"] == 2
    assert doc_before["indexing_state"] == "reindex_required", f"Expected reindex_required, got {doc_before['indexing_state']}"
    log(f"  [PASS] Pre-upgrade unvalidated vectors quarantined: indexing_state={doc_before['indexing_state']}")

    # 2. Verify idempotency replay of pre-upgrade key still returns existing source/version without duplicate
    replay = kernel.ingest(
        claims_alpha,
        "candidate_arch.txt",
        "candidate_arch.txt",
        b"Version 2: Raft consensus state machine replication and multi-region failover.",
        target_source_id=source_id,
        idempotency_key="idem-upgrade-v2",
    )
    assert replay["replayed"] is True and replay["version_id"] == seeded["v2_id"]
    log("  [PASS] Pre-upgrade idempotency record preserved across upgrade")

    # 3. Verify historical v1 inspection works
    doc_v1 = kernel.inspect(claims_alpha, source_id, version=1)
    assert doc_v1["version"] == 1 and "Legacy monolith" in doc_v1["normalized_text"]
    log("  [PASS] Historical v1 and current v2 inspection preserved across upgrade")

    # 4. Verify Tenant B isolation
    try:
        kernel.inspect(claims_beta, source_id)
        raise AssertionError("Expected 404 for cross-tenant inspect")
    except Exception as exc:
        assert getattr(exc, "status", None) == 404
    log("  [PASS] Cross-tenant isolation preserved across upgrade")

    # 5. Reindex v1 and v2 with validated SentenceTransformers backend
    res_v1 = hybrid.index_version(seeded["v1_id"])
    res_v2 = hybrid.index_version(seeded["v2_id"])
    assert res_v1["inference_backend"].startswith("sentence_transformers:")
    assert res_v2["inference_backend"].startswith("sentence_transformers:")

    doc_after = kernel.inspect(claims_alpha, source_id)
    assert doc_after["indexing_state"] == "indexed"
    assert doc_after["inference_backend"] == embedder.inference_backend
    log(f"  [PASS] Reindexed upgraded versions with {doc_after['inference_backend']}; indexing_state=indexed")

    # 6. Verify hybrid semantic retrieval finds v2 on semantic query
    hits = hybrid.retrieve(claims_alpha, "leader election state machine replication", limit=5)
    assert len(hits["passages"]) >= 1
    assert hits["passages"][0]["version_id"] == seeded["v2_id"]
    log("  [PASS] Post-upgrade hybrid dense+lexical retrieval verified")


def main() -> int:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []

    def log(msg: str) -> None:
        print(msg, flush=True)
        lines.append(msg)

    log("=== WorkByLine V3: Historical Candidate Upgrade & Schema Reconciliation Verification ===")
    embedder = LocalBGEEmbedder(WEIGHTS_DIR)

    mig_names_000_006 = [
        "000_contain_unsafe_legacy_rpc.sql",
        "001_evidence_service.sql",
        "004_hybrid_retrieval.sql",
        "005_v3_projections_and_semantics.sql",
        "006_indexing_stages_and_erasure_recovery.sql",
    ]

    # -------------------------------------------------------------------------
    # Case 1: Upgrade from f41e503 (untracked 000-006 schema without schema_migrations)
    # -------------------------------------------------------------------------
    log("\n--- Case 1: Upgrade from candidate f41e503 (untracked 000-006 + synthetic records) ---")
    db_f41 = "disposable_upgrade_f41e503_db"
    storage_f41 = Path(tempfile.mkdtemp(prefix="wbctx_upg_f41_"))
    try:
        url_f41 = recreate_disposable_db(db_f41)
        conn = psycopg.connect(url_f41, autocommit=True)
        with conn.cursor() as cur:
            for mname in mig_names_000_006:
                sql = git_show_file("f41e503", f"migrations/{mname}")
                cur.execute(sql)
        conn.close()

        seeded_f41 = seed_pre_upgrade_records(url_f41, storage_f41, include_007_cols=False)

        run_res = subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "run_forward_migrations.py"),
                "--db-url",
                url_f41,
                "--migrations-dir",
                str(ROOT / "migrations"),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        log(run_res.stdout.strip())
        verify_post_upgrade_behavior(url_f41, storage_f41, seeded_f41, embedder, log)
    finally:
        drop_disposable_db(db_f41)
        shutil.rmtree(storage_f41, ignore_errors=True)

    # -------------------------------------------------------------------------
    # Case 2: Upgrade from 1f40f9f (tracked schema_migrations with 1f40f9f hashes)
    # -------------------------------------------------------------------------
    log("\n--- Case 2: Upgrade from candidate 1f40f9f (tracked schema_migrations + non-destructive audit reconciliation) ---")
    db_1f4 = "disposable_upgrade_1f40f9f_db"
    storage_1f4 = Path(tempfile.mkdtemp(prefix="wbctx_upg_1f4_"))
    try:
        url_1f4 = recreate_disposable_db(db_1f4)
        conn = psycopg.connect(url_1f4, autocommit=True)
        original_1f4_hashes = {}
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE schema_migrations (
                    version TEXT PRIMARY KEY,
                    sha256 TEXT NOT NULL,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
            for mname in mig_names_000_006:
                sql_bytes = git_show_file("1f40f9f", f"migrations/{mname}").encode("utf-8")
                sha = hashlib.sha256(sql_bytes).hexdigest()
                original_1f4_hashes[mname] = sha
                cur.execute(sql_bytes.decode("utf-8"))
                cur.execute(
                    "INSERT INTO schema_migrations (version, sha256) VALUES (%s, %s)",
                    (mname, sha),
                )
        conn.close()

        seeded_1f4 = seed_pre_upgrade_records(url_1f4, storage_1f4, include_007_cols=False)

        run_res = subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "run_forward_migrations.py"),
                "--db-url",
                url_1f4,
                "--migrations-dir",
                str(ROOT / "migrations"),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        log(run_res.stdout.strip())

        # Verify schema_migrations.sha256 was NOT overwritten and reconciliations were logged
        conn = psycopg.connect(url_1f4)
        with conn.cursor() as cur:
            cur.execute("SELECT version, sha256 FROM schema_migrations WHERE version <= '006_z'")
            stored_hashes = dict(cur.fetchall())
            for mname, orig_sha in original_1f4_hashes.items():
                assert stored_hashes[mname] == orig_sha, (
                    f"schema_migrations.sha256 was overwritten for {mname}: {stored_hashes[mname]} != {orig_sha}"
                )
            cur.execute(
                "SELECT version, recorded_sha256, canonical_file_sha256, variant_origin, verified_details "
                "FROM schema_migration_reconciliations ORDER BY version"
            )
            reconciliations = cur.fetchall()
            reconciled_versions = [r[0] for r in reconciliations]
            assert reconciled_versions == [
                "000_contain_unsafe_legacy_rpc.sql",
                "001_evidence_service.sql",
                "004_hybrid_retrieval.sql",
                "006_indexing_stages_and_erasure_recovery.sql",
            ], f"Unexpected reconciled versions: {reconciled_versions}"
        conn.close()
        log("  [PASS] schema_migrations.sha256 preserved untouched; 4 audited entries recorded in schema_migration_reconciliations")

        verify_post_upgrade_behavior(url_1f4, storage_1f4, seeded_1f4, embedder, log)
    finally:
        drop_disposable_db(db_1f4)
        shutil.rmtree(storage_1f4, ignore_errors=True)

    # -------------------------------------------------------------------------
    # Case 3: Fail-closed on 1f40f9f 'embedding text' fallback drift and unknown checksum
    # -------------------------------------------------------------------------
    log("\n--- Case 3: Fail-closed rejection on 'embedding text' drift and unknown checksum ---")
    db_drift = "disposable_upgrade_drift_db"
    try:
        url_drift = recreate_disposable_db(db_drift)
        conn = psycopg.connect(url_drift, autocommit=True)
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE schema_migrations (
                    version TEXT PRIMARY KEY,
                    sha256 TEXT NOT NULL,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
            for mname in mig_names_000_006[:3]:  # 000, 001, 004
                sql_bytes = git_show_file("1f40f9f", f"migrations/{mname}").encode("utf-8")
                sha = hashlib.sha256(sql_bytes).hexdigest()
                if mname == "004_hybrid_retrieval.sql":
                    # Simulate the 1f40f9f degraded fallback where wbctx_span_embeddings.embedding is TEXT
                    cur.execute(
                        """
                        CREATE TABLE wbctx_span_embeddings (
                            span_id VARCHAR PRIMARY KEY REFERENCES wbctx_spans(id) ON DELETE CASCADE,
                            model_id VARCHAR NOT NULL,
                            embedding TEXT NOT NULL
                        )
                        """
                    )
                else:
                    cur.execute(sql_bytes.decode("utf-8"))
                cur.execute(
                    "INSERT INTO schema_migrations (version, sha256) VALUES (%s, %s)",
                    (mname, sha),
                )
        conn.close()

        drift_res = subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "run_forward_migrations.py"),
                "--db-url",
                url_drift,
                "--migrations-dir",
                str(ROOT / "migrations"),
            ],
            capture_output=True,
            text=True,
        )
        assert drift_res.returncode != 0, "Expected migration runner to fail closed when embedding column is TEXT"
        assert "SCHEMA_DRIFT_DETECTED" in drift_res.stderr, f"Unexpected stderr: {drift_res.stderr}"
        log("  [PASS] Fail-closed when 1f40f9f 004 degraded 'embedding TEXT' fallback is detected")

        # Now test unknown tampered checksum
        conn = psycopg.connect(url_drift, autocommit=True)
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE schema_migrations SET sha256 = 'deadbeef00000000000000000000000000000000000000000000000000000000' "
                "WHERE version = '000_contain_unsafe_legacy_rpc.sql'"
            )
        conn.close()
        tamper_res = subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "run_forward_migrations.py"),
                "--db-url",
                url_drift,
                "--migrations-dir",
                str(ROOT / "migrations"),
            ],
            capture_output=True,
            text=True,
        )
        assert tamper_res.returncode != 0, "Expected migration runner to fail closed on unknown checksum"
        assert "MIGRATION_CHECKSUM_MISMATCH" in tamper_res.stderr, f"Unexpected stderr: {tamper_res.stderr}"
        log("  [PASS] Fail-closed when unknown/tampered migration checksum is encountered")
    finally:
        drop_disposable_db(db_drift)

    # -------------------------------------------------------------------------
    # Case 4: Upgrade from 870e3d2 (000-007 with unvalidated _SafetensorsBertModel vectors)
    # -------------------------------------------------------------------------
    log("\n--- Case 4: Upgrade from candidate 870e3d2 (000-007 with unvalidated vectors quarantined by 008) ---")
    db_870 = "disposable_upgrade_870e3d2_db"
    storage_870 = Path(tempfile.mkdtemp(prefix="wbctx_upg_870_"))
    try:
        url_870 = recreate_disposable_db(db_870)
        conn = psycopg.connect(url_870, autocommit=True)
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE schema_migrations (
                    version TEXT PRIMARY KEY,
                    sha256 TEXT NOT NULL,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
            for mname in mig_names_000_006 + ["007_closeout_provenance_and_recovery_leases.sql"]:
                sql_bytes = (ROOT / "migrations" / mname).read_bytes()
                sha = hashlib.sha256(sql_bytes).hexdigest()
                cur.execute(sql_bytes.decode("utf-8"))
                cur.execute(
                    "INSERT INTO schema_migrations (version, sha256) VALUES (%s, %s)",
                    (mname, sha),
                )
        conn.close()

        seeded_870 = seed_pre_upgrade_records(url_870, storage_870, include_007_cols=True)

        run_res = subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "run_forward_migrations.py"),
                "--db-url",
                url_870,
                "--migrations-dir",
                str(ROOT / "migrations"),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        log(run_res.stdout.strip())
        verify_post_upgrade_behavior(url_870, storage_870, seeded_870, embedder, log)
    finally:
        drop_disposable_db(db_870)
        shutil.rmtree(storage_870, ignore_errors=True)

    log("\n=== ALL HISTORICAL CANDIDATE UPGRADE & RECONCILIATION CHECKS PASSED ===")
    LOG_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
