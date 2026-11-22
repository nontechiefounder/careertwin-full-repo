#!/usr/bin/env python3
"""Run a persistent or in-memory local Temporal development server via the Python SDK."""
import asyncio
import os
import signal
import sys
from pathlib import Path
from temporalio.testing import WorkflowEnvironment


async def run_server():
    port = int(os.environ.get("TEMPORAL_PORT", "7233"))
    ip = os.environ.get("TEMPORAL_IP", "127.0.0.1")
    db_file = None

    if len(sys.argv) > 1 and not sys.argv[1].startswith("-"):
        db_file = sys.argv[1]
    elif os.environ.get("TEMPORAL_DB_FILENAME"):
        db_file = os.environ.get("TEMPORAL_DB_FILENAME")

    if db_file:
        Path(db_file).parent.mkdir(parents=True, exist_ok=True)

    print(f"Starting Temporal development server on {ip}:{port} (db: {db_file or 'in-memory'})...", flush=True)

    env = await WorkflowEnvironment.start_local(
        ip=ip,
        port=port,
        dev_server_database_filename=db_file,
    )
    print(f"Temporal server operational on {ip}:{port}", flush=True)

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    def handle_stop():
        print("Received shutdown signal; stopping Temporal dev server...", flush=True)
        stop_event.set()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, handle_stop)

    await stop_event.wait()
    await env.shutdown()
    print("Temporal dev server stopped cleanly.", flush=True)


if __name__ == "__main__":
    try:
        asyncio.run(run_server())
    except KeyboardInterrupt:
        pass
