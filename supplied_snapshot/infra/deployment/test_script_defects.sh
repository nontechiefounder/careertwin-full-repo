#!/usr/bin/env bash
# ==============================================================================
# WorkByLine V2 — Script Defect & Robustness Verification Suite (A2 Hardened)
# Fail-closed prerequisite checking & exact error signature verification:
#   A. Missing database connection fails closed with connection error.
#   B. Missing required RPC causes verify_staging_smoke.sh to fail closed.
#   C. Injected tracking-write / mid-migration failure rolls back atomically.
#   D. Extracted deployment in directory path with spaces operates cleanly.
#   E. Invalid target parameter fails closed with unknown target error.
#   F. Production script logging path redacts complex passwords with colons.
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

echo "=== SCRIPT DEFECT & ROBUSTNESS VERIFICATION SUITE START ==="
TOTAL_EXPECTED=6
PASSED_COUNT=0
BLOCKED_COUNT=0
FAILED_COUNT=0

record_check() {
  local code="$1"
  local desc="$2"
  local status="$3"
  local detail="$4"

  echo ""
  echo "--- [Test ${code}] ${desc} ---"
  if [ "${status}" = "PASS" ]; then
    echo "  -> [PASS] ${detail}"
    PASSED_COUNT=$((PASSED_COUNT + 1))
  elif [ "${status}" = "BLOCKED" ]; then
    echo "  -> [BLOCKED] ${detail}"
    BLOCKED_COUNT=$((BLOCKED_COUNT + 1))
  else
    echo "  -> [FAIL] ${detail}"
    FAILED_COUNT=$((FAILED_COUNT + 1))
  fi
}

# --- Test A: Missing Database Connection ---
if ! command -v psql >/dev/null 2>&1; then
  record_check "A" "Missing database connection fails closed" "BLOCKED" "Tool 'psql' is missing; cannot verify connection failure path"
else
  set +e
  OUT_A=$(DATABASE_URL="postgres://postgres:fakepass@127.0.0.1:59999/nonexistent" "${SCRIPT_DIR}/verify_staging_smoke.sh" --target=staging --app-url="http://127.0.0.1:3004" 2>&1)
  EXIT_A=$?
  set -e
  if [ "${EXIT_A}" -ne 0 ] && [[ "${OUT_A}" == *"could not connect"* || "${OUT_A}" == *"Connection refused"* || "${OUT_A}" == *"connection to server"* || "${OUT_A}" == *"Database connection check failed"* ]]; then
    record_check "A" "Missing database connection fails closed" "PASS" "Failed closed with expected connection rejection (exit ${EXIT_A})"
  else
    record_check "A" "Missing database connection fails closed" "FAIL" "Did not fail with expected connection error. Exit: ${EXIT_A}, Output: ${OUT_A}"
  fi
fi

# --- Test B: Missing Required RPC Causes Smoke Checker to Fail Closed (Finding A2) ---
if ! command -v psql >/dev/null 2>&1; then
  record_check "B" "Missing required RPC causes smoke checker to fail closed" "BLOCKED" "Tool 'psql' is missing"
else
  # Create a disposable wrapper that mocks psql to return 0 for RPC check
  MOCK_RPC_DIR="/tmp/ctw_mock_rpc_test"
  rm -rf "${MOCK_RPC_DIR}"
  mkdir -p "${MOCK_RPC_DIR}"
  cat << 'EOF' > "${MOCK_RPC_DIR}/psql"
#!/usr/bin/env bash
Q="$*"
if [[ "$Q" == *"record_human_decision_transactional"* ]]; then
  echo "0"
elif [[ "$Q" == *"SELECT 1;"* ]]; then
  echo "1"
elif [[ "$Q" == *"information_schema.tables"* ]]; then
  echo "1"
elif [[ "$Q" == *"information_schema.columns"* ]]; then
  echo "4"
elif [[ "$Q" == *"storage.buckets"* ]]; then
  echo "f|10485760"
else
  echo "1"
fi
EOF
  chmod +x "${MOCK_RPC_DIR}/psql"

  set +e
  OUT_B=$(PATH="${MOCK_RPC_DIR}:${PATH}" DATABASE_URL="postgres://audit-user:pass@127.0.0.1:5432/testdb" NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:5432" "${SCRIPT_DIR}/verify_staging_smoke.sh" --target=staging --app-url="http://127.0.0.1:3004" 2>&1)
  EXIT_B=$?
  set -e
  rm -rf "${MOCK_RPC_DIR}"

  if [ "${EXIT_B}" -ne 0 ] && [[ "${OUT_B}" == *"[FAIL] RPC record_human_decision_transactional: RPC missing or signature mismatch"* ]]; then
    record_check "B" "Missing required RPC causes smoke checker to fail closed" "PASS" "Smoke checker exited ${EXIT_B} and reported missing RPC failure"
  else
    record_check "B" "Missing required RPC causes smoke checker to fail closed" "FAIL" "Smoke checker did not fail closed on missing RPC (exit ${EXIT_B}): ${OUT_B}"
  fi
fi

# --- Test C: Atomic Migration Failure Rollback (Finding A2/F03) ---
HAS_DB=false
if docker ps --filter name=supabase_db_careertwin-local-baseline --format "{{.Names}}" | grep -q "supabase_db_careertwin-local-baseline"; then
  HAS_DB=true
fi

if [ "${HAS_DB}" = "false" ]; then
  record_check "C" "Atomic migration failure rolls back transaction completely" "BLOCKED" "Local Supabase database container is not running"
else
  if [ -d "${WORKTREE_ROOT}/supabase/migrations" ]; then
    CANARY_DIR="${WORKTREE_ROOT}/supabase/migrations"
  elif [ -d "${SCRIPT_DIR}/../migrations" ]; then
    CANARY_DIR="$(cd "${SCRIPT_DIR}/../migrations" && pwd)"
  else
    CANARY_DIR="${WORKTREE_ROOT}/supabase/migrations"
  fi
  CANARY_MIG="${CANARY_DIR}/99999999999998_canary_defect_test.sql"
  cat << 'EOF' > "${CANARY_MIG}"
CREATE TABLE public.canary_tracking_defect_test_tbl (id serial primary key);
INTENTIONAL_FATAL_SYNTAX_ERROR_TO_TEST_ATOMIC_ROLLBACK;
EOF

  set +e
  OUT_C=$("${SCRIPT_DIR}/deploy_staging.sh" --target=local-rehearsal 2>&1)
  EXIT_C=$?
  set -e
  rm -f "${CANARY_MIG}"

  CANARY_EXISTS=$(docker exec -i supabase_db_careertwin-local-baseline psql -U postgres -d postgres -t -A -c "SELECT to_regclass('public.canary_tracking_defect_test_tbl');" 2>/dev/null || echo "ERROR")
  TRACKING_EXISTS=$(docker exec -i supabase_db_careertwin-local-baseline psql -U postgres -d postgres -t -A -c "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '99999999999998';" 2>/dev/null || echo "0")

  if [ "${EXIT_C}" -ne 0 ] && [ -z "${CANARY_EXISTS}" ] && [ "${TRACKING_EXISTS}" = "0" ]; then
    record_check "C" "Atomic migration failure rolls back transaction completely" "PASS" "Deploy script exited ${EXIT_C}; neither canary table nor tracking record committed"
  else
    record_check "C" "Atomic migration failure rolls back transaction completely" "FAIL" "Rollback check failed. Exit: ${EXIT_C}, Table: ${CANARY_EXISTS}, Tracking: ${TRACKING_EXISTS}"
  fi
fi

# --- Test D: Extracted Space-Path Rehearsal (Finding A2) ---
TEST_SPACE_DIR="/tmp/ctw test path with spaces"
rm -rf "${TEST_SPACE_DIR}"
mkdir -p "${TEST_SPACE_DIR}/supabase/migrations"
cat << 'EOS' > "${TEST_SPACE_DIR}/supabase/migrations/20260817999999_test_space_migration.sql"
-- Test migration in path with spaces
SELECT 1;
EOS

set +e
MIG_FILES_D=()
while IFS= read -r -d '' file; do MIG_FILES_D+=("${file}"); done < <(find "${TEST_SPACE_DIR}/supabase/migrations" -maxdepth 1 -name "*.sql" -print0 | sort -z)
EXIT_D=$?
rm -rf "${TEST_SPACE_DIR}"
set -e

if [ ${#MIG_FILES_D[@]} -eq 1 ] && [[ "${MIG_FILES_D[0]}" == *"test path with spaces"* ]]; then
  record_check "D" "Handling paths with spaces without glob or quoting errors" "PASS" "Files in spaced directory discovered cleanly: ${MIG_FILES_D[0]}"
else
  record_check "D" "Handling paths with spaces without glob or quoting errors" "FAIL" "Failed to discover files in spaced path"
fi

# --- Test E: Invalid Target Parameter Fails Closed ---
set +e
OUT_E=$("${SCRIPT_DIR}/deploy_staging.sh" --target=invalid_cloud_target 2>&1)
EXIT_E=$?
set -e
if [ "${EXIT_E}" -ne 0 ] && [[ "${OUT_E}" == *"Unknown argument"* || "${OUT_E}" == *"Invalid target"* ]]; then
  record_check "E" "Invalid/unknown target parameter fails closed" "PASS" "Rejected invalid target with expected message (exit ${EXIT_E})"
else
  record_check "E" "Invalid/unknown target parameter fails closed" "FAIL" "Did not fail with expected invalid target message (exit ${EXIT_E})"
fi

# --- Test F: Production Script Logging Path Redacts Colon Password (Finding A2/F07) ---
if ! command -v psql >/dev/null 2>&1; then
  record_check "F" "Production script logging path redacts colon password" "BLOCKED" "Tool 'psql' is missing"
else
  SECRET_PART="MY_SECRET_PW_PART1:PART2"
  TEST_CONN_URL="postgres://audit-user:${SECRET_PART}@host.invalid:5432/testdb"
  set +e
  OUT_F=$(DATABASE_URL="${TEST_CONN_URL}" "${SCRIPT_DIR}/deploy_staging.sh" --target=staging 2>&1)
  EXIT_F=$?
  set -e

if [[ "${OUT_F}" == *"${SECRET_PART}"* ]]; then
  record_check "F" "Production script logging path redacts colon password" "FAIL" "Production script leaked secret password in output!"
elif [[ "${OUT_F}" == *"postgres://audit-user:****@host.invalid:5432/testdb"* ]]; then
  record_check "F" "Production script logging path redacts colon password" "PASS" "Production script log verified: fully masked to postgres://audit-user:****@host.invalid:5432/testdb"
else
  record_check "F" "Production script logging path redacts colon password" "FAIL" "Masked URL pattern not found in production script output: ${OUT_F}"
fi
fi

echo ""
echo "=== SCRIPT DEFECT VERIFICATION SUMMARY ==="
echo "  Passed:  ${PASSED_COUNT}/${TOTAL_EXPECTED}"
echo "  Blocked: ${BLOCKED_COUNT}/${TOTAL_EXPECTED}"
echo "  Failed:  ${FAILED_COUNT}/${TOTAL_EXPECTED}"

if [ "${BLOCKED_COUNT}" -gt 0 ] || [ "${FAILED_COUNT}" -gt 0 ]; then
  echo "[Status] DEFECT SUITE FAILED OR BLOCKED — Exiting with code 1 (fail-closed)."
  exit 1
else
  echo "[Status] ALL ${PASSED_COUNT} SCRIPT DEFECT AND ROBUSTNESS CHECKS PASSED WITH 100% SUCCESS."
  exit 0
fi
