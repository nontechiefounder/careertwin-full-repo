"""Scoped PostgreSQL FTS + pgvector, exact search then reciprocal rank fusion."""
import math
from sqlalchemy import text
from .core import Fault

DIMENSIONS = 384

def vector_literal(values):
    if len(values) != DIMENSIONS or any(isinstance(v, bool) or not isinstance(v, (float,int)) or not math.isfinite(v) for v in values):
        raise Fault(422, 'INVALID_EMBEDDING')
    if not any(values):
        raise Fault(422, 'ZERO_EMBEDDING')
    return '[' + ','.join(str(float(v)) for v in values) + ']'

# Choose the latest observed version BEFORE checking processing state, so pending
# revisions cannot silently fall back to an old complete document.
ELIGIBLE = '''WITH latest AS (
 SELECT DISTINCT ON (s.id) s.id source_id,v.id version_id,v.state
 FROM wbctx_sources s JOIN wbctx_versions v ON v.source=s.id
 WHERE s.org=:org AND s.run=:run AND s.workspace=:workspace AND s.role=:role
 AND s.deleted=false AND (CAST(:as_of AS double precision) IS NULL OR v.observed_at<=CAST(:as_of AS double precision))
 ORDER BY s.id,v.number DESC
), allowed AS (
 SELECT p.id span_id,p.text,p.start,p."end",p.page,l.source_id,l.version_id
 FROM latest l JOIN wbctx_spans p ON p.version=l.version_id
 WHERE l.state IN ('completed','partial')
) '''
LEXICAL = ELIGIBLE + '''SELECT a.*, ts_rank_cd(to_tsvector('english',a.text),websearch_to_tsquery('english',:query)) score
 FROM allowed a WHERE to_tsvector('english',a.text) @@ websearch_to_tsquery('english',:query)
 ORDER BY score DESC,span_id LIMIT 50'''
DENSE = ELIGIBLE + '''SELECT a.*,e.embedding <=> CAST(:vector AS vector) distance
 FROM allowed a JOIN wbctx_span_embeddings e ON e.span_id=a.span_id
 WHERE e.model_id=:model
   AND (CAST(:model_rev AS varchar) IS NULL OR e.model_revision IS NULL OR e.model_revision=CAST(:model_rev AS varchar))
   AND (CAST(:artifact_sha AS varchar) IS NULL OR e.artifact_sha256 IS NULL OR e.artifact_sha256=CAST(:artifact_sha AS varchar))
 ORDER BY distance,span_id LIMIT 50'''

DENSE_STRICT_PROVENANCE = ELIGIBLE + '''SELECT a.*,e.embedding <=> CAST(:vector AS vector) distance
 FROM allowed a JOIN wbctx_span_embeddings e ON e.span_id=a.span_id
 WHERE e.model_id=:model
   AND (CAST(:model_rev AS varchar) IS NULL OR e.model_revision=CAST(:model_rev AS varchar))
   AND (CAST(:artifact_sha AS varchar) IS NULL OR e.artifact_sha256=CAST(:artifact_sha AS varchar))
   AND (CAST(:inference_backend AS varchar) IS NULL OR e.inference_backend=CAST(:inference_backend AS varchar))
 ORDER BY distance,span_id LIMIT 50'''

class HybridRetriever:
    def __init__(self, kernel, model_id, embed=None):
        if kernel.engine.dialect.name != 'postgresql':
            raise Fault(503, 'POSTGRES_REQUIRED_FOR_HYBRID')
        if not model_id.strip():
            raise Fault(503, 'EMBEDDING_MODEL_REQUIRED')
        self.kernel, self.model_id, self.embed = kernel, model_id, embed
        self._provenance_cols_checked = False
        self._has_provenance_cols = False
        self._has_inference_backend_col = False

    def _supports_provenance_columns(self, conn) -> bool:
        if not self._provenance_cols_checked:
            rows = conn.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name='wbctx_span_embeddings'"
            )).scalars().all()
            col_set = set(rows)
            self._has_provenance_cols = ('model_revision' in col_set and 'artifact_sha256' in col_set)
            self._has_inference_backend_col = ('inference_backend' in col_set)
            self._provenance_cols_checked = True
        return self._has_provenance_cols

    def index_version(self, version_id, *, before_commit=None, index_delay_seconds=0.0):
        if self.embed is None:
            raise Fault(503, 'EMBEDDING_PROVIDER_UNAVAILABLE')
        import os
        from pathlib import Path
        import time
        from sqlalchemy import select
        from .core import Span, Version, Source, IndexingStage, uid, Job

        model_rev = getattr(self.embed, 'model_revision', None)
        artifact_hash = getattr(self.embed, 'artifact_sha256', None)
        inference_backend = getattr(self.embed, 'inference_backend', None)
        fence = uid()

        with self.kernel.session.begin() as db:
            stage = db.scalar(select(IndexingStage).where(IndexingStage.version == version_id).with_for_update())
            if not stage:
                db.add(IndexingStage(
                    version=version_id,
                    status='running',
                    model_id=self.model_id,
                    model_revision=model_rev,
                    artifact_sha256=artifact_hash,
                    inference_backend=inference_backend,
                    fence=fence,
                    updated_at=time.time(),
                ))
            else:
                stage.status = 'running'
                stage.model_id = self.model_id
                stage.model_revision = model_rev
                stage.artifact_sha256 = artifact_hash
                stage.inference_backend = inference_backend
                stage.fence = fence
                stage.updated_at = time.time()

        try:
            if Path("/tmp/workbyline_test_force_index_fail").exists() or os.environ.get("WORKBYLINE_TEST_FORCE_INDEX_FAIL") == "1":
                raise Fault(500, "INJECTED_INDEX_DEPENDENCY_FAILURE")
            with self.kernel.session() as db:
                ver = db.get(Version, version_id)
                if not ver or ver.state not in ('completed', 'partial'):
                    raise Fault(409, 'VERSION_NOT_INDEXABLE')
                spans = db.scalars(select(Span).where(Span.version == version_id)).all()

            payloads = []
            for s in spans:
                if before_commit is not None:
                    before_commit()
                payloads.append((s.id, vector_literal(self.embed(s.text))))

            if index_delay_seconds and index_delay_seconds > 0:
                deadline = time.time() + float(index_delay_seconds)
                while time.time() < deadline:
                    if before_commit is not None:
                        before_commit()
                    time.sleep(min(0.1, max(0.01, deadline - time.time())))

            # Single atomic pre-commit fenced transaction for embeddings + stage completion
            with self.kernel.session.begin() as db:
                stage = db.scalar(select(IndexingStage).where(IndexingStage.version == version_id).with_for_update())
                if not stage or stage.fence != fence or stage.status != 'running':
                    raise Fault(409, 'INDEXING_LEASE_LOST')
                ver = db.get(Version, version_id)
                if not ver or ver.state not in ('completed', 'partial'):
                    raise Fault(409, 'VERSION_NOT_INDEXABLE')
                src = db.get(Source, ver.source)
                if not src or src.deleted:
                    raise Fault(409, 'SOURCE_DELETED')
                if before_commit is not None:
                    before_commit()

                has_prov = self._supports_provenance_columns(db)
                has_ib = self._has_inference_backend_col
                for span_id, vector in payloads:
                    if has_prov and has_ib:
                        db.execute(
                            text(
                                '''INSERT INTO wbctx_span_embeddings(span_id,model_id,model_revision,artifact_sha256,inference_backend,embedding)
                                   VALUES (:span,:model,:model_rev,:artifact_sha,:inference_backend,CAST(:vector AS vector))
                                   ON CONFLICT(span_id) DO UPDATE SET
                                     model_id=excluded.model_id,
                                     model_revision=excluded.model_revision,
                                     artifact_sha256=excluded.artifact_sha256,
                                     inference_backend=excluded.inference_backend,
                                     embedding=excluded.embedding'''
                            ),
                            {
                                'span': span_id,
                                'model': self.model_id,
                                'model_rev': model_rev,
                                'artifact_sha': artifact_hash,
                                'inference_backend': inference_backend,
                                'vector': vector,
                            },
                        )
                    elif has_prov:
                        db.execute(
                            text(
                                '''INSERT INTO wbctx_span_embeddings(span_id,model_id,model_revision,artifact_sha256,embedding)
                                   VALUES (:span,:model,:model_rev,:artifact_sha,CAST(:vector AS vector))
                                   ON CONFLICT(span_id) DO UPDATE SET
                                     model_id=excluded.model_id,
                                     model_revision=excluded.model_revision,
                                     artifact_sha256=excluded.artifact_sha256,
                                     embedding=excluded.embedding'''
                            ),
                            {
                                'span': span_id,
                                'model': self.model_id,
                                'model_rev': model_rev,
                                'artifact_sha': artifact_hash,
                                'vector': vector,
                            },
                        )
                    else:
                        db.execute(
                            text(
                                '''INSERT INTO wbctx_span_embeddings(span_id,model_id,embedding)
                                   VALUES (:span,:model,CAST(:vector AS vector))
                                   ON CONFLICT(span_id) DO UPDATE SET
                                     model_id=excluded.model_id,
                                     embedding=excluded.embedding'''
                            ),
                            {'span': span_id, 'model': self.model_id, 'vector': vector},
                        )

                stage.status = 'completed'
                stage.indexed_spans = len(payloads)
                stage.model_revision = model_rev
                stage.artifact_sha256 = artifact_hash
                stage.inference_backend = inference_backend
                stage.error = None
                stage.updated_at = time.time()
                job = db.scalar(select(Job).where(Job.version == version_id).with_for_update())
                if job and job.state != 'cancelled':
                    job.state = 'completed'
                    job.error = None

            return {
                'indexed_spans': len(payloads),
                'model_id': self.model_id,
                'model_revision': model_rev,
                'artifact_sha256': artifact_hash,
                'inference_backend': inference_backend,
            }
        except Exception as exc:
            if exc.__class__.__name__ in ('CancelledError', 'CanceledError'):
                with self.kernel.session.begin() as db:
                    stage = db.scalar(select(IndexingStage).where(IndexingStage.version == version_id).with_for_update())
                    if stage and stage.fence == fence and stage.status == 'running':
                        stage.status = 'cancelled'
                        stage.error = 'ACTIVITY_CANCELLED'
                        stage.updated_at = time.time()
                raise
            err_msg = str(exc)[:255]
            with self.kernel.session.begin() as db:
                stage = db.scalar(select(IndexingStage).where(IndexingStage.version == version_id).with_for_update())
                if stage and stage.fence == fence and stage.status == 'running':
                    stage.status = 'failed'
                    stage.error = err_msg
                    stage.updated_at = time.time()
                job = db.scalar(select(Job).where(Job.version == version_id).with_for_update())
                if job and job.state != 'cancelled':
                    job.state = 'failed'
                    job.error = 'INDEXING_FAILED'
            raise

    def retrieve(self, claims, query, limit=5, as_of=None):
        if not 1 <= limit <= 20:
            raise Fault(422, 'INVALID_LIMIT')
        model_rev = getattr(self.embed, 'model_revision', None) if self.embed is not None else None
        artifact_hash = getattr(self.embed, 'artifact_sha256', None) if self.embed is not None else None
        inference_backend = getattr(self.embed, 'inference_backend', None) if self.embed is not None else None
        params = {k: claims[k] for k in ('org','run','workspace','role')}
        params.update(
            query=query,
            as_of=as_of,
            model=self.model_id,
            model_rev=model_rev,
            artifact_sha=artifact_hash,
            inference_backend=inference_backend,
        )
        with self.kernel.engine.connect() as conn:
            lexical = [dict(x) for x in conn.execute(text(LEXICAL),params).mappings()]
            dense = []
            if self.embed is not None:
                params['vector']=vector_literal(self.embed(query))
                if self._supports_provenance_columns(conn) and self._has_inference_backend_col:
                    dense=[dict(x) for x in conn.execute(text(DENSE_STRICT_PROVENANCE),params).mappings()]
                elif self._supports_provenance_columns(conn):
                    legacy_prov_dense = ELIGIBLE + '''SELECT a.*,e.embedding <=> CAST(:vector AS vector) distance
 FROM allowed a JOIN wbctx_span_embeddings e ON e.span_id=a.span_id
 WHERE e.model_id=:model
   AND (CAST(:model_rev AS varchar) IS NULL OR e.model_revision=CAST(:model_rev AS varchar))
   AND (CAST(:artifact_sha AS varchar) IS NULL OR e.artifact_sha256=CAST(:artifact_sha AS varchar))
 ORDER BY distance,span_id LIMIT 50'''
                    dense=[dict(x) for x in conn.execute(text(legacy_prov_dense),params).mappings()]
                else:
                    old_dense = ELIGIBLE + '''SELECT a.*,e.embedding <=> CAST(:vector AS vector) distance
 FROM allowed a JOIN wbctx_span_embeddings e ON e.span_id=a.span_id
 WHERE e.model_id=:model ORDER BY distance,span_id LIMIT 50'''
                    dense=[dict(x) for x in conn.execute(text(old_dense),params).mappings()]
        merged={}
        for ranking in (lexical,dense):
            for rank,row in enumerate(ranking,1):
                item=merged.setdefault(row['span_id'],{k:v for k,v in row.items() if k not in ('score','distance')})
                item['rrf_score']=item.get('rrf_score',0)+1/(60+rank)
                item['employer_approval']='NOT_OBTAINED'
        return {'mode':'retrieval_only','status':'RETRIEVAL_ONLY_COMPLETE','answer':None,
                'passages':sorted(merged.values(),key=lambda r:(-r['rrf_score'],r['span_id']))[:limit],
                'retrieval_method':'postgres-fts+pgvector-rrf' if self.embed else 'postgres-fts',
                'dense_enabled':self.embed is not None,
                'has_validation_errors': False,
                'disclaimer':'SOURCE MATERIAL / NOT EMPLOYER-APPROVED; retrieval does not verify competence'}
