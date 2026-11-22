#!/usr/bin/env bash
# ==============================================================================
# WorkByLine V3 Release Candidate — Unified Local Runtime Launcher & Orchestration
# ==============================================================================
# Covers the 5 approved runtime subsystems:
#   1. PostgreSQL/Supabase & Private Storage (Authoritative records & byte integrity)
#   2. Persistent Temporal Server, Dispatcher & Worker (Durable document processing)
#   3. Graphiti Backend (Derived entity relationships)
#   4. Python Context & Memory Service API (FastAPI port 8011)
#   5. Next.js Web Application (Port 3004 / 3000)
#
# Usage:
#   ./infra/scripts/launch_workbyline_v3.sh [command]
#
# Commands:
#   all             - Run migrations, launch all subsystems, and verify API + Web readiness
#   db              - Initialize/verify forward database migrations (000-007) under session lock
#   temporal        - Start Temporal local dev server
#   dispatcher      - Run continuous Temporal ingestion dispatcher
#   worker          - Run continuous Temporal document processing worker
#   api             - Run Python Memory/Context API service (service.run_memory serve)
#   web             - Run Next.js frontend web server (production or dev mode)
#   recover-erasure - Run durable lease-based physical erasure recovery
#   status          - Check status of all subsystem processes and ports
#   stop            - Stop all running candidate background processes and child trees
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PID_DIR="${WORKTREE_ROOT}/logs/pids"
LOG_DIR="${WORKTREE_ROOT}/logs/services"
mkdir -p "${PID_DIR}" "${LOG_DIR}"

PYTHON_BIN="${WORKTREE_ROOT}/.venv/bin/python"
if [ ! -f "${PYTHON_BIN}" ]; then
  PYTHON_BIN="python3"
fi
export PATH="${WORKTREE_ROOT}/.venv/bin:${PATH}"

# Load environment configuration safely without exporting literals
if [ -f "${WORKTREE_ROOT}/apps/web/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${WORKTREE_ROOT}/apps/web/.env.local"
  set +a
fi
if [ -f "${WORKTREE_ROOT}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${WORKTREE_ROOT}/.env"
  set +a
fi
if [ -f "${WORKTREE_ROOT}/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${WORKTREE_ROOT}/.env.local"
  set +a
fi

DB_URL="${WORKBYLINE_CONTEXT_DATABASE_URL:-${DATABASE_URL:-}}"
STORAGE_DIR="${WORKBYLINE_CONTEXT_STORAGE:-${WORKTREE_ROOT}/private-context-storage}"
TEMPORAL_ADDR="${TEMPORAL_ADDRESS:-127.0.0.1:7233}"
if [[ "${TEMPORAL_ADDR}" != 127.0.0.1:* && "${TEMPORAL_ADDR}" != localhost:* ]]; then
  echo "ERROR: TEMPORAL_ADDRESS must be a local address (127.0.0.1 or localhost). Got: ${TEMPORAL_ADDR}" >&2
  exit 1
fi
API_PORT="${API_PORT:-8011}"
WEB_PORT="${WEB_PORT:-3004}"

check_postgres() {
  echo "Checking PostgreSQL connectivity..."
  if [ -z "${DB_URL}" ]; then
    echo "ERROR: Neither WORKBYLINE_CONTEXT_DATABASE_URL nor DATABASE_URL is set." >&2
    echo "Please configure .env before starting services." >&2
    exit 1
  fi
  mkdir -p "${STORAGE_DIR}"
  chmod 700 "${STORAGE_DIR}" 2>/dev/null || true
  echo "Private storage initialized at: ${STORAGE_DIR}"
}

run_migrations() {
  echo "=== Running Single-Session Advisory-Locked Forward Migrations (000 -> 009) ==="
  if [ -z "${DB_URL}" ]; then
    echo "ERROR: DATABASE_URL is required for migrations." >&2
    exit 1
  fi
  # shellcheck disable=SC1091
  source "${WORKTREE_ROOT}/infra/deployment/db_target_guard.sh"
  assert_disposable_db_target "${DB_URL}"
  SAFE_TARGET="$(mask_target_identity "${DB_URL}")"
  echo "  Target verified as disposable: ${SAFE_TARGET}"

  SEED_ARGS=()
  if [ "${WORKBYLINE_SEED_SYNTHETIC_BINDINGS:-true}" = "true" ]; then
    SEED_ARGS+=(--seed-synthetic-bindings)
  fi

  PYTHONPATH="${WORKTREE_ROOT}" "${PYTHON_BIN}" "${WORKTREE_ROOT}/scripts/run_forward_migrations.py" \
    --db-url "${DB_URL}" \
    --migrations-dir "${WORKTREE_ROOT}/migrations" \
    "${SEED_ARGS[@]}"
}

export_child_env() {
  export WORKBYLINE_CONTEXT_DATABASE_URL="${DB_URL}"
  export DATABASE_URL="${DB_URL}"
  export WORKBYLINE_CONTEXT_STORAGE="${STORAGE_DIR}"
  export WORKBYLINE_CONTEXT_SERVICE_URL="${WORKBYLINE_CONTEXT_SERVICE_URL:-http://127.0.0.1:${API_PORT}}"
  if [ -z "${WORKBYLINE_CONTEXT_DELEGATION_SECRET:-}" ] && [ -f "${WORKTREE_ROOT}/apps/web/.env.local" ]; then
    _SECRET_FROM_FILE=$(grep -E '^WORKBYLINE_CONTEXT_DELEGATION_SECRET=' "${WORKTREE_ROOT}/apps/web/.env.local" | cut -d '=' -f2-)
    if [ -n "${_SECRET_FROM_FILE}" ]; then
      export WORKBYLINE_CONTEXT_DELEGATION_SECRET="${_SECRET_FROM_FILE}"
    fi
  fi
  if [ -z "${WORKBYLINE_CONTEXT_DELEGATION_SECRET:-}" ] || [ "${#WORKBYLINE_CONTEXT_DELEGATION_SECRET}" -lt 32 ]; then
    echo "ERROR: WORKBYLINE_CONTEXT_DELEGATION_SECRET must be explicitly provided in the environment (length >= 32)." >&2
    exit 1
  fi
  export WORKBYLINE_CONTEXT_DELEGATION_SECRET="${WORKBYLINE_CONTEXT_DELEGATION_SECRET}"
  export WORKBYLINE_ENGINE_MAPPINGS="${WORKBYLINE_ENGINE_MAPPINGS:-{\"00000000-0000-4000-c000-000000000001\":{\"companyName\":\"Organization Alpha Corp\",\"corpusScope\":\"TENANT_PRIVATE\",\"runs\":{\"1bea003e-9466-4e4e-a185-6cc7cdd06ff1\":{\"workspaceId\":\"ws_alpha_corp\",\"roleId\":\"role_alpha_lead\",\"corpusScope\":\"TENANT_PRIVATE\",\"status\":\"active\"},\"95709284-d21b-496e-bb7c-6c68d067c422\":{\"workspaceId\":\"ws_alpha_corp\",\"roleId\":\"role_alpha_lead\",\"corpusScope\":\"TENANT_PRIVATE\",\"status\":\"active\"}}},\"00000000-0000-4000-c000-000000000002\":{\"companyName\":\"Organization Beta Corp\",\"corpusScope\":\"TENANT_PRIVATE\",\"runs\":{\"22222222-2222-4000-c000-000000000002\":{\"workspaceId\":\"ws_beta_corp\",\"roleId\":\"role_beta_lead\",\"corpusScope\":\"TENANT_PRIVATE\",\"status\":\"active\"}}}}}"
  export WORKBYLINE_EMBEDDING_WEIGHTS="${WORKBYLINE_EMBEDDING_WEIGHTS:-/tmp/workbyline_bge_small_en_v1_5}"
  export WORKBYLINE_EMBEDDING_MODEL="${WORKBYLINE_EMBEDDING_MODEL:-bge-small-en-v1.5}"
  export WORKBYLINE_EMBEDDING_REVISION="${WORKBYLINE_EMBEDDING_REVISION:-5c38ec7c405ec4b44b94cc5a9bb96e735b38267a}"
  export WORKBYLINE_EMBEDDING_CONFIG_SHA256="${WORKBYLINE_EMBEDDING_CONFIG_SHA256:-094f8e891b932f2000c92cfc663bac4c62069f5d8af5b5278c4306aef3084750}"
  export WORKBYLINE_EMBEDDING_ARTIFACT_SHA256="${WORKBYLINE_EMBEDDING_ARTIFACT_SHA256:-5650b43c69a52dc94d243256be3a974a8836090b043531cec56ae64ac2fc3d0a}"
  export WORKBYLINE_GRAPH_ENABLED="${WORKBYLINE_GRAPH_ENABLED:-false}"
  export WORKBYLINE_GRAPH_URI="${WORKBYLINE_GRAPH_URI:-}"
  export WORKBYLINE_GRAPH_USER="${WORKBYLINE_GRAPH_USER:-}"
  export WORKBYLINE_GRAPH_PASSWORD="${WORKBYLINE_GRAPH_PASSWORD:-}"
  export WORKBYLINE_GRAPH_LLM_MODEL="${WORKBYLINE_GRAPH_LLM_MODEL:-gemini-2.5-flash}"
  export WORKBYLINE_GRAPH_EMBEDDING_MODEL="${WORKBYLINE_GRAPH_EMBEDDING_MODEL:-gemini-embedding-001}"
  export GRAPHITI_TELEMETRY_ENABLED="${GRAPHITI_TELEMETRY_ENABLED:-false}"
  export GEMINI_API_KEY="${GEMINI_API_KEY:-}"
  export WORKBYLINE_GENERATION_GATE="${WORKBYLINE_GENERATION_GATE:-false}"
  export WORKBYLINE_GENERATION_MODEL="${WORKBYLINE_GENERATION_MODEL:-gemini-2.5-flash}"
  export TEMPORAL_ADDRESS="${TEMPORAL_ADDR}"
  export WORKBYLINE_REQUIRE_TEMPORAL_READY="${WORKBYLINE_REQUIRE_TEMPORAL_READY:-true}"
  export WORKBYLINE_HEARTBEAT_INTERVAL_SEC="${WORKBYLINE_HEARTBEAT_INTERVAL_SEC:-1.0}"
  export WORKBYLINE_LEASE_RENEWAL_INTERVAL_SEC="${WORKBYLINE_LEASE_RENEWAL_INTERVAL_SEC:-2.0}"
  export WORKBYLINE_LEASE_DURATION_SEC="${WORKBYLINE_LEASE_DURATION_SEC:-8}"
  export WORKBYLINE_INITIAL_LEASE_SEC="${WORKBYLINE_INITIAL_LEASE_SEC:-8}"
  export WORKBYLINE_TEST_PARSE_DELAY_SEC="${WORKBYLINE_TEST_PARSE_DELAY_SEC:-0.0}"
  export WORKBYLINE_TEST_INDEX_DELAY_SEC="${WORKBYLINE_TEST_INDEX_DELAY_SEC:-0.0}"
  export PORT="${API_PORT}"
  export WEB_PORT="${WEB_PORT}"
  export CAREERTWIN_DRY_RUN_EMAIL=true
}

stop_existing_service() {
  local svc="$1"
  local pidfile="${PID_DIR}/${svc}.pid"
  if [ -f "${pidfile}" ]; then
    local pid
    pid="$(cat "${pidfile}" 2>/dev/null || true)"
    if [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null; then
      echo "  Stopping existing ${svc} (PID ${pid})..."
      stop_process_tree "${pid}"
    fi
    rm -f "${pidfile}"
  fi
}

start_temporal_server() {
  echo "=== Starting Temporal Local Dev Server ==="
  stop_existing_service "temporal"
  if command -v temporal >/dev/null 2>&1; then
    nohup temporal server start-dev --ip 127.0.0.1 --port 7233 --db-filename "${WORKTREE_ROOT}/logs/temporal.db" --headless < /dev/null > "${LOG_DIR}/temporal.log" 2>&1 &
    echo $! > "${PID_DIR}/temporal.pid"
    echo "Temporal server PID: $(cat "${PID_DIR}/temporal.pid") (cli)"
  else
    echo "Using embedded Python Temporal development server..."
    nohup "${PYTHON_BIN}" "${WORKTREE_ROOT}/scripts/start_temporal_server.py" "${WORKTREE_ROOT}/logs/temporal.db" < /dev/null > "${LOG_DIR}/temporal.log" 2>&1 &
    echo $! > "${PID_DIR}/temporal.pid"
    echo "Temporal server PID: $(cat "${PID_DIR}/temporal.pid") (python runner)"
  fi
  for _ in {1..30}; do
    if nc -z 127.0.0.1 7233 >/dev/null 2>&1; then
      echo "  -> Temporal server listening on 127.0.0.1:7233"
      break
    fi
    sleep 0.5
  done
}

start_dispatcher() {
  echo "=== Starting Continuous Temporal Dispatcher ==="
  stop_existing_service "dispatcher"
  export_child_env
  nohup env PYTHONPATH="${WORKTREE_ROOT}" "${PYTHON_BIN}" -m service.run_memory dispatch > "${LOG_DIR}/dispatcher.log" 2>&1 &
  echo $! > "${PID_DIR}/dispatcher.pid"
  echo "Dispatcher PID: $(cat "${PID_DIR}/dispatcher.pid")"
}

start_worker() {
  echo "=== Starting Continuous Temporal Document Worker ==="
  stop_existing_service "worker"
  export_child_env
  nohup env PYTHONPATH="${WORKTREE_ROOT}" "${PYTHON_BIN}" -m service.run_memory worker > "${LOG_DIR}/worker.log" 2>&1 &
  echo $! > "${PID_DIR}/worker.pid"
  echo "Worker PID: $(cat "${PID_DIR}/worker.pid")"
}

start_api() {
  echo "=== Starting Python Memory & Evidence API Service (Port ${API_PORT}) ==="
  stop_existing_service "api"
  export_child_env
  nohup env PYTHONPATH="${WORKTREE_ROOT}" "${PYTHON_BIN}" -m service.run_memory serve --port "${API_PORT}" > "${LOG_DIR}/api.log" 2>&1 &
  echo $! > "${PID_DIR}/api.pid"
  echo "API Service PID: $(cat "${PID_DIR}/api.pid")"
}

start_web() {
  echo "=== Starting Next.js Web Server (Port ${WEB_PORT}) ==="
  stop_existing_service "web"
  export_child_env
  export WORKBYLINE_CONTEXT_API_URL="http://127.0.0.1:${API_PORT}"
  if [ "${WORKBYLINE_WEB_MODE:-production}" = "production" ] || [ "${NODE_ENV:-}" = "production" ]; then
    if [ ! -f "${WORKTREE_ROOT}/apps/web/.next/BUILD_ID" ] || [ "${WORKBYLINE_FORCE_WEB_BUILD:-false}" = "true" ]; then
      echo "  Building production Next.js bundle..."
      (cd "${WORKTREE_ROOT}/apps/web" && npm run build > "${LOG_DIR}/web_build.log" 2>&1)
    fi
    echo "  Starting production Next.js server on port ${WEB_PORT}..."
    (cd "${WORKTREE_ROOT}/apps/web" && nohup npx next start -p "${WEB_PORT}" -H 127.0.0.1 > "${LOG_DIR}/web.log" 2>&1 & echo $! > "${PID_DIR}/web.pid")
  else
    echo "  Starting development Next.js server on port ${WEB_PORT}..."
    (cd "${WORKTREE_ROOT}/apps/web" && nohup npx next dev -p "${WEB_PORT}" -H 127.0.0.1 > "${LOG_DIR}/web.log" 2>&1 & echo $! > "${PID_DIR}/web.pid")
  fi
  echo "Next.js Web PID: $(cat "${PID_DIR}/web.pid")"
}

recover_erasure() {
  echo "=== Recovering Interrupted Physical Disk Erasures ==="
  export_child_env
  PYTHONPATH="${WORKTREE_ROOT}" "${PYTHON_BIN}" -m service.cli recover-erasure
}

check_status() {
  echo "=== WorkByLine V3 Runtime Subsystem Status ==="
  for svc in temporal dispatcher worker api web; do
    pidfile="${PID_DIR}/${svc}.pid"
    if [ -f "${pidfile}" ] && kill -0 "$(cat "${pidfile}")" 2>/dev/null; then
      echo "  [RUNNING] ${svc} (PID $(cat "${pidfile}"))"
    else
      echo "  [STOPPED] ${svc}"
    fi
  done
}

stop_process_tree() {
  local pid="$1"
  if [ -z "${pid}" ]; then
    return
  fi
  # Stop child processes first
  pkill -TERM -P "${pid}" 2>/dev/null || true
  if kill -0 "${pid}" 2>/dev/null; then
    kill -TERM "${pid}" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
      if ! kill -0 "${pid}" 2>/dev/null; then
        break
      fi
      sleep 0.2
    done
    if kill -0 "${pid}" 2>/dev/null; then
      pkill -KILL -P "${pid}" 2>/dev/null || true
      kill -KILL "${pid}" 2>/dev/null || true
    fi
  fi
}

stop_all() {
  echo "=== Stopping WorkByLine V3 Services ==="
  for svc in web api worker dispatcher temporal; do
    pidfile="${PID_DIR}/${svc}.pid"
    if [ -f "${pidfile}" ]; then
      pid="$(cat "${pidfile}")"
      if kill -0 "${pid}" 2>/dev/null; then
        echo "  Stopping ${svc} (PID ${pid})..."
        stop_process_tree "${pid}"
      fi
      rm -f "${pidfile}"
    fi
  done
  echo "All candidate background processes stopped."
}

cmd="${1:-all}"
case "${cmd}" in
  all)
    check_postgres
    run_migrations
    start_temporal_server
    sleep 2
    start_dispatcher
    start_worker
    start_api
    start_web
    echo ""
    echo "Subsystem processes launched; verifying API operational readiness at http://127.0.0.1:${API_PORT}/health..."
    api_ready=false
    for _ in {1..30}; do
      health_json="$(curl -s -f --max-time 3 "http://127.0.0.1:${API_PORT}/health" 2>/dev/null || true)"
      if [ -n "${health_json}" ] && echo "${health_json}" | grep -q '"status":"ready"' && echo "${health_json}" | grep -Eq '"temporal":"(connected_worker_active|ready)"'; then
        api_ready=true
        break
      fi
      sleep 1
    done

    if [ "${api_ready}" != "true" ]; then
      echo "ERROR: API or Temporal worker operational readiness check failed after 30s. Exiting." >&2
      echo "Last /health response: ${health_json:-none}" >&2
      stop_all
      exit 1
    fi
    echo "  -> API & Temporal worker operational readiness verified."

    echo "Verifying Next.js Web readiness at http://127.0.0.1:${WEB_PORT}..."
    web_ready=false
    for _ in {1..30}; do
      http_code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://127.0.0.1:${WEB_PORT}" 2>/dev/null || echo "000")"
      if [ "${http_code}" != "000" ] && [ "${http_code}" -lt 500 ]; then
        web_ready=true
        break
      fi
      sleep 1
    done

    if [ "${web_ready}" != "true" ]; then
      echo "ERROR: Next.js Web readiness check failed on port ${WEB_PORT} after 30s. Exiting." >&2
      stop_all
      exit 1
    fi
    echo "  -> Next.js Web readiness verified (HTTP ${http_code})."
    echo "=== [READY] All subsystems operational and verified ==="
    if [ "${WORKBYLINE_HOLD_PROCESSES:-false}" = "true" ] || [ "${2:-}" = "--hold" ]; then
      echo "Holding background services in session..."
      wait
    fi
    ;;
  db)
    check_postgres
    run_migrations
    ;;
  temporal)
    start_temporal_server
    ;;
  dispatcher)
    start_dispatcher
    ;;
  worker)
    start_worker
    ;;
  api)
    start_api
    ;;
  web)
    start_web
    ;;
  recover-erasure)
    recover_erasure
    ;;
  status)
    check_status
    ;;
  stop)
    stop_all
    ;;
  *)
    echo "Usage: $0 {all|db|temporal|dispatcher|worker|api|web|status|stop|recover-erasure}"
    exit 1
    ;;
esac
