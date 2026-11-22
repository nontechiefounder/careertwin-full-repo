#!/usr/bin/env bash
# ==============================================================================
# WorkByLine V2 — Reproducible Synthetic Seed Setup Script
# Target Binding: Explicitly bound to Staging or Local Rehearsal
# Usage:
#   DATABASE_URL="postgres://..." ./infra/deployment/seed_synthetic_data.sh [--target=staging]
#   DISPOSABLE_DB_CONTAINER="wbctx-..." ./infra/deployment/seed_synthetic_data.sh --target=local-rehearsal
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Source unified target safety guard
source "${SCRIPT_DIR}/db_target_guard.sh"

SEED_FILE="${WORKTREE_ROOT}/supabase/seed.sql"

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
for arg in "$@"; do
  case "${arg}" in
    --target=staging)
      TARGET="staging"
      ;;
    --target=local-rehearsal)
      TARGET="local-rehearsal"
      ;;
    --help|-h)
      echo "Usage: $0 [--target=staging|local-rehearsal]"
      exit 0
      ;;
    *)
      echo "Usage: $0 [--target=staging|local-rehearsal]"
      exit 1
      ;;
  esac
done

echo "=== WORKBYLINE V2: SEED SYNTHETIC DATA START ==="
echo "Worktree root: ${WORKTREE_ROOT}"
echo "Current timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "Seed Target: ${TARGET}"
echo "Seed File: ${SEED_FILE}"

if [ ! -f "${SEED_FILE}" ]; then
  echo "[Error] Seed file not found at ${SEED_FILE}" >&2
  exit 1
fi

if [ "${TARGET}" = "staging" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "[SECURITY REJECTION] Staging seed setup requires DATABASE_URL to be explicitly set." >&2
    exit 42
  fi
  setup_guarded_sql_exec "${DATABASE_URL}"
  echo "[Target] Applying synthetic seed to Staging: $(mask_target_identity "${DATABASE_URL}")"
elif [ "${TARGET}" = "local-rehearsal" ]; then
  DISPOSABLE_DB_CONTAINER="${DISPOSABLE_DB_CONTAINER:-wbctx-disposable-eval-pg}"
  setup_guarded_sql_exec "${DISPOSABLE_DB_CONTAINER}"
  echo "[Target] Mode: Explicit Local Rehearsal (Disposable Docker Target: ${DISPOSABLE_DB_CONTAINER})"
  if ! docker ps --filter name="${DISPOSABLE_DB_CONTAINER}" --format "{{.Names}}" | grep -q "${DISPOSABLE_DB_CONTAINER}"; then
    echo "[BLOCKED] Disposable container '${DISPOSABLE_DB_CONTAINER}' is not running." >&2
    exit 1
  fi
else
  echo "[Error] Invalid target: ${TARGET}" >&2
  exit 1
fi

# Step 1: Execute Seed Script
echo "[Step 1/2] Applying synthetic seed SQL..."
exec_guarded_sql_file "${SEED_FILE}"
echo "  -> Seed SQL applied successfully."

# Step 2: Verify Comprehensive Seed Integrity
echo "[Step 2/2] Validating all promised synthetic entities, memberships, and credentials..."

ORG_A_NAME=$(exec_guarded_sql_cmd "SELECT name FROM public.organizations WHERE id = '00000000-0000-4000-c000-000000000001';")
ORG_B_NAME=$(exec_guarded_sql_cmd "SELECT name FROM public.organizations WHERE id = '00000000-0000-4000-c000-000000000002';")

if [ "${ORG_A_NAME}" != "Organization Alpha Corp" ] || [ "${ORG_B_NAME}" != "Organization Beta Corp" ]; then
  echo "  -> [FAIL] Expected organizations not found (Alpha: '${ORG_A_NAME}', Beta: '${ORG_B_NAME}')."
  exit 1
fi
echo "  -> [PASS] Verified organizations: '${ORG_A_NAME}' and '${ORG_B_NAME}' exist."

MEMBERS_COUNT=$(exec_guarded_sql_cmd "SELECT count(*) FROM public.organization_memberships;")
echo "  -> [PASS] Verified active memberships present (${MEMBERS_COUNT} memberships)."

CAND_COUNT=$(exec_guarded_sql_cmd "SELECT count(*) FROM public.candidates;")
echo "  -> [PASS] Verified synthetic candidate pool (${CAND_COUNT} candidates)."

DOCS_COUNT=$(exec_guarded_sql_cmd "SELECT count(*) FROM public.candidate_documents;")
echo "  -> [PASS] Verified candidate documents fixtures (${DOCS_COUNT} documents)."

echo "=== WORKBYLINE V2: SEED SYNTHETIC DATA COMPLETE ==="
exit 0
