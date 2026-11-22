"""Explicit local/server operator entry points. Never log configuration values."""
import argparse
import os
import time

from .core import Binding, Kernel


def configured():
    return Kernel(os.environ.get("WORKBYLINE_CONTEXT_DATABASE_URL"),
                  os.environ.get("WORKBYLINE_CONTEXT_STORAGE", "./private-context-storage"),
                  os.environ.get("WORKBYLINE_CONTEXT_DELEGATION_SECRET"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["initialize", "provision", "worker", "serve", "recover-erasure"])
    for field in ("actor", "org", "run", "workspace", "role"):
        parser.add_argument("--" + field)
    parser.add_argument("--read-only", action="store_true")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--maintenance-mode-override", action="store_true", help="Explicit override to run low-level maintenance parsing worker bypassing Temporal")
    parser.add_argument("--port", type=int, default=8011)
    args = parser.parse_args()
    kernel = configured()
    if args.command == "initialize":
        kernel.initialize()
    elif args.command == "provision":
        fields = {f: getattr(args, f) for f in ("actor", "org", "run", "workspace", "role")}
        if not all(fields.values()):
            parser.error("All scope fields required for explicit operator provisioning")
        with kernel.session.begin() as db:
            db.add(Binding(**fields, active=True, can_write=not args.read_only))
    elif args.command == "worker":
        if not args.maintenance_mode_override:
            parser.error(
                "CRITICAL: 'service.cli worker' is a low-level maintenance utility that only executes raw parsing "
                "and BYPASSES Temporal durable orchestration, hybrid embedding indexing, and Graphiti projection. "
                "In WorkByLine V3, the standard application path is 'python -m service.run_memory worker' and "
                "'python -m service.run_memory dispatch'. To execute this bare maintenance tool for offline repair, "
                "you must explicitly supply --maintenance-mode-override."
            )
        print("[WARNING] Running low-level maintenance worker. Bypassing Temporal, embeddings, and graph projection.", flush=True)
        while True:
            claim = kernel.claim()
            if claim:
                print(kernel.process(claim), flush=True)
            elif args.once:
                break
            else:
                time.sleep(1)
    elif args.command == "recover-erasure":
        import json
        result = kernel.recover_interrupted_erasures()
        print(
            f"[RECOVERY] Recovered {result['recovered_count']} tombstones, "
            f"unlinked {result['unlinked_files']} disk files, "
            f"failed {result['failed_count']} (pending_backlog={result['pending_backlog']}, "
            f"failed_backlog={result['failed_backlog']}).",
            flush=True,
        )
        if result["errors"]:
            print(f"[RECOVERY ERRORS] {json.dumps(result['errors'])}", flush=True)
    else:
        import uvicorn
        from .api import create_app
        uvicorn.run(create_app(kernel), host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
