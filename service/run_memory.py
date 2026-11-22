"""Operator runner. Safe defaults: FTS only, no generation, graph opt-in via SDK."""
import argparse
import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from .cli import configured
from .hybrid import HybridRetriever

def hybrid_for(kernel):
    from .provider_factory import LocalBGEEmbedder
    weights = os.environ.get("WORKBYLINE_EMBEDDING_WEIGHTS")
    embed = LocalBGEEmbedder(weights) if weights else None
    model = os.environ.get("WORKBYLINE_EMBEDDING_MODEL", "unconfigured")
    if embed is not None:
        if model != "unconfigured" and model != embed.model_id:
            raise ValueError(f"EMBEDDING_MODEL_MISMATCH: expected {embed.model_id}, got {model}")
        model = embed.model_id
    return HybridRetriever(kernel, model, embed)

async def temporal_main(kernel,command):
    from temporalio.client import Client
    from temporalio.worker import Worker
    from .temporal_pipeline import EvidenceVersionWorkflow,EvidenceActivities,dispatch_pending
    address=os.environ.get('TEMPORAL_ADDRESS','127.0.0.1:7233')
    # This local rehearsal runner deliberately rejects remote services. Production
    # requires a separate TLS/auth/namespace configuration review.
    if not address.startswith(('127.0.0.1:','localhost:')):
        raise ValueError('LOCAL_TEMPORAL_ONLY')
    client = None
    for attempt in range(30):
        try:
            client = await Client.connect(address, namespace='default')
            break
        except Exception:
            if attempt == 29:
                raise
            await asyncio.sleep(1.0)
    queue='wbctx-evidence'
    if command=='dispatch':
        while True:
            await dispatch_pending(kernel,client,queue)
            await asyncio.sleep(2)
    else:
        graph=None
        if os.environ.get('WORKBYLINE_GRAPH_ENABLED')=='true':
            from .provider_factory import graphiti_from_env
            from .graph_projection import GraphProjection
            graph=GraphProjection(kernel,graphiti_from_env())
        activities=EvidenceActivities(kernel,hybrid_for(kernel) if os.environ.get("WORKBYLINE_EMBEDDING_WEIGHTS") else None,graph)
        with ThreadPoolExecutor(max_workers=4) as executor:
            async with Worker(client,task_queue=queue,workflows=[EvidenceVersionWorkflow],
                 activities=[activities.process_version,activities.index_version,activities.project_version],activity_executor=executor):
                await asyncio.Event().wait()

def main():
    parser = argparse.ArgumentParser(description="WorkByLine V3 Operator Runner")
    parser.add_argument('command', choices=['serve', 'worker', 'dispatch'])
    parser.add_argument('--port', type=int, default=int(os.environ.get("PORT", "8011")), help="Port to bind serve (default: 8011)")
    parser.add_argument('--host', type=str, default="127.0.0.1", help="Host to bind serve (default: 127.0.0.1)")
    args = parser.parse_args()
    kernel = configured()
    if args.command == 'serve':
        import uvicorn
        from .memory_api import create_memory_app
        # FTS operational without embeddings; dense indexing needs explicit provider.
        hybrid = hybrid_for(kernel)
        graph = None
        if os.environ.get('WORKBYLINE_GRAPH_ENABLED') == 'true':
            from .provider_factory import graphiti_from_env
            from .graph_projection import GraphProjection
            graph = GraphProjection(kernel, graphiti_from_env())
        generator = None
        if os.environ.get('GEMINI_API_KEY'):
            from .provider_factory import generator_from_env
            generator = generator_from_env()
        uvicorn.run(create_memory_app(kernel, hybrid, generator=generator, graph_projection=graph), host=args.host, port=args.port)
    else:
        asyncio.run(temporal_main(kernel, args.command))

if __name__=='__main__':
    main()
