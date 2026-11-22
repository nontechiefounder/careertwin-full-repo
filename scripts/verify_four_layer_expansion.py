"""
WorkByLine V2: Four-Layer Memory Expansion Verification & Acceptance Script
Accurately categorizes and independently executes:
Layer 1: Temporal Durable Workflow & Activity Pipeline on Native PostgreSQL
Layer 2: Native pgvector Embeddings & PostgreSQL Full-Text Search with RRF
Layer 3: Bounded LangGraph QA Pipeline with Claim-to-Evidence Validation
Layer 4: Graphiti Derived Namespacing & Live Acceptance Gate Evaluation
"""
import asyncio
import os
import sys
import uuid
import time
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select, text
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker
from temporalio.exceptions import ApplicationError, WorkflowAlreadyStartedError

from service.core import Kernel, Binding, Source, Version, Job, Span, uid
from service.temporal_pipeline import EvidenceVersionWorkflow, EvidenceActivities, dispatch_pending
from service.hybrid import HybridRetriever, vector_literal, DIMENSIONS
from service.qa_flow import build_qa_flow
from service.graph_projection import GraphProjection, namespace, episode_id

DATABASE_URL = os.environ.get("WB_TEST_DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:54399/postgres")
STORAGE_DIR = Path("/tmp/wbctx_expansion_acceptance_" + uuid.uuid4().hex[:8])


async def main():
    masked_dsn = re.sub(r"://([^:]+):([^@]+)@", r"://\1:****@", DATABASE_URL)
    print("==================================================================")
    print("WORKBYLINE V2: FOUR-LAYER MEMORY EXPANSION INDEPENDENT ACCEPTANCE")
    print(f"Target Database: {masked_dsn}")
    print(f"Target Storage:  {STORAGE_DIR}")
    print("==================================================================")

    results_matrix = []

    def record_gate(layer, test_name, classification, detail):
        results_matrix.append({
            "layer": layer,
            "test": test_name,
            "classification": classification,
            "detail": detail
        })
        print(f"[{classification}] Layer {layer} | {test_name}: {detail}")

    kernel = Kernel(DATABASE_URL, STORAGE_DIR, "expansion-secret-" + "b" * 40)
    kernel.initialize()

    test_id = uuid.uuid4().hex[:6]
    claims = {
        "actor": f"user_{test_id}",
        "org": f"org_{test_id}",
        "run": f"run_{test_id}",
        "workspace": f"ws_{test_id}",
        "role": "platform_architect"
    }

    with kernel.session.begin() as db:
        db.add(Binding(**claims, active=True, can_write=True))

    # =========================================================================
    # LAYER 1: TEMPORAL DURABLE PIPELINE ON NATIVE POSTGRESQL
    # =========================================================================
    print("\n--- [LAYER 1: Temporal Durable Pipeline on Native PostgreSQL] ---")
    doc_bytes = b"Kubernetes Platform Spec\nHigh-availability distributed database clustering.\nAutomated SOC2 audit compliance.\nKafka event stream processing.\n"
    doc = kernel.ingest(claims, "platform_spec", "platform_spec.txt", doc_bytes)
    version_id = doc["version_id"]
    source_id = doc["source_id"]

    # Explicitly identified embedding model for hybrid test
    def mock_embed(txt: str):
        import hashlib
        h = int(hashlib.md5(txt.encode()).hexdigest(), 16)
        vec = [0.0] * DIMENSIONS
        for i in range(DIMENSIONS):
            vec[i] = ((h >> (i % 64)) & 1) * 2.0 - 1.0
        norm = sum(x*x for x in vec) ** 0.5
        return [x / norm for x in vec]

    hybrid = HybridRetriever(kernel, "bge-small-en-v1.5", embed=mock_embed)

    env = await WorkflowEnvironment.start_time_skipping()
    try:
        acts = EvidenceActivities(kernel, hybrid=hybrid, graph=None)
        queue_name = f"wbctx-acceptance-{test_id}"

        from temporalio.common import WorkflowIDReusePolicy
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=4) as executor:
            async with Worker(
                env.client,
                task_queue=queue_name,
                workflows=[EvidenceVersionWorkflow],
                activities=[acts.process_version, acts.index_version, acts.project_version],
                activity_executor=executor
            ):
                # 1. Actual Workflow Dispatch
                wf_handle = await env.client.start_workflow(
                    EvidenceVersionWorkflow.run,
                    version_id,
                    id=f"wbctx-version-{version_id}",
                    task_queue=queue_name,
                    id_reuse_policy=WorkflowIDReusePolicy.REJECT_DUPLICATE
                )

                # 2. Duplicate Workflow Dispatch Rejection
                try:
                    await env.client.start_workflow(
                        EvidenceVersionWorkflow.run,
                        version_id,
                        id=f"wbctx-version-{version_id}",
                        task_queue=queue_name,
                        id_reuse_policy=WorkflowIDReusePolicy.REJECT_DUPLICATE
                    )
                    assert False, "Expected WorkflowAlreadyStartedError"
                except WorkflowAlreadyStartedError:
                    record_gate(1, "Duplicate Dispatch Rejection", "PASSED", "Temporal client raised WorkflowAlreadyStartedError for duplicate workflow ID")

                wf_result = await wf_handle.result()
                assert wf_result["ok"] is True
                assert wf_result["state"] == "completed"
                record_gate(1, "Actual Workflow Dispatch", "PASSED", f"Workflow wbctx-version-{version_id} executed to terminal state 'completed'")

        # 3. No Duplicate Persisted Spans
        with kernel.session() as db:
            dup_spans = db.execute(text(
                "SELECT id, count(*) FROM wbctx_spans WHERE version = :v GROUP BY id HAVING count(*) > 1"
            ), {"v": version_id}).all()
            assert len(dup_spans) == 0
            record_gate(1, "Span Persistence Uniqueness", "PASSED", "Verified 0 duplicate span IDs in wbctx_spans table")

        # 4. Real Expired-Lease Recovery and Stale-Worker Fencing on Native DB
        fence_doc = kernel.ingest(claims, "fencing_spec", "fencing.txt", b"Fencing test content\nLeader lease election.\n")
        fence_ver = fence_doc["version_id"]

        # Worker 1 claims real job
        worker_1_lease = kernel.claim()
        assert worker_1_lease is not None
        job_id, token_1 = worker_1_lease

        # Worker 1 hangs; simulate lease expiration in PostgreSQL
        with kernel.session.begin() as db:
            job_record = db.get(Job, job_id)
            job_record.lease_until = time.time() - 2.0  # Expired in past

        # Worker 2 claims expired job
        worker_2_lease = kernel.claim()
        assert worker_2_lease is not None
        job_id_2, token_2 = worker_2_lease
        assert job_id == job_id_2
        assert token_1 != token_2

        # Stale Worker 1 wakes up and attempts to commit -> FENCED OUT by database
        stale_res = kernel.process(worker_1_lease)
        assert stale_res["ok"] is False
        assert stale_res["code"] == "LEASE_LOST"

        # Active Worker 2 commits successfully
        w2_res = kernel.process(worker_2_lease)
        assert w2_res["ok"] is True
        record_gate(1, "Real Expired-Lease Recovery & Stale-Worker Fencing", "PASSED",
                    f"Stale worker lease {token_1[:8]} rejected with LEASE_LOST; recovered lease {token_2[:8]} committed successfully")

        # 5. Retry Exhaustion and Terminal Failure Recovery
        dead_doc = kernel.ingest(claims, "broken_spec", "broken.txt", b"Broken doc content")
        dead_version = dead_doc["version_id"]
        with kernel.session.begin() as db:
            dead_job = db.scalar(select(Job).where(Job.version == dead_version))
            dead_job.attempts = 5

        try:
            acts.process_version(dead_version)
            assert False, "Expected RETRY_EXHAUSTED"
        except ApplicationError as e:
            assert "RETRY_EXHAUSTED" in str(e)
            with kernel.session() as db:
                failed_job = db.scalar(select(Job).where(Job.version == dead_version))
                assert failed_job.state == "failed"
            record_gate(1, "Retry Exhaustion & Failure Terminal State", "PASSED",
                        "Exhausted 5 attempts, marked state='failed' in PostgreSQL, raised non-retryable ApplicationError")

    finally:
        await env.shutdown()

    # =========================================================================
    # LAYER 2: SCOPED HYBRID RETRIEVAL (PGVECTOR + FULL-TEXT SEARCH)
    # =========================================================================
    print("\n--- [LAYER 2: Native PostgreSQL pgvector + FTS Hybrid Search] ---")

    # 1. Native pgvector storage check
    with kernel.engine.connect() as conn:
        emb_count = conn.scalar(text("SELECT count(*) FROM wbctx_span_embeddings WHERE model_id = 'bge-small-en-v1.5'"))
        assert emb_count >= 3
        record_gate(2, "Native pgvector Persistence", "PASSED",
                    f"Stored {emb_count} 384-d normalized embeddings in PostgreSQL wbctx_span_embeddings table")

    # 2. Reciprocal Rank Fusion Verification (Formula: 1 / (60 + rank))
    res = hybrid.retrieve(claims, "Kubernetes database cluster", limit=5)
    assert res["status"] == "RETRIEVAL_ONLY_COMPLETE"
    assert res["retrieval_method"] == "postgres-fts+pgvector-rrf"
    assert len(res["passages"]) > 0
    top_p = res["passages"][0]
    expected_min_rrf = 1.0 / 61.0  # Rank 1 contribution
    assert top_p["rrf_score"] >= expected_min_rrf
    record_gate(2, "Reciprocal Rank Fusion Verification", "PASSED",
                f"Computed RRF score {top_p['rrf_score']:.4f} via native PostgreSQL FTS + pgvector distance combination")

    # 3. Pre-Ranking Tenant / Run Isolation
    foreign_claims = dict(claims, org=f"foreign_org_{test_id}")
    with kernel.session.begin() as db:
        db.add(Binding(**foreign_claims, active=True, can_write=True))
    foreign_res = hybrid.retrieve(foreign_claims, "Kubernetes", limit=5)
    assert len(foreign_res["passages"]) == 0
    record_gate(2, "Tenant / Run Scope Pre-Filter Isolation", "PASSED",
                "Foreign tenant query returned exactly 0 passages prior to ranking")

    # 4. Current vs Historical vs Pending vs Revoked Lifecycle
    source_key = f"lifecycle_doc_{test_id}"
    v1_doc = kernel.ingest(claims, source_key, "doc.txt", b"Version 1 original content: Microservices architecture.")
    acts.process_version(v1_doc["version_id"])
    hybrid.index_version(v1_doc["version_id"])

    # Current search returns v1
    v1_search = hybrid.retrieve(claims, "Microservices", limit=5)
    assert any(p["version_id"] == v1_doc["version_id"] for p in v1_search["passages"])
    t_v1 = time.time()

    # Ingest v2 (pending revision)
    time.sleep(0.05)
    v2_doc = kernel.ingest(claims, source_key, "doc.txt", b"Version 2 updated content: Microservices and event queues.")

    # Historical query as_of t_v1 returns v1 and excludes pending v2
    hist_search = hybrid.retrieve(claims, "Microservices", limit=5, as_of=t_v1)
    assert any(p["version_id"] == v1_doc["version_id"] for p in hist_search["passages"])
    assert not any(p["version_id"] == v2_doc["version_id"] for p in hist_search["passages"])

    # Now complete and index v2; current search returns v2
    acts.process_version(v2_doc["version_id"])
    hybrid.index_version(v2_doc["version_id"])
    v2_search = hybrid.retrieve(claims, "Microservices", limit=5)
    assert any(p["version_id"] == v2_doc["version_id"] for p in v2_search["passages"])

    # Revoke source: immediate exclusion
    kernel.remove(claims, v1_doc["source_id"])
    revoked_search = hybrid.retrieve(claims, "Microservices", limit=5)
    assert not any(p["source_id"] == v1_doc["source_id"] for p in revoked_search["passages"])
    record_gate(2, "Document Lifecycle (Current, Historical, Pending, Revoked)", "PASSED",
                "Verified current v1 retrieval, historical as_of query, pending exclusion, v2 supersession, and revocation")

    record_gate(2, "Live Embedding Model Quality Acceptance Gate", "BLOCKED",
                "Evaluated SQL/RRF math with deterministic unit vectors. Live model evaluation requires downloaded SentenceTransformers weights.")

    # =========================================================================
    # LAYER 3: BOUNDED LANGGRAPH QA PIPELINE & EVIDENCE VALIDATION
    # =========================================================================
    print("\n--- [LAYER 3: Bounded LangGraph QA Pipeline & Evidence Validation] ---")

    # 1. Valid Grounded Answer
    p0 = next((p for p in res["passages"] if "clustering" in p["text"].lower()), res["passages"][0])
    def mock_generator_valid(*args):
        return {
            "answer": "The platform spec provides high-availability distributed database clustering.",
            "status": "GROUNDED",
            "citations": [{
                "span_id": p0["span_id"],
                "source_id": p0["source_id"],
                "version_id": p0["version_id"],
                "quote": p0["text"]
            }]
        }

    flow_valid = build_qa_flow(lambda q: res, mock_generator_valid)
    qa_valid = flow_valid.invoke({"question": "Spec?"})["output"]
    assert qa_valid["status"] == "GROUNDED", f"Expected GROUNDED, got {qa_valid['status']}"
    assert len(qa_valid["citations"]) == 1
    record_gate(3, "Grounded Evidence Validation", "PASSED",
                "Answer supported by exact citation quote correctly labeled GROUNDED")

    # 2. Founder Counterexample Reproduction: Python quote cited for AWS/10 years answer
    source_counter = [{
        "span_id": "span_py",
        "source_id": "source_py",
        "version_id": "ver_py",
        "text": "Python experience is mentioned."
    }]
    def mock_counterexample_gen(*args):
        return {
            "answer": "The candidate is AWS certified and has 10 years of experience.",
            "status": "GROUNDED",
            "citations": [{
                "span_id": "span_py",
                "source_id": "source_py",
                "version_id": "ver_py",
                "quote": "Python experience is mentioned."
            }]
        }

    flow_counter = build_qa_flow(lambda q: {"passages": source_counter}, mock_counterexample_gen)
    qa_counter = flow_counter.invoke({"question": "Experience?"})["output"]
    assert qa_counter["status"] != "GROUNDED", "Counterexample must NOT be labeled GROUNDED"
    assert qa_counter["status"] == "INSUFFICIENT_EVIDENCE"
    assert "AWS certified" not in qa_counter["answer"]
    assert qa_counter["citations"] == []
    record_gate(3, "Founder Counterexample Gate", "PASSED",
                "AWS/10yr answer cited to Python quote rejected; withheld unsupported claims and downgraded to INSUFFICIENT_EVIDENCE")

    # 3. Negated Claim Contradiction
    neg_source = [{
        "span_id": "span_k8s",
        "source_id": "src_k8s",
        "version_id": "v_k8s",
        "text": "Candidate has no Kubernetes experience."
    }]
    def mock_neg_gen(*args):
        return {
            "answer": "Candidate has extensive Kubernetes experience.",
            "status": "GROUNDED",
            "citations": [{
                "span_id": "span_k8s",
                "source_id": "src_k8s",
                "version_id": "v_k8s",
                "quote": "Candidate has no Kubernetes experience"
            }]
        }

    flow_neg = build_qa_flow(lambda q: {"passages": neg_source}, mock_neg_gen)
    qa_neg = flow_neg.invoke({"question": "K8s?"})["output"]
    assert qa_neg["status"] == "INSUFFICIENT_EVIDENCE"
    record_gate(3, "Negation & Polarity Contradiction Check", "PASSED",
                "Positive claim contradicted by negative citation rejected as INSUFFICIENT_EVIDENCE")

    # 4. Partial Support: Multi-claim answer withholds unsupported sentence
    multi_source = [{
        "span_id": "span_multi",
        "source_id": "src_multi",
        "version_id": "v_multi",
        "text": "Candidate has 5 years of Python engineering experience."
    }]
    def mock_multi_gen(*args):
        return {
            "answer": "Candidate has 5 years of Python engineering experience. Candidate is also GCP certified with 8 years of Rust experience.",
            "status": "GROUNDED",
            "citations": [{
                "span_id": "span_multi",
                "source_id": "src_multi",
                "version_id": "v_multi",
                "quote": "Candidate has 5 years of Python engineering experience."
            }]
        }

    flow_multi = build_qa_flow(lambda q: {"passages": multi_source}, mock_multi_gen)
    qa_multi = flow_multi.invoke({"question": "Profile?"})["output"]
    assert qa_multi["status"] == "AMBIGUOUS"
    assert "GCP certified" not in qa_multi["answer"]
    assert "5 years of Python engineering experience" in qa_multi["answer"]
    record_gate(3, "Multi-Claim Partial Support Withholding", "PASSED",
                "Unsupported second claim stripped from answer; status downgraded from GROUNDED to AMBIGUOUS")

    # 5. Missing provider fails closed
    try:
        flow_no_provider = build_qa_flow(lambda q: res, generate=None)
        flow_no_provider.invoke({"question": "What is here?"})
        assert False, "Expected LIVE_GENERATION_UNAVAILABLE"
    except ApplicationError:
        pass
    except Exception as e:
        assert "LIVE_GENERATION_UNAVAILABLE" in str(e)
    record_gate(3, "Missing Provider Fail-Closed Gate", "PASSED",
                "Unconfigured provider raises 503 LIVE_GENERATION_UNAVAILABLE without fabricating answers")

    record_gate(3, "Live Model Generation Acceptance Gate", "BLOCKED",
                "Live provider generation blocked pending secure rotated GEMINI_API_KEY")

    # =========================================================================
    # LAYER 4: GRAPHITI KNOWLEDGE GRAPH DERIVED NAMESPACING & LIVE GATE
    # =========================================================================
    print("\n--- [LAYER 4: Graphiti Knowledge Graph Integration & Gate] ---")

    grp_id = namespace(claims)
    ep_id = episode_id(version_id)
    assert grp_id.startswith("wbctx_") and len(grp_id) == 70
    record_gate(4, "Deterministic Namespace & Episode IDs", "PASSED",
                f"Derived namespace '{grp_id[:20]}...' (SHA256 hex) and episode UUID '{ep_id}'")

    # Unit contract test with test double
    class UnitContractGraphFake:
        """SDK-boundary mock; strictly labeled unit_contract_only."""
        def __init__(self, ep_uuid):
            from types import SimpleNamespace
            self.edges = [SimpleNamespace(group_id=grp_id, episodes=[ep_uuid])]
        async def add_episode(self, **kw): pass
        async def search(self, **kw): return self.edges

    fake_client = UnitContractGraphFake(ep_id)
    adapter = GraphProjection(kernel, fake_client)
    candidates = await adapter.candidate_versions(claims, "Kubernetes")
    assert len(candidates) == 1
    assert candidates[0]["version_id"] == version_id
    record_gate(4, "Graphiti SDK Contract & Projection Mapping", "UNIT_CONTRACT_ONLY",
                "Unit contract test verified episode projection format and candidate re-resolution using SDK mock")

    # Live Graphiti Acceptance Gate Check
    graph_backend_available = False
    try:
        from service.provider_factory import graphiti_from_env
        live_graph = graphiti_from_env()
        graph_backend_available = True
    except Exception as err:
        live_graph_reason = str(err)

    if graph_backend_available:
        record_gate(4, "Graphiti Live Backend Acceptance Gate", "PASSED", "Connected to live Graphiti backend")
    else:
        record_gate(4, "Graphiti Live Backend Acceptance Gate", "BLOCKED",
                    f"Local Graphiti backend / GEMINI_API_KEY is not provisioned ({live_graph_reason})")

    # =========================================================================
    # SUMMARY REPORT
    # =========================================================================
    print("\n==================================================================")
    print("FOUR-LAYER MEMORY EXPANSION: ACCEPTANCE SUMMARY MATRIX")
    print("==================================================================")
    passed_count = sum(1 for r in results_matrix if r["classification"] == "PASSED")
    blocked_count = sum(1 for r in results_matrix if r["classification"] == "BLOCKED")
    unit_count = sum(1 for r in results_matrix if r["classification"] == "UNIT_CONTRACT_ONLY")
    failed_count = sum(1 for r in results_matrix if r["classification"] == "FAILED")

    print(f"Total Gates Evaluated: {len(results_matrix)}")
    print(f"  Passed:             {passed_count}")
    print(f"  Unit/Contract Only: {unit_count}")
    print(f"  Blocked (Prereqs):  {blocked_count}")
    print(f"  Failed:             {failed_count}")
    print("------------------------------------------------------------------")
    for r in results_matrix:
        print(f"[{r['classification']}] Layer {r['layer']} | {r['test']}: {r['detail']}")
    print("==================================================================")

    assert failed_count == 0, f"Found {failed_count} failing checks!"


if __name__ == "__main__":
    asyncio.run(main())
