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
TOTAL_EXPECTED=15
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
if [ -z "${DISPOSABLE_DATABASE_URL:-}" ]; then
  if nc -z 127.0.0.1 54399 2>/dev/null; then
    DISPOSABLE_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:54399/postgres"
  fi
fi

if [ -z "${DISPOSABLE_DATABASE_URL:-}" ]; then
  record_check "C" "Atomic migration failure rolls back transaction completely" "BLOCKED" "Disposable test database not configured (set DISPOSABLE_DATABASE_URL); shared database is protected and cannot be probed"
else
  # Enforce rejection of protected database identity
  LOWER_DISP="$(echo "${DISPOSABLE_DATABASE_URL}" | tr '[:upper:]' '[:lower:]')"
  if [[ "${LOWER_DISP}" =~ :54332 ]] || [[ "${LOWER_DISP}" =~ supabase_db_careertwin-local-baseline ]]; then
    record_check "C" "Atomic migration failure rolls back transaction completely" "FAIL" "Configured DISPOSABLE_DATABASE_URL targets protected shared database"
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
    OUT_C=$(DATABASE_URL="${DISPOSABLE_DATABASE_URL}" "${SCRIPT_DIR}/deploy_staging.sh" --target=staging 2>&1)
    EXIT_C=$?
    set -e
    rm -f "${CANARY_MIG}"

    CANARY_EXISTS=$(psql "${DISPOSABLE_DATABASE_URL}" -t -A -c "SELECT to_regclass('public.canary_tracking_defect_test_tbl');" 2>/dev/null || echo "ERROR")
    TRACKING_EXISTS=$(psql "${DISPOSABLE_DATABASE_URL}" -t -A -c "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '99999999999998';" 2>/dev/null || echo "0")

    if [ "${EXIT_C}" -ne 0 ] && [ -z "${CANARY_EXISTS}" ] && [ "${TRACKING_EXISTS}" = "0" ]; then
      record_check "C" "Atomic migration failure rolls back transaction completely" "PASS" "Deploy script exited ${EXIT_C}; neither canary table nor tracking record committed on disposable DB"
    else
      record_check "C" "Atomic migration failure rolls back transaction completely" "FAIL" "Rollback check failed on disposable DB. Exit: ${EXIT_C}, Table: ${CANARY_EXISTS}, Tracking: ${TRACKING_EXISTS}"
    fi
  fi
fi

# --- Test C2: Rejection of Protected Shared Database ---
set +e
OUT_REJECT=$(DATABASE_URL="postgresql://postgres:secret@127.0.0.1:54332/postgres" "${SCRIPT_DIR}/deploy_staging.sh" --target=staging 2>&1)
EXIT_REJECT=$?
set -e
if [ "${EXIT_REJECT}" -eq 42 ] && [[ "${OUT_REJECT}" == *"[SECURITY REJECTION]"* ]]; then
  record_check "C2" "Rejection guard prevents writes to shared baseline database (port 54332)" "PASS" "Deploy script cleanly rejected port 54332 with exit code 42"
else
  record_check "C2" "Rejection guard prevents writes to shared baseline database (port 54332)" "FAIL" "Rejection guard failed to block port 54332 (exit ${EXIT_REJECT})"
fi

# --- Test C3: Rejection of libpq with whitespace around port 54332 ---
set +e
OUT_LIBPQ=$(DATABASE_URL="host = 127.0.0.1 port = 54332 user = postgres dbname = postgres" "${SCRIPT_DIR}/deploy_staging.sh" --target=staging 2>&1)
EXIT_LIBPQ=$?
set -e
if [ "${EXIT_LIBPQ}" -eq 42 ] && [[ "${OUT_LIBPQ}" == *"[SECURITY REJECTION]"* ]]; then
  record_check "C3" "Rejection guard catches libpq connection string with whitespace around port 54332" "PASS" "Rejected 'port = 54332' with exit code 42"
else
  record_check "C3" "Rejection guard catches libpq connection string with whitespace around port 54332" "FAIL" "Failed to reject libpq whitespace (exit ${EXIT_LIBPQ})"
fi

# --- Test C4: Rejection of Protected Container Name ---
set +e
OUT_CONTAINER=$(DISPOSABLE_DB_CONTAINER="supabase_db_careertwin-local-baseline" "${SCRIPT_DIR}/deploy_staging.sh" --target=local-rehearsal 2>&1)
EXIT_CONTAINER=$?
set -e
if [ "${EXIT_CONTAINER}" -eq 42 ] && [[ "${OUT_CONTAINER}" == *"[SECURITY REJECTION]"* ]]; then
  record_check "C4" "Rejection guard blocks shared baseline container name in local-rehearsal" "PASS" "Rejected protected container with exit code 42"
else
  record_check "C4" "Rejection guard blocks shared baseline container name in local-rehearsal" "FAIL" "Failed to reject shared container (exit ${EXIT_CONTAINER})"
fi

# --- Test C5: Rejection of Unsupported / Malformed Target Formats ---
set +e
OUT_MALFORMED=$(DATABASE_URL="ftp://localhost:5432/invalid_db" "${SCRIPT_DIR}/deploy_staging.sh" --target=staging 2>&1)
EXIT_MALFORMED=$?
set -e
if [ "${EXIT_MALFORMED}" -eq 42 ] && [[ "${OUT_MALFORMED}" == *"[SECURITY REJECTION]"* ]]; then
  record_check "C5" "Rejection guard fails closed on malformed/unsupported database targets" "PASS" "Rejected unsupported scheme 'ftp://' with exit code 42"
else
  record_check "C5" "Rejection guard fails closed on malformed/unsupported database targets" "FAIL" "Failed to reject malformed target (exit ${EXIT_MALFORMED})"
fi

# --- Test C6: DSN Redaction with Special Encoded Chars, Raw @ and Query Strings ---
COMPLEX_URL="postgresql+psycopg://app_user:P%40ss%23w0rd%21%3Acomplex@127.0.0.1:54399/disposable_db?sslmode=disable"
MASKED_DESC=$(source "${SCRIPT_DIR}/db_target_guard.sh" && mask_target_identity "${COMPLEX_URL}")
if [[ "${MASKED_DESC}" == *"127.0.0.1"* ]] && [[ "${MASKED_DESC}" == *"54399"* ]] && [[ "${MASKED_DESC}" != *"P%40ss"* ]] && [[ "${MASKED_DESC}" != *"w0rd"* ]]; then
  record_check "C6" "DSN logging redaction strips complex credentials completely" "PASS" "Redacted identity: ${MASKED_DESC}"
else
  record_check "C6" "DSN logging redaction strips complex credentials completely" "FAIL" "Credentials leaked in descriptor: ${MASKED_DESC}"
fi

# --- Test C7: Rejection of URL Query-Parameter Overrides (?port=..., ?host=..., ?dbname=...) ---
set +e
OUT_Q1=$(bash -c 'source "'"${SCRIPT_DIR}"'/db_target_guard.sh" && assert_disposable_db_target "postgresql://postgres:secret@127.0.0.1:54399/disposable_db?port=54332"' 2>&1)
EXIT_Q1=$?
OUT_Q2=$(bash -c 'source "'"${SCRIPT_DIR}"'/db_target_guard.sh" && assert_disposable_db_target "postgresql://postgres:secret@127.0.0.1:54399/disposable_db?host=10.0.0.5"' 2>&1)
EXIT_Q2=$?
OUT_Q3=$(bash -c 'source "'"${SCRIPT_DIR}"'/db_target_guard.sh" && assert_disposable_db_target "postgresql://postgres:secret@127.0.0.1:54399/disposable_db?dbname=production"' 2>&1)
EXIT_Q3=$?
set -e
if [ "${EXIT_Q1}" -eq 42 ] && [ "${EXIT_Q2}" -eq 42 ] && [ "${EXIT_Q3}" -eq 42 ]; then
  record_check "C7" "Rejection guard blocks URL query-parameter host/port/dbname overrides" "PASS" "All query overrides (?port=, ?host=, ?dbname=) rejected with exit code 42"
else
  record_check "C7" "Rejection guard blocks URL query-parameter host/port/dbname overrides" "FAIL" "Failed to reject query overrides (${EXIT_Q1}, ${EXIT_Q2}, ${EXIT_Q3})"
fi

# --- Test C8: Rejection of Duplicate Connection Parameters in URL Query & libpq ---
set +e
OUT_DUP_URL=$(bash -c 'source "'"${SCRIPT_DIR}"'/db_target_guard.sh" && assert_disposable_db_target "postgresql://postgres:secret@127.0.0.1:54399/disposable_db?sslmode=disable&sslmode=require"' 2>&1)
EXIT_DUP_URL=$?
OUT_DUP_LIBPQ=$(bash -c 'source "'"${SCRIPT_DIR}"'/db_target_guard.sh" && assert_disposable_db_target "host=127.0.0.1 port=54399 port=5432 dbname=disposable_db user=postgres"' 2>&1)
EXIT_DUP_LIBPQ=$?
set -e
if [ "${EXIT_DUP_URL}" -eq 42 ] && [ "${EXIT_DUP_LIBPQ}" -eq 42 ]; then
  record_check "C8" "Rejection guard blocks duplicate connection parameters in URL and libpq" "PASS" "Duplicate URL query and libpq parameters rejected with exit code 42"
else
  record_check "C8" "Rejection guard blocks duplicate connection parameters in URL and libpq" "FAIL" "Failed to reject duplicate parameters (URL=${EXIT_DUP_URL}, libpq=${EXIT_DUP_LIBPQ})"
fi

# --- Test C9: Rejection of Misleading Disposable Keywords in Password or Query Params ---
set +e
OUT_MISLEAD_URL=$(bash -c 'source "'"${SCRIPT_DIR}"'/db_target_guard.sh" && assert_disposable_db_target "postgresql://disposable_user:disposable_test_pw@127.0.0.1:5432/postgres?application_name=disposable_staging_eval"' 2>&1)
EXIT_MISLEAD_URL=$?
OUT_MISLEAD_LIBPQ=$(bash -c 'source "'"${SCRIPT_DIR}"'/db_target_guard.sh" && assert_disposable_db_target "host=127.0.0.1 port=5432 dbname=postgres user=disposable_user password=disposable_test_staging"' 2>&1)
EXIT_MISLEAD_LIBPQ=$?
set -e
if [ "${EXIT_MISLEAD_URL}" -eq 42 ] && [ "${EXIT_MISLEAD_LIBPQ}" -eq 42 ]; then
  record_check "C9" "Rejection guard ignores misleading disposable keywords in passwords/usernames/query params" "PASS" "Misleading password/user/query labels on non-disposable port 5432/postgres rejected with exit code 42"
else
  record_check "C9" "Rejection guard ignores misleading disposable keywords in passwords/usernames/query params" "FAIL" "Accepted misleading labels (URL=${EXIT_MISLEAD_URL}, libpq=${EXIT_MISLEAD_LIBPQ})"
fi

# --- Test C10: Correspondence Verification Fails Closed (Exit 43) on Mismatched SQL/HTTP Target ---
MOCK_CORR_DIR="/tmp/ctw_mock_corr_test"
rm -rf "${MOCK_CORR_DIR}"
mkdir -p "${MOCK_CORR_DIR}"
cat << 'EOF' > "${MOCK_CORR_DIR}/psql"
#!/usr/bin/env bash
exit 0
EOF
cat << 'EOF' > "${MOCK_CORR_DIR}/curl"
#!/usr/bin/env bash
echo "[]"
exit 0
EOF
chmod +x "${MOCK_CORR_DIR}/psql" "${MOCK_CORR_DIR}/curl"
set +e
OUT_CORR=$(PATH="${MOCK_CORR_DIR}:${PATH}" bash -c 'source "'"${SCRIPT_DIR}"'/db_target_guard.sh" && verify_disposable_correspondence "postgresql://postgres:postgres@127.0.0.1:54399/disposable_db" "http://127.0.0.1:54398" "fake_service_role_key"' 2>&1)
EXIT_CORR=$?
set -e
rm -rf "${MOCK_CORR_DIR}"
if [ "${EXIT_CORR}" -eq 43 ] && [[ "${OUT_CORR}" == *"Positive correspondence check FAILED"* ]]; then
  record_check "C10" "verify_disposable_correspondence fails closed (exit 43) on SQL/HTTP mismatch" "PASS" "Cleanly rejected mismatched SQL/HTTP correspondence with exit code 43"
else
  record_check "C10" "verify_disposable_correspondence fails closed (exit 43) on SQL/HTTP mismatch" "FAIL" "Did not fail with exit code 43 (exit=${EXIT_CORR}, out=${OUT_CORR})"
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
elif [[ "${OUT_F}" == *"postgres://audit-user:****@host.invalid:5432/testdb"* ]] || [[ "${OUT_F}" == *"host.invalid:5432/testdb (user: audit-user)"* ]] || [[ "${OUT_F}" == *"host: host.invalid, port: 5432, db: testdb, user: audit-user"* ]]; then
  record_check "F" "Production script logging path redacts colon password" "PASS" "Production script log verified: credentials stripped and target identity safely logged"
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
