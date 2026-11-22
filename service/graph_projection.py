"""Graphiti is a derived index. Authorize and re-resolve all episode candidates."""
import hashlib
import json
import uuid
from datetime import datetime, timezone
from graphiti_core.nodes import EpisodeType
from sqlalchemy import select
from .core import Source, Version, Fault


def namespace(claims):
    scope = [claims[k] for k in ('org','run','workspace','role')]
    if any(not isinstance(v,str) or not v.strip() for v in scope):
        raise Fault(403,'INVALID_GRAPH_SCOPE')
    return 'wbctx_' + hashlib.sha256(json.dumps(scope).encode()).hexdigest()


def episode_id(version_id):
    return str(uuid.uuid5(uuid.NAMESPACE_URL,'workbyline-context-version:'+version_id))


def allowed_versions(kernel, claims, as_of=None):
    # Source of truth consulted at READ time, including deletion/supersession.
    with kernel.session() as db:
        ids=db.scalars(select(Source.id).where(*kernel._scope(claims),Source.deleted.is_(False))).all()
    result={}
    for source_id in ids:
        try:
            doc=kernel.inspect(claims,source_id,as_of)
        except Fault:
            continue
        if doc['state'] in ('completed','partial'):
            result[episode_id(doc['version_id'])]=doc
    return result


class GraphProjection:
    def __init__(self,kernel,client):
        # Inject an explicitly configured Graphiti SDK instance. No implicit API key.
        self.kernel,self.client=kernel,client

    async def project_version(self,version_id,*,before_commit=None):
        from .core import Projection, uid
        with self.kernel.session() as db:
            ver=db.get(Version,version_id)
            if not ver:
                raise Fault(404,'VERSION_NOT_FOUND')
            source=db.get(Source,ver.source)
            claims={k:getattr(source,k) for k in ('org','run','workspace','role')}
            source_id=source.id
        doc=self.kernel.inspect(claims,source_id)
        if doc['version_id']!=version_id or doc['state'] not in ('completed','partial'):
            return {'status':'SKIPPED_NOT_CURRENT_COMPLETE'}

        fence = uid()
        now_ts = datetime.now(timezone.utc).timestamp()
        with self.kernel.session.begin() as db:
            proj = db.scalar(select(Projection).where(Projection.version == version_id).with_for_update())
            if not proj:
                db.add(Projection(version=version_id, status='pending', fence=fence, updated_at=now_ts))
            else:
                proj.status = 'pending'
                proj.fence = fence
                proj.updated_at = now_ts

        # Immutable deterministic UUID is passed to Graphiti; native replay needs
        # live acceptance before automatic projection retries may be enabled.
        body=json.dumps({'source_id':source_id,'version_id':version_id,
                         'spans':doc['spans'],'approval':'NOT_OBTAINED'})
        try:
            if before_commit is not None:
                before_commit()
            await self.client.add_episode(name='Evidence '+version_id,
                episode_body=body,
                source_description='WorkByLine immutable source version; derived extraction, not verified truth',
                reference_time=datetime.fromtimestamp(doc['observed_at'],timezone.utc),
                source=EpisodeType.json,group_id=namespace(claims),uuid=episode_id(version_id))
            eid = episode_id(version_id)
            with self.kernel.session.begin() as db:
                proj = db.scalar(select(Projection).where(Projection.version == version_id).with_for_update())
                if not proj or proj.fence != fence:
                    raise Fault(409, 'PROJECTION_LEASE_LOST')
                if before_commit is not None:
                    before_commit()
                proj.status = 'projected'
                proj.episode_id = eid
                proj.error = None
                proj.updated_at = datetime.now(timezone.utc).timestamp()
            return {'status':'PROJECTED','episode_id':eid}
        except Exception as exc:
            if exc.__class__.__name__ in ('CancelledError', 'CanceledError'):
                with self.kernel.session.begin() as db:
                    proj = db.scalar(select(Projection).where(Projection.version == version_id).with_for_update())
                    if proj and proj.fence == fence:
                        proj.status = 'cancelled'
                        proj.error = 'ACTIVITY_CANCELLED'
                        proj.updated_at = datetime.now(timezone.utc).timestamp()
                raise
            err_msg = str(exc)[:255]
            with self.kernel.session.begin() as db:
                proj = db.scalar(select(Projection).where(Projection.version == version_id).with_for_update())
                if proj and proj.fence == fence:
                    proj.status = 'failed'
                    proj.error = err_msg
                    proj.updated_at = datetime.now(timezone.utc).timestamp()
            return {'status':'FAILED','error':err_msg}

    async def candidate_versions(self,claims,query,as_of=None):
        allowed=allowed_versions(self.kernel,claims,as_of)
        edges=await self.client.search(query=query,group_ids=[namespace(claims)],num_results=20)
        selected={}
        for edge in edges:
            if edge.group_id != namespace(claims):
                continue
            provenance=set(edge.episodes or [])
            # Mixed stale/private provenance cannot influence active results.
            if not provenance or not provenance.issubset(allowed):
                continue
            for eid in provenance:
                selected[eid]=allowed[eid]
        # Recheck on return: a source may have been revoked during graph I/O.
        still_allowed=allowed_versions(self.kernel,claims,as_of)
        return [doc for eid,doc in selected.items() if eid in still_allowed]
