"""Actual Temporal workflow-server acceptance. Fail when unavailable; no fake PASS."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker
from service.core import Kernel
from service.temporal_pipeline import EvidenceActivities,EvidenceVersionWorkflow

async def main():
    with TemporaryDirectory() as tmp:
        kernel=Kernel('sqlite:///'+tmp+'/db',Path(tmp)/'bytes','test-'+40*'x',allow_sqlite=True)
        kernel.initialize()
        c={'actor':'a','org':'o','run':'r','workspace':'w','role':'role'}
        o=kernel.ingest(c,'spec','spec.txt',b'Python\nNo sponsorship')
        env=await asyncio.wait_for(WorkflowEnvironment.start_time_skipping(),timeout=30)
        try:
            acts=EvidenceActivities(kernel)
            with ThreadPoolExecutor(max_workers=2) as executor:
                async with Worker(env.client,task_queue='acceptance',workflows=[EvidenceVersionWorkflow],
                   activities=[acts.process_version,acts.index_version,acts.project_version],activity_executor=executor):
                    result=await env.client.execute_workflow(EvidenceVersionWorkflow.run,o['version_id'],id='acceptance-'+o['version_id'],task_queue='acceptance')
                    assert result['graph_projection']=='NOT_ENABLED' and result['ok'] and kernel.inspect(c,o['source_id'])['state']=='completed'
                    print('PASS actual Temporal workflow server + parser activity; SQLite evidence backend')
        finally:
            await env.shutdown()

if __name__=='__main__':
    asyncio.run(main())
