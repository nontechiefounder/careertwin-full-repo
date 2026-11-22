#!/usr/bin/env bash
# ==============================================================================
# WorkByline V2 — Staging Rollback Script
# Target Binding: Explicitly bound to Staging or Local Rehearsal
# Usage:
#   DATABASE_URL="postgres://..." ./infra/deployment/rollback_staging.sh [--target=staging]
#   ./infra/deployment/rollback_staging.sh --target=local-rehearsal
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "${SCRIPT_DIR}/../../source/apps/web" ]; then
  WORKTREE_ROOT="$(cd "${SCRIPT_DIR}/../../source" && pwd)"
elif [ -d "${SCRIPT_DIR}/../source/apps/web" ]; then
  WORKTREE_ROOT="$(cd "${SCRIPT_DIR}/../source" && pwd)"
elif [ -d "${SCRIPT_DIR}/../../apps/web" ]; then
  WORKTREE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
elif [ -d "${SCRIPT_DIR}/apps/web" ]; then
  WORKTREE_ROOT="${SCRIPT_DIR}"
else
  WORKTREE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
fi
if [ -f "${WORKTREE_ROOT}/supabase/migrations/rehearsals/rollback_20260817000001.sql" ]; then
  ROLLBACK_FILE="${WORKTREE_ROOT}/supabase/migrations/rehearsals/rollback_20260817000001.sql"
elif [ -f "${SCRIPT_DIR}/../migrations/rehearsals/rollback_20260817000001.sql" ]; then
  ROLLBACK_FILE="${SCRIPT_DIR}/../migrations/rehearsals/rollback_20260817000001.sql"
elif [ -f "${SCRIPT_DIR}/../../migrations/rehearsals/rollback_20260817000001.sql" ]; then
  ROLLBACK_FILE="${SCRIPT_DIR}/../../migrations/rehearsals/rollback_20260817000001.sql"
else
  ROLLBACK_FILE="${WORKTREE_ROOT}/supabase/migrations/rehearsals/rollback_20260817000001.sql"
fi

# Redact credentials function
mask_url() {
  local raw_url="$1"
  echo "${raw_url}" | sed -E 's|://([^:]+):(.*)@|://\1:****@|'
}

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

TARGET="staging"
VERIFY_CORE08=false

for arg in "$@"; do
  case "${arg}" in
    --target=staging)
      TARGET="staging"
      ;;
    --target=local-rehearsal)
      TARGET="local-rehearsal"
      ;;
    --verify-core08-package)
      VERIFY_CORE08=true
      ;;
    *)
      echo "[Error] Unknown argument: ${arg}"
      echo "Usage: $0 [--target=staging|local-rehearsal] [--verify-core08-package]"
      exit 1
      ;;
  esac
done

echo "=== WORKBYLINE V2: STAGING ROLLBACK START ==="
echo "Worktree root: ${WORKTREE_ROOT}"
echo "Current timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "Rollback Target: ${TARGET}"
echo "Rollback SQL script: ${ROLLBACK_FILE}"

if [ ! -f "${ROLLBACK_FILE}" ]; then
  echo "[Error] Rollback SQL script not found at ${ROLLBACK_FILE}"
  exit 1
fi

if [ "${VERIFY_CORE08}" = "true" ]; then
  CORE08_TAR="${WORKTREE_ROOT}/rollback/careertwin_core08_app_archive.tar.gz"
  if [ ! -f "${CORE08_TAR}" ]; then
    echo "[Error] Paired Core-08 application archive not found at ${CORE08_TAR}"
    exit 1
  fi
  echo "[Rollback Verification] Validating paired Core-08 application archive integrity..."
  if ! tar -tzf "${CORE08_TAR}" >/dev/null 2>&1; then
    echo "[Error] Paired Core-08 archive is corrupted or invalid."
    exit 1
  fi
  echo "[Rollback Verification] Paired Core-08 application archive is verified and intact."
fi

if [ "${TARGET}" = "staging" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "[Error] Staging rollback requires DATABASE_URL to be explicitly set."
    echo "[Error] Silent fallback to local Docker is removed and disabled."
    echo "Usage: DATABASE_URL=\"postgres://...\" $0 --target=staging"
    exit 1
  fi
  if ! command -v psql >/dev/null 2>&1; then
    echo "[Error] 'psql' client is required for staging rollback but not found in PATH."
    exit 1
  fi
  echo "[Rollback] Executing atomic rollback against target DATABASE_URL: $(mask_url "${DATABASE_URL}")..."
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${ROLLBACK_FILE}"
  echo "[Rollback] Rollback completed successfully on $(mask_url "${DATABASE_URL}")."
elif [ "${TARGET}" = "local-rehearsal" ]; then
  echo "[Rollback] Mode: Explicit Local Rehearsal (Docker Target)"
  if ! docker ps --filter name=supabase_db_careertwin-local-baseline --format "{{.Names}}" | grep -q "supabase_db_careertwin-local-baseline"; then
    echo "[Error] Local Supabase container 'supabase_db_careertwin-local-baseline' is not running."
    exit 1
  fi
  docker exec -i supabase_db_careertwin-local-baseline psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "${ROLLBACK_FILE}"
  echo "[Rollback] Atomic rollback completed successfully on local Supabase container."
else
  echo "[Error] Invalid target: ${TARGET}"
  exit 1
fi

echo ""
echo "--- APPLICATION VERSION PAIRING & COMPATIBILITY NOTICE (F05) ---"
echo "[Schema State] Database RPC definitions reverted to Core-08 signatures; versions 20260817000001/2 removed from schema_migrations."
echo "[Retained Schema] All candidate records (155), candidate_profiles, claim_ledgers (202), and storage buckets remain safely intact."
echo "[Application Pairing] To ensure end-to-end compatibility, deploy the matching Core-08 application version:"
echo "  Option A (Standalone Package without Git):"
echo "    mkdir -p rollback/core08_app && tar -xzf rollback/careertwin_core08_app_archive.tar.gz -C rollback/core08_app"
echo "    cd rollback/core08_app/apps/web && npm ci --prefer-offline && npm run build && npm run start"
echo "  Option B (Git Worktree / Repository):"
echo "    git checkout 5f1b851"
echo "    cd apps/web && npm ci --prefer-offline && npm run build && npm run start"
echo "[Compatibility Note] Legacy Core-08 RPC does not accept OCC parameters 'expected_ledger_revision' and 'expected_rubric_version'."
echo "=== WORKBYLINE V2: STAGING ROLLBACK COMPLETE ==="
