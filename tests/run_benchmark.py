"""Real local TCP/HTTP benchmark, labelled test backend and generated corpus.

No LLM, no external company data, no enterprise throughput claim.
"""
import hashlib
import json
from pathlib import Path
import secrets
import socket
import statistics
import tempfile
import threading
import time
import uuid

import httpx
import uvicorn

import sys

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from service.api import create_app
from service.core import Binding, Kernel, sign


def run():
    with tempfile.TemporaryDirectory(prefix="wb-context-benchmark-") as temp:
        root=Path(temp)
        k=Kernel('sqlite:///'+str(root/'data.db'),root/'files',secrets.token_urlsafe(40),allow_sqlite=True)
        k.initialize()
        scope={'actor':'benchmark-user','org':'benchmark-org','run':'backend-run','workspace':'benchmark-workspace','role':'backend-role'}
        with k.session.begin() as db:
            db.add(Binding(**scope,active=True,can_write=True))
        def headers(op):
            now=int(time.time())
            c={**scope,'iss':'workbyline-v2-web','aud':'workbyline-context-evidence','iat':now,'exp':now+120,'operation':op,'jti':str(uuid.uuid4())}
            return {'Authorization':'Bearer '+sign(c,k.secret)}
        sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        server=uvicorn.Server(uvicorn.Config(create_app(k),log_level='error'))
        thread=threading.Thread(target=server.run,kwargs={'sockets':[sock]},daemon=True);thread.start()
        deadline=time.monotonic()+10
        while not server.started:
            if time.monotonic()>deadline:raise RuntimeError('HTTP server failed to start')
            time.sleep(.01)
        latencies=[];version_ids=[];expected_bytes={}
        try:
            with httpx.Client(base_url=f'http://127.0.0.1:{port}',timeout=15,trust_env=False) as client:
                start=time.perf_counter()
                for n in range(100):
                    content=f'Candidate {n}\nPython\nNo sponsorship\nOwned migration project {n}\nKafka optional'.encode()
                    response=client.post('/v1/workspaces/benchmark-workspace/sources',headers=headers('upload'),files={'file':(f'candidate-{n}.txt',content)},data={'source_key':f'candidate-{n}'})
                    assert response.status_code==202 and response.json()['state']=='pending'
                    version_ids.append(response.json()['version_id'])
                    expected_bytes[response.json()['version_id']]=content
                intake_seconds=time.perf_counter()-start
                from service.core import Version
                with k.session() as db:
                    for version_id, expected in expected_bytes.items():
                        original=db.get(Version,version_id)
                        assert Path(original.path).read_bytes()==expected
                        assert original.sha256==hashlib.sha256(expected).hexdigest()
                start=time.perf_counter();processed=0
                while claim:=k.claim():
                    assert k.process(claim)['ok'];processed+=1
                processing_seconds=time.perf_counter()-start
                assert processed==100 and len(set(version_ids))==100
                for n in range(30):
                    start=time.perf_counter()
                    response=client.post('/v1/workspaces/benchmark-workspace/research-qa',headers=headers('retrieve'),json={'question':'Python sponsorship','limit':5})
                    latencies.append((time.perf_counter()-start)*1000)
                    body=response.json()
                    assert response.status_code==200 and len(body['passages'])==5
                    assert body['coverage']=={'eligible_sources':100,'completed':100,'partial':0,'pending':0,'failed':0}
                    assert all(p['employer_approval']=='NOT_OBTAINED' for p in body['passages'])
                denied=client.get('/v1/workspaces/benchmark-workspace/sources')
                assert denied.status_code==401
        finally:
            server.should_exit=True;thread.join(timeout=10);sock.close();k.engine.dispose()
        return {'scope':'real TCP/HTTP on local single-process service; SQLite test backend; synthetic text corpus; no LLM',
                'documents':100,'source_versions':len(set(version_ids)),'processed':processed,
                'retrieval_requests':30,'intake_seconds':round(intake_seconds,3),'processing_seconds':round(processing_seconds,3),
                'retrieval_median_ms':round(statistics.median(latencies),2),'retrieval_p95_ms':round(sorted(latencies)[int(.95*(len(latencies)-1))],2),
                'originals_preserved':True,'coverage_reconciled':True,'unauthenticated_read_denied':True,
                'production_scale':'NOT_EVALUATED','semantic_accuracy':'NOT_EVALUATED','provider_cost':'NO_PROVIDER_CALLS'}


if __name__=='__main__':
    result=run()
    target=Path(__file__).resolve().parents[1]/'evidence/local_http_benchmark.json'
    target.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
