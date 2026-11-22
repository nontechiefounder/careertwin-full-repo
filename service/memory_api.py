"""Integration entry point; injected dependencies must be provisioned server-side."""
import asyncio
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from contextlib import asynccontextmanager
import os
from fastapi import Header
from fastapi.responses import JSONResponse
from .api import create_app, Question
from .core import Fault
from .qa_flow import build_qa_flow


async def _probe_temporal(temporal_addr: str, queue_name: str = "wbctx-evidence", timeout: float = 1.5) -> dict:
    """Bounded live probe of Temporal server connectivity and task-queue worker pollers."""
    if not temporal_addr or not temporal_addr.startswith(("127.0.0.1:", "localhost:")):
        return {
            "state": "unverified",
            "pollers": 0,
            "detail": f"unverified ({temporal_addr})",
        }
    try:
        from temporalio.client import Client
        from temporalio.api.workflowservice.v1 import DescribeTaskQueueRequest
        from temporalio.api.taskqueue.v1 import TaskQueue
        from temporalio.api.enums.v1 import TaskQueueKind

        async def _check():
            client = await Client.connect(temporal_addr, namespace="default")
            resp = await client.workflow_service.describe_task_queue(
                DescribeTaskQueueRequest(
                    namespace="default",
                    task_queue=TaskQueue(
                        name=queue_name,
                        kind=TaskQueueKind.TASK_QUEUE_KIND_NORMAL,
                    ),
                )
            )
            return len(resp.pollers)

        poller_count = await asyncio.wait_for(_check(), timeout=timeout)
        if poller_count > 0:
            return {
                "state": "ready",
                "pollers": poller_count,
                "detail": f"ready ({temporal_addr} / {queue_name}, pollers={poller_count})",
            }
        return {
            "state": "connected_no_workers",
            "pollers": 0,
            "detail": f"degraded ({temporal_addr} / {queue_name}, pollers=0)",
        }
    except Exception:
        return {
            "state": "unreachable",
            "pollers": 0,
            "detail": f"unreachable ({temporal_addr} / {queue_name})",
        }


def _probe_database_and_schema(kernel, timeout_sec: float = 2.0) -> dict:
    """Execute database connectivity, statement timeout, schema tables, migration version,
    and erasure recovery probe within a strict wall-clock timeout."""
    from sqlalchemy import text

    def _run_db_check():
        with kernel.session() as db:
            if kernel.engine.dialect.name == "postgresql":
                db.execute(text(f"SET LOCAL statement_timeout = '{int(timeout_sec * 1000)}ms'"))
            db.execute(text("SELECT 1"))

            missing_tables = []
            missing_columns = []
            schema_version = "sqlite_local"
            schema_status = "ready"

            if kernel.engine.dialect.name == "postgresql":
                expected_tables = {
                    "wbctx_bindings", "wbctx_nonces",
                    "wbctx_sources", "wbctx_versions", "wbctx_jobs",
                    "wbctx_artifacts", "wbctx_spans", "wbctx_span_embeddings",
                    "wbctx_projections", "wbctx_idempotency_keys",
                    "wbctx_indexings", "wbctx_erasure_tombstones",
                }
                rows = db.execute(text(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
                )).scalars().all()
                existing_tables = set(rows)
                missing = expected_tables - existing_tables
                if missing:
                    schema_status = "incomplete"
                    missing_tables = sorted(list(missing))

                # Check required 007/008 columns across tables
                required_cols = {
                    ("wbctx_indexings", "model_revision"),
                    ("wbctx_indexings", "artifact_sha256"),
                    ("wbctx_indexings", "inference_backend"),
                    ("wbctx_indexings", "fence"),
                    ("wbctx_span_embeddings", "inference_backend"),
                    ("wbctx_projections", "fence"),
                    ("wbctx_erasure_tombstones", "fence"),
                    ("wbctx_erasure_tombstones", "lease_until"),
                    ("wbctx_erasure_tombstones", "attempts"),
                    ("wbctx_erasure_tombstones", "last_error"),
                }
                col_rows = db.execute(text(
                    "SELECT table_name, column_name FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name IN "
                    "('wbctx_indexings', 'wbctx_projections', 'wbctx_erasure_tombstones', 'wbctx_span_embeddings')"
                )).all()
                existing_cols = {(r[0], r[1]) for r in col_rows}
                missing_c = required_cols - existing_cols
                if missing_c:
                    schema_status = "incomplete"
                    missing_columns = sorted(f"{t}.{c}" for t, c in missing_c)

                if "schema_migrations" in existing_tables:
                    applied_migs = db.execute(text(
                        "SELECT version FROM schema_migrations ORDER BY version"
                    )).scalars().all()
                    schema_version = applied_migs[-1] if applied_migs else "none"
                    if "008_inference_backend_and_upgrade_reconciliation.sql" not in set(applied_migs):
                        schema_status = "migration_pending"
                else:
                    schema_version = "untracked"

            erasure_status = kernel.erasure_recovery_status()
            return {
                "db_status": "connected",
                "schema_status": schema_status,
                "schema_version": schema_version,
                "missing_tables": missing_tables,
                "missing_columns": missing_columns,
                "erasure_recovery": erasure_status,
            }

    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(_run_db_check)
    try:
        return future.result(timeout=timeout_sec)
    except FuturesTimeoutError:
        return {
            "db_status": "timeout",
            "schema_status": "unavailable",
            "schema_version": "unknown",
            "missing_tables": [],
            "missing_columns": [],
            "erasure_recovery": {"healthy": False, "error": "DB_TIMEOUT"},
        }
    except Exception:
        return {
            "db_status": "disconnected",
            "schema_status": "unavailable",
            "schema_version": "unknown",
            "missing_tables": [],
            "missing_columns": [],
            "erasure_recovery": {"healthy": False, "error": "DB_DISCONNECTED"},
        }
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


def create_memory_app(kernel, hybrid=None, generator=None, graph_projection=None):
    app = create_app(kernel)
    route = '/v1/workspaces/{workspace}/research-qa'
    app.router.routes[:] = [r for r in app.router.routes if not (getattr(r, 'path', None) == route and 'POST' in getattr(r, 'methods', set()))]

    app.state.startup_recovery = None
    app.state.startup_recovery_error = None

    orig_lifespan = app.router.lifespan_context

    @asynccontextmanager
    async def lifespan(application):
        try:
            application.state.startup_recovery = kernel.recover_interrupted_erasures()
            application.state.startup_recovery_error = None
        except Exception as exc:
            application.state.startup_recovery = None
            application.state.startup_recovery_error = f"{type(exc).__name__}"
        if orig_lifespan is not None:
            async with orig_lifespan(application) as state:
                yield state
        else:
            yield

    app.router.lifespan_context = lifespan

    # Truthful readiness probe separating liveness, configuration, and operational_readiness
    health_route = '/health'
    app.router.routes[:] = [r for r in app.router.routes if not (getattr(r, 'path', None) == health_route and 'GET' in getattr(r, 'methods', set()))]

    @app.get('/health')
    async def health():
        # 1. Process Liveness
        liveness = "alive"

        # 2. Bounded Database Connectivity, Schema, Migration & Erasure Recovery Probe (2.0s real timeout)
        db_probe = _probe_database_and_schema(kernel, timeout_sec=2.0)
        db_status = db_probe["db_status"]
        schema_status = db_probe["schema_status"]
        schema_version = db_probe["schema_version"]
        missing_tables = db_probe["missing_tables"]
        missing_columns = db_probe["missing_columns"]
        erasure_recovery = dict(db_probe["erasure_recovery"])
        if app.state.startup_recovery_error:
            erasure_recovery["startup_recovery_error"] = app.state.startup_recovery_error
            erasure_recovery["healthy"] = False
        elif app.state.startup_recovery is not None:
            erasure_recovery["startup_recovered_count"] = app.state.startup_recovery.get("recovered_count", 0)

        status_code = 200
        if db_status != "connected" or schema_status != "ready":
            status_code = 503

        # 3. Temporal Subsystem Configuration & Live Operational Probe
        temporal_addr = os.environ.get("TEMPORAL_ADDRESS", "127.0.0.1:7233")
        temporal_probe = await _probe_temporal(temporal_addr, queue_name="wbctx-evidence", timeout=1.5)
        temporal_status = temporal_probe["detail"]
        require_temporal = os.environ.get("WORKBYLINE_REQUIRE_TEMPORAL_READY", "false").lower() == "true"
        if require_temporal and temporal_probe["state"] != "ready":
            status_code = 503

        # 4. Embedding Availability & Model Provenance
        embedding_weights_expected = bool(os.environ.get("WORKBYLINE_EMBEDDING_WEIGHTS", "").strip())
        if hybrid and hybrid.embed:
            model_prov = getattr(hybrid.embed, "model_id", "bge-small-en-v1.5")
            rev = getattr(hybrid.embed, "model_revision", "v1.5")
            art_sha = (getattr(hybrid.embed, "artifact_sha256", "") or "")[:12]
            inf_backend = getattr(hybrid.embed, "inference_backend", "sentence_transformers")
            embedding_status = f"ready ({model_prov}:{rev}, sha256={art_sha}, backend={inf_backend}, 384d)"
            embedding_op = "ready"
            retrieval_mode = "postgres-fts+pgvector-rrf"
        elif embedding_weights_expected:
            embedding_status = "failed (configured weights unavailable or invalid)"
            embedding_op = "failed"
            retrieval_mode = "postgres-fts"
            status_code = 503
        else:
            embedding_status = "unconfigured (lexical_only)"
            embedding_op = "lexical_only"
            retrieval_mode = "postgres-fts"

        # 5. Graph Configuration & Operational State
        graph_enabled = os.environ.get("WORKBYLINE_GRAPH_ENABLED", "false").lower() == "true"
        if graph_enabled and graph_projection is not None:
            graph_status = "configured (local_graphiti)"
            graph_op = "configured"
        elif graph_enabled:
            graph_status = "unreachable"
            graph_op = "unreachable"
        else:
            graph_status = "disabled"
            graph_op = "disabled"

        # 6. Generation Configuration & Feature-Gate State
        gen_gate = os.environ.get("WORKBYLINE_GENERATION_GATE", "false").lower() == "true"
        if generator and gen_gate:
            generation_status = "ready"
            generation_op = "ready"
        elif generator:
            generation_status = "feature_gated"
            generation_op = "feature_gated"
        else:
            generation_status = "unconfigured"
            generation_op = "unconfigured"

        configuration = {
            "database_dialect": kernel.engine.dialect.name,
            "temporal_address": temporal_addr,
            "temporal_task_queue": "wbctx-evidence",
            "require_temporal_ready": require_temporal,
            "embedding_configured": bool(hybrid and hybrid.embed),
            "embedding_model": getattr(hybrid.embed, "model_id", None) if (hybrid and hybrid.embed) else None,
            "embedding_revision": getattr(hybrid.embed, "model_revision", None) if (hybrid and hybrid.embed) else None,
            "embedding_artifact_sha256": getattr(hybrid.embed, "artifact_sha256", None) if (hybrid and hybrid.embed) else None,
            "embedding_inference_backend": getattr(hybrid.embed, "inference_backend", None) if (hybrid and hybrid.embed) else None,
            "embedding_language_scope": getattr(hybrid.embed, "supported_language_scope", None) if (hybrid and hybrid.embed) else None,
            "graph_enabled": graph_enabled,
            "generation_configured": generator is not None,
            "generation_feature_gate": gen_gate,
        }

        operational_readiness = {
            "database": db_status,
            "schema": schema_status,
            "schema_version": schema_version,
            "temporal": temporal_probe["state"],
            "temporal_worker_pollers": temporal_probe["pollers"],
            "embedding": embedding_op,
            "graph": graph_op,
            "generation": generation_op,
            "erasure_recovery": "ready" if erasure_recovery.get("healthy", True) else "degraded",
        }

        overall_status = "ready" if status_code == 200 else "unhealthy"

        content = {
            "status": overall_status,
            "service": "workbyline-context-evidence",
            "release": "workbyline-v3-candidate",
            "liveness": liveness,
            "configuration": configuration,
            "operational_readiness": operational_readiness,
            "database": db_status,
            "schema": schema_status,
            "schema_version": schema_version,
            "temporal": temporal_status,
            "embedding": embedding_status,
            "retrieval": retrieval_mode,
            "graph": graph_status,
            "generation": generation_status,
            "erasure_recovery": erasure_recovery,
        }
        if missing_tables:
            content["missing_schema_tables"] = missing_tables
        if missing_columns:
            content["missing_schema_columns"] = missing_columns

        return JSONResponse(status_code=status_code, content=content)

    @app.post(route)
    def qa(workspace: str, body: Question, authorization: str | None = Header(default=None)):
        if not authorization or not authorization.startswith('Bearer '):
            raise Fault(401, 'AUTH_REQUIRED')
        claims = kernel.authorize(authorization[7:], workspace, 'retrieve')
        retriever = hybrid or kernel
        retrieve = lambda question: retriever.retrieve(claims, question, body.limit, body.as_of)
        if body.mode == 'retrieval_only':
            return retrieve(body.question)
        if body.mode != 'retrieval_augmented':
            raise Fault(422, 'UNSUPPORTED_MODE')

        if generator is None:
            raise Fault(503, 'LIVE_GENERATION_UNAVAILABLE')

        # Feature gate guard: Generation remains gated until separate acceptance approves its behavior
        gen_gate = os.environ.get("WORKBYLINE_GENERATION_GATE", "false").lower() == "true"
        if not gen_gate:
            raise Fault(503, 'FEATURE_GATED_GENERATION')

        flow = build_qa_flow(retrieve, generator)
        return flow.invoke({'question': body.question}, config={'recursion_limit': 6})['output']

    @app.post('/v1/workspaces/{workspace}/related-evidence')
    async def related(workspace: str, body: Question, authorization: str | None = Header(default=None)):
        if not authorization or not authorization.startswith('Bearer '):
            raise Fault(401, 'AUTH_REQUIRED')
        claims = kernel.authorize(authorization[7:], workspace, 'retrieve')
        if graph_projection is None:
            raise Fault(503, 'GRAPH_PROJECTION_UNAVAILABLE')
        docs = await graph_projection.candidate_versions(claims, body.question, body.as_of)
        passages = []
        for doc in docs:
            for span in doc['spans']:
                passages.append(span | {'source_id': doc['source_id'], 'version_id': doc['version_id']})
        return {
            'status': 'RELATED_EVIDENCE_FOR_HUMAN_REVIEW',
            'passages': passages[:body.limit],
            'disclaimer': 'DERIVED GRAPH CANDIDATES / NOT EMPLOYER-APPROVED',
            'candidate_versions': len(docs),
            'truncated': len(passages) > body.limit
        }

    @app.post('/v1/workspaces/{workspace}/sources/{source_id}/reindex')
    def reindex_source(workspace: str, source_id: str, authorization: str | None = Header(default=None)):
        if not authorization or not authorization.startswith('Bearer '):
            raise Fault(401, 'AUTH_REQUIRED')
        claims = kernel.authorize(authorization[7:], workspace, 'upload')
        doc = kernel.inspect(claims, source_id)
        if hybrid is None:
            raise Fault(503, 'EMBEDDING_PROVIDER_UNCONFIGURED')
        return hybrid.index_version(doc['version_id'])

    @app.post('/v1/workspaces/{workspace}/sources/{source_id}/reproject')
    async def reproject_source(workspace: str, source_id: str, authorization: str | None = Header(default=None)):
        if not authorization or not authorization.startswith('Bearer '):
            raise Fault(401, 'AUTH_REQUIRED')
        claims = kernel.authorize(authorization[7:], workspace, 'upload')
        doc = kernel.inspect(claims, source_id)
        if graph_projection is None:
            raise Fault(503, 'GRAPH_PROJECTION_UNAVAILABLE')
        return await graph_projection.project_version(doc['version_id'])

    return app
