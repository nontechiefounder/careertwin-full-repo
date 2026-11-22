#!/usr/bin/env bash
# ==============================================================================
# GUARDED DISPOSABLE VERIFICATION ENTRY POINT (WORKBYLINE / GENOME V3 TRACK 1)
# ==============================================================================
# Prerequisites (must already exist on the disposable target before invocation):
#   1. All 24 baseline migrations applied in order:
#      supabase/migrations/20260803000001_operational_schema_baseline.sql through
#      supabase/migrations/20260819000001_datavertex_transactional_shortlist_and_credit_ledger.sql
#   2. Private storage bucket 'candidate_resumes' provisioned (20260817000001).
#   3. Synthetic fixtures seeded:
#      - supabase/seed.sql (synthetic.employer.alpha@example.invalid, org ...c000-000000000001, run ...a111-111111111111)
#      - D2C staging fixtures (d2c.alpha.owner@example.com, d2c.beta.owner@example.com,
#        org 00000000-0000-4000-d2c0-000000000001, run 11111111-1111-4111-d2c1-111111111111,
#        org 00000000-0000-4000-d2c0-000000000002, run 11111111-1111-4111-d2c1-222222222222)
#        authenticating via CAREERTWIN_STAGING_TEST_PASSWORD.
#
# Security & Isolation Guarantees:
#   1. Separates external connection/host port (DISPOSABLE_DB_PORT) from internal
#      PostgreSQL port (DISPOSABLE_DB_INTERNAL_PORT / inet_server_port()).
#      Fails closed if required Docker container or host listener identity checks
#      cannot execute.
#   2. Rejects protected baseline ports (54330, 54331, 54332, 54333, 54334, 54335) and
#      protected container identifiers (careertwin-local-baseline).
#   3. Completes read-only prerequisite & 4-way SQL <-> Auth <-> REST <-> Storage
#      correspondence BEFORE any write, migration, build, or test execution.
#   4. Stages an isolated source copy excluding supabase/.temp, supabase/.branches,
#      .env* secrets, credential files, and symlinks escaping ISOLATED_RUN_DIR;
#      runs all build/test/server steps under a strict env -i allowlist.
#   5. Preserves sanitized logs, summary metadata, and Playwright artifacts into
#      logs/guarded_verify_<run_id> BEFORE cleanup on both passing and failing runs.
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

VERIFICATION_PORT="${DISPOSABLE_VERIFICATION_PORT:-3010}"
if ! [[ "${VERIFICATION_PORT}" =~ ^[0-9]+$ ]]; then
  echo "FATAL: DISPOSABLE_VERIFICATION_PORT ('${VERIFICATION_PORT}') must be a numeric TCP port." >&2
  exit 1
fi
if [[ "${VERIFICATION_PORT}" == "3000" ]] || [[ "${VERIFICATION_PORT}" == "3004" ]]; then
  echo "FATAL GUARD REJECTION: Occupied application port ${VERIFICATION_PORT} rejected; use disposable verification port 3010." >&2
  exit 1
fi
VERIFICATION_URL="http://localhost:${VERIFICATION_PORT}"
DISPOSABLE_CONTEXT_SERVICE_URL="${WORKBYLINE_CONTEXT_SERVICE_URL:-http://127.0.0.1:8011}"
DISPOSABLE_CONTEXT_DELEGATION_SECRET="${WORKBYLINE_CONTEXT_DELEGATION_SECRET:-$(node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))")}"
DISPOSABLE_INTERNAL_SERVICE_KEY="${WORKBYLINE_INTERNAL_SERVICE_KEY:-${DISPOSABLE_CONTEXT_DELEGATION_SECRET}}"
DEFAULT_DISPOSABLE_ENGINE_MAPPINGS='{"00000000-0000-4000-d2c0-000000000001":{"companyName":"Alpha Corp","runs":{"11111111-1111-4111-d2c1-111111111111":{"workspaceId":"11111111-1111-4111-d2c1-111111111111","roleId":"11111111-1111-4111-d2c1-111111111111","status":"active"}}},"00000000-0000-4000-d2c0-000000000002":{"companyName":"Beta Inc","runs":{"11111111-1111-4111-d2c1-222222222222":{"workspaceId":"11111111-1111-4111-d2c1-222222222222","roleId":"11111111-1111-4111-d2c1-222222222222","status":"active"}}},"00000000-0000-4000-c000-000000000001":{"companyName":"Organization Alpha Corp","runs":{"11111111-1111-4111-a111-111111111111":{"workspaceId":"11111111-1111-4111-a111-111111111111","roleId":"11111111-1111-4111-a111-111111111111","status":"active"}}},"00000000-0000-4000-c000-000000000002":{"companyName":"Organization Beta Inc","runs":{"22222222-2222-4222-a222-222222222222":{"workspaceId":"22222222-2222-4222-a222-222222222222","roleId":"22222222-2222-4222-a222-222222222222","status":"active"}}}}'
DISPOSABLE_ENGINE_MAPPINGS="${WORKBYLINE_ENGINE_MAPPINGS:-${DEFAULT_DISPOSABLE_ENGINE_MAPPINGS}}"

EVIDENCE_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)_$$"
START_TS_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
EVIDENCE_OUT_DIR="${VERIFICATION_EVIDENCE_DIR:-${WORKTREE_ROOT}/logs/guarded_verify_${EVIDENCE_RUN_ID}}"
RAW_RUNNER_LOG="$(mktemp "${TMPDIR:-/tmp}/wbl_verify_runner.XXXXXX.log")"
chmod 600 "${RAW_RUNNER_LOG}"

ISOLATED_RUN_DIR=""
ISOLATED_TMPDIR=""
SERVER_PID=""
SERVER_LISTENER_PID=""
SERVER_ANCESTRY=""
SERVER_CWD=""
PROBE_PROFILE_ID=""
EXPECTED_DB_INTERNAL_PORT=""
LIVE_DB_INTERNAL_PORT=""
LIVE_DB_NAME=""
CLEANUP_STATUS="not_run"

exec 3>&1 4>&2
exec > >(tee -a "${RAW_RUNNER_LOG}") 2>&1

resolve_realpath() {
  node -e "const fs=require('node:fs'); try { process.stdout.write(fs.realpathSync(process.argv[1])); } catch { process.stdout.write(process.argv[1]); }" "$1"
}

run_allowlisted() {
  local step_node_env="$1"
  shift
  env -i \
    PATH="${PATH}" \
    HOME="${HOME:-/tmp}" \
    TMPDIR="${ISOLATED_TMPDIR:-/tmp}" \
    USER="${USER:-nobody}" \
    LANG="${LANG:-en_US.UTF-8}" \
    LC_ALL="${LC_ALL:-en_US.UTF-8}" \
    TERM="${TERM:-xterm-256color}" \
    NPM_CONFIG_USERCONFIG="/dev/null" \
    PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-${HOME:-/tmp}/Library/Caches/ms-playwright}" \
    ARTIFACTS_DIR="${ISOLATED_RUN_DIR}/test-artifacts" \
    DISPOSABLE_VERIFICATION_PORT="${VERIFICATION_PORT}" \
    PORT="${VERIFICATION_PORT}" \
    APP_URL="${VERIFICATION_URL}" \
    NEXT_PUBLIC_URL="${VERIFICATION_URL}" \
    WORKBYLINE_WEB_URL="${VERIFICATION_URL}" \
    DISPOSABLE_DATABASE_URL="${DISPOSABLE_DATABASE_URL}" \
    DISPOSABLE_SUPABASE_URL="${DISPOSABLE_SUPABASE_URL}" \
    DISPOSABLE_SUPABASE_ANON_KEY="${DISPOSABLE_SUPABASE_ANON_KEY}" \
    DISPOSABLE_SUPABASE_SERVICE_ROLE_KEY="${DISPOSABLE_SUPABASE_SERVICE_ROLE_KEY}" \
    NEXT_PUBLIC_SUPABASE_URL="${DISPOSABLE_SUPABASE_URL}" \
    NEXT_PUBLIC_SUPABASE_ANON_KEY="${DISPOSABLE_SUPABASE_ANON_KEY}" \
    SUPABASE_SERVICE_ROLE_KEY="${DISPOSABLE_SUPABASE_SERVICE_ROLE_KEY}" \
    CAREERTWIN_STAGING_SUPABASE_URL="${DISPOSABLE_SUPABASE_URL}" \
    CAREERTWIN_STAGING_PUBLISHABLE_KEY="${DISPOSABLE_SUPABASE_ANON_KEY}" \
    CAREERTWIN_STAGING_TEST_PASSWORD="${CAREERTWIN_STAGING_TEST_PASSWORD}" \
    WORKBYLINE_ENGINE_MAPPINGS="${DISPOSABLE_ENGINE_MAPPINGS}" \
    WORKBYLINE_CONTEXT_SERVICE_URL="${DISPOSABLE_CONTEXT_SERVICE_URL}" \
    WORKBYLINE_ENGINE_URL="${DISPOSABLE_CONTEXT_SERVICE_URL}" \
    WORKBYLINE_CONTEXT_DELEGATION_SECRET="${DISPOSABLE_CONTEXT_DELEGATION_SECRET}" \
    WORKBYLINE_INTERNAL_SERVICE_KEY="${DISPOSABLE_INTERNAL_SERVICE_KEY}" \
    CAREERTWIN_DRY_RUN_EMAIL="true" \
    NODE_ENV="${step_node_env}" \
    "$@"
}

preserve_sanitized_evidence() {
  local run_exit_code="$1"
  local cleanup_state="$2"
  mkdir -p "${EVIDENCE_OUT_DIR}"
  chmod 700 "${EVIDENCE_OUT_DIR}"

  WORKBYLINE_CONTEXT_DELEGATION_SECRET="${DISPOSABLE_CONTEXT_DELEGATION_SECRET}" \
  WORKBYLINE_INTERNAL_SERVICE_KEY="${DISPOSABLE_INTERNAL_SERVICE_KEY}" \
  node -e '
    const fs = require("node:fs");
    const path = require("node:path");

    const [
      outDir, rawLog, isolatedDir,
      runId, startTs, exitCodeStr, cleanupStatus,
      dbName, hostPort, internalPort, targetId,
      listenerPid, ancestry, listenerCwd
    ] = process.argv.slice(1);

    const secretValues = [
      process.env.DISPOSABLE_DATABASE_URL,
      process.env.DISPOSABLE_SUPABASE_ANON_KEY,
      process.env.DISPOSABLE_SUPABASE_SERVICE_ROLE_KEY,
      process.env.CAREERTWIN_STAGING_TEST_PASSWORD,
      process.env.WORKBYLINE_CONTEXT_DELEGATION_SECRET,
      process.env.WORKBYLINE_INTERNAL_SERVICE_KEY
    ].filter((s) => typeof s === "string" && s.length >= 4);

    function sanitizeText(text) {
      let out = text || "";
      for (const s of secretValues) {
        out = out.split(s).join("[REDACTED_SECRET]");
      }
      out = out.replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, "$1[REDACTED]@");
      out = out.replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED_TOKEN]");
      out = out.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g, "[REDACTED_JWT]");
      return out;
    }

    if (rawLog && fs.existsSync(rawLog)) {
      fs.writeFileSync(
        path.join(outDir, "runner.sanitized.log"),
        sanitizeText(fs.readFileSync(rawLog, "utf8")),
        "utf8"
      );
    }

    if (isolatedDir && fs.existsSync(path.join(isolatedDir, "next_server.log"))) {
      fs.writeFileSync(
        path.join(outDir, "next_server.sanitized.log"),
        sanitizeText(fs.readFileSync(path.join(isolatedDir, "next_server.log"), "utf8")),
        "utf8"
      );
    }

    const artifactSubdirs = [
      ["test-artifacts", "test-artifacts"],
      ["apps/web/test-results", "playwright-test-results"],
      ["apps/web/playwright-report", "playwright-report"]
    ];
    if (isolatedDir) {
      for (const [relSrc, relDst] of artifactSubdirs) {
        const srcPath = path.join(isolatedDir, relSrc);
        if (fs.existsSync(srcPath)) {
          fs.cpSync(srcPath, path.join(outDir, relDst), {
            recursive: true,
            filter: (p) => !/\/\.env(\.|$)/i.test(p)
          });
        }
      }
    }

    const exitCode = Number(exitCodeStr);
    const summary = {
      run_id: runId,
      started_at_utc: startTs,
      finished_at_utc: new Date().toISOString(),
      status: exitCode === 0 ? "PASSED" : "FAILED",
      exit_code: exitCode,
      cleanup_status: cleanupStatus,
      disposable_target: {
        db_name: dbName || null,
        host_port: hostPort || null,
        internal_postgres_port: internalPort || null,
        container_or_ref: targetId || null
      },
      server_ownership: {
        listener_pid: listenerPid || null,
        ancestry: ancestry || null,
        cwd: listenerCwd || null
      }
    };
    fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
  ' \
    "${EVIDENCE_OUT_DIR}" "${RAW_RUNNER_LOG}" "${ISOLATED_RUN_DIR}" \
    "${EVIDENCE_RUN_ID}" "${START_TS_UTC}" "${run_exit_code}" "${cleanup_state}" \
    "${LIVE_DB_NAME:-${DISPOSABLE_DB_NAME:-}}" "${DISPOSABLE_DB_PORT:-}" "${LIVE_DB_INTERNAL_PORT:-${EXPECTED_DB_INTERNAL_PORT:-}}" "${DISPOSABLE_DB_CONTAINER:-${DISPOSABLE_SUPABASE_REF:-}}" \
    "${SERVER_LISTENER_PID}" "${SERVER_ANCESTRY}" "${SERVER_CWD}" || true
}

stop_owned_server() {
  local shutdown_err=0
  if [[ -n "${SERVER_LISTENER_PID}" ]] && kill -0 "${SERVER_LISTENER_PID}" 2>/dev/null; then
    kill -TERM "${SERVER_LISTENER_PID}" 2>/dev/null || true
  fi
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    echo "Shutting down isolated application server (Launcher PID ${SERVER_PID})..."
    kill -TERM "${SERVER_PID}" 2>/dev/null || true
  fi

  for _ in {1..10}; do
    local alive=0
    if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then alive=1; fi
    if [[ -n "${SERVER_LISTENER_PID}" ]] && kill -0 "${SERVER_LISTENER_PID}" 2>/dev/null; then alive=1; fi
    if [[ "${alive}" -eq 0 ]]; then break; fi
    sleep 0.5
  done

  if [[ -n "${SERVER_LISTENER_PID}" ]] && kill -0 "${SERVER_LISTENER_PID}" 2>/dev/null; then
    kill -KILL "${SERVER_LISTENER_PID}" 2>/dev/null || true
  fi
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill -KILL "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi

  SERVER_PID=""
  SERVER_LISTENER_PID=""

  if command -v lsof >/dev/null 2>&1; then
    local remaining
    remaining="$(lsof -nP -iTCP:"${VERIFICATION_PORT}" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "${remaining}" ]]; then
      echo "CLEANUP ERROR: Port ${VERIFICATION_PORT} listener still active after server shutdown:" >&2
      echo "${remaining}" >&2
      shutdown_err=1
    fi
  fi
  return "${shutdown_err}"
}

cleanup_all() {
  local exit_code=$?
  local cleanup_err=0

  if ! stop_owned_server; then
    cleanup_err=1
  fi

  if [[ -n "${PROBE_PROFILE_ID}" ]] && [[ -n "${DISPOSABLE_DATABASE_URL:-}" ]]; then
    echo "Cleaning up correspondence probe profile ${PROBE_PROFILE_ID}..."
    if ! psql "${DISPOSABLE_DATABASE_URL}" -v ON_ERROR_STOP=1 -q -c \
      "DELETE FROM public.candidate_profiles WHERE id = '${PROBE_PROFILE_ID}';"; then
      echo "CLEANUP ERROR: Failed to delete probe profile ${PROBE_PROFILE_ID}." >&2
      cleanup_err=1
    else
      local rem_probe
      rem_probe=$(psql "${DISPOSABLE_DATABASE_URL}" -v ON_ERROR_STOP=1 -t -A -c \
        "SELECT count(*) FROM public.candidate_profiles WHERE id = '${PROBE_PROFILE_ID}';" || echo "ERR")
      if [[ "${rem_probe}" != "0" ]]; then
        echo "CLEANUP ERROR: Probe profile ${PROBE_PROFILE_ID} residual count=${rem_probe}." >&2
        cleanup_err=1
      fi
    fi
    PROBE_PROFILE_ID=""
  fi

  if [[ "${cleanup_err}" -eq 0 ]]; then
    CLEANUP_STATUS="clean"
  else
    CLEANUP_STATUS="cleanup_errors_detected"
  fi

  # Flush tee before preserving sanitized evidence so full output (including failures) is saved
  exec 1>&3 2>&4 3>&- 4>&-
  sleep 0.2

  preserve_sanitized_evidence "${exit_code}" "${CLEANUP_STATUS}"
  echo "Sanitized verification evidence preserved at: ${EVIDENCE_OUT_DIR}"

  if [[ -n "${ISOLATED_RUN_DIR}" ]] && [[ -d "${ISOLATED_RUN_DIR}" ]]; then
    if ! rm -rf "${ISOLATED_RUN_DIR}"; then
      echo "CLEANUP ERROR: Failed to remove isolated staging directory ${ISOLATED_RUN_DIR}." >&2
      cleanup_err=1
    fi
    ISOLATED_RUN_DIR=""
  fi
  rm -f "${RAW_RUNNER_LOG}" 2>/dev/null || true

  if [[ "${exit_code}" -eq 0 ]] && [[ "${cleanup_err}" -ne 0 ]]; then
    echo "FATAL: Verification checks finished, but post-run cleanup reported errors." >&2
    exit 1
  fi

  return "${exit_code}"
}
trap cleanup_all EXIT INT TERM HUP

echo "========================================================================"
echo "GENOME V3 TRACK 1: GUARDED DISPOSABLE VERIFICATION ENTRY POINT"
echo "Run ID: ${EVIDENCE_RUN_ID}"
echo "Worktree (read-only source): ${WORKTREE_ROOT}"
echo "========================================================================"

# ── 1. VALIDATE MANDATORY DISPOSABLE & POSITIVE IDENTITY CONFIGURATION ─────────
echo -n "[Step 1/9] Validating mandatory disposable identity variables... "

for req_var in \
  DISPOSABLE_DATABASE_URL \
  DISPOSABLE_SUPABASE_URL \
  DISPOSABLE_SUPABASE_ANON_KEY \
  DISPOSABLE_SUPABASE_SERVICE_ROLE_KEY \
  CAREERTWIN_STAGING_TEST_PASSWORD \
  DISPOSABLE_DB_NAME \
  DISPOSABLE_DB_PORT
do
  if [[ -z "${!req_var:-}" ]]; then
    echo "FAILED"
    echo "FATAL: ${req_var} is not set. Disposable verification requires explicit target identity before any operation."
    exit 1
  fi
done

if ! [[ "${DISPOSABLE_DB_PORT}" =~ ^[0-9]+$ ]]; then
  echo "FAILED"
  echo "FATAL: DISPOSABLE_DB_PORT ('${DISPOSABLE_DB_PORT}') must be a numeric TCP port."
  exit 1
fi

PARSED_URLS=$(node -e '
  const dbUrl = new URL(process.argv[1]);
  const sbUrl = new URL(process.argv[2]);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"]);
  const isLocal = localHosts.has(dbUrl.hostname.toLowerCase()) || localHosts.has(sbUrl.hostname.toLowerCase());
  const dbPathName = (dbUrl.pathname || "").replace(/^\/+/, "");
  process.stdout.write([dbUrl.hostname, dbUrl.port || "", dbPathName, sbUrl.hostname, sbUrl.port || "", isLocal ? "1" : "0"].join("|"));
' "${DISPOSABLE_DATABASE_URL}" "${DISPOSABLE_SUPABASE_URL}" 2>/dev/null || true)

if [[ -z "${PARSED_URLS}" ]]; then
  echo "FAILED"
  echo "FATAL: DISPOSABLE_DATABASE_URL or DISPOSABLE_SUPABASE_URL is not a valid URL."
  exit 1
fi

URL_DB_HOST=$(echo "${PARSED_URLS}" | cut -d'|' -f1)
URL_DB_PORT=$(echo "${PARSED_URLS}" | cut -d'|' -f2)
URL_DB_PATH=$(echo "${PARSED_URLS}" | cut -d'|' -f3)
URL_SB_HOST=$(echo "${PARSED_URLS}" | cut -d'|' -f4)
URL_SB_PORT=$(echo "${PARSED_URLS}" | cut -d'|' -f5)
IS_LOCAL_TARGET=$(echo "${PARSED_URLS}" | cut -d'|' -f6)

if [[ -n "${URL_DB_PORT}" ]] && [[ "${URL_DB_PORT}" != "${DISPOSABLE_DB_PORT}" ]]; then
  echo "FAILED"
  echo "FATAL GUARD REJECTION: DISPOSABLE_DATABASE_URL port '${URL_DB_PORT}' != DISPOSABLE_DB_PORT '${DISPOSABLE_DB_PORT}'."
  exit 1
fi

if [[ -n "${URL_DB_PATH}" ]] && [[ "${URL_DB_PATH}" != "${DISPOSABLE_DB_NAME}" ]]; then
  echo "FAILED"
  echo "FATAL GUARD REJECTION: DISPOSABLE_DATABASE_URL database '${URL_DB_PATH}' != DISPOSABLE_DB_NAME '${DISPOSABLE_DB_NAME}'."
  exit 1
fi

HOST_MODE="${DISPOSABLE_DB_HOST_MODE:-docker}"
if [[ "${IS_LOCAL_TARGET}" == "1" ]]; then
  if [[ "${HOST_MODE}" == "native" ]]; then
    EXPECTED_DB_INTERNAL_PORT="${DISPOSABLE_DB_INTERNAL_PORT:-${DISPOSABLE_DB_PORT}}"
  else
    if [[ -z "${DISPOSABLE_DB_CONTAINER:-}" ]]; then
      echo "FAILED"
      echo "FATAL: Localhost containerized target requires DISPOSABLE_DB_CONTAINER (or explicit DISPOSABLE_DB_HOST_MODE=native for non-Docker local Postgres)."
      exit 1
    fi
    EXPECTED_DB_INTERNAL_PORT="${DISPOSABLE_DB_INTERNAL_PORT:-5432}"
  fi
else
  if [[ -z "${DISPOSABLE_SUPABASE_REF:-}" ]] || [[ "${URL_SB_HOST}" != *"${DISPOSABLE_SUPABASE_REF}"* ]]; then
    echo "FAILED"
    echo "FATAL: Remote disposable target requires DISPOSABLE_SUPABASE_REF matching DISPOSABLE_SUPABASE_URL host (${URL_SB_HOST})."
    exit 1
  fi
  EXPECTED_DB_INTERNAL_PORT="${DISPOSABLE_DB_INTERNAL_PORT:-5432}"
fi

if ! [[ "${EXPECTED_DB_INTERNAL_PORT}" =~ ^[0-9]+$ ]]; then
  echo "FAILED"
  echo "FATAL: DISPOSABLE_DB_INTERNAL_PORT ('${EXPECTED_DB_INTERNAL_PORT}') must be numeric."
  exit 1
fi
echo "OK (host=${URL_DB_HOST}, host_port=${DISPOSABLE_DB_PORT}, expected_internal_port=${EXPECTED_DB_INTERNAL_PORT}, expected_db=${DISPOSABLE_DB_NAME}, mode=${HOST_MODE})"

# ── 2. REJECT PROTECTED BASELINE & PROVE READ-ONLY IDENTITY BEFORE ANY WRITES ─
echo "[Step 2/9] Enforcing protected exclusions, container/port identity, migration prereqs & read-only 4-way proof..."

PROTECTED_PORTS=("54330" "54331" "54332" "54333" "54334" "54335")
for p in "${PROTECTED_PORTS[@]}"; do
  if [[ "${DISPOSABLE_DB_PORT}" == "${p}" ]] || [[ "${URL_DB_PORT}" == "${p}" ]] || [[ "${URL_SB_PORT}" == "${p}" ]] || [[ "${EXPECTED_DB_INTERNAL_PORT}" == "${p}" ]]; then
    echo "FATAL GUARD REJECTION: Protected baseline port ${p} rejected."
    exit 1
  fi
done

PROTECTED_PORT_REGEX=':(54330|54331|54332|54333|54334|54335)\b|[?&]port=(54330|54331|54332|54333|54334|54335)\b'
if [[ "${DISPOSABLE_DATABASE_URL}" =~ ${PROTECTED_PORT_REGEX} ]] || [[ "${DISPOSABLE_SUPABASE_URL}" =~ ${PROTECTED_PORT_REGEX} ]]; then
  echo "FATAL GUARD REJECTION: Protected baseline port (54330-54335) detected in disposable URL."
  exit 1
fi

if [[ "${DISPOSABLE_DATABASE_URL}" =~ (careertwin-local-baseline|supabase_db_careertwin-local-baseline) ]] || \
   [[ "${DISPOSABLE_SUPABASE_URL}" =~ (careertwin-local-baseline) ]] || \
   [[ "${DISPOSABLE_DB_CONTAINER:-}" =~ (careertwin-local-baseline|supabase_db_careertwin-local-baseline) ]]; then
  echo "FATAL GUARD REJECTION: Protected baseline container identifier detected."
  exit 1
fi

# 2a. Fail-Closed Host/Container Identity + Read-Only SQL Internal Port Identity
DB_SERVER_INFO=$(psql "${DISPOSABLE_DATABASE_URL}" -v ON_ERROR_STOP=1 -t -A -c \
  "SELECT COALESCE(inet_server_addr()::text, 'local-socket') || '|' || inet_server_port()::text || '|' || current_database() || '|' || current_user;")
DB_ADDR=$(echo "${DB_SERVER_INFO}" | cut -d'|' -f1)
LIVE_DB_INTERNAL_PORT=$(echo "${DB_SERVER_INFO}" | cut -d'|' -f2)
LIVE_DB_NAME=$(echo "${DB_SERVER_INFO}" | cut -d'|' -f3)
DB_USER=$(echo "${DB_SERVER_INFO}" | cut -d'|' -f4)

for p in "${PROTECTED_PORTS[@]}"; do
  if [[ "${LIVE_DB_INTERNAL_PORT}" == "${p}" ]]; then
    echo "FATAL GUARD REJECTION: Live PostgreSQL inet_server_port() resolved to protected port ${LIVE_DB_INTERNAL_PORT}."
    exit 1
  fi
done

if [[ "${LIVE_DB_INTERNAL_PORT}" != "${EXPECTED_DB_INTERNAL_PORT}" ]]; then
  echo "FATAL GUARD REJECTION: Live SQL internal port '${LIVE_DB_INTERNAL_PORT}' != expected internal port '${EXPECTED_DB_INTERNAL_PORT}' (host connection port='${DISPOSABLE_DB_PORT}')."
  exit 1
fi

if [[ "${LIVE_DB_NAME}" != "${DISPOSABLE_DB_NAME}" ]]; then
  echo "FATAL GUARD REJECTION: Connected DB '${LIVE_DB_NAME}' != expected DISPOSABLE_DB_NAME '${DISPOSABLE_DB_NAME}'."
  exit 1
fi

if [[ "${IS_LOCAL_TARGET}" == "1" ]]; then
  if [[ "${HOST_MODE}" == "native" ]]; then
    if ! command -v lsof >/dev/null 2>&1; then
      echo "FATAL GUARD FAILURE: lsof is required to verify native local Postgres listener on port ${DISPOSABLE_DB_PORT}."
      exit 1
    fi
    NATIVE_LISTENERS=$(lsof -nP -iTCP:"${DISPOSABLE_DB_PORT}" -sTCP:LISTEN 2>/dev/null || true)
    if [[ -z "${NATIVE_LISTENERS}" ]]; then
      echo "FATAL GUARD FAILURE: No local listener found on DISPOSABLE_DB_PORT ${DISPOSABLE_DB_PORT}."
      exit 1
    fi
    echo "  -> Native local TCP port identity confirmed on :${DISPOSABLE_DB_PORT} -> internal :${LIVE_DB_INTERNAL_PORT}"
  else
    if ! command -v docker >/dev/null 2>&1; then
      echo "FATAL GUARD FAILURE: docker CLI is required to verify DISPOSABLE_DB_CONTAINER '${DISPOSABLE_DB_CONTAINER}'."
      exit 1
    fi
    if ! docker info >/dev/null 2>&1; then
      echo "FATAL GUARD FAILURE: Docker daemon is inaccessible from this shell; cannot verify DISPOSABLE_DB_CONTAINER '${DISPOSABLE_DB_CONTAINER}' host-port mapping (failing closed)."
      exit 1
    fi
    CONTAINER_STATE=$(docker inspect -f '{{.State.Running}}|{{.Name}}' "${DISPOSABLE_DB_CONTAINER}" 2>/dev/null || true)
    if [[ -z "${CONTAINER_STATE}" ]] || [[ "${CONTAINER_STATE}" != true* ]]; then
      echo "FATAL GUARD REJECTION: DISPOSABLE_DB_CONTAINER '${DISPOSABLE_DB_CONTAINER}' is missing or not running."
      exit 1
    fi
    CONTAINER_PORTS_JSON=$(docker inspect -f '{{json .NetworkSettings.Ports}}' "${DISPOSABLE_DB_CONTAINER}" 2>/dev/null || true)
    PORT_BINDING_OK=$(node -e '
      const ports = JSON.parse(process.argv[1] || "{}");
      const expectedInternalKey = process.argv[2] + "/tcp";
      const expectedHostPort = process.argv[3];
      const protectedSet = new Set(["54330", "54331", "54332", "54333", "54334", "54335"]);
      for (const bindings of Object.values(ports)) {
        if (!Array.isArray(bindings)) continue;
        for (const b of bindings) {
          if (protectedSet.has(String(b.HostPort || ""))) {
            process.stdout.write("PROTECTED_PORT");
            process.exit(0);
          }
        }
      }
      const targetBindings = ports[expectedInternalKey];
      const matches = Array.isArray(targetBindings) && targetBindings.some((b) => String(b.HostPort || "") === expectedHostPort);
      process.stdout.write(matches ? "OK" : "MISMATCH");
    ' "${CONTAINER_PORTS_JSON}" "${LIVE_DB_INTERNAL_PORT}" "${DISPOSABLE_DB_PORT}" 2>/dev/null || echo "PARSE_ERR")
    if [[ "${PORT_BINDING_OK}" != "OK" ]]; then
      echo "FATAL GUARD REJECTION: Container '${DISPOSABLE_DB_CONTAINER}' port mapping check returned '${PORT_BINDING_OK}' (expected host :${DISPOSABLE_DB_PORT} -> container :${LIVE_DB_INTERNAL_PORT}/tcp)."
      exit 1
    fi
    echo "  -> Docker host-port mapping verified: ${DISPOSABLE_DB_CONTAINER} host:${DISPOSABLE_DB_PORT} -> container:${LIVE_DB_INTERNAL_PORT}/tcp"
  fi
fi
echo "  -> Read-only SQL identity confirmed: addr=${DB_ADDR} internal_port=${LIVE_DB_INTERNAL_PORT} db=${LIVE_DB_NAME} user=${DB_USER}"

# 2b. Read-only Migration Tracking, Schema, Columns, Storage Bucket & Fixture Prerequisites
HAS_SB_MIGS=$(psql "${DISPOSABLE_DATABASE_URL}" -v ON_ERROR_STOP=1 -t -A -c \
  "SELECT CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN '1' ELSE '0' END;")
HAS_PUB_MIGS=$(psql "${DISPOSABLE_DATABASE_URL}" -v ON_ERROR_STOP=1 -t -A -c \
  "SELECT CASE WHEN to_regclass('public.schema_migrations') IS NOT NULL THEN '1' ELSE '0' END;")

if [[ "${HAS_SB_MIGS}" == "0" ]] && [[ "${HAS_PUB_MIGS}" == "0" ]]; then
  echo "FATAL PREREQUISITE FAILURE: Neither supabase_migrations.schema_migrations nor public.schema_migrations exists."
  echo "Apply baseline migrations 20260803000001..20260819000001 with migration tracking first."
  exit 1
fi

MIGRATION_SELECT_SQL=""
if [[ "${HAS_SB_MIGS}" == "1" ]]; then
  MIGRATION_SELECT_SQL="SELECT version::text AS v FROM supabase_migrations.schema_migrations"
fi
if [[ "${HAS_PUB_MIGS}" == "1" ]]; then
  if [[ -n "${MIGRATION_SELECT_SQL}" ]]; then
    MIGRATION_SELECT_SQL="${MIGRATION_SELECT_SQL} UNION "
  fi
  MIGRATION_SELECT_SQL="${MIGRATION_SELECT_SQL}SELECT version::text AS v FROM public.schema_migrations"
fi

PREREQ_COUNTS=$(psql "${DISPOSABLE_DATABASE_URL}" -v ON_ERROR_STOP=1 -t -A -c "
  WITH required_migrations(version) AS (
    VALUES
      ('20260803000001'),('20260803000002'),('20260803000003'),('20260804000001'),
      ('20260805000001'),('20260814000001'),('20260814000002'),('20260814000003'),
      ('20260815000001'),('20260815000002'),('20260816000001'),('20260816000002'),
      ('20260816000003'),('20260817000001'),('20260817000002'),('20260818000001'),
      ('20260818000002'),('20260818000003'),('20260818000004'),('20260818000005'),
      ('20260818000006'),('20260818000007'),('20260818000008'),('20260819000001')
  ),
  applied_versions AS (
    ${MIGRATION_SELECT_SQL}
  )
  SELECT
    (SELECT count(*) FROM required_migrations rm JOIN applied_versions av ON av.v = rm.version OR av.v LIKE rm.version || '_%')::text || '|' ||
    (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (
      'profiles','candidate_profiles','proof_profiles','hiring_runs','sourcing_sessions',
      'candidates','screening_sessions','screening_answers','screening_summaries','activity_events',
      'scheduled_emails','organizations','organization_memberships','candidate_documents','claim_ledgers'
    ))::text || '|' ||
    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND (
      (table_name = 'candidates' AND column_name IN ('decision_packet', 'fit_score')) OR
      (table_name = 'hiring_runs' AND column_name = 'brief_json') OR
      (table_name = 'claim_ledgers' AND column_name = 'revision') OR
      (table_name = 'candidate_documents' AND column_name IN ('file_sha256', 'normalized_text_sha256', 'org_id'))
    ))::text || '|' ||
    (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN (
      'allocate_claim_ledger_revision_and_persist',
      'record_human_decision_transactional',
      'shortlist_candidate_from_provider_transactional'
    ))::text || '|' ||
    (SELECT count(*) FROM storage.buckets WHERE id = 'candidate_resumes' AND public = false)::text || '|' ||
    (SELECT count(*) FROM auth.users WHERE email IN ('d2c.alpha.owner@example.com', 'd2c.beta.owner@example.com'))::text || '|' ||
    (SELECT count(*) FROM public.organizations WHERE id IN ('00000000-0000-4000-d2c0-000000000001'::uuid, '00000000-0000-4000-d2c0-000000000002'::uuid))::text || '|' ||
    (SELECT count(*) FROM public.hiring_runs WHERE id IN ('11111111-1111-4111-d2c1-111111111111'::uuid, '11111111-1111-4111-a111-111111111111'::uuid))::text;
")

PREREQ_MIGS=$(echo "${PREREQ_COUNTS}" | cut -d'|' -f1)
PREREQ_TABLES=$(echo "${PREREQ_COUNTS}" | cut -d'|' -f2)
PREREQ_COLS=$(echo "${PREREQ_COUNTS}" | cut -d'|' -f3)
PREREQ_RPCS=$(echo "${PREREQ_COUNTS}" | cut -d'|' -f4)
PREREQ_BUCKET=$(echo "${PREREQ_COUNTS}" | cut -d'|' -f5)
PREREQ_USERS=$(echo "${PREREQ_COUNTS}" | cut -d'|' -f6)
PREREQ_ORGS=$(echo "${PREREQ_COUNTS}" | cut -d'|' -f7)
PREREQ_RUNS=$(echo "${PREREQ_COUNTS}" | cut -d'|' -f8)

if [[ "${PREREQ_MIGS}" != "24" ]] || [[ "${PREREQ_TABLES}" != "15" ]] || [[ "${PREREQ_COLS}" != "7" ]] || [[ "${PREREQ_RPCS}" -lt 3 ]] || [[ "${PREREQ_BUCKET}" != "1" ]]; then
  echo "FATAL PREREQUISITE FAILURE: Disposable DB missing baseline migrations/schema/bucket (migrations=${PREREQ_MIGS}/24, tables=${PREREQ_TABLES}/15, columns=${PREREQ_COLS}/7, rpcs=${PREREQ_RPCS}/3, private_bucket=${PREREQ_BUCKET}/1)."
  echo "Apply baseline migrations 20260803000001..20260819000001 (with tracking in schema_migrations) first."
  exit 1
fi

if [[ "${PREREQ_USERS}" != "2" ]] || [[ "${PREREQ_ORGS}" != "2" ]] || [[ "${PREREQ_RUNS}" != "2" ]]; then
  echo "FATAL PREREQUISITE FAILURE: Synthetic fixtures missing (d2c_users=${PREREQ_USERS}/2, d2c_orgs=${PREREQ_ORGS}/2, alpha_seed_runs=${PREREQ_RUNS}/2)."
  echo "Seed supabase/seed.sql and D2C synthetic staging fixtures (d2c.alpha.owner@example.com, d2c.beta.owner@example.com) first."
  exit 1
fi

# 2c. Read-only 4-way correspondence proof BEFORE ANY WRITES:
#     SQL <-> GoTrue /auth/v1 <-> PostgREST /rest/v1 <-> Storage /storage/v1
ALPHA_UID_SQL=$(psql "${DISPOSABLE_DATABASE_URL}" -v ON_ERROR_STOP=1 -t -A -c \
  "SELECT id::text FROM auth.users WHERE email = 'd2c.alpha.owner@example.com' LIMIT 1;")

AUTH_TOKEN_JSON=$(curl -sf -X POST "${DISPOSABLE_SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${DISPOSABLE_SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"d2c.alpha.owner@example.com\",\"password\":\"${CAREERTWIN_STAGING_TEST_PASSWORD}\"}" || true)

if [[ -z "${AUTH_TOKEN_JSON}" ]]; then
  echo "FATAL CORRESPONDENCE FAILURE: GoTrue password sign-in failed at ${DISPOSABLE_SUPABASE_URL}/auth/v1/token for d2c.alpha.owner@example.com."
  exit 1
fi

ALPHA_JWT=$(node -e "const d=JSON.parse(process.argv[1]); if(!d.access_token) process.exit(1); process.stdout.write(d.access_token);" "${AUTH_TOKEN_JSON}")
AUTH_USER_JSON=$(curl -sf "${DISPOSABLE_SUPABASE_URL}/auth/v1/user" \
  -H "apikey: ${DISPOSABLE_SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${ALPHA_JWT}")
ALPHA_UID_AUTH=$(node -e "const u=JSON.parse(process.argv[1]); process.stdout.write(u.id || '');" "${AUTH_USER_JSON}")

if [[ -z "${ALPHA_UID_SQL}" ]] || [[ "${ALPHA_UID_SQL}" != "${ALPHA_UID_AUTH}" ]]; then
  echo "FATAL CORRESPONDENCE FAILURE: auth.users SQL ID (${ALPHA_UID_SQL}) != GoTrue /auth/v1/user ID (${ALPHA_UID_AUTH})."
  exit 1
fi

ALPHA_RUN_SQL=$(psql "${DISPOSABLE_DATABASE_URL}" -v ON_ERROR_STOP=1 -t -A -c \
  "SELECT id::text || '|' || org_id::text || '|' || COALESCE(role_title, '') FROM public.hiring_runs WHERE id = '11111111-1111-4111-d2c1-111111111111'::uuid;")
ALPHA_RUN_REST=$(curl -sf \
  "${DISPOSABLE_SUPABASE_URL}/rest/v1/hiring_runs?id=eq.11111111-1111-4111-d2c1-111111111111&select=id,org_id,role_title" \
  -H "apikey: ${DISPOSABLE_SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${DISPOSABLE_SUPABASE_SERVICE_ROLE_KEY}")

REST_RO_MATCH=$(node -e "
  const rows = JSON.parse(process.argv[1]);
  const [sqlId, sqlOrg, ...rest] = process.argv[2].split('|');
  const sqlTitle = rest.join('|');
  const ok = Array.isArray(rows) && rows.length === 1 && rows[0].id === sqlId && rows[0].org_id === sqlOrg && (rows[0].role_title || '') === sqlTitle;
  process.stdout.write(ok ? 'OK' : 'FAIL');
" "${ALPHA_RUN_REST}" "${ALPHA_RUN_SQL}")

if [[ "${REST_RO_MATCH}" != "OK" ]]; then
  echo "FATAL CORRESPONDENCE FAILURE: Read-only PostgREST /rest/v1/hiring_runs check failed against SQL identity."
  exit 1
fi

STORAGE_HTTP_CODE=$(curl -s -o /tmp/wbl_storage_buckets.$$.json -w "%{http_code}" \
  "${DISPOSABLE_SUPABASE_URL}/storage/v1/bucket" \
  -H "apikey: ${DISPOSABLE_SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${DISPOSABLE_SUPABASE_SERVICE_ROLE_KEY}" || echo "000")
STORAGE_BUCKET_MATCH=$(node -e "
  const fs = require('node:fs');
  try {
    const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const b = Array.isArray(data) ? data.find((x) => x.id === 'candidate_resumes' || x.name === 'candidate_resumes') : null;
    process.stdout.write(b && b.public === false ? 'OK' : 'FAIL');
  } catch { process.stdout.write('FAIL'); }
" "/tmp/wbl_storage_buckets.$$.json")
rm -f "/tmp/wbl_storage_buckets.$$.json"

if [[ "${STORAGE_HTTP_CODE}" != "200" ]] || [[ "${STORAGE_BUCKET_MATCH}" != "OK" ]]; then
  echo "FATAL CORRESPONDENCE FAILURE: Storage API check returned HTTP ${STORAGE_HTTP_CODE}, candidate_resumes private match=${STORAGE_BUCKET_MATCH}."
  exit 1
fi

# 2d. Ephemeral write correspondence check (executes ONLY after read-only 4-way identity passed)
PROBE_NONCE=$(node -e "process.stdout.write(require('node:crypto').randomUUID());")
PROBE_NAME="DISPOSABLE_CORRESPONDENCE_PROBE_${PROBE_NONCE}"
PROBE_PROFILE_ID=$(psql "${DISPOSABLE_DATABASE_URL}" -v ON_ERROR_STOP=1 -q -t -A -c \
  "INSERT INTO public.candidate_profiles (name, email) VALUES ('${PROBE_NAME}', 'probe.${PROBE_NONCE}@example.invalid') RETURNING id::text;" | head -n 1 | tr -d '[:space:]')

REST_PROBE_JSON=$(curl -sf \
  "${DISPOSABLE_SUPABASE_URL}/rest/v1/candidate_profiles?id=eq.${PROBE_PROFILE_ID}&select=id,name" \
  -H "apikey: ${DISPOSABLE_SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${DISPOSABLE_SUPABASE_SERVICE_ROLE_KEY}")

REST_WRITE_MATCH=$(node -e "const rows=JSON.parse(process.argv[1]); process.stdout.write(Array.isArray(rows) && rows.length===1 && rows[0].name===process.argv[2] ? 'OK' : 'FAIL');" "${REST_PROBE_JSON}" "${PROBE_NAME}")
if [[ "${REST_WRITE_MATCH}" != "OK" ]]; then
  echo "FATAL CORRESPONDENCE FAILURE: PostgREST /rest/v1 did not observe disposable probe row inserted into DISPOSABLE_DATABASE_URL."
  exit 1
fi

psql "${DISPOSABLE_DATABASE_URL}" -v ON_ERROR_STOP=1 -q -c \
  "DELETE FROM public.candidate_profiles WHERE id = '${PROBE_PROFILE_ID}';"
PROBE_REMAINING=$(psql "${DISPOSABLE_DATABASE_URL}" -v ON_ERROR_STOP=1 -t -A -c \
  "SELECT count(*) FROM public.candidate_profiles WHERE id = '${PROBE_PROFILE_ID}';")
if [[ "${PROBE_REMAINING}" != "0" ]]; then
  echo "FATAL CLEANUP FAILURE: Correspondence probe row ${PROBE_PROFILE_ID} was not deleted."
  exit 1
fi
PROBE_PROFILE_ID=""
echo "  -> Four-way SQL <-> Auth <-> REST <-> Storage correspondence confirmed (Alpha UID ${ALPHA_UID_SQL})."

# ── 3. STAGE ISOLATED SOURCE/CONFIG DIRECTORY (NO .temp/SECRETS/ESCAPING LINKS)
echo -n "[Step 3/9] Creating sanitized isolated source directory & verifying link/secret boundaries... "
ISOLATED_RUN_DIR=$(mktemp -d "${TMPDIR:-/tmp}/wbl_isolated_verify.XXXXXX")
chmod 700 "${ISOLATED_RUN_DIR}"
ISOLATED_TMPDIR="${ISOLATED_RUN_DIR}/tmp"
mkdir -p "${ISOLATED_TMPDIR}" "${ISOLATED_RUN_DIR}/apps"

for top_file in "package.json" "package-lock.json"; do
  if [[ -f "${WORKTREE_ROOT}/${top_file}" ]] && [[ ! -L "${WORKTREE_ROOT}/${top_file}" ]]; then
    cp -p "${WORKTREE_ROOT}/${top_file}" "${ISOLATED_RUN_DIR}/${top_file}"
  fi
done

RSYNC_FILTERS=(
  --exclude='.git'
  --exclude='.temp'
  --exclude='.branches'
  --exclude='.venv'
  --exclude='__pycache__'
  --exclude='*.pyc'
  --exclude='.pytest_cache'
  --exclude='.next'
  --exclude='Files'
  --exclude='node_modules'
  --exclude='.vercel'
  --exclude='.npmrc'
  --include='.env.example'
  --exclude='.env*'
  --exclude='*.pem'
  --exclude='*.key'
  --exclude='*.p12'
  --exclude='*.pfx'
  --exclude='*.secret*'
  --exclude='*credentials*'
  --exclude='*service-account*'
)

rsync -a "${RSYNC_FILTERS[@]}" \
  "${WORKTREE_ROOT}/packages" \
  "${WORKTREE_ROOT}/fixtures" \
  "${WORKTREE_ROOT}/supabase" \
  "${WORKTREE_ROOT}/scripts" \
  "${ISOLATED_RUN_DIR}/"

rsync -a "${RSYNC_FILTERS[@]}" \
  "${WORKTREE_ROOT}/apps/web" \
  "${ISOLATED_RUN_DIR}/apps/"

copy_node_modules_isolated() {
  local src="$1"
  local dst="$2"
  if [[ -d "${src}" ]] && [[ ! -L "${src}" ]]; then
    if find "${src}" -maxdepth 2 -name "@electric-sql" -print -quit 2>/dev/null | grep -q .; then
      mkdir -p "${dst}"
      rsync -a --exclude='@electric-sql' "${src}/" "${dst}/"
    else
      if ! cp -cR "${src}" "${dst}" 2>/dev/null; then
        rm -rf "${dst}"
        cp -R "${src}" "${dst}"
      fi
    fi
  fi
}

copy_node_modules_isolated "${WORKTREE_ROOT}/node_modules" "${ISOLATED_RUN_DIR}/node_modules"
copy_node_modules_isolated "${WORKTREE_ROOT}/apps/web/node_modules" "${ISOLATED_RUN_DIR}/apps/web/node_modules"

ISOLATION_AUDIT=$(node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const root = fs.realpathSync(process.argv[1]);
  const forbiddenPaths = [
    path.join(root, "supabase", ".temp"),
    path.join(root, "supabase", ".branches")
  ];
  for (const fp of forbiddenPaths) {
    if (fs.existsSync(fp)) {
      console.error("FORBIDDEN_STAGED_PATH:" + fp);
      process.exit(1);
    }
  }
  const secretNameRe = /^(\.env(?!\.example$).*|\.npmrc|\.vercel|.*\.(pem|key|p12|pfx)|.*\.secret.*|.*credentials.*|.*service-account.*)$/i;
  function walk(dir, insideNodeModules) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      const isNm = insideNodeModules || ent.name === "node_modules";
      if (!isNm && secretNameRe.test(ent.name)) {
        console.error("FORBIDDEN_CREDENTIAL_FILE:" + full);
        process.exit(1);
      }
      if (ent.isSymbolicLink()) {
        let targetReal;
        try {
          targetReal = fs.realpathSync(full);
        } catch {
          console.error("DANGLING_SYMLINK:" + full);
          process.exit(1);
        }
        if (targetReal !== root && !targetReal.startsWith(root + path.sep)) {
          console.error("ESCAPING_SYMLINK:" + full + "->" + targetReal);
          process.exit(1);
        }
      } else if (ent.isDirectory()) {
        walk(full, isNm);
      }
    }
  }
  walk(root, false);
  process.stdout.write("ISOLATION_OK");
' "${ISOLATED_RUN_DIR}")

if [[ "${ISOLATION_AUDIT}" != "ISOLATION_OK" ]]; then
  echo "FAILED"
  echo "FATAL ISOLATION AUDIT FAILURE: ${ISOLATION_AUDIT}"
  exit 1
fi
echo "OK (${ISOLATED_RUN_DIR})"

# ── 4. CONFIGURE STRICT ALLOWLISTED ENVIRONMENT (EXPLICIT VERIFICATION PORT) ────
echo "[Step 4/9] Runtime steps will execute under strict env -i allowlist (${VERIFICATION_URL}, CAREERTWIN_DRY_RUN_EMAIL=true)."

# ── 5. APPLY FORWARD MIGRATIONS FROM ISOLATED STAGING DIRECTORY ────────────────
echo "[Step 5/9] Applying forward migrations (Track 1, DataVertex privilege hardening, canonical fit_score scale, forward reconciliation)..."
psql "${DISPOSABLE_DATABASE_URL}" -v ON_ERROR_STOP=1 \
  -f "${ISOLATED_RUN_DIR}/supabase/migrations/20260820000001_track1_integrity_repairs.sql"
psql "${DISPOSABLE_DATABASE_URL}" -v ON_ERROR_STOP=1 \
  -f "${ISOLATED_RUN_DIR}/supabase/migrations/20260821000001_datavertex_ledger_privilege_hardening.sql"
psql "${DISPOSABLE_DATABASE_URL}" -v ON_ERROR_STOP=1 \
  -f "${ISOLATED_RUN_DIR}/supabase/migrations/20260821000002_canonical_fit_score_scale.sql"
psql "${DISPOSABLE_DATABASE_URL}" -v ON_ERROR_STOP=1 \
  -f "${ISOLATED_RUN_DIR}/supabase/migrations/20260821000003_track1_forward_upgrade_reconciliation.sql"
psql "${DISPOSABLE_DATABASE_URL}" -v ON_ERROR_STOP=1 \
  -f "${ISOLATED_RUN_DIR}/supabase/migrations/20260822000001_transactional_screening_completion.sql"
psql "${DISPOSABLE_DATABASE_URL}" -v ON_ERROR_STOP=1 \
  -f "${ISOLATED_RUN_DIR}/supabase/migrations/20260823000001_revoke_profiles_token_select.sql"

POST_MIG_CHECK=$(psql "${DISPOSABLE_DATABASE_URL}" -v ON_ERROR_STOP=1 -t -A -c "
  SELECT
    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'candidates' AND column_name = 'pre_evaluation_revision')::text || '|' ||
    (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'record_pre_evaluation_decision_transactional' AND pronargs = 8)::text || '|' ||
    (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee IN ('anon', 'PUBLIC') AND table_name IN (
      'profiles','candidate_profiles','proof_profiles','hiring_runs','sourcing_sessions',
      'candidates','screening_sessions','screening_answers','screening_summaries','activity_events',
      'scheduled_emails','organizations','organization_memberships','candidate_documents','claim_ledgers'
    ))::text || '|' ||
    (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'datavertex_credit_ledger' AND grantee IN ('PUBLIC', 'anon', 'authenticated'))::text || '|' ||
    (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.candidates'::regclass AND conname = 'candidates_canonical_fit_score_range')::text;
")
if [[ "${POST_MIG_CHECK}" != "1|1|0|0|1" ]]; then
  echo "FATAL POST-MIGRATION CHECK FAILED: expected 1|1|0|0|1 (pre_eval_col|8arg_rpc|anon_grants_15|ledger_untrusted_grants|fit_score_chk), got ${POST_MIG_CHECK}."
  exit 1
fi
echo "Migrations applied and post-migration invariants confirmed (pre_eval_col|8arg_rpc|anon_grants_15|ledger_untrusted_grants|fit_score_chk = ${POST_MIG_CHECK})."

# ── 6. RUN UNIT/MOCKED VS REAL-DB VITEST SUITES UNDER ALLOWLISTED ENV ─────────
echo "[Step 6/9] Running Vitest suites under strict allowlist (${ISOLATED_RUN_DIR}/apps/web)..."
cd "${ISOLATED_RUN_DIR}/apps/web"

echo "  -> [6a] Unit & Mocked Contract Suites..."
run_allowlisted "test" npx --no-install vitest run \
  ../../packages/proof-engine/__tests__/proofEngine.test.ts \
  __tests__/evals/GoldenReleaseCandidateEvaluations.test.js \
  __tests__/evals/Track1IntegrityRepairs.test.js \
  __tests__/evals/Core09RouteSecurityAndDecoupling.test.js \
  __tests__/evals/Core09UploadAndProvenanceIntegrity.test.jsx \
  __tests__/evals/KubernetesMismatchProvenance.test.js \
  __tests__/evals/ScoreScaleAndEvidenceDedup.test.js \
  __tests__/evals/SourceFaithfulClaimExtraction.test.js \
  __tests__/security/ProtectedDatabaseGuard.test.js \
  __tests__/security/VitestDiscoveryContract.test.js \
  __tests__/sourcing/DataVertexRoutesAuth.test.js \
  __tests__/security/SafeRedirectAndEntry.test.js \
  __tests__/device-policy/DeviceSupportUnit.test.jsx \
  __tests__/components/ProtectedRoute.test.jsx \
  __tests__/pages/AuthPage.test.jsx \
  __tests__/pages/EmployerChatGreeting.test.jsx \
  __tests__/intake/RoleIntakeUI.test.jsx \
  __tests__/api/dryRunEmail.test.js \
  __tests__/evals/V3CloseoutBehavior.test.js \
  __tests__/api/screeningCompleteBehavior.test.js \
  __tests__/security/V11SecurityRepairs.test.js

echo "  -> [6b] Real Disposable Database & Concurrency Suites..."
run_allowlisted "test" npx --no-install vitest run --no-file-parallelism \
  __tests__/evals/Core08IntegrityAndAudit.test.jsx \
  __tests__/evals/Core09TransactionalDecisionsAndConcurrency.test.jsx \
  __tests__/evals/IngestionAndProvenanceIntegrity.test.jsx \
  __tests__/evals/ReleaseBlockerVerification.test.jsx \
  __tests__/security/TenantEvidenceSecurity.test.js \
  __tests__/security/CreditLedgerPrivilegeSecurity.test.js

# ── 7. LINT AND BUILD PRODUCTION NEXT.JS APPLICATION IN ISOLATED_RUN_DIR ──────
echo "[Step 7/9] Running ESLint and Webpack production build under strict allowlist..."
run_allowlisted "production" npm run lint
run_allowlisted "production" npm run build

# ── 8. START OWNED NEXT.JS SERVER ON VERIFICATION PORT & VERIFY CONCURRENCY/CONTINUITY
echo "[Step 8/9] Starting isolated Next.js application server on port ${VERIFICATION_PORT}..."
if command -v lsof >/dev/null 2>&1; then
  PRE_EXISTING_PORT_LISTENERS=$(lsof -nP -iTCP:"${VERIFICATION_PORT}" -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "${PRE_EXISTING_PORT_LISTENERS}" ]]; then
    echo "FATAL: Port ${VERIFICATION_PORT} is already occupied before server startup:"
    echo "${PRE_EXISTING_PORT_LISTENERS}"
    exit 1
  fi
fi
if curl -sf "http://127.0.0.1:${VERIFICATION_PORT}" >/dev/null 2>&1; then
  echo "FATAL: Port ${VERIFICATION_PORT} is already responding before guarded server startup. Refusing to target an unisolated process."
  exit 1
fi

SERVER_LOG="${ISOLATED_RUN_DIR}/next_server.log"
run_allowlisted "production" npx --no-install next start -p "${VERIFICATION_PORT}" >"${SERVER_LOG}" 2>&1 &
SERVER_PID=$!

echo "Waiting for ${VERIFICATION_URL} to become responsive..."
for i in {1..30}; do
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    echo "FATAL: Next.js launcher process (${SERVER_PID}) exited prematurely. Tail of ${SERVER_LOG}:"
    tail -n 40 "${SERVER_LOG}" || true
    exit 1
  fi
  if curl -sf "${VERIFICATION_URL}/auth" >/dev/null 2>&1; then
    echo "Application server responded on ${VERIFICATION_URL} (Launcher PID ${SERVER_PID})"
    break
  fi
  sleep 1
  if [[ $i -eq 30 ]]; then
    echo "FATAL: Application server failed to become responsive within 30 seconds. Tail of ${SERVER_LOG}:"
    tail -n 40 "${SERVER_LOG}" || true
    exit 1
  fi
done

if ! command -v lsof >/dev/null 2>&1; then
  echo "FATAL: lsof is required to prove port ${VERIFICATION_PORT} server ownership."
  exit 1
fi

PORT_LISTENERS=$(lsof -nP -iTCP:"${VERIFICATION_PORT}" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2}' | sort -u || true)
NUM_LISTENERS=$(echo "${PORT_LISTENERS}" | grep -c '[0-9]' || true)
if [[ "${NUM_LISTENERS}" != "1" ]]; then
  echo "FATAL SERVER OWNERSHIP FAILURE: Expected exactly 1 listener PID on port ${VERIFICATION_PORT}, found ${NUM_LISTENERS} (${PORT_LISTENERS})."
  exit 1
fi

SERVER_LISTENER_PID=$(echo "${PORT_LISTENERS}" | tr -d '[:space:]')
CUR_PID="${SERVER_LISTENER_PID}"
OWNERSHIP_FOUND=0
SERVER_ANCESTRY="${CUR_PID}"
for _ in {1..10}; do
  if [[ "${CUR_PID}" == "${SERVER_PID}" ]]; then
    OWNERSHIP_FOUND=1
    break
  fi
  PARENT_PID=$(ps -o ppid= -p "${CUR_PID}" 2>/dev/null | tr -d '[:space:]' || true)
  if [[ -z "${PARENT_PID}" ]] || [[ "${PARENT_PID}" == "1" ]] || [[ "${PARENT_PID}" == "${CUR_PID}" ]]; then
    break
  fi
  SERVER_ANCESTRY="${SERVER_ANCESTRY} -> ${PARENT_PID}"
  CUR_PID="${PARENT_PID}"
done

LISTENER_CWD=$(lsof -a -p "${SERVER_LISTENER_PID}" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1 || true)
SERVER_CWD=$(resolve_realpath "${LISTENER_CWD}")
REAL_EXPECTED_WEB=$(resolve_realpath "${ISOLATED_RUN_DIR}/apps/web")

if [[ "${OWNERSHIP_FOUND}" != "1" ]] || [[ "${SERVER_CWD}" != "${REAL_EXPECTED_WEB}"* ]]; then
  echo "FATAL SERVER OWNERSHIP FAILURE: Listener PID ${SERVER_LISTENER_PID} (ancestry=${SERVER_ANCESTRY}, cwd=${SERVER_CWD}) is not owned by launcher ${SERVER_PID} inside ${REAL_EXPECTED_WEB}."
  exit 1
fi
echo "  -> Server ownership proven: listener=${SERVER_LISTENER_PID}, ancestry=${SERVER_ANCESTRY}, cwd=${SERVER_CWD}"

echo "Running Real PDF Upload, HTTP Concurrency, Storage & Packet/Ledger Continuity suite..."
cd "${ISOLATED_RUN_DIR}"
run_allowlisted "test" node scripts/verify_live_concurrency_and_continuity.mjs

# ── 9. RUN PLAYWRIGHT BROWSER ACCEPTANCE SUITES UNDER ALLOWLISTED ENV ──────────
echo "[Step 9/9] Running Playwright browser assertion suites against ${VERIFICATION_URL}..."
cd "${ISOLATED_RUN_DIR}/apps/web"
run_allowlisted "test" npx --no-install playwright test \
  __tests__/day3/EmployerDay3Assertions.test.js \
  __tests__/day4/EmployerDay4Assertions.test.js \
  __tests__/chat/EmployerChatAssertions.test.js \
  __tests__/packet/CandidateTrustPacketAssertions.test.js \
  __tests__/device-policy/DeviceSupportPolicy.test.js \
  __tests__/packet/UninterceptedPacketJourneyE2E.test.js \
  --workers=1 \
  --reporter=line

stop_owned_server

echo "========================================================================"
echo "GUARDED DISPOSABLE VERIFICATION SEQUENCE COMPLETED WITH ZERO FAILURES"
echo "========================================================================"
