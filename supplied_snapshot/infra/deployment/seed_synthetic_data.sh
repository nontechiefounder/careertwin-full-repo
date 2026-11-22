#!/usr/bin/env bash
# ==============================================================================
# WorkByline V2 — Reproducible Synthetic Seed Setup Script
# Target Binding: Explicitly bound to Staging or Local Rehearsal
# Usage:
#   DATABASE_URL="postgres://..." ./infra/deployment/seed_synthetic_data.sh [--target=staging]
#   ./infra/deployment/seed_synthetic_data.sh --target=local-rehearsal
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
if [ -f "${WORKTREE_ROOT}/supabase/seed.sql" ]; then
  SEED_FILE="${WORKTREE_ROOT}/supabase/seed.sql"
elif [ -f "${SCRIPT_DIR}/../migrations/seed.sql" ]; then
  SEED_FILE="${SCRIPT_DIR}/../migrations/seed.sql"
elif [ -f "${SCRIPT_DIR}/../../migrations/seed.sql" ]; then
  SEED_FILE="${SCRIPT_DIR}/../../migrations/seed.sql"
else
  SEED_FILE="${WORKTREE_ROOT}/supabase/seed.sql"
fi

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

# Redact credentials function
mask_url() {
  local raw_url="$1"
  echo "${raw_url}" | sed -E 's|://([^:]+):(.*)@|://\1:****@|'
}

TARGET="staging"
for arg in "$@"; do
  case "${arg}" in
    --target=staging)
      TARGET="staging"
      ;;
    --target=local-rehearsal)
      TARGET="local-rehearsal"
      ;;
    *)
      echo "[Error] Unknown argument: ${arg}"
      echo "Usage: $0 [--target=staging|local-rehearsal]"
      exit 1
      ;;
  esac
done

echo "=== WORKBYLINE V2: REPRODUCIBLE SYNTHETIC SEED SETUP START ==="
echo "Worktree root: ${WORKTREE_ROOT}"
echo "Current timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "Seed Target: ${TARGET}"
echo "Seed SQL file: ${SEED_FILE}"

if [ ! -f "${SEED_FILE}" ]; then
  echo "[Error] Seed file not found at ${SEED_FILE}"
  exit 1
fi

run_sql_cmd() {
  local query="$1"
  if [ "${TARGET}" = "staging" ]; then
    psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -q -t -A -c "${query}"
  else
    docker exec -i supabase_db_careertwin-local-baseline psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -t -A -c "${query}"
  fi
}

run_sql_file() {
  local file_path="$1"
  if [ "${TARGET}" = "staging" ]; then
    psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${file_path}"
  else
    docker exec -i supabase_db_careertwin-local-baseline psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "${file_path}"
  fi
}

if [ "${TARGET}" = "staging" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "[Error] Staging seed setup requires DATABASE_URL to be set."
    exit 1
  fi
  if ! command -v psql >/dev/null 2>&1; then
    echo "[Error] 'psql' client is required for staging seed setup."
    exit 1
  fi
  echo "[Target] Applying synthetic seed to Staging: $(mask_url "${DATABASE_URL}")"
elif [ "${TARGET}" = "local-rehearsal" ]; then
  echo "[Target] Mode: Explicit Local Rehearsal (Docker Target)"
  if ! docker ps --filter name=supabase_db_careertwin-local-baseline --format "{{.Names}}" | grep -q "supabase_db_careertwin-local-baseline"; then
    echo "[Error] Local Supabase container 'supabase_db_careertwin-local-baseline' is not running."
    exit 1
  fi
fi

# Step 1: Execute Seed Script
echo "[Step 1/2] Applying synthetic seed SQL..."
run_sql_file "${SEED_FILE}"
echo "  -> Seed SQL applied successfully."

# Step 2: Verify Comprehensive Seed Integrity & Authentication Setup (F08 Fail-Closed)
echo "[Step 2/2] Validating all promised synthetic entities, memberships, and credentials..."

# 1. Validate exact synthetic auth user identities (UUID + Email pairing)
AUTH_EXACT_COUNT=$(run_sql_cmd "SELECT count(*) FROM auth.users WHERE (id, email) IN (
  ('00000000-0000-4000-a000-000000000001', 'synthetic.employer.alpha@example.invalid'),
  ('00000000-0000-4000-a000-000000000002', 'synthetic.employer.beta@example.invalid'),
  ('00000000-0000-4000-a000-000000000003', 'synthetic.employer.alpha.recruiter@example.invalid'),
  ('00000000-0000-4000-a000-000000000004', 'synthetic.employer.alpha.auditor@example.invalid'),
  ('00000000-0000-4000-b000-000000000001', 'synthetic.candidate.one@example.invalid'),
  ('00000000-0000-4000-b000-000000000002', 'synthetic.candidate.two@example.invalid')
);")
if [ "${AUTH_EXACT_COUNT}" != "6" ]; then
  echo "[Error] Expected 6 exact synthetic auth users (ID + Email), found: ${AUTH_EXACT_COUNT}"
  exit 1
fi

# 2. Cryptographic password verification for all 6 accounts (Finding A6)
AUTH_PASS_COUNT=$(run_sql_cmd "SELECT count(*) FROM auth.users WHERE id IN (
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000002',
  '00000000-0000-4000-a000-000000000003',
  '00000000-0000-4000-a000-000000000004',
  '00000000-0000-4000-b000-000000000001',
  '00000000-0000-4000-b000-000000000002'
) AND (crypt('TestPassword123!', encrypted_password) = encrypted_password);")
if [ "${AUTH_PASS_COUNT}" != "6" ]; then
  echo "[Error] Expected 6 accounts with verifiable password 'TestPassword123!', found: ${AUTH_PASS_COUNT}"
  exit 1
fi

# 3. Validate organizations (Alpha and Beta)
ORGS_COUNT=$(run_sql_cmd "SELECT count(*) FROM public.organizations WHERE id IN (
  '00000000-0000-4000-c000-000000000001',
  '00000000-0000-4000-c000-000000000002'
);")
if [ "${ORGS_COUNT}" != "2" ]; then
  echo "[Error] Expected 2 synthetic organizations, found: ${ORGS_COUNT}"
  exit 1
fi

# 4. Validate exact staff profiles (ID + Email)
PROFILES_COUNT=$(run_sql_cmd "SELECT count(*) FROM public.profiles WHERE (id, email) IN (
  ('00000000-0000-4000-a000-000000000001', 'synthetic.employer.alpha@example.invalid'),
  ('00000000-0000-4000-a000-000000000002', 'synthetic.employer.beta@example.invalid'),
  ('00000000-0000-4000-a000-000000000003', 'synthetic.employer.alpha.recruiter@example.invalid'),
  ('00000000-0000-4000-a000-000000000004', 'synthetic.employer.alpha.auditor@example.invalid')
);")
if [ "${PROFILES_COUNT}" != "4" ]; then
  echo "[Error] Expected 4 employer staff profiles (ID + Email), found: ${PROFILES_COUNT}"
  exit 1
fi

# 5. Validate exact organization memberships (Org + User + Role + Status tuples) (Finding A6)
MEMBERS_COUNT=$(run_sql_cmd "SELECT count(*) FROM public.organization_memberships WHERE (organization_id, user_id, membership_role, membership_status) IN (
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001', 'owner', 'active'),
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000003', 'recruiter', 'active'),
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000004', 'auditor', 'active'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000002', 'owner', 'active')
);")
if [ "${MEMBERS_COUNT}" != "4" ]; then
  echo "[Error] Expected 4 exact active organization memberships (Org, User, Role, Status), found: ${MEMBERS_COUNT}"
  exit 1
fi

# 6. Validate exact candidate profiles (ID + Email)
CAND_COUNT=$(run_sql_cmd "SELECT count(*) FROM public.candidate_profiles WHERE (id, email) IN (
  ('00000000-0000-4000-b000-000000000001', 'synthetic.candidate.one@example.invalid'),
  ('00000000-0000-4000-b000-000000000002', 'synthetic.candidate.two@example.invalid')
);")
if [ "${CAND_COUNT}" != "2" ]; then
  echo "[Error] Expected 2 synthetic candidate profiles, found: ${CAND_COUNT}"
  exit 1
fi

echo "[Seed] Comprehensive validation passed: 6 auth users with verified password auth, 2 organizations, 4 staff profiles, 4 exact membership tuples, and 2 candidate profiles verified."
echo "=== WORKBYLINE V2: REPRODUCIBLE SYNTHETIC SEED SETUP COMPLETE ==="
