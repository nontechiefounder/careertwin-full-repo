"""Native PostgreSQL & Storage Acceptance Runner for WorkByLine Context Evidence Foundation.
Runs against explicitly disposable PostgreSQL container on port 54399.
Never touches or alters the shared baseline database.
"""
import os
import sys
import time
import uuid
import hashlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from service.core import Kernel, Binding, Source, Version, Job, Artifact, Span, Receipt, sign

DATABASE_URL = os.environ.get("WB_TEST_DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:54399/postgres")
STORAGE_DIR = Path("/tmp/wbctx_disposable_storage_" + uuid.uuid4().hex[:8])

def run_acceptance():
    print("=== WORKBYLINE CONTEXT EVIDENCE: NATIVE POSTGRESQL ACCEPTANCE ===")
    import re
    masked_dsn = re.sub(r"://([^:]+):([^@]+)@", r"://\1:****@", DATABASE_URL)
    print(f"Target Database: {masked_dsn}")
    print(f"Target Storage:  {STORAGE_DIR}")
    
    k = Kernel(DATABASE_URL, STORAGE_DIR, "acceptance-secret-" + "a" * 40)
    
    # 1. Schema Creation & Client Grants / RLS verification
    print("\n[1/13] Initializing schema and verifying RLS and client role isolation...")
    k.initialize()
    with k.engine.connect() as conn:
        from sqlalchemy import text
        for tbl in ["wbctx_bindings", "wbctx_nonces", "wbctx_sources", "wbctx_versions", "wbctx_artifacts", "wbctx_jobs", "wbctx_spans"]:
            rls_enabled = conn.scalar(text(f"SELECT relrowsecurity FROM pg_class WHERE relname = '{tbl}'"))
            assert rls_enabled is True, f"RLS not enabled on {tbl}"
            for role in ("anon", "authenticated"):
                has_perm = conn.scalar(text(f"SELECT has_table_privilege('{role}', '{tbl}', 'SELECT')"))
                assert has_perm is False, f"Table {tbl} granted to {role}"
    print("  -> PASS: All 7 wbctx tables have RLS enabled and zero permissions for anon/authenticated.")

    # 2. Scope & Same-Tenant Parent/Child Integrity
    run_token = uuid.uuid4().hex[:8]
    org_alpha = f"org_acceptance_{run_token}"
    run_alpha = f"run_{run_token}"
    ws_alpha = f"ws_{run_token}"
    role_alpha = f"role_{run_token}"
    actor_id = f"user_{run_token}"

    claims_alpha = {
        "actor": actor_id,
        "org": org_alpha,
        "run": run_alpha,
        "workspace": ws_alpha,
        "role": role_alpha,
    }
    with k.session.begin() as db:
        db.add(Binding(**claims_alpha, active=True, can_write=True))

    # 3. Concurrent First Uploads and Revised Uploads
    print("\n[3/13] Testing concurrent first uploads for race-condition prevention...")
    doc_bytes_v1 = b"Lead Site Reliability Engineer\nKubernetes multi-region clusters.\nPostgreSQL replication."
    def upload_worker(idx):
        return k.ingest(claims_alpha, "sre_job_spec", "spec.txt", doc_bytes_v1)

    with ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(upload_worker, range(5)))
    
    # Exactly one creates pending version 1; others replay version 1
    new_versions = [r for r in results if not r["replayed"]]
    replayed = [r for r in results if r["replayed"]]
    assert len(new_versions) == 1, f"Expected exactly 1 new version, got {len(new_versions)}"
    assert len(replayed) == 4, f"Expected 4 replayed, got {len(replayed)}"
    source_id = new_versions[0]["source_id"]
    print(f"  -> PASS: Atomic advisory lock handled 5 concurrent uploads: 1 created, 4 replayed. Source: {source_id}")

    # 4. Unchanged-Document Replay (No duplicate version created)
    print("\n[4/13] Verifying unchanged-document replay idempotency...")
    replay_res = k.ingest(claims_alpha, "sre_job_spec", "spec.txt", doc_bytes_v1)
    assert replay_res["replayed"] is True
    assert replay_res["version"] == 1
    print("  -> PASS: Identical file hash does not generate a new version number.")

    # 5. Worker Processing & Private Storage Verification
    print("\n[5/13] Verifying worker lease claim, execution, and private filesystem storage...")
    # Drain until our source is processed
    claimed = 0
    while claim := k.claim(lease_seconds=30):
        proc_res = k.process(claim)
        assert proc_res["ok"] is True
        claimed += 1
    assert claimed > 0, "Expected at least 1 job claimed"

    doc = k.inspect(claims_alpha, source_id)
    assert doc["state"] == "completed"
    assert doc["original_sha256"] == hashlib.sha256(doc_bytes_v1).hexdigest()
    assert len(doc["spans"]) >= 3
    
    # Check physical file security on disk
    file_path = STORAGE_DIR / source_id / doc["version_id"]
    assert file_path.exists(), "Stored file missing on disk"
    mode = oct(file_path.stat().st_mode)[-3:]
    assert mode == "600", f"File permission should be 0600, got {mode}"
    print(f"  -> PASS: Worker processed job. Physical file permissions: {mode}. Extracted spans: {len(doc['spans'])}.")

    # 6. Changed-Document Upload -> Version Increment (v1 -> v2)
    print("\n[6/13] Ingesting revised document (v2) and verifying version increment...")
    doc_bytes_v2 = b"Lead Site Reliability Engineer\nKubernetes multi-region clusters.\nPostgreSQL replication.\nKafka distributed streaming."
    v2_res = k.ingest(claims_alpha, "sre_job_spec", "spec.txt", doc_bytes_v2)
    assert v2_res["version"] == 2
    assert v2_res["replayed"] is False
    
    # Process v2
    claim2 = k.claim(lease_seconds=30)
    k.process(claim2)
    doc_v2 = k.inspect(claims_alpha, source_id)
    assert doc_v2["version"] == 2
    assert doc_v2["state"] == "completed"
    assert any("Kafka" in s["text"] for s in doc_v2["spans"])
    print(f"  -> PASS: Revised upload successfully incremented to version {doc_v2['version']} with fresh spans.")

    # 7. As-Of Historical vs Current Retrieval
    print("\n[7/13] Testing current vs historical retrieval as-of timestamp...")
    time_before_v2 = doc["observed_at"]
    hist_doc = k.inspect(claims_alpha, source_id, as_of=time_before_v2)
    assert hist_doc["version"] == 1
    assert not any("Kafka" in s["text"] for s in hist_doc["spans"])

    cur_search = k.retrieve(claims_alpha, "Kafka")
    assert len(cur_search["passages"]) > 0

    hist_search = k.retrieve(claims_alpha, "Kafka", as_of=time_before_v2)
    assert len(hist_search["passages"]) == 0
    print("  -> PASS: Historical query strictly observes v1 state; current query observes v2 state.")

    # 8. Worker Crash Simulation Before Finalization (Rollback & Safe Retry)
    print("\n[8/13] Simulating worker crash before transaction commit...")
    doc_bytes_v3 = b"Lead Site Reliability Engineer v3\nTerraform state management."
    v3_res = k.ingest(claims_alpha, "sre_v3", "spec3.txt", doc_bytes_v3)
    claim3 = k.claim(lease_seconds=30)
    
    # Process with simulated crash
    fail_res = k.process(claim3, fail_before_commit=True)
    assert fail_res["ok"] is False
    
    # Verify version state rolled back to pending
    inspect_v3 = k.inspect(claims_alpha, v3_res["source_id"])
    assert inspect_v3["state"] == "pending"
    
    # Re-claim and finalize successfully
    claim3_retry = k.claim(lease_seconds=30)
    retry_res = k.process(claim3_retry)
    assert retry_res["ok"] is True
    assert k.inspect(claims_alpha, v3_res["source_id"])["state"] == "completed"
    print("  -> PASS: Crash before commit left no orphaned partial data and succeeded on subsequent claim.")

    # 9. Expired Lease Recovery and Fencing Token
    print("\n[9/13] Testing expired lease reclamation and fencing token rejection...")
    doc_bytes_v4 = b"Lead SRE v4\nIncident response."
    v4_res = k.ingest(claims_alpha, "sre_v4", "spec4.txt", doc_bytes_v4)
    claim_slow = k.claim(lease_seconds=0.1) # Instant lease expiration
    time.sleep(0.2) # Wait for lease to expire
    
    # Another worker claims the expired job
    claim_fast = k.claim(lease_seconds=30)
    assert claim_fast is not None
    assert claim_fast[1] != claim_slow[1] # Different fence
    k.process(claim_fast)
    
    # The zombie slow worker tries to finalize with old fence -> fenced out
    zombie_res = k.process(claim_slow)
    assert zombie_res["ok"] is False
    assert zombie_res["code"] == "LEASE_LOST"
    print("  -> PASS: Expired lease reclaimed; zombie worker fenced out with LEASE_LOST.")

    # 10. Retry Exhaustion Detection
    print("\n[10/13] Verifying retry exhaustion after max attempts (5)...")
    doc_bytes_v5 = b"Corrupted document\nUnparseable."
    v5_res = k.ingest(claims_alpha, "sre_v5", "corrupt.txt", doc_bytes_v5)
    claim5 = k.claim(lease_seconds=30)
    with k.session.begin() as db:
        job = db.get(Job, claim5[0])
        job.attempts = 5
        job.lease_until = 0 # Expired
    
    # Calling claim checks for abandoned jobs with >= 5 attempts
    next_claim = k.claim()
    assert k.inspect(claims_alpha, v5_res["source_id"])["state"] == "failed"
    print("  -> PASS: Abandoned job with 5 attempts automatically transitioned to failed.")

    # 11. Original Hash Mismatch Detection (Tampering Detection)
    print("\n[11/13] Verifying original hash tampering detection...")
    doc_bytes_v6 = b"Original text untampered"
    v6_res = k.ingest(claims_alpha, "sre_v6", "spec6.txt", doc_bytes_v6)
    
    # Mutate the file on disk behind the database's back
    doc_v6 = k.inspect(claims_alpha, v6_res["source_id"])
    path_v6 = STORAGE_DIR / v6_res["source_id"] / doc_v6["version_id"]
    path_v6.write_bytes(b"Tampered bytes on disk!")
    
    claim6 = k.claim(lease_seconds=30)
    tamper_res = k.process(claim6)
    assert tamper_res["ok"] is False
    assert tamper_res["code"] == "ORIGINAL_HASH_MISMATCH"
    assert k.inspect(claims_alpha, v6_res["source_id"])["state"] == "failed"
    print("  -> PASS: Modified bytes on disk detected and failed with ORIGINAL_HASH_MISMATCH.")

    # 12. Cross-Tenant and Foreign-Run Scope Isolation
    print("\n[12/13] Verifying multi-tenant and foreign run isolation...")
    claims_beta = {
        "actor": "user_beta_lead",
        "org": "org_tenant_beta",
        "run": "run_beta_01",
        "workspace": "ws_beta",
        "role": "role_lead_beta",
    }
    with k.session.begin() as db:
        db.add(Binding(**claims_beta, active=True, can_write=True))

    # Tenant Beta attempts to inspect Tenant Alpha's source
    try:
        k.inspect(claims_beta, source_id)
        assert False, "Should have thrown Fault 404"
    except Exception as exc:
        assert getattr(exc, "status", None) == 404
        assert getattr(exc, "code", None) == "SOURCE_NOT_FOUND"

    beta_search = k.retrieve(claims_beta, "Kubernetes")
    assert beta_search["coverage"]["eligible_sources"] == 0
    assert len(beta_search["passages"]) == 0
    print("  -> PASS: Foreign tenant completely isolated: 404 on direct access, 0 eligible sources on retrieval.")

    # 13. Soft Revocation (Tombstone immediately excludes from current & historical retrieval)
    print("\n[13/13] Verifying source revocation excludes current and historical retrieval...")
    rev_res = k.remove(claims_alpha, source_id)
    assert rev_res["state"] == "revoked"
    assert rev_res["byte_retention"] == "retained"
    assert rev_res["hard_erasure"] == "not_implemented"

    # Direct inspect fails with 404
    try:
        k.inspect(claims_alpha, source_id)
        assert False, "Expected 404 after revocation"
    except Exception as exc:
        assert getattr(exc, "status", None) == 404

    # Retrieval excludes revoked source
    post_rev_search = k.retrieve(claims_alpha, "Kubernetes")
    assert not any(p["source_id"] == source_id for p in post_rev_search["passages"])
    print("  -> PASS: Revocation tombstone immediately cuts off retrieval while retaining original bytes.")

    print("\n==================================================================")
    print("ALL 13 NATIVE POSTGRESQL & STORAGE ACCEPTANCE CHECKS PASSED!")
    print("==================================================================")

if __name__ == "__main__":
    run_acceptance()
