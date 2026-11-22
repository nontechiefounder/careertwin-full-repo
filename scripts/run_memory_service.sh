#!/bin/bash
cd /Users/darshilparmar/Desktop/Genome/careertwin-v2-memory-expansion-worktree
source /tmp/wb_venv/bin/activate
export WORKBYLINE_CONTEXT_DATABASE_URL="postgresql+psycopg://postgres:postgres@127.0.0.1:54399/disposable_v3_db"
export WORKBYLINE_CONTEXT_STORAGE="/tmp/wbctx_live_storage"
export WORKBYLINE_CONTEXT_DELEGATION_SECRET="acceptance-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
exec python -m service.run_memory serve --host 127.0.0.1 --port 8011
