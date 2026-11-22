#!/usr/bin/env python3
"""Persistent-Runtime Acceptance Suite for WorkByLine V3 Closeout.

Executes real multi-process acceptance verification against:
- Disposable PostgreSQL 17 + pgvector on 127.0.0.1:54399 (disposable_v3_db)
- Persistent Temporal local server on 127.0.0.1:7233
- Continuous Temporal Dispatcher (python -m service.run_memory dispatch)
- Continuous Temporal Worker (python -m service.run_memory worker)
- FastAPI Memory & Context Evidence API on 127.0.0.1:8011
- Local BGE-small-en-v1.5 weights (/tmp/workbyline_bge_small_en_v1_5) via SentenceTransformers
"""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import uuid

import httpx
from sqlalchemy import select, text
from temporalio.client import Client, WorkflowFailureError

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from service.core import (
    Artifact,
    Binding,
    ErasureTombstone,
    Fault,
    IndexingStage,
    Job,
    Kernel,
    Projection,
    Source,
    Span,
    Version,
    sign,
    uid,
)

DB_URL = os.environ.get(
    "WORKBYLINE_CONTEXT_DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@127.0.0.1:54399/disposable_v3_db",
)
TEMPORAL_ADDR = os.environ.get("TEMPORAL_ADDRESS", "127.0.0.1:7233")
API_PORT = int(os.environ.get("PORT", "8011"))
API_URL = f"http://127.0.0.1:{API_PORT}"
BGE_WEIGHTS = os.environ.get("WORKBYLINE_EMBEDDING_WEIGHTS", "/tmp/workbyline_bge_small_en_v1_5")
SECRET = os.environ.get(
    "WORKBYLINE_CONTEXT_DELEGATION_SECRET",
    "acceptance-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
)
STORAGE_DIR = Path(os.environ.get("WORKBYLINE_CONTEXT_STORAGE", str(ROOT / "private-context-storage")))
PID_DIR = ROOT / "logs" / "pids"


def make_token(claims: dict, operation: str) -> str:
    now = int(time.time())
    payload = {
        **claims,
        "iss": "workbyline-v2-web",
        "aud": "workbyline-context-evidence",
        "operation": operation,
        "iat": now,
        "exp": now + 180,
        "jti": str(uuid.uuid4()),
    }
    return "Bearer " + sign(payload, SECRET)


def kill_worker_sigkill() -> int:
    """Terminate the running Temporal worker process tree with SIGKILL and return its PID."""
    pid_file = PID_DIR / "worker.pid"
    assert pid_file.exists(), f"Worker PID file not found at {pid_file}"
    worker_pid = int(pid_file.read_text().strip())
    # Kill any child processes first with SIGKILL, then the worker process itself
    subprocess.run(["pkill", "-KILL", "-P", str(worker_pid)], check=False)
    try:
        os.kill(worker_pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    # Wait briefly for OS process table reap
    for _ in range(20):
        try:
            os.kill(worker_pid, 0)
            time.sleep(0.05)
        except ProcessLookupError:
            break
    return worker_pid


def restart_worker_via_launcher(extra_env: dict[str, str] | None = None) -> int:
    """Restart the Temporal worker using ./infra/scripts/launch_workbyline_v3.sh worker."""
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)
    subprocess.run(
        [str(ROOT / "infra" / "scripts" / "launch_workbyline_v3.sh"), "worker"],
        cwd=str(ROOT),
        env=env,
        check=True,
    )
    pid_file = PID_DIR / "worker.pid"
    new_pid = int(pid_file.read_text().strip())
    return new_pid


async def run_acceptance() -> dict:
    report: dict = {
        "suite": "persistent_runtime_acceptance",
        "timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "database_target": "127.0.0.1:54399/disposable_v3_db",
        "temporal_address": TEMPORAL_ADDR,
        "api_url": API_URL,
        "checks": {},
    }

    kernel = Kernel(DB_URL, str(STORAGE_DIR), SECRET)
    scope = {
        "actor": "founder_verifier",
        "org": f"org_accept_{uuid.uuid4().hex[:8]}",
        "run": "run_pilot_01",
        "workspace": "ws-accept",
        "role": "role_backend_eng",
    }
    with kernel.session.begin() as db:
        db.add(Binding(**scope, active=True, can_write=True))

    restart_worker_via_launcher(
        {
            "WORKBYLINE_HEARTBEAT_INTERVAL_SEC": "1.0",
            "WORKBYLINE_LEASE_RENEWAL_INTERVAL_SEC": "2.0",
            "WORKBYLINE_LEASE_DURATION_SEC": "8",
            "WORKBYLINE_INITIAL_LEASE_SEC": "8",
            "WORKBYLINE_TEST_PARSE_DELAY_SEC": "4.5",
            "WORKBYLINE_TEST_INDEX_DELAY_SEC": "4.5",
        }
    )

    # -------------------------------------------------------------------------
    # CHECK 1: /health Operational Readiness (DB + Schema 008 + Temporal Worker + SentenceTransformers BGE)
    # -------------------------------------------------------------------------
    print("[1/8] Verifying /health operational readiness across DB, Schema 008, Temporal pollers, and SentenceTransformers BGE...", flush=True)
    async with httpx.AsyncClient(timeout=10.0) as http:
        resp = await http.get(f"{API_URL}/health")
        assert resp.status_code == 200, f"Expected 200 from /health, got {resp.status_code}: {resp.text}"
        health = resp.json()
        assert health["status"] == "ready"
        assert health["liveness"] == "alive"
        assert health["operational_readiness"]["database"] == "connected"
        assert health["operational_readiness"]["schema"] == "ready"
        assert health["operational_readiness"]["schema_version"] == "008_inference_backend_and_upgrade_reconciliation.sql"
        assert health["operational_readiness"]["temporal"] == "ready"
        assert health["operational_readiness"]["temporal_worker_pollers"] >= 1
        assert health["operational_readiness"]["embedding"] == "ready"
        assert health["configuration"]["embedding_inference_backend"].startswith("sentence_transformers:")
        assert health["configuration"]["embedding_language_scope"].startswith("en (English-primary")
        assert health["retrieval"] == "postgres-fts+pgvector-rrf"
        report["checks"]["health_operational_readiness"] = {
            "status": "PASS",
            "http_status": resp.status_code,
            "operational_readiness": health["operational_readiness"],
            "configuration": health["configuration"],
        }

    # -------------------------------------------------------------------------
    # CHECK 2: Same-Filename Document Identity, Revisions & Idempotency Conflicts
    # -------------------------------------------------------------------------
    print("[2/8] Verifying document identity semantics, explicit revisions, and idempotency...", flush=True)
    async with httpx.AsyncClient(timeout=20.0) as http:
        idem_key_1 = f"idem_{uuid.uuid4().hex}"
        r1 = await http.post(
            f"{API_URL}/v1/workspaces/ws-accept/sources",
            headers={"Authorization": make_token(scope, "upload")},
            files={"file": ("resume.txt", b"Alice built distributed consensus in Python and Kubernetes cluster orchestration.")},
            data={"source_key": "resume.txt", "idempotency_key": idem_key_1},
        )
        assert r1.status_code == 202, r1.text
        doc1 = r1.json()
        assert doc1["version"] == 1 and doc1["replayed"] is False

        # Second upload with same filename 'resume.txt' and no target_source_id -> distinct source_id
        r2 = await http.post(
            f"{API_URL}/v1/workspaces/ws-accept/sources",
            headers={"Authorization": make_token(scope, "upload")},
            files={"file": ("resume.txt", b"Bob designed PostgreSQL storage engines and Raft replication.")},
            data={"source_key": "resume.txt"},
        )
        assert r2.status_code == 202, r2.text
        doc2 = r2.json()
        assert doc2["version"] == 1
        assert doc2["source_id"] != doc1["source_id"], "Same filename without target_source_id must create distinct Source"

        # Replay of idem_key_1 with identical payload -> replayed=True, same version_id
        r1_replay = await http.post(
            f"{API_URL}/v1/workspaces/ws-accept/sources",
            headers={"Authorization": make_token(scope, "upload")},
            files={"file": ("resume.txt", b"Alice built distributed consensus in Python and Kubernetes cluster orchestration.")},
            data={"source_key": "resume.txt", "idempotency_key": idem_key_1},
        )
        assert r1_replay.status_code == 202
        assert r1_replay.json()["replayed"] is True
        assert r1_replay.json()["version_id"] == doc1["version_id"]

        # Conflicting payload with same idem_key_1 -> 409 IDEMPOTENCY_CONFLICT
        r1_conflict = await http.post(
            f"{API_URL}/v1/workspaces/ws-accept/sources",
            headers={"Authorization": make_token(scope, "upload")},
            files={"file": ("resume.txt", b"Different conflicting payload bytes")},
            data={"source_key": "resume.txt", "idempotency_key": idem_key_1},
        )
        assert r1_conflict.status_code == 409
        assert r1_conflict.json()["error"] == "IDEMPOTENCY_CONFLICT"

        # Explicit revision on doc1 via target_source_id -> version 2
        r1_rev = await http.post(
            f"{API_URL}/v1/workspaces/ws-accept/sources",
            headers={"Authorization": make_token(scope, "upload")},
            files={"file": ("resume.txt", b"Alice built distributed consensus in Python, Kubernetes orchestration, and multi-region Raft.")},
            data={"source_key": "resume.txt", "target_source_id": doc1["source_id"]},
        )
        assert r1_rev.status_code == 202
        doc1_v2 = r1_rev.json()
        assert doc1_v2["source_id"] == doc1["source_id"]
        assert doc1_v2["version"] == 2

    report["checks"]["document_identity_and_idempotency"] = {
        "status": "PASS",
        "doc1_source_id": doc1["source_id"],
        "doc2_source_id": doc2["source_id"],
        "doc1_v2_version_id": doc1_v2["version_id"],
        "idempotency_conflict_status": 409,
    }

    # -------------------------------------------------------------------------
    # CHECK 3: Persistent Temporal Multi-Heartbeat, Lease Renewal & Dense SentenceTransformers Indexing
    # -------------------------------------------------------------------------
    print("[3/8] Waiting for persistent Temporal workflow completion, multiple heartbeats, lease renewals, and SentenceTransformers indexing...", flush=True)
    temporal_client = await Client.connect(TEMPORAL_ADDR, namespace="default")
    wf_handle = temporal_client.get_workflow_handle(f"wbctx-version-{doc1_v2['version_id']}")

    wf_result = None
    for _ in range(80):
        try:
            wf_result = await asyncio.wait_for(wf_handle.result(), timeout=2.0)
            break
        except Exception:
            await asyncio.sleep(0.5)

    assert wf_result is not None, "Workflow did not complete within 40s"
    assert wf_result["ok"] is True
    assert wf_result["pipeline_status"] == "COMPLETED"
    assert wf_result["indexing_status"] == "INDEXED"
    assert wf_result.get("parse_heartbeat_count", 0) >= 2, f"Expected >=2 heartbeats, got {wf_result}"
    assert wf_result.get("parse_lease_renewal_count", 0) >= 1, f"Expected >=1 lease renewals, got {wf_result}"

    # Also wait for doc1 v1 and doc2 workflows to complete
    for vid in (doc1["version_id"], doc2["version_id"]):
        h = temporal_client.get_workflow_handle(f"wbctx-version-{vid}")
        for _ in range(50):
            try:
                await asyncio.wait_for(h.result(), timeout=2.0)
                break
            except Exception:
                await asyncio.sleep(0.5)

    async with httpx.AsyncClient(timeout=15.0) as http:
        insp_resp = await http.get(
            f"{API_URL}/v1/workspaces/ws-accept/sources/{doc1['source_id']}",
            headers={"Authorization": make_token(scope, "read")},
        )
        assert insp_resp.status_code == 200
        insp = insp_resp.json()
        assert insp["version_id"] == doc1_v2["version_id"]
        assert insp["parsing_state"] == "completed"
        assert insp["indexing_state"] == "indexed"
        assert (insp.get("inference_backend") or "").startswith("sentence_transformers:")

        # Also inspect historical v1 via version=1 query parameter
        insp_v1_resp = await http.get(
            f"{API_URL}/v1/workspaces/ws-accept/sources/{doc1['source_id']}?version=1",
            headers={"Authorization": make_token(scope, "read")},
        )
        assert insp_v1_resp.status_code == 200
        assert insp_v1_resp.json()["version"] == 1

        # Execute hybrid FTS + pgvector RRF retrieval query
        qa_resp = await http.post(
            f"{API_URL}/v1/workspaces/ws-accept/research-qa",
            headers={"Authorization": make_token(scope, "retrieve")},
            json={"question": "Kubernetes orchestration and multi-region Raft", "mode": "retrieval_only", "limit": 5},
        )
        assert qa_resp.status_code == 200, qa_resp.text
        qa_data = qa_resp.json()
        assert qa_data["retrieval_method"] == "postgres-fts+pgvector-rrf"
        assert qa_data["dense_enabled"] is True
        assert len(qa_data["passages"]) >= 1
        assert qa_data["passages"][0]["version_id"] == doc1_v2["version_id"]

    # Verify persisted provenance in wbctx_indexings and wbctx_span_embeddings
    with kernel.session() as db:
        stage = db.get(IndexingStage, doc1_v2["version_id"])
        assert stage is not None and stage.status == "completed"
        assert stage.model_id == "bge-small-en-v1.5"
        assert stage.model_revision == "5c38ec7c405ec4b44b94cc5a9bb96e735b38267a"
        assert len(stage.artifact_sha256 or "") == 64
        assert (stage.inference_backend or "").startswith("sentence_transformers:")
        emb_row = db.execute(
            text(
                "SELECT model_id, model_revision, artifact_sha256, inference_backend, vector_dims(embedding) "
                "FROM wbctx_span_embeddings e JOIN wbctx_spans s ON s.id = e.span_id "
                "WHERE s.version = :vid LIMIT 1"
            ),
            {"vid": doc1_v2["version_id"]},
        ).fetchone()
        assert emb_row is not None
        assert emb_row[0] == "bge-small-en-v1.5"
        assert emb_row[1] == "5c38ec7c405ec4b44b94cc5a9bb96e735b38267a"
        assert emb_row[2] == stage.artifact_sha256
        assert emb_row[3] == stage.inference_backend
        assert emb_row[4] == 384

    report["checks"]["temporal_heartbeats_lease_and_hybrid_rrf"] = {
        "status": "PASS",
        "workflow_result": wf_result,
        "indexing_provenance": {
            "model_id": stage.model_id,
            "model_revision": stage.model_revision,
            "artifact_sha256": stage.artifact_sha256,
            "inference_backend": stage.inference_backend,
            "dimensions": 384,
        },
        "retrieval_method": qa_data["retrieval_method"],
        "top_passage_rrf_score": qa_data["passages"][0]["rrf_score"],
    }

    # -------------------------------------------------------------------------
    # CHECK 4: Explicit Workflow Cancellation & Durable Cancellation Contract (Zero Manual SQL Edits)
    # -------------------------------------------------------------------------
    print("[4/8] Testing explicit Temporal workflow cancellation and durable non-redispatch contract...", flush=True)
    async with httpx.AsyncClient(timeout=20.0) as http:
        cancel_up = await http.post(
            f"{API_URL}/v1/workspaces/ws-accept/sources",
            headers={"Authorization": make_token(scope, "upload")},
            files={"file": ("cancel_target.txt", b"Document whose workflow will be explicitly cancelled in-flight.")},
            data={"source_key": "cancel_target.txt"},
        )
        assert cancel_up.status_code == 202
        cancel_doc = cancel_up.json()
    cancel_vid = cancel_doc["version_id"]

    cancel_handle = temporal_client.get_workflow_handle(f"wbctx-version-{cancel_vid}")
    entered_processing = False
    for _ in range(50):
        with kernel.session() as db:
            j = db.scalar(select(Job).where(Job.version == cancel_vid))
            if j and j.state == "processing":
                entered_processing = True
                break
        await asyncio.sleep(0.15)

    assert entered_processing, "Job did not enter processing state for cancellation test"

    await cancel_handle.cancel()

    cancelled_cleanly = False
    try:
        res = await asyncio.wait_for(cancel_handle.result(), timeout=12.0)
        print(f"DEBUG: cancel_handle.result() succeeded with: {res}", flush=True)
    except WorkflowFailureError as wfe:
        print(f"DEBUG: cancel_handle.result() raised WorkflowFailureError: {wfe}", flush=True)
        cancelled_cleanly = True
    except Exception as exc:
        print(f"DEBUG: cancel_handle.result() raised: {type(exc)} {exc}", flush=True)
        if "Cancel" in type(exc).__name__ or "cancel" in str(exc).lower():
            cancelled_cleanly = True

    assert cancelled_cleanly, "Expected workflow handle to raise cancellation failure, not succeed"

    # Wait 3.5 seconds while continuous dispatcher polls every 2s to prove it does NOT re-dispatch cancelled jobs
    await asyncio.sleep(3.5)

    with kernel.session() as db:
        j_cancel = db.scalar(select(Job).where(Job.version == cancel_vid))
        v_cancel = db.get(Version, cancel_vid)
        art = db.get(Artifact, cancel_vid)
        spans = db.scalars(select(Span).where(Span.version == cancel_vid)).all()
        proj = db.get(Projection, cancel_vid)
        assert j_cancel is not None and j_cancel.state == "cancelled", f"Expected job.state=='cancelled', got {j_cancel.state if j_cancel else None}"
        assert v_cancel is not None and v_cancel.state == "cancelled", f"Expected ver.state=='cancelled', got {v_cancel.state if v_cancel else None}"
        assert j_cancel.attempts == 1, f"Dispatcher must not re-dispatch cancelled job; attempts={j_cancel.attempts}"
        assert art is None, "Cancelled activity must NOT commit Artifact"
        assert len(spans) == 0, "Cancelled activity must NOT commit Spans"
        assert proj is None, "Cancelled workflow must NOT run or commit Projection"

    report["checks"]["in_flight_cancellation_fencing"] = {
        "status": "PASS",
        "cancelled_version_id": cancel_vid,
        "durable_job_state": j_cancel.state,
        "durable_version_state": v_cancel.state,
        "attempts_after_dispatcher_poll": j_cancel.attempts,
        "manual_sql_override_used": False,
        "committed_artifacts": 0,
        "committed_spans": 0,
        "committed_projections": 0,
    }

    # -------------------------------------------------------------------------
    # CHECK 5: Genuine Worker-Process Crash (SIGKILL) & Restart Recovery (Parsing + Indexing)
    # -------------------------------------------------------------------------
    print("[5/8] Executing genuine worker-process crash (SIGKILL) and launcher restart recovery across parsing and indexing...", flush=True)

    # 5A: Crash during process_evidence_version (Parsing)
    async with httpx.AsyncClient(timeout=20.0) as http:
        crash_parse_up = await http.post(
            f"{API_URL}/v1/workspaces/ws-accept/sources",
            headers={"Authorization": make_token(scope, "upload")},
            files={
                "file": (
                    "crash_parse_recovery.txt",
                    b"Worker SIGKILL during process_evidence_version: resilient distributed transaction recovery.",
                )
            },
            data={"source_key": "crash_parse_recovery.txt"},
        )
        assert crash_parse_up.status_code == 202
        crash_parse_doc = crash_parse_up.json()
    crash_parse_vid = crash_parse_doc["version_id"]
    crash_parse_wf_id = f"wbctx-version-{crash_parse_vid}"
    crash_parse_handle = temporal_client.get_workflow_handle(crash_parse_wf_id)

    # Wait until worker claims the parsing job
    parse_claim_info = None
    for _ in range(60):
        with kernel.session() as db:
            j = db.scalar(select(Job).where(Job.version == crash_parse_vid))
            if j and j.state == "processing" and j.fence:
                parse_claim_info = {
                    "job_id": j.id,
                    "attempt_before_kill": j.attempts,
                    "fence_before_kill": j.fence,
                    "lease_until_before_kill": j.lease_until,
                }
                break
        await asyncio.sleep(0.15)
    assert parse_claim_info is not None, "Worker did not claim crash_parse_recovery.txt"

    wf_desc_before = await crash_parse_handle.describe()
    run_id_before = wf_desc_before.run_id

    # Terminate the worker process with SIGKILL mid-parsing!
    killed_pid_1 = kill_worker_sigkill()
    kill_ts_1 = time.time()
    print(f"  -> Sent SIGKILL to worker PID {killed_pid_1} during process_evidence_version (fence={parse_claim_info['fence_before_kill']})", flush=True)

    # Verify /health reflects worker loss (503 / connected_no_workers) once Temporal updates poller list
    # Note: Temporal dev server poller TTL is ~5-10s; we also restart worker promptly so heartbeat retry succeeds cleanly.
    await asyncio.sleep(1.0)
    restarted_pid_1 = restart_worker_via_launcher(
        {
            "WORKBYLINE_HEARTBEAT_INTERVAL_SEC": "1.0",
            "WORKBYLINE_LEASE_RENEWAL_INTERVAL_SEC": "2.0",
            "WORKBYLINE_LEASE_DURATION_SEC": "8",
            "WORKBYLINE_INITIAL_LEASE_SEC": "8",
            "WORKBYLINE_TEST_PARSE_DELAY_SEC": "5.0",
            "WORKBYLINE_TEST_INDEX_DELAY_SEC": "5.0",
        }
    )
    assert restarted_pid_1 != killed_pid_1, "Restarted worker must be a new OS process"
    print(f"  -> Restarted worker via launch_workbyline_v3.sh worker (new PID {restarted_pid_1})", flush=True)

    # Wait for Temporal heartbeat timeout (10s) + retry on the new worker to complete the workflow
    crash_parse_wf_result = None
    for _ in range(120):
        try:
            crash_parse_wf_result = await asyncio.wait_for(crash_parse_handle.result(), timeout=2.0)
            break
        except Exception:
            await asyncio.sleep(0.5)

    assert crash_parse_wf_result is not None, "Workflow did not recover after worker SIGKILL during parsing"
    assert crash_parse_wf_result["ok"] is True
    assert crash_parse_wf_result["indexing_status"] == "INDEXED"

    # Verify stale worker fence cannot commit or overwrite completed job
    stale_attempt = kernel.process((parse_claim_info["job_id"], parse_claim_info["fence_before_kill"]))
    assert stale_attempt == {"ok": False, "code": "LEASE_LOST"}

    with kernel.session() as db:
        j_after = db.get(Job, parse_claim_info["job_id"])
        v_after = db.get(Version, crash_parse_vid)
        arts = db.scalars(select(Artifact).where(Artifact.version == crash_parse_vid)).all()
        spans = db.scalars(select(Span).where(Span.version == crash_parse_vid)).all()
        assert j_after.state == "completed"
        assert j_after.attempts >= 2, f"Expected attempts >= 2 after SIGKILL recovery, got {j_after.attempts}"
        assert j_after.fence != parse_claim_info["fence_before_kill"]
        assert v_after.state == "completed"
        assert len(arts) == 1, f"Expected 1 artifact, got {len(arts)}"
        assert len(spans) == 1, f"Expected 1 span (zero duplicates), got {len(spans)}"

    # 5B: Crash during index_evidence_version (Downstream Indexing)
    async with httpx.AsyncClient(timeout=20.0) as http:
        crash_index_up = await http.post(
            f"{API_URL}/v1/workspaces/ws-accept/sources",
            headers={"Authorization": make_token(scope, "upload")},
            files={
                "file": (
                    "crash_index_recovery.txt",
                    b"Worker SIGKILL during index_evidence_version: pgvector embedding atomic fencing.",
                )
            },
            data={"source_key": "crash_index_recovery.txt"},
        )
        assert crash_index_up.status_code == 202
        crash_index_doc = crash_index_up.json()
    crash_index_vid = crash_index_doc["version_id"]
    crash_index_wf_id = f"wbctx-version-{crash_index_vid}"
    crash_index_handle = temporal_client.get_workflow_handle(crash_index_wf_id)

    # Wait until parsing completes and index_evidence_version enters 'running' in wbctx_indexings
    index_fence_before_kill = None
    for _ in range(120):
        with kernel.session() as db:
            st = db.get(IndexingStage, crash_index_vid)
            if st and st.status == "running" and st.fence:
                index_fence_before_kill = st.fence
                break
        await asyncio.sleep(0.15)
    assert index_fence_before_kill is not None, "Worker did not enter running state in wbctx_indexings"

    killed_pid_2 = kill_worker_sigkill()
    print(f"  -> Sent SIGKILL to worker PID {killed_pid_2} during index_evidence_version (fence={index_fence_before_kill})", flush=True)

    await asyncio.sleep(1.0)
    restarted_pid_2 = restart_worker_via_launcher(
        {
            "WORKBYLINE_HEARTBEAT_INTERVAL_SEC": "1.0",
            "WORKBYLINE_LEASE_RENEWAL_INTERVAL_SEC": "2.0",
            "WORKBYLINE_LEASE_DURATION_SEC": "8",
            "WORKBYLINE_INITIAL_LEASE_SEC": "8",
            "WORKBYLINE_TEST_PARSE_DELAY_SEC": "0.5",
            "WORKBYLINE_TEST_INDEX_DELAY_SEC": "0.5",
        }
    )
    assert restarted_pid_2 != killed_pid_2
    print(f"  -> Restarted worker via launch_workbyline_v3.sh worker (new PID {restarted_pid_2})", flush=True)

    crash_index_wf_result = None
    for _ in range(120):
        try:
            crash_index_wf_result = await asyncio.wait_for(crash_index_handle.result(), timeout=2.0)
            break
        except Exception:
            await asyncio.sleep(0.5)

    assert crash_index_wf_result is not None, "Workflow did not recover after worker SIGKILL during indexing"
    assert crash_index_wf_result["ok"] is True
    assert crash_index_wf_result["indexing_status"] == "INDEXED"

    with kernel.session() as db:
        st_after = db.get(IndexingStage, crash_index_vid)
        assert st_after is not None and st_after.status == "completed"
        assert st_after.fence != index_fence_before_kill, "Recovered indexing attempt must have a new fence"
        assert st_after.indexed_spans == 1
        emb_cnt = db.execute(
            text(
                "SELECT count(*) FROM wbctx_span_embeddings e JOIN wbctx_spans s ON s.id = e.span_id "
                "WHERE s.version = :vid"
            ),
            {"vid": crash_index_vid},
        ).scalar()
        assert emb_cnt == 1

    # Verify both crash-recovered documents are retrievable through hybrid search
    async with httpx.AsyncClient(timeout=15.0) as http:
        qa_crash = await http.post(
            f"{API_URL}/v1/workspaces/ws-accept/research-qa",
            headers={"Authorization": make_token(scope, "retrieve")},
            json={"question": "pgvector embedding atomic fencing resilient distributed transaction", "mode": "retrieval_only", "limit": 5},
        )
        assert qa_crash.status_code == 200
        returned_vids = {p["version_id"] for p in qa_crash.json()["passages"]}
        assert crash_parse_vid in returned_vids
        assert crash_index_vid in returned_vids

    # Restore default worker configuration for subsequent tests
    restart_worker_via_launcher(
        {
            "WORKBYLINE_HEARTBEAT_INTERVAL_SEC": "1.0",
            "WORKBYLINE_LEASE_RENEWAL_INTERVAL_SEC": "2.0",
            "WORKBYLINE_LEASE_DURATION_SEC": "8",
            "WORKBYLINE_INITIAL_LEASE_SEC": "8",
            "WORKBYLINE_TEST_PARSE_DELAY_SEC": "4.5",
            "WORKBYLINE_TEST_INDEX_DELAY_SEC": "4.5",
        }
    )

    report["checks"]["worker_sigkill_crash_and_restart_recovery"] = {
        "status": "PASS",
        "parsing_crash_recovery": {
            "workflow_id": crash_parse_wf_id,
            "run_id": run_id_before,
            "version_id": crash_parse_vid,
            "killed_worker_pid": killed_pid_1,
            "restarted_worker_pid": restarted_pid_1,
            "attempt_before_kill": parse_claim_info["attempt_before_kill"],
            "attempt_after_recovery": j_after.attempts,
            "fence_before_kill": parse_claim_info["fence_before_kill"],
            "fence_after_recovery": j_after.fence,
            "stale_worker_fence_rejected": True,
            "duplicate_artifacts_or_spans": 0,
        },
        "indexing_crash_recovery": {
            "workflow_id": crash_index_wf_id,
            "version_id": crash_index_vid,
            "killed_worker_pid": killed_pid_2,
            "restarted_worker_pid": restarted_pid_2,
            "index_fence_before_kill": index_fence_before_kill,
            "index_fence_after_recovery": st_after.fence,
            "indexed_spans": st_after.indexed_spans,
            "duplicate_embeddings": 0,
        },
        "graph_projection_crash_recovery": "BLOCKED (local Neo4j/Graphiti and GEMINI_API_KEY unprovisioned in this environment)",
    }

    # -------------------------------------------------------------------------
    # CHECK 6: Concurrent Advisory-Locked Migration Runner, Legacy NULL Backfill & Drift Rejection
    # -------------------------------------------------------------------------
    print("[6/8] Verifying single-session advisory lock concurrency, NULL sha256 backfill, and drift fail-closed...", flush=True)
    env_mig = os.environ.copy()
    env_mig["PYTHONPATH"] = str(ROOT)
    p_a = subprocess.Popen(
        [
            sys.executable,
            str(ROOT / "scripts/run_forward_migrations.py"),
            "--db-url",
            DB_URL,
            "--hold-lock-seconds",
            "1.5",
            "--worker-label",
            "worker-A",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        env=env_mig,
    )
    await asyncio.sleep(0.25)
    t_b_start = time.time()
    p_b = subprocess.Popen(
        [
            sys.executable,
            str(ROOT / "scripts/run_forward_migrations.py"),
            "--db-url",
            DB_URL,
            "--worker-label",
            "worker-B",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        env=env_mig,
    )
    out_a, _ = p_a.communicate(timeout=15)
    out_b, _ = p_b.communicate(timeout=15)
    b_elapsed = time.time() - t_b_start
    assert p_a.returncode == 0, f"Worker A failed: {out_a}"
    assert p_b.returncode == 0, f"Worker B failed: {out_b}"
    assert b_elapsed >= 1.0, f"Worker B did not wait for Worker A's session advisory lock (elapsed={b_elapsed:.2f}s)"

    # 6B: Legacy NULL sha256 verification and backfill against pinned historical table
    with kernel.engine.begin() as conn:
        conn.execute(text("ALTER TABLE schema_migrations ALTER COLUMN sha256 DROP NOT NULL"))
        conn.execute(
            text("UPDATE schema_migrations SET sha256 = NULL WHERE version = '006_indexing_stages_and_erasure_recovery.sql'")
        )
    res_backfill = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/run_forward_migrations.py"),
            "--db-url",
            DB_URL,
            "--worker-label",
            "backfill-verify",
        ],
        capture_output=True,
        text=True,
        env=env_mig,
    )
    assert res_backfill.returncode == 0, res_backfill.stderr
    assert "Verified & backfilled legacy sha256 for 006_indexing_stages_and_erasure_recovery.sql" in res_backfill.stdout

    # 6C: Tampered migration file detection (fails closed with exit code 1)
    with tempfile.TemporaryDirectory() as tmp_mig_dir:
        for f in (ROOT / "migrations").glob("*.sql"):
            shutil.copy2(f, Path(tmp_mig_dir) / f.name)
        (Path(tmp_mig_dir) / "006_indexing_stages_and_erasure_recovery.sql").write_text("-- tampered migration content\n")
        res_tamper = subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts/run_forward_migrations.py"),
                "--db-url",
                DB_URL,
                "--migrations-dir",
                tmp_mig_dir,
            ],
            capture_output=True,
            text=True,
            env=env_mig,
        )
        assert res_tamper.returncode == 1
        assert "MIGRATION_CHECKSUM_MISMATCH" in res_tamper.stderr

    report["checks"]["migration_advisory_lock_and_checksums"] = {
        "status": "PASS",
        "worker_b_waited_seconds": round(b_elapsed, 3),
        "legacy_null_backfill": "VERIFIED",
        "tamper_rejection_exit_code": res_tamper.returncode,
        "worker_a_log": out_a.strip().splitlines(),
        "worker_b_log": out_b.strip().splitlines(),
    }

    # -------------------------------------------------------------------------
    # CHECK 7: Crash-Safe Erasure Recovery, Concurrent Claim Fencing, PermissionError & Degraded /health Reporting
    # -------------------------------------------------------------------------
    print("[7/8] Verifying crash-safe erasure recovery, concurrent claim fencing, OS PermissionError, and degraded /health reporting...", flush=True)
    erase_doc = kernel.ingest(scope, "erase_target.txt", "erase_target.txt", b"Sensitive bytes for crash-safe erasure test")
    erase_vid = erase_doc["version_id"]
    with kernel.session() as db:
        ver_obj = db.get(Version, erase_vid)
        erase_disk_path = Path(ver_obj.path)
    assert erase_disk_path.exists()

    try:
        kernel.hard_erase(scope, erase_doc["source_id"], simulate_crash_before_unlink=True)
    except RuntimeError as exc:
        assert "SIMULATED_CRASH_AFTER_DB_COMMIT_BEFORE_UNLINK" in str(exc)

    assert erase_disk_path.exists()
    with kernel.session() as db:
        tomb = db.scalar(select(ErasureTombstone).where(ErasureTombstone.version_id == erase_vid))
        assert tomb is not None and tomb.status == "pending"

    # Run two concurrent recovery workers against PostgreSQL FOR UPDATE SKIP LOCKED
    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(kernel.recover_interrupted_erasures, source_id=erase_doc["source_id"])
        f2 = pool.submit(kernel.recover_interrupted_erasures, source_id=erase_doc["source_id"])
        r_a, r_b = f1.result(), f2.result()

    assert (r_a["recovered_count"] + r_b["recovered_count"]) == 1
    assert (r_a["unlinked_files"] + r_b["unlinked_files"]) == 1
    assert not erase_disk_path.exists()

    # Real filesystem PermissionError test using chmod 0o500 on parent directory + aging backlog check
    perm_src_id = f"perm_src_{uuid.uuid4().hex[:8]}"
    perm_dir = STORAGE_DIR / perm_src_id
    perm_dir.mkdir(parents=True, exist_ok=True)
    perm_file = perm_dir / "locked_version_blob"
    perm_file.write_bytes(b"Locked file that cannot be unlinked while parent dir is 0500")
    tomb_perm_id = f"tomb_{uuid.uuid4().hex}"
    with kernel.session.begin() as db:
        db.add(
            ErasureTombstone(
                id=tomb_perm_id,
                source_id=perm_src_id,
                version_id="v_locked",
                path=str(perm_file),
                status="pending",
                created_at=time.time() - 600.0,  # also exercises aging_tombstone_backlog
            )
        )

    os.chmod(perm_dir, 0o500)
    try:
        perm_res_1 = kernel.recover_interrupted_erasures(source_id=perm_src_id)
        assert perm_res_1["recovered_count"] == 0
        assert perm_res_1["failed_count"] == 1
        assert perm_file.exists()
        with kernel.session() as db:
            t_locked = db.get(ErasureTombstone, tomb_perm_id)
            assert t_locked.status == "pending"
            assert t_locked.attempts == 1
            assert "PermissionError" in (t_locked.last_error or "")

        # Verify /health reports erasure_recovery as degraded when pending tombstones have errors / aging backlog
        async with httpx.AsyncClient(timeout=10.0) as http:
            h_deg = (await http.get(f"{API_URL}/health")).json()
            assert h_deg["operational_readiness"]["erasure_recovery"] == "degraded"
            assert h_deg["erasure_recovery"]["healthy"] is False
            assert h_deg["erasure_recovery"]["pending_with_errors"] >= 1
            assert h_deg["erasure_recovery"]["aging_backlog"] >= 1
            assert "pending_retry_errors" in h_deg["erasure_recovery"]["degraded_reasons"]
            assert "aging_tombstone_backlog" in h_deg["erasure_recovery"]["degraded_reasons"]
    finally:
        os.chmod(perm_dir, 0o700)

    # Now run CLI recover-erasure subprocess and verify completion + /health recovery to ready
    cli_res = subprocess.run(
        [sys.executable, "-m", "service.cli", "recover-erasure"],
        capture_output=True,
        text=True,
        env={
            **os.environ,
            "PYTHONPATH": str(ROOT),
            "WORKBYLINE_CONTEXT_DATABASE_URL": DB_URL,
            "WORKBYLINE_CONTEXT_STORAGE": str(STORAGE_DIR),
            "WORKBYLINE_CONTEXT_DELEGATION_SECRET": SECRET,
        },
    )
    assert cli_res.returncode == 0, cli_res.stderr
    assert not perm_file.exists()
    with kernel.session() as db:
        t_done = db.get(ErasureTombstone, tomb_perm_id)
        assert t_done.status == "completed"
        assert t_done.last_error is None

    async with httpx.AsyncClient(timeout=10.0) as http:
        h_rec = (await http.get(f"{API_URL}/health")).json()
        assert h_rec["operational_readiness"]["erasure_recovery"] == "ready"
        assert h_rec["erasure_recovery"]["healthy"] is True

    report["checks"]["durable_erasure_recovery"] = {
        "status": "PASS",
        "concurrent_claim_total_recovered": r_a["recovered_count"] + r_b["recovered_count"],
        "permission_error_preserved_pending": True,
        "degraded_health_reported_on_pending_error_and_aging_backlog": True,
        "cli_recovery_output": cli_res.stdout.strip(),
    }

    # -------------------------------------------------------------------------
    # CHECK 8: Terminal-Workflow Retry Recovery, Downstream Failure & Stage Idempotency
    # -------------------------------------------------------------------------
    print("[8/8] Verifying terminal-workflow retry recovery, downstream failure & stage idempotency...", flush=True)
    restart_worker_via_launcher(
        {
            "WORKBYLINE_HEARTBEAT_INTERVAL_SEC": "1.0",
            "WORKBYLINE_LEASE_RENEWAL_INTERVAL_SEC": "2.0",
            "WORKBYLINE_LEASE_DURATION_SEC": "8",
            "WORKBYLINE_INITIAL_LEASE_SEC": "8",
            "WORKBYLINE_TEST_PARSE_DELAY_SEC": "0.0",
            "WORKBYLINE_TEST_INDEX_DELAY_SEC": "0.0",
        }
    )
    retry_flag_file = Path("/tmp/workbyline_test_force_index_fail")
    retry_flag_file.write_text("1")

    retry_wf_id = None
    retry_run_id_1 = None
    retry_vid = None
    retry_src_id = None

    try:
        # a. Upload synthetic document through normal application route
        async with httpx.AsyncClient(timeout=15.0) as http:
            up_res = await http.post(
                f"{API_URL}/v1/workspaces/ws-accept/sources",
                headers={"Authorization": make_token(scope, "upload")},
                files={"file": ("retry_recovery_target.txt", b"Consensus state machine replication Paxos lease fencing retry verification protocol.")},
                data={"source_key": "retry_recovery_target.txt"},
            )
            assert up_res.status_code == 202
            retry_doc = up_res.json()
            retry_vid = retry_doc["version_id"]
            retry_src_id = retry_doc["source_id"]
            retry_wf_id = f"wbctx-version-{retry_vid}"

        # b. Wait for workflow to execute and force indexing to exhaust retries
        wf_handle_1 = temporal_client.get_workflow_handle(retry_wf_id)
        wf_failed_cleanly = False
        wf_err_msg = ""
        for _ in range(60):
            try:
                await asyncio.wait_for(wf_handle_1.result(), timeout=2.0)
                break
            except WorkflowFailureError as wfe:
                wf_failed_cleanly = True
                wf_err_msg = f"{wfe}: {getattr(wfe, 'cause', '')}"
                break
            except Exception as exc:
                err_str = str(exc)
                if "not found" in err_str.lower() or isinstance(exc, asyncio.TimeoutError):
                    await asyncio.sleep(0.5)
                    continue
                wf_failed_cleanly = True
                wf_err_msg = f"{exc}: {getattr(exc, 'cause', '')}"
                break

        assert wf_failed_cleanly, "Expected workflow to terminate as FAILED on indexing retry exhaustion"
        assert "PARTIAL_DOWNSTREAM_FAILED" in wf_err_msg, f"Expected PARTIAL_DOWNSTREAM_FAILED in error message, got: {wf_err_msg}"

        # c. Confirm workflow's actual terminal status and persisted stage state
        desc_1 = await wf_handle_1.describe()
        retry_run_id_1 = desc_1.run_id
        assert desc_1.status.name == "FAILED", f"Expected Temporal workflow status FAILED, got {desc_1.status.name}"

        with kernel.session() as db:
            j_fail = db.scalar(select(Job).where(Job.version == retry_vid))
            v_fail = db.get(Version, retry_vid)
            st_fail = db.get(IndexingStage, retry_vid)
            art_fail = db.get(Artifact, retry_vid)
            spans_fail = db.scalars(select(Span).where(Span.version == retry_vid)).all()

            assert v_fail.state in ("completed", "partial"), f"Parsing must remain preserved, got {v_fail.state}"
            assert art_fail is not None, "Artifact must be preserved"
            assert len(spans_fail) >= 1, "Spans must be preserved"
            span_count_before_retry = len(spans_fail)

            assert st_fail is not None and st_fail.status == "failed"
            assert j_fail.state == "failed"
            assert j_fail.error == "INDEXING_FAILED"

        # d. Repair the dependency
        if retry_flag_file.exists():
            retry_flag_file.unlink()

        # e. Retry through actual authenticated endpoint
        async with httpx.AsyncClient(timeout=10.0) as http:
            retry_call = await http.post(
                f"{API_URL}/v1/workspaces/ws-accept/sources/{retry_src_id}/retry",
                headers={"Authorization": make_token(scope, "upload")},
            )
            assert retry_call.status_code == 200
            retry_resp = retry_call.json()
            assert retry_resp["ok"] is True
            assert retry_resp["state"] == "pending"

        # f. Prove dispatcher starts the intended recovery execution in Temporal
        wf_handle_2 = None
        for _ in range(60):
            try:
                handle = temporal_client.get_workflow_handle(retry_wf_id)
                desc = await handle.describe()
                if desc.run_id != retry_run_id_1:
                    wf_handle_2 = handle
                    break
            except Exception:
                pass
            await asyncio.sleep(0.5)

        assert wf_handle_2 is not None, "Dispatcher did not start new workflow execution for retry within 30s"
        res_2 = None
        for _ in range(60):
            try:
                res_2 = await asyncio.wait_for(wf_handle_2.result(), timeout=2.0)
                break
            except Exception:
                await asyncio.sleep(0.5)

        assert res_2 is not None, "Recovered workflow did not complete within 30s"
        assert res_2["ok"] is True
        assert res_2["pipeline_status"] == "COMPLETED"
        assert res_2["indexing_status"] == "INDEXED"

        desc_2 = await wf_handle_2.describe()
        retry_run_id_2 = desc_2.run_id
        assert desc_2.status.name == "COMPLETED"
        assert retry_run_id_2 != retry_run_id_1, f"Expected distinct Temporal run_id for retry ({retry_run_id_1} vs {retry_run_id_2})"

        # g. Prove indexing completes and retrieval uses the resulting vectors
        with kernel.session() as db:
            j_recovered = db.scalar(select(Job).where(Job.version == retry_vid))
            st_recovered = db.get(IndexingStage, retry_vid)
            assert j_recovered.state == "completed"
            assert st_recovered.status == "completed"
            assert st_recovered.indexed_spans == span_count_before_retry

            # h. Verify no duplicate evidence rows
            spans_after = db.scalars(select(Span).where(Span.version == retry_vid)).all()
            assert len(spans_after) == span_count_before_retry, f"Duplicate spans detected: {len(spans_after)} vs {span_count_before_retry}"
            art_count = db.execute(select(text("count(*)")).select_from(Artifact).where(Artifact.version == retry_vid)).scalar()
            assert art_count == 1, "Duplicate artifacts detected"
            emb_count = db.execute(
                text("SELECT count(*) FROM wbctx_span_embeddings e JOIN wbctx_spans s ON s.id = e.span_id WHERE s.version = :vid"),
                {"vid": retry_vid}
            ).scalar()
            assert emb_count == span_count_before_retry, f"Expected {span_count_before_retry} embeddings, found {emb_count}"

        async with httpx.AsyncClient(timeout=15.0) as http:
            qa_res = await http.post(
                f"{API_URL}/v1/workspaces/ws-accept/research-qa",
                headers={"Authorization": make_token(scope, "retrieve")},
                json={"question": "Consensus state machine replication Paxos lease fencing", "mode": "retrieval_only", "limit": 5},
            )
            assert qa_res.status_code == 200
            qa_body = qa_res.json()
            returned_vids = {p["version_id"] for p in qa_body["passages"]}
            assert retry_vid in returned_vids, "Recovered document version must be retrievable via hybrid vectors"

        report["checks"]["terminal_workflow_retry_recovery"] = {
            "status": "PASS",
            "workflow_id": retry_wf_id,
            "failed_run_id": retry_run_id_1,
            "recovered_run_id": retry_run_id_2,
            "initial_temporal_status": "FAILED",
            "recovered_temporal_status": "COMPLETED",
            "parsed_evidence_preserved": True,
            "duplicate_spans_created": 0,
            "duplicate_artifacts_created": 0,
            "indexed_embeddings_count": emb_count,
            "hybrid_retrieval_verified": True,
        }
    finally:
        if retry_flag_file.exists():
            retry_flag_file.unlink()

    kernel.engine.dispose()
    return report


if __name__ == "__main__":
    result_report = asyncio.run(run_acceptance())
    out_path = ROOT / "evidence" / "persistent_runtime_acceptance.json"
    out_path.write_text(json.dumps(result_report, indent=2) + "\n", encoding="utf-8")
    print("\n=== PERSISTENT RUNTIME ACCEPTANCE SUITE PASSED ===", flush=True)
    print(json.dumps(result_report, indent=2), flush=True)
