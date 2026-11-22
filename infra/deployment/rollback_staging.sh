#!/usr/bin/env bash
# ==============================================================================
# WorkByLine V2 — Staging Rollback Script
# Target Binding: Explicitly bound to Staging or Local Rehearsal
# Usage:
#   DATABASE_URL="postgres://..." ./infra/deployment/rollback_staging.sh [--target=staging]
#   DISPOSABLE_DB_CONTAINER="wbctx-..." ./infra/deployment/rollback_staging.sh --target=local-rehearsal
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Source unified target safety guard
source "${SCRIPT_DIR}/db_target_guard.sh"

ROLLBACK_FILE="${WORKTREE_ROOT}/supabase/migrations/rehearsals/rollback_20260817000001.sql"

# 1. Environment Loading (Safe / Silent)
load_env_safe() {
  local env_file="$1"
  if [ -f "${env_file}" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      line="$(echo "${line}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
      if [[ -z "${line}" || "${line}" == \#* ]]; then
        continue
      fi
      if [[ "${line}" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
        local key="${BASH_REMATCH[1]}"
        local val="${BASH_REMATCH[2]}"
        val="${val%\"}"
        val="${val#\"}"
        val="${val%\'}"
        val="${val#\'}"
        if [ -z "${!key:-}" ]; then
          export "${key}=${val}"
        fi
      fi
    done < "${env_file}"
  fi
}

load_env_safe "${WORKTREE_ROOT}/.env"
load_env_safe "${WORKTREE_ROOT}/.env.local"
load_env_safe "${WORKTREE_ROOT}/apps/web/.env"
load_env_safe "${WORKTREE_ROOT}/apps/web/.env.local"

# 2. Argument Parsing
TARGET="staging"
CHECK_ARCHIVE=true

for arg in "$@"; do
  case "${arg}" in
    --target=staging)
      TARGET="staging"
      ;;
    --target=local-rehearsal)
      TARGET="local-rehearsal"
      ;;
    --skip-archive-check)
      CHECK_ARCHIVE=false
      ;;
    --help|-h)
      echo "Usage: $0 [--target=staging|local-rehearsal] [--skip-archive-check]"
      exit 0
      ;;
    *)
      echo "Usage: $0 [--target=staging|local-rehearsal] [--skip-archive-check]"
      exit 1
      ;;
  esac
done

echo "=== WORKBYLINE V2: ROLLBACK START ==="
echo "Worktree root: ${WORKTREE_ROOT}"
echo "Current timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "Rollback Target: ${TARGET}"
echo "Rollback SQL: ${ROLLBACK_FILE}"

if [ ! -f "${ROLLBACK_FILE}" ]; then
  echo "[Error] Rollback file not found at ${ROLLBACK_FILE}"
  exit 1
fi

# Optional validation of Core-08 paired archive
CORE08_TAR="${WORKTREE_ROOT}/rollback/careertwin_core08_app_archive.tar.gz"
if [ "${CHECK_ARCHIVE}" = "true" ] && [ -f "${CORE08_TAR}" ]; then
  echo "[Rollback Verification] Validating paired Core-08 application archive integrity..."
  if ! tar -tzf "${CORE08_TAR}" >/dev/null 2>&1; then
    echo "[Error] Paired Core-08 archive is corrupted or invalid."
    exit 1
  fi
  echo "[Rollback Verification] Paired Core-08 application archive is verified and intact."
fi

# 3. Target Verification & Fail-Closed Setup
if [ "${TARGET}" = "staging" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "[SECURITY REJECTION] Staging rollback requires DATABASE_URL to be explicitly set." >&2
    echo "[SECURITY REJECTION] Silent fallback to local Docker is removed and disabled." >&2
    exit 42
  fi
  setup_guarded_sql_exec "${DATABASE_URL}"
  echo "[Rollback] Executing atomic rollback against target: $(mask_target_identity "${DATABASE_URL}")..."
  exec_guarded_sql_file "${ROLLBACK_FILE}"
  echo "[Rollback] Rollback completed successfully on $(mask_target_identity "${DATABASE_URL}")."
elif [ "${TARGET}" = "local-rehearsal" ]; then
  if [ -z "${DISPOSABLE_DB_CONTAINER:-}" ]; then
    echo "[SECURITY REJECTION] Local rehearsal requires DISPOSABLE_DB_CONTAINER to be explicitly set." >&2
    echo "[SECURITY REJECTION] Shared container 'supabase_db_careertwin-local-baseline' is protected from destructive test writes." >&2
    exit 42
  fi
  setup_guarded_sql_exec "${DISPOSABLE_DB_CONTAINER}"
  echo "[Rollback] Executing atomic rollback against disposable container $(mask_target_identity "${DISPOSABLE_DB_CONTAINER}")..."
  exec_guarded_sql_file "${ROLLBACK_FILE}"
  echo "[Rollback] Atomic rollback completed successfully on disposable container."
else
  echo "[Error] Invalid target: ${TARGET}" >&2
  exit 1
fi

echo ""
echo "--- APPLICATION VERSION PAIRING & COMPATIBILITY NOTICE ---"
echo "[Schema State] Database RPC definitions reverted to Core-08 signatures; versions 20260817000001/2 removed from schema_migrations."
echo "=== WORKBYLINE V2: STAGING ROLLBACK COMPLETE ==="
exit 0
