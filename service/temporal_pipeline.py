"""One durable workflow per immutable version. No source text in workflow history."""
from datetime import timedelta
from temporalio import activity, workflow
from temporalio.common import RetryPolicy, WorkflowIDReusePolicy
from temporalio.exceptions import (
    ActivityError,
    ApplicationError,
    CancelledError,
    WorkflowAlreadyStartedError,
)

with workflow.unsafe.imports_passed_through():
    import contextvars
    import os
    import threading
    import time
    from sqlalchemy import select, and_, or_
    from .core import Job, Version, Artifact, uid, Fault, IndexingStage


def _is_cancellation_exception(exc: BaseException | None) -> bool:
    if exc is None:
        return False
    cur: BaseException | None = exc
    visited: set[int] = set()
    while cur is not None and id(cur) not in visited:
        visited.add(id(cur))
        name = cur.__class__.__name__
        msg = str(cur)
        if (
            isinstance(cur, CancelledError)
            or "Cancel" in name
            or "cancel" in name.lower()
            or "cancel" in msg.lower()
        ):
            return True
        cur = getattr(cur, "cause", None) or getattr(cur, "__cause__", None) or getattr(cur, "__context__", None)
    return False


class HeartbeatLeaseMaintainer:
    """Runs a periodic background thread with propagated Python contextvars that:
    1. Emits activity.heartbeat(...) every heartbeat_interval seconds inside the
       captured Temporal activity context.
    2. Renews kernel database lease every lease_interval seconds if job_id and fence are provided.
    3. Never ignores heartbeat or lease renewal errors; records self.error and stops.
    4. Provides assert_healthy() for pre-commit validation inside the DB transaction.
    """

    def __init__(
        self,
        heartbeat_details,
        kernel=None,
        job_id=None,
        fence=None,
        heartbeat_interval=None,
        lease_interval=None,
        lease_duration=10,
    ):
        self.heartbeat_details = heartbeat_details
        self.kernel = kernel
        self.job_id = job_id
        self.fence = fence
        self.heartbeat_interval = (
            float(heartbeat_interval)
            if heartbeat_interval is not None
            else float(os.environ.get("WORKBYLINE_HEARTBEAT_INTERVAL_SEC", "1.0"))
        )
        self.lease_interval = (
            float(lease_interval)
            if lease_interval is not None
            else float(os.environ.get("WORKBYLINE_LEASE_RENEWAL_INTERVAL_SEC", "2.0"))
        )
        self.lease_duration = int(
            os.environ.get("WORKBYLINE_LEASE_DURATION_SEC", str(lease_duration))
        )
        self.stop_event = threading.Event()
        self.error: BaseException | None = None
        self.heartbeat_count = 0
        self.lease_renewal_count = 0
        self.thread: threading.Thread | None = None

    def _run(self):
        last_lease = time.time()
        last_hb = time.time()
        check_interval = max(0.01, min(self.heartbeat_interval / 2.0, 0.1))
        while not self.stop_event.wait(timeout=check_interval):
            now = time.time()
            if (activity.in_activity() and activity.is_cancelled()) or self.stop_event.is_set():
                self.error = CancelledError("Activity cancelled during heartbeat loop")
                break

            if now - last_hb >= self.heartbeat_interval:
                try:
                    activity.heartbeat(
                        f"{self.heartbeat_details}:hb={self.heartbeat_count + 1}:renew={self.lease_renewal_count}"
                    )
                    self.heartbeat_count += 1
                    last_hb = now
                except BaseException as exc:
                    self.error = exc
                    break

            if self.kernel and self.job_id and self.fence and (now - last_lease >= self.lease_interval):
                try:
                    self.kernel.renew_lease(
                        self.job_id,
                        self.fence,
                        additional_seconds=self.lease_duration,
                    )
                    self.lease_renewal_count += 1
                    last_lease = now
                except BaseException as exc:
                    self.error = exc
                    break

    def assert_healthy(self):
        """Pre-commit authority check invoked inside the final DB transaction before commit."""
        if activity.in_activity():
            try:
                activity.heartbeat(f"{self.heartbeat_details}:check")
            except BaseException as hb_err:
                if _is_cancellation_exception(hb_err):
                    raise CancelledError("Activity cancelled during heartbeat check") from hb_err
                raise
            if activity.is_cancelled():
                raise CancelledError("Activity cancellation detected before commit")
        if self.error is not None:
            if _is_cancellation_exception(self.error):
                raise CancelledError(f"Activity cancellation in heartbeat thread: {self.error}")
            if isinstance(self.error, CancelledError):
                raise self.error
            if isinstance(self.error, Fault):
                raise self.error
            raise Fault(409, f"HEARTBEAT_OR_LEASE_FAILED:{type(self.error).__name__}")
        if self.stop_event.is_set():
            self.error = CancelledError("Activity cancellation detected before commit")
            raise self.error

    def __enter__(self):
        ctx = contextvars.copy_context()
        self.thread = threading.Thread(target=lambda: ctx.run(self._run), daemon=True)
        self.thread.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop_event.set()
        if self.thread is not None:
            self.thread.join(timeout=2.0)


@workflow.defn
class EvidenceVersionWorkflow:
    @workflow.run
    async def run(self, version_id: str) -> dict:
        result = await workflow.execute_activity(
            "process_evidence_version",
            version_id,
            start_to_close_timeout=timedelta(seconds=150),
            heartbeat_timeout=timedelta(seconds=2.5),
            retry_policy=RetryPolicy(initial_interval=timedelta(seconds=2), maximum_attempts=5),
            cancellation_type=workflow.ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
        )

        indexing_status = "SKIPPED"
        index_hb_count = 0
        try:
            index_res = await workflow.execute_activity(
                "index_evidence_version",
                version_id,
                start_to_close_timeout=timedelta(minutes=5),
                heartbeat_timeout=timedelta(seconds=2.5),
                retry_policy=RetryPolicy(initial_interval=timedelta(seconds=1), maximum_attempts=3),
                cancellation_type=workflow.ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
            )
            indexing_status = index_res.get("status", "INDEXED")
            index_hb_count = index_res.get("heartbeat_count", 0)
        except BaseException as exc:
            if _is_cancellation_exception(exc):
                raise
            indexing_status = "FAILED"

        projection_status = "NOT_ENABLED"
        try:
            proj_res = await workflow.execute_activity(
                "project_evidence_version",
                version_id,
                start_to_close_timeout=timedelta(minutes=5),
                heartbeat_timeout=timedelta(seconds=2.5),
                retry_policy=RetryPolicy(initial_interval=timedelta(seconds=2), maximum_attempts=3),
                cancellation_type=workflow.ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
            )
            projection_status = proj_res.get("status", "NOT_ENABLED")
        except BaseException as exc:
            if _is_cancellation_exception(exc):
                raise
            projection_status = "FAILED"

        pipeline_status = "COMPLETED"
        if indexing_status == "FAILED" or projection_status == "FAILED":
            pipeline_status = "PARTIAL_DOWNSTREAM_FAILED"
            raise ApplicationError(
                f"PARTIAL_DOWNSTREAM_FAILED: indexing={indexing_status}, projection={projection_status}",
                non_retryable=True,
            )

        return {
            "ok": result.get("ok", True),
            "state": result.get("state"),
            "pipeline_status": pipeline_status,
            "parsing_state": result.get("state"),
            "indexing_status": indexing_status,
            "graph_projection": projection_status,
            "parse_heartbeat_count": result.get("heartbeat_count", 0),
            "parse_lease_renewal_count": result.get("lease_renewal_count", 0),
            "index_heartbeat_count": index_hb_count,
        }


class EvidenceActivities:
    def __init__(self, kernel, hybrid=None, graph=None):
        self.kernel, self.hybrid, self.graph = kernel, hybrid, graph

    @activity.defn(name="process_evidence_version")
    def process_version(self, version_id: str) -> dict:
        now = time.time()
        initial_lease_sec = int(os.environ.get("WORKBYLINE_INITIAL_LEASE_SEC", "10"))
        parse_delay = float(os.environ.get("WORKBYLINE_TEST_PARSE_DELAY_SEC", "0.0"))
        activity.heartbeat(f"start_process_{version_id}")
        with self.kernel.session.begin() as db:
            job = db.scalar(select(Job).where(Job.version == version_id).with_for_update())
            if not job:
                raise ApplicationError("VERSION_JOB_NOT_FOUND", non_retryable=True)
            if job.state == "completed":
                return {"ok": True, "state": db.get(Version, version_id).state, "replayed": True}
            if job.state == "cancelled":
                raise CancelledError("VERSION_JOB_ALREADY_CANCELLED")

            # Stage idempotency: If artifact and spans are already committed, parsing is already finished
            artifact = db.get(Artifact, version_id)
            ver = db.get(Version, version_id)
            if artifact is not None and ver and ver.state in ("completed", "partial"):
                job.state = "completed"
                job.error = None
                return {"ok": True, "state": ver.state, "replayed": True}

            if job.state == "failed" or job.attempts >= 5:
                job.state = "failed"
                db.get(Version, version_id).state = "failed"
                terminal = True
            else:
                terminal = False
                job.state, job.fence, job.lease_until = "processing", uid(), now + initial_lease_sec
                job.attempts += 1
                claim = (job.id, job.fence)
        if terminal:
            raise ApplicationError("RETRY_EXHAUSTED", non_retryable=True)

        try:
            activity.heartbeat(f"parsing_{version_id}")
            self.kernel.renew_lease(claim[0], claim[1], additional_seconds=initial_lease_sec)
            with HeartbeatLeaseMaintainer(
                f"parsing_{version_id}",
                kernel=self.kernel,
                job_id=claim[0],
                fence=claim[1],
                lease_duration=initial_lease_sec,
            ) as maintainer:
                result = self.kernel.process(
                    claim,
                    before_commit=maintainer.assert_healthy,
                    parse_delay_seconds=parse_delay,
                )
                maintainer.assert_healthy()
                hb_count = maintainer.heartbeat_count
                renew_count = maintainer.lease_renewal_count
        except BaseException as exc:
            if _is_cancellation_exception(exc):
                with self.kernel.session.begin() as db:
                    job = db.scalar(select(Job).where(Job.version == version_id).with_for_update())
                    if job and job.state != "completed":
                        job.state = "cancelled"
                        job.lease_until = 0
                        job.error = "ACTIVITY_CANCELLED"
                        ver_row = db.get(Version, version_id)
                        if ver_row and ver_row.state not in ("completed", "partial"):
                            ver_row.state = "cancelled"
            raise

        if not result["ok"]:
            raise ApplicationError(
                result["code"],
                non_retryable=result["code"] in ("ORIGINAL_HASH_MISMATCH", "SOURCE_DELETED", "LEASE_LOST"),
            )
        activity.heartbeat(f"completed_{version_id}:hb={hb_count}:renew={renew_count}")
        return result | {"heartbeat_count": hb_count, "lease_renewal_count": renew_count}

    @activity.defn(name="index_evidence_version")
    def index_version(self, version_id: str) -> dict:
        if self.hybrid is None or self.hybrid.embed is None:
            with self.kernel.session.begin() as db:
                stage = db.get(IndexingStage, version_id)
                if not stage:
                    db.add(
                        IndexingStage(
                            version=version_id,
                            status="lexical_only",
                            model_id=None,
                            indexed_spans=0,
                            updated_at=time.time(),
                        )
                    )
                else:
                    stage.status = "lexical_only"
                    stage.updated_at = time.time()
            return {"status": "LEXICAL_ONLY", "reason": "EMBEDDING_PROVIDER_NOT_CONFIGURED"}

        index_delay = float(os.environ.get("WORKBYLINE_TEST_INDEX_DELAY_SEC", "0.0"))
        activity.heartbeat(f"indexing_{version_id}")
        try:
            with HeartbeatLeaseMaintainer(f"indexing_{version_id}") as maintainer:
                res = self.hybrid.index_version(
                    version_id,
                    before_commit=maintainer.assert_healthy,
                    index_delay_seconds=index_delay,
                )
                maintainer.assert_healthy()
                hb_count = maintainer.heartbeat_count
            activity.heartbeat(f"indexed_{version_id}:hb={hb_count}")
            return {"status": "INDEXED", "heartbeat_count": hb_count} | res
        except CancelledError:
            raise
        except Fault as f:
            if _is_cancellation_exception(f):
                raise CancelledError("Indexing cancelled") from f
            raise ApplicationError(f.code, non_retryable=(f.status in (404, 409, 422)))
        except BaseException as exc:
            if _is_cancellation_exception(exc):
                raise
            raise ApplicationError(f"INDEXING_RETRYABLE: {str(exc)[:100]}", non_retryable=False)

    @activity.defn(name="project_evidence_version")
    async def project_version(self, version_id: str) -> dict:
        if self.graph is None:
            return {"status": "NOT_ENABLED"}
        activity.heartbeat(f"projecting_{version_id}")
        try:
            with HeartbeatLeaseMaintainer(f"projecting_{version_id}") as maintainer:
                res = await self.graph.project_version(
                    version_id,
                    before_commit=maintainer.assert_healthy,
                )
                maintainer.assert_healthy()
                hb_count = maintainer.heartbeat_count
        except CancelledError:
            raise
        except Fault as f:
            if _is_cancellation_exception(f):
                raise CancelledError("Projection cancelled") from f
            raise ApplicationError(f.code, non_retryable=(f.status in (404, 409, 422)))
        except BaseException as exc:
            if _is_cancellation_exception(exc):
                raise
            raise ApplicationError(f"GRAPH_PROJECTION_RETRYABLE: {str(exc)[:100]}", non_retryable=False)

        if isinstance(res, dict) and res.get("status") == "FAILED":
            err = res.get("error", "GRAPH_PROJECTION_FAILED")
            raise ApplicationError(f"GRAPH_PROJECTION_RETRYABLE: {err}", non_retryable=False)
        activity.heartbeat(f"projected_{version_id}:hb={hb_count}")
        return res | {"heartbeat_count": hb_count}


async def dispatch_pending(kernel, client, queue="wbctx-evidence"):
    """Replay-safe poll of the existing committed job table; only dispatches pending or expired jobs."""
    now = time.time()
    with kernel.session() as db:
        pending = db.scalars(
            select(Job.version).where(
                or_(
                    Job.state == "pending",
                    and_(Job.state == "processing", Job.lease_until < now, Job.attempts < 5),
                )
            )
        ).all()
    started = 0
    for version in pending:
        try:
            await client.start_workflow(
                EvidenceVersionWorkflow.run,
                version,
                id="wbctx-version-" + version,
                task_queue=queue,
                id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE,
            )
            started += 1
        except WorkflowAlreadyStartedError:
            pass
        except Exception as exc:
            with kernel.session.begin() as db:
                j = db.scalar(select(Job).where(Job.version == version).with_for_update())
                if j and j.state == "pending":
                    j.error = f"DISPATCH_ERROR: {str(exc)[:100]}"
    return started
