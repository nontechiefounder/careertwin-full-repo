import io
import zipfile

from fastapi.testclient import TestClient

from service.api import create_app
from service.core import Binding, Fault, Job, Kernel, decode_token, parse_original, sign
import pytest
from tests.test_foundation import claims, drain, headers, kernel, put


def test_same_org_different_run_cannot_inspect_or_retrieve(kernel):
    k = kernel
    with k.session.begin() as db:
        db.add(Binding(actor='actor', org=k.test_org, run='run-b', workspace='ws-a', role='role-b', active=True, can_write=True))
    with TestClient(create_app(k)) as client:
        obj = put(client, k).json()
        drain(k)
        h = headers(k, run='run-b', role='role-b')
        assert client.get(f"/v1/workspaces/ws-a/sources/{obj['source_id']}", headers=h).status_code == 404
        r = client.post('/v1/workspaces/ws-a/research-qa', headers=headers(k, 'retrieve', run='run-b', role='role-b'), json={'question':'Python'})
        assert r.status_code == 200 and r.json()['passages'] == []


def test_read_only_binding_cannot_upload(kernel):
    k = kernel
    with k.session.begin() as db:
        db.get(Binding, k.binding_id).can_write = False
    with TestClient(create_app(k)) as client:
        assert put(client, k).status_code == 403


def test_retry_exhaustion_of_abandoned_job_is_visible(kernel):
    k = kernel
    with TestClient(create_app(k)) as client:
        obj = put(client, k).json()
        claim = k.claim()
        with k.session.begin() as db:
            job = db.get(Job, claim[0])
            job.attempts, job.lease_until = 5, 0
        assert k.claim() is None
        assert k.inspect(k.test_claims, obj['source_id'])['state'] == 'failed'


def test_docx_body_is_truthful_and_limitations_explicit():
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as z:
        z.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Python</w:t></w:r></w:p><w:p><w:r><w:t>No sponsorship</w:t></w:r></w:p></w:body></w:document>')
    parsed = parse_original(stream.getvalue(), 'test.docx')
    assert [s['text'] for s in parsed['spans']] == ['Python', 'No sponsorship']
    assert parsed['exceptions'] and parsed['pages_total'] is None


def test_signed_invalid_operation_does_not_read(kernel):
    with TestClient(create_app(kernel)) as client:
        assert client.get('/v1/workspaces/ws-a/sources', headers=headers(kernel, 'upload')).status_code == 403


def test_auth_required_and_listed_scope(kernel):
    with TestClient(create_app(kernel)) as client:
        assert client.get('/v1/workspaces/ws-a/sources').status_code == 401
        put(client, kernel)
        result = client.get('/v1/workspaces/ws-a/sources', headers=headers(kernel))
        assert result.status_code == 200 and len(result.json()['sources']) == 1


@pytest.mark.parametrize('payload',[[],['bad'],'invalid',123,None])
def test_signed_non_object_payload_rejected(kernel,payload):
    with pytest.raises(Fault,match='INVALID_DELEGATION'):
        decode_token(sign(payload,kernel.secret),kernel.secret)


def test_storage_reconciliation_detects_and_prunes_orphans(kernel):
    k = kernel
    # Ingest a valid document
    res = k.ingest(k.test_claims, 'key_recon', 'test.txt', b'Valid document content')
    
    # Injected orphan file in storage
    orphan_dir = k.storage / 'orphaned_source_id'
    orphan_dir.mkdir(parents=True, exist_ok=True)
    orphan_file = orphan_dir / 'orphan_version_file'
    orphan_file.write_bytes(b'Orphaned uncommitted bytes from interrupted upload')

    # Dry run audit detects orphan without deleting
    report_dry = k.reconcile_storage(dry_run=True)
    assert len(report_dry['orphaned_files']) == 1
    assert str(orphan_file) in report_dry['orphaned_files']
    assert orphan_file.exists()

    # Reconcile with dry_run=False prunes orphan
    report_prune = k.reconcile_storage(dry_run=False)
    assert report_prune['reconciled_orphans_pruned'] == 1
    assert not orphan_file.exists()


def test_storage_reconciliation_detects_hash_mismatch(kernel):
    k = kernel
    res = k.ingest(k.test_claims, 'key_tamper', 'tamper.txt', b'Original pristine text')
    
    # Intentionally tamper the file on disk
    from pathlib import Path
    with k.session() as db:
        from service.core import Version
        ver = db.get(Version, res['version_id'])
        Path(ver.path).write_bytes(b'Tampered bytes on disk')

    report = k.reconcile_storage(dry_run=True)
    assert len(report['hash_mismatches']) == 1
    assert report['hash_mismatches'][0]['version_id'] == res['version_id']


def test_hard_erase_purges_rows_and_disk_bytes(kernel):
    k = kernel
    res = k.ingest(k.test_claims, 'key_erase', 'erase.txt', b'Content to be erased permanently')
    k.process(k.claim())
    
    from pathlib import Path
    with k.session() as db:
        from service.core import Version
        ver = db.get(Version, res['version_id'])
        disk_path = Path(ver.path)
    assert disk_path.exists()

    # Hard erase source
    erase_report = k.hard_erase(k.test_claims, res['source_id'])
    assert erase_report['state'] == 'hard_erased'
    assert erase_report['byte_retention'] == 'purged'
    assert not disk_path.exists()

    # Verify DB rows are gone
    with pytest.raises(Fault, match='SOURCE_NOT_FOUND'):
        k.inspect(k.test_claims, res['source_id'])


def test_interrupted_upload_recovery_and_reconciliation(kernel):
    """
    Test recovery when an upload is interrupted after file write but before DB commit.
    Storage reconciliation detects and cleans the orphaned file, allowing clean retry.
    """
    k = kernel
    # Simulate an interrupted upload: disk file written but DB transaction rolled back
    interrupted_path = k.storage / 'partial_upload_source' / 'partial_ver'
    interrupted_path.parent.mkdir(parents=True, exist_ok=True)
    interrupted_path.write_bytes(b'Interrupted partial payload')
    assert interrupted_path.exists()

    # Audit detects the uncommitted orphan
    audit = k.reconcile_storage(dry_run=True)
    assert str(interrupted_path) in audit['orphaned_files']

    # Prune orphans
    k.reconcile_storage(dry_run=False)
    assert not interrupted_path.exists()

    # Retry upload succeeds cleanly
    clean_doc = k.ingest(k.test_claims, 'clean_retry_key', 'retry.txt', b'Clean payload after recovery')
    assert clean_doc['version'] == 1
    assert clean_doc['state'] == 'pending'
    k.process(k.claim())
    assert k.inspect(k.test_claims, clean_doc['source_id'])['state'] == 'completed'


def test_hard_erase_interaction_with_retrieval_and_reconciliation(kernel):
    """
    Test that hard erasure purges live storage, removes database records,
    and immediately excludes the document from search retrieval.
    """
    k = kernel
    doc = k.ingest(k.test_claims, 'erase_indexing_key', 'searchable.txt', b'UniqueDistributedConsensusEngineKeyword')
    k.process(k.claim())

    # Pre-erasure: retrieval finds document
    pre_results = k.retrieve(k.test_claims, 'UniqueDistributedConsensusEngineKeyword')
    assert len(pre_results['passages']) >= 1

    # Hard erase
    report = k.hard_erase(k.test_claims, doc['source_id'])
    assert report['state'] == 'hard_erased'
    assert report['byte_retention'] == 'purged'

    # Post-erasure: retrieval immediately excludes the document
    post_results = k.retrieve(k.test_claims, 'UniqueDistributedConsensusEngineKeyword')
    assert len(post_results['passages']) == 0

    # Storage reconciliation finds zero orphans and zero missing files
    recon = k.reconcile_storage(dry_run=True)
    assert len(recon['orphaned_files']) == 0
    assert len(recon['missing_files']) == 0


def test_interrupted_erasure_tombstone_recovery(kernel):
    """
    Test that crash between database changes and disk file deletion
    is tracked via durable tombstones and completed by recover_interrupted_erasures().
    """
    from service.core import ErasureTombstone
    from pathlib import Path
    import time
    k = kernel
    doc = k.ingest(k.test_claims, 'interrupted_erase_key', 'crash_test.txt', b'Payload for interrupted erasure')
    k.process(k.claim())

    # Get file path
    doc_inspect = k.inspect(k.test_claims, doc['source_id'])
    v_id = doc_inspect['version_id']

    # Simulate an interrupted hard erasure: tombstone written, file remains on disk
    fake_orphan = k.storage / "orphaned_crash_source" / "crash_v1"
    fake_orphan.parent.mkdir(parents=True, exist_ok=True)
    fake_orphan.write_bytes(b'Orphaned payload after simulated crash')
    assert fake_orphan.exists()

    with k.session.begin() as db:
        db.add(ErasureTombstone(
            source_id="orphaned_crash_source",
            version_id="crash_v1",
            path=str(fake_orphan),
            status="pending",
            created_at=time.time()
        ))

    # Recovery scans tombstones, unlinks the leftover file, and marks tombstone completed
    res = k.recover_interrupted_erasures()
    assert res['recovered_count'] >= 1
    assert not fake_orphan.exists()

    with k.session() as db:
        from sqlalchemy import select
        pending = db.scalars(select(ErasureTombstone).where(ErasureTombstone.status == "pending")).all()
        assert len(pending) == 0


def test_same_filename_creates_distinct_sources_unless_target_source_id_supplied(kernel):
    """Verifies document identity boundary:
    Uploading two files with the identical filename creates two distinct sources with
    unique identities and non-colliding keys. Only explicit target_source_id creates a revision.
    """
    k = kernel
    # 1. First upload of resume.pdf
    doc1 = k.ingest(k.test_claims, "", "resume.pdf", b"Candidate Alpha resume")
    assert doc1["version"] == 1

    # 2. Second upload of resume.pdf without target_source_id
    doc2 = k.ingest(k.test_claims, "", "resume.pdf", b"Candidate Beta resume")
    assert doc2["version"] == 1
    assert doc2["source_id"] != doc1["source_id"]

    # Check inspection of both
    s1 = k.inspect(k.test_claims, doc1["source_id"])
    s2 = k.inspect(k.test_claims, doc2["source_id"])
    assert s1["source_id"] != s2["source_id"]
    assert s1["source_key"] != s2["source_key"]
    assert "resume.pdf" in s1["source_key"]
    assert "resume.pdf" in s2["source_key"]

    # 3. Explicit revision using target_source_id
    rev = k.ingest(k.test_claims, "", "resume.pdf", b"Candidate Alpha updated", target_source_id=doc1["source_id"])
    assert rev["source_id"] == doc1["source_id"]
    assert rev["version"] == 2


def test_interrupted_erasure_skips_path_outside_storage(kernel, tmp_path):
    """Verifies that recover_interrupted_erasures refuses to unlink any path outside storage
    and marks the tombstone 'failed' (never 'completed')."""
    from service.core import ErasureTombstone
    from sqlalchemy import select
    import time
    k = kernel
    outside_file = tmp_path / "outside_secret.txt"
    outside_file.write_bytes(b"Do not delete this outside file")
    assert outside_file.exists()

    with k.session.begin() as db:
        db.add(ErasureTombstone(
            source_id="malicious_outside_source",
            version_id="outside_v1",
            path=str(outside_file),
            status="pending",
            created_at=time.time()
        ))

    res = k.recover_interrupted_erasures()
    # The outside file MUST NOT be unlinked and tombstone MUST be marked failed
    assert outside_file.exists()
    assert res["recovered_count"] == 0
    assert res["failed_count"] >= 1
    with k.session() as db:
        t = db.scalar(select(ErasureTombstone).where(ErasureTombstone.source_id == "malicious_outside_source"))
        assert t.status == "failed"
        assert t.last_error == "PATH_OUTSIDE_STORAGE_ROOT"

    # Clean up test tombstone after verifying failure status
    with k.session.begin() as db:
        from sqlalchemy import delete
        db.execute(delete(ErasureTombstone).where(ErasureTombstone.source_id == "malicious_outside_source"))


def test_erasure_recovery_permission_error_never_marks_completed(kernel, monkeypatch):
    """Verifies that if unlink raises PermissionError/OSError, tombstone is NEVER marked completed,
    records sanitized error, and completes once the error is resolved."""
    from service.core import ErasureTombstone
    from pathlib import Path
    import time
    import uuid

    k = kernel
    tomb_id = "tomb_perm_" + str(uuid.uuid4())
    locked_file = k.storage / "perm_source" / ("perm_" + tomb_id)
    locked_file.parent.mkdir(parents=True, exist_ok=True)
    locked_file.write_bytes(b"File blocked by permission error")

    with k.session.begin() as db:
        db.add(ErasureTombstone(
            id=tomb_id,
            source_id="perm_source",
            version_id="perm_v1",
            path=str(locked_file),
            status="pending",
            created_at=time.time()
        ))

    orig_unlink = Path.unlink
    def failing_unlink(self, *args, **kwargs):
        if self.name == locked_file.name:
            raise PermissionError(13, "Permission denied")
        return orig_unlink(self, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", failing_unlink)
    res1 = k.recover_interrupted_erasures()
    assert res1["failed_count"] >= 1
    assert locked_file.exists()

    with k.session() as db:
        t = db.get(ErasureTombstone, tomb_id)
        assert t.status == "pending"
        assert t.attempts == 1
        assert "PermissionError" in (t.last_error or "")

    # Restore unlink and verify recovery completes and verifies absence
    monkeypatch.setattr(Path, "unlink", orig_unlink)
    res2 = k.recover_interrupted_erasures()
    assert res2["recovered_count"] >= 1
    assert res2["unlinked_files"] >= 1
    assert not locked_file.exists()
    with k.session() as db:
        t = db.get(ErasureTombstone, tomb_id)
        assert t.status == "completed"
        assert t.last_error is None


def test_renew_lease_rejects_expired_lease_and_fences_pre_commit(kernel):
    """Verifies that renew_lease rejects an already-expired lease and pre-commit check prevents stale commit."""
    from service.core import Artifact, Span
    from sqlalchemy import select
    import time

    k = kernel
    doc = k.ingest(k.test_claims, "lease_exp_key", "lease.txt", b"Lease expiration test content")
    claim = k.claim(lease_seconds=60)
    job_id, fence = claim

    # Expire lease in DB
    with k.session.begin() as db:
        job = db.get(Job, job_id)
        job.lease_until = time.time() - 5

    with pytest.raises(Fault, match="LEASE_LOST"):
        k.renew_lease(job_id, fence, additional_seconds=60)

    # Restore lease, then trigger pre-commit failure via before_commit hook
    with k.session.begin() as db:
        job = db.get(Job, job_id)
        job.lease_until = time.time() + 60

    def fail_hook():
        raise Fault(409, "LEASE_LOST")

    res = k.process(claim, before_commit=fail_hook)
    assert not res["ok"] and res["code"] == "LEASE_LOST"
    with k.session() as db:
        assert db.get(Artifact, doc["version_id"]) is None
        assert db.scalars(select(Span).where(Span.version == doc["version_id"])).all() == []


def test_heartbeat_lease_maintainer_propagates_contextvars_to_child_thread(kernel):
    """Verifies that HeartbeatLeaseMaintainer propagates Temporal activity contextvars into its
    background thread so activity.heartbeat() and kernel.renew_lease() succeed repeatedly."""
    from temporalio.testing import ActivityEnvironment
    from service.temporal_pipeline import HeartbeatLeaseMaintainer
    import time

    k = kernel
    doc = k.ingest(k.test_claims, "hb_ctx_key", "hb.txt", b"Heartbeat context propagation content")
    claim = k.claim(lease_seconds=10)
    job_id, fence = claim

    recorded_heartbeats = []
    env = ActivityEnvironment()
    env.on_heartbeat = lambda * details: recorded_heartbeats.append(details)

    def run_inside_activity():
        with HeartbeatLeaseMaintainer(
            "test_hb_ctx",
            kernel=k,
            job_id=job_id,
            fence=fence,
            heartbeat_interval=0.05,
            lease_interval=0.10,
            lease_duration=120,
        ) as maintainer:
            time.sleep(0.35)
            maintainer.assert_healthy()
            return maintainer.heartbeat_count, maintainer.lease_renewal_count, maintainer.error

    hb_count, renew_count, err = env.run(run_inside_activity)
    assert err is None
    assert hb_count >= 2
    assert renew_count >= 1
    assert len(recorded_heartbeats) >= 2


def test_local_bge_embedder_validates_complete_artifact_files(tmp_path, monkeypatch):
    """Verifies LocalBGEEmbedder rejects incomplete directories and checksum mismatches."""
    from service.provider_factory import LocalBGEEmbedder
    import json

    incomplete_dir = tmp_path / "incomplete_model"
    incomplete_dir.mkdir()
    (incomplete_dir / "config.json").write_text(json.dumps({"hidden_size": 384}))

    with pytest.raises(Fault, match="INCOMPLETE_EMBEDDING_ARTIFACT_FILES"):
        LocalBGEEmbedder(str(incomplete_dir))

    # Populate dummy files for checksum mismatch test
    for fname in ("modules.json", "tokenizer_config.json", "special_tokens_map.json", "vocab.txt", "model.safetensors"):
        (incomplete_dir / fname).write_bytes(b"{}")

    monkeypatch.setenv("WORKBYLINE_EMBEDDING_ARTIFACT_SHA256", "0" * 64)
    with pytest.raises(Fault, match="EMBEDDING_ARTIFACT_CHECKSUM_MISMATCH"):
        LocalBGEEmbedder(str(incomplete_dir))


def test_health_separates_liveness_configuration_and_operational_readiness(kernel):
    """Verifies /health separates liveness, configuration, and operational_readiness,
    and surfaces degraded erasure recovery when a tombstone is in failed state."""
    from service.memory_api import create_memory_app
    from service.core import ErasureTombstone
    from sqlalchemy import delete
    import time

    with kernel.session.begin() as db:
        db.execute(delete(ErasureTombstone).where(ErasureTombstone.status == "failed"))

    with TestClient(create_memory_app(kernel)) as client:
        r = client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body["liveness"] == "alive"
        assert isinstance(body["configuration"], dict)
        assert isinstance(body["operational_readiness"], dict)
        assert body["operational_readiness"]["database"] == "connected"
        assert body["operational_readiness"]["erasure_recovery"] == "ready"
        assert body["erasure_recovery"]["healthy"] is True

        # Inject a failed tombstone and verify /health surfaces degraded erasure_recovery
        with kernel.session.begin() as db:
            db.add(ErasureTombstone(
                id="health_failed_tomb",
                source_id="src_health_fail",
                version_id="v_health_fail",
                path=str(kernel.storage / "src_health_fail" / "v_health_fail"),
                status="failed",
                attempts=5,
                last_error="PermissionError: Permission denied",
                created_at=time.time(),
            ))
        r2 = client.get("/health")
        body2 = r2.json()
        assert body2["operational_readiness"]["erasure_recovery"] == "degraded"
        assert body2["erasure_recovery"]["healthy"] is False
        assert len(body2["erasure_recovery"]["recent_errors"]) >= 1

        with kernel.session.begin() as db:
            db.execute(delete(ErasureTombstone).where(ErasureTombstone.id == "health_failed_tomb"))


def test_reprocess_version_rejects_active_indexing_and_projection(kernel):
    """Verifies reprocess_version rejects retry when indexing or projection is actively owned."""
    from service.core import IndexingStage, Projection, Version
    import time
    k = kernel
    res = k.ingest(k.test_claims, 'key_active_stage', 'test.txt', b'Stage content')
    vid = res['version_id']

    now = time.time()
    with k.session.begin() as db:
        stage = db.get(IndexingStage, vid)
        if not stage:
            stage = IndexingStage(version=vid, status='running', fence='fence1', updated_at=now)
            db.add(stage)
        else:
            stage.status = 'running'
            stage.updated_at = now

    with pytest.raises(Fault, match="INDEXING_ALREADY_ACTIVE"):
        k.reprocess_version(k.test_claims, vid)

    # Clean up stage and test projection active lock
    with k.session.begin() as db:
        stage = db.get(IndexingStage, vid)
        stage.status = 'completed'
        proj = db.get(Projection, vid)
        if not proj:
            proj = Projection(version=vid, status='running', updated_at=now)
            db.add(proj)
        else:
            proj.status = 'running'
            proj.updated_at = now

    with pytest.raises(Fault, match="PROJECTION_ALREADY_ACTIVE"):
        k.reprocess_version(k.test_claims, vid)


def test_reprocess_version_rejects_deliberate_cancellation_unless_resume(kernel):
    """Verifies reprocess_version blocks ordinary retry on deliberately cancelled versions unless authorized resume."""
    from service.core import Version
    k = kernel
    res = k.ingest(k.test_claims, 'key_cancelled_ver', 'test.txt', b'Cancelled doc content')
    vid = res['version_id']

    with k.session.begin() as db:
        ver = db.get(Version, vid)
        ver.state = 'cancelled'

    # Ordinary retry without allow_resume flag must be rejected
    with pytest.raises(Fault, match="VERSION_CANCELLED"):
        k.reprocess_version(k.test_claims, vid)

    # Authorized resume allows reprocess
    claims_with_resume = {**k.test_claims, "allow_resume": True}
    result = k.reprocess_version(claims_with_resume, vid)
    assert result['ok'] is True
    assert result['state'] == 'pending'





