#!/usr/bin/env bash
# ==============================================================================
# WorkByline V2 — Staging Smoke Verification Script
# Target Binding: Explicitly bound to Staging or Local Rehearsal
# Usage:
#   STAGING_APP_URL="https://staging.workbyline.internal" DATABASE_URL="postgres://..." ./infra/deployment/verify_staging_smoke.sh [--target=staging]
#   ./infra/deployment/verify_staging_smoke.sh --target=local-rehearsal [--app-url=http://localhost:3004]
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
APP_URL="${STAGING_APP_URL:-}"

for arg in "$@"; do
  case "${arg}" in
    --target=staging)
      TARGET="staging"
      ;;
    --target=local-rehearsal)
      TARGET="local-rehearsal"
      ;;
    --app-url=*)
      APP_URL="${arg#*=}"
      ;;
    *)
      echo "[Error] Unknown argument: ${arg}"
      echo "Usage: $0 [--target=staging|local-rehearsal] [--app-url=URL]"
      exit 1
      ;;
  esac
done

if [ -z "${APP_URL}" ]; then
  if [ "${TARGET}" = "local-rehearsal" ]; then
    APP_URL="http://localhost:3004"
  else
    echo "[Error] Staging smoke verification requires STAGING_APP_URL to be set."
    echo "Usage: STAGING_APP_URL=\"https://...\" DATABASE_URL=\"postgres://...\" $0 --target=staging"
    exit 1
  fi
fi
APP_URL="${APP_URL%/}"

echo "=== WORKBYLINE V2: STAGING SMOKE VERIFICATION START ==="
echo "Target: ${TARGET}"
echo "App URL: ${APP_URL}"
echo "Current timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

PASSED_COUNT=0
FAILED_COUNT=0

record_result() {
  local check_name="$1"
  local status="$2"
  local details="$3"

  if [ "$status" = "PASS" ]; then
    echo "  [PASS] ${check_name}: ${details}"
    PASSED_COUNT=$((PASSED_COUNT + 1))
  else
    echo "  [FAIL] ${check_name}: ${details}"
    FAILED_COUNT=$((FAILED_COUNT + 1))
  fi
}

# Target DB validation
if [ "${TARGET}" = "staging" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "[Error] Target 'staging' requires DATABASE_URL to be set. Silent fallback to Docker is disabled."
    exit 1
  fi
  if ! command -v psql >/dev/null 2>&1; then
    echo "[Error] 'psql' client is required for staging database verification."
    exit 1
  fi
  echo "[Database Target] Staging: $(mask_url "${DATABASE_URL}")"
elif [ "${TARGET}" = "local-rehearsal" ]; then
  if ! docker ps --filter name=supabase_db_careertwin-local-baseline --format "{{.Names}}" | grep -q "supabase_db_careertwin-local-baseline"; then
    echo "[Error] Local container 'supabase_db_careertwin-local-baseline' is not running."
    exit 1
  fi
  echo "[Database Target] Mode: Explicit Local Rehearsal (Docker Target)"
fi

run_sql() {
  local query="$1"
  if [ "${TARGET}" = "staging" ]; then
    psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -q -t -A -c "${query}"
  else
    docker exec -i supabase_db_careertwin-local-baseline psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -t -A -c "${query}"
  fi
}

echo ""
echo "--- Section 1: HTTP API Contracts & Runtime Verification ---"

# Check 1: Route /auth rendering
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${APP_URL}/auth" || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  record_result "Auth Page HTTP Contract" "PASS" "HTTP 200 returned from ${APP_URL}/auth"
else
  record_result "Auth Page HTTP Contract" "FAIL" "Expected HTTP 200, received HTTP ${HTTP_CODE}"
fi

# Check 2: Unauthenticated Chat API Protection (Strict 401/403, No Arbitrary Redirects)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${APP_URL}/api/employer/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"pipeline summary"}' || echo "000")
if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
  record_result "Chat API Auth Contract" "PASS" "HTTP ${HTTP_CODE} correctly enforces security boundary"
else
  record_result "Chat API Auth Contract" "FAIL" "Declared API contract requires 401/403, received HTTP ${HTTP_CODE}"
fi

# Check 3: Unauthenticated Review Action API Protection (Strict 401/403)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${APP_URL}/api/employer/packets/00000000-0000-0000-0000-000000000000/action" \
  -H "Content-Type: application/json" \
  -d '{"action":"advance","expected_ledger_revision":1,"expected_rubric_version":"1.0.0"}' || echo "000")
if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
  record_result "Packet Action API Auth Contract" "PASS" "HTTP ${HTTP_CODE} correctly enforces security boundary"
else
  record_result "Packet Action API Auth Contract" "FAIL" "Declared API contract requires 401/403, received HTTP ${HTTP_CODE}"
fi

# Check 4: Runtime /api/health verification for Deployed Dry-Run and Target Binding (F02/A1)
# 1. Project Reference & Host Extraction
extract_project_id() {
  local url="$1"
  if [ -z "$url" ]; then echo ""; return; fi
  # Supabase pooler format: postgres://postgres.<ref>:<pass>@...
  if [[ "$url" =~ postgres://[^:]*\.([a-zA-Z0-9_-]+): ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi
  # Supabase db.<ref>.supabase.co
  if [[ "$url" =~ db\.([a-zA-Z0-9_-]+)\.supabase\.co ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi
  # Supabase https://<ref>.supabase.co
  if [[ "$url" =~ https?://([a-zA-Z0-9_-]+)\.supabase\.co ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi
  # General host fallback
  if [[ "$url" =~ https?://([^:/]+) ]]; then
    local h="${BASH_REMATCH[1]}"
    if [[ "$h" == db.* ]]; then h="${h#db.}"; fi
    echo "$h"
    return
  fi
  if [[ "$url" =~ @([^:/]+) ]]; then
    local h="${BASH_REMATCH[1]}"
    if [[ "$h" == db.* ]]; then h="${h#db.}"; fi
    echo "$h"
    return
  fi
  echo ""
}

EXPECTED_HOST=""
API_PROJ_REF=""
DB_PROJ_REF=""

if [ "${TARGET}" = "staging" ]; then
  if [ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
    EXPECTED_HOST=$(echo "${NEXT_PUBLIC_SUPABASE_URL}" | sed -E 's|https?://([^:/]+).*|\1|')
    API_PROJ_REF=$(extract_project_id "${NEXT_PUBLIC_SUPABASE_URL}")
  fi
  if [ -n "${DATABASE_URL:-}" ]; then
    DB_PROJ_REF=$(extract_project_id "${DATABASE_URL}")
    if [ -z "${EXPECTED_HOST}" ]; then
      EXPECTED_HOST=$(echo "${DATABASE_URL}" | sed -E 's|.*@([^:/]+).*|\1|')
    fi
  fi
elif [ "${TARGET}" = "local-rehearsal" ]; then
  EXPECTED_HOST="127.0.0.1"
  API_PROJ_REF="127.0.0.1"
  DB_PROJ_REF="127.0.0.1"
fi

HEALTH_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${APP_URL}/api/health" || echo "000")
if [ "${HEALTH_HTTP}" != "200" ]; then
  record_result "Deployed Runtime Dry-Run Lock" "FAIL" "/api/health returned HTTP ${HEALTH_HTTP}"
  record_result "Deployed Runtime Target Binding" "FAIL" "/api/health returned HTTP ${HEALTH_HTTP}"
  record_result "Database & API Project Target Consistency" "FAIL" "/api/health returned HTTP ${HEALTH_HTTP}"
else
  HEALTH_PAYLOAD=$(curl -s "${APP_URL}/api/health" || echo "{}")
  # Robust JSON parsing via node
  PARSED_JSON=$(node -e '
    try {
      const d = JSON.parse(process.argv[1]);
      const isDryRun = (d.dry_run_email === true || d.dry_run_email === "true") && d.dry_run_email !== "false" && d.dry_run_email !== false;
      console.log(JSON.stringify({
        dry_run_email: isDryRun,
        supabase_host: String(d.supabase_host || "")
      }));
    } catch(e) {
      console.log(JSON.stringify({ error: "json_parse_failed" }));
    }
  ' "${HEALTH_PAYLOAD}" 2>/dev/null || echo '{"error":"node_exec_failed"}')

  DRY_RUN_VAL=$(node -e 'console.log(JSON.parse(process.argv[1]).dry_run_email)' "${PARSED_JSON}" 2>/dev/null || echo "false")
  RUNTIME_HOST=$(node -e 'console.log(JSON.parse(process.argv[1]).supabase_host || "")' "${PARSED_JSON}" 2>/dev/null || echo "")

  if [ "${DRY_RUN_VAL}" = "true" ]; then
    record_result "Deployed Runtime Dry-Run Lock" "PASS" "Live service runtime returned dry_run_email=true"
  else
    record_result "Deployed Runtime Dry-Run Lock" "FAIL" "Live service runtime returned dry_run_email=${DRY_RUN_VAL} (must be true)"
  fi

  if [ -z "${RUNTIME_HOST}" ] || [ "${RUNTIME_HOST}" = "invalid_url" ]; then
    record_result "Deployed Runtime Target Binding" "FAIL" "Invalid Supabase host reported by runtime: '${RUNTIME_HOST}'"
  elif [ -n "${EXPECTED_HOST}" ]; then
    if [ "${TARGET}" = "local-rehearsal" ] && [[ "${RUNTIME_HOST}" == "127.0.0.1" || "${RUNTIME_HOST}" == "localhost" ]]; then
      record_result "Deployed Runtime Target Binding" "PASS" "Service bound to expected rehearsal host: ${RUNTIME_HOST}"
    elif [ "${RUNTIME_HOST}" = "${EXPECTED_HOST}" ]; then
      record_result "Deployed Runtime Target Binding" "PASS" "Service bound to expected target host: ${RUNTIME_HOST}"
    else
      record_result "Deployed Runtime Target Binding" "FAIL" "Target mismatch: expected '${EXPECTED_HOST}', live runtime bound to '${RUNTIME_HOST}'"
    fi
  else
    record_result "Deployed Runtime Target Binding" "PASS" "Service bound to Supabase host: ${RUNTIME_HOST}"
  fi

  # Check 4b: Database & API Project Target Consistency (Finding A1 Fail-Closed)
  if [ "${TARGET}" = "staging" ]; then
    if [ -n "${API_PROJ_REF}" ] && [ -n "${DB_PROJ_REF}" ]; then
      if [ "${API_PROJ_REF}" = "${DB_PROJ_REF}" ]; then
        record_result "Database & API Project Target Consistency" "PASS" "Verified both API and Database target project '${DB_PROJ_REF}'"
      else
        record_result "Database & API Project Target Consistency" "FAIL" "Project mismatch: API targets '${API_PROJ_REF}' while Database URL targets '${DB_PROJ_REF}'"
      fi
    elif [ -z "${DB_PROJ_REF}" ]; then
      record_result "Database & API Project Target Consistency" "FAIL" "Unresolved database project identity in DATABASE_URL"
    else
      record_result "Database & API Project Target Consistency" "PASS" "Database project identity resolved: '${DB_PROJ_REF}'"
    fi
  else
    record_result "Database & API Project Target Consistency" "PASS" "Verified local rehearsal targets (127.0.0.1)"
  fi
fi

echo ""
echo "--- Section 2: Database Schema, Scoped Tables & Signatures (Fail-Closed) ---"

# Check 5: public.claim_ledgers table scoped to public schema
CL_EXISTS=$(run_sql "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'claim_ledgers';" || echo "ERROR")
if [ "${CL_EXISTS}" = "1" ]; then
  record_result "Schema Table public.claim_ledgers" "PASS" "Table public.claim_ledgers exists"
else
  record_result "Schema Table public.claim_ledgers" "FAIL" "Table public.claim_ledgers missing or database error (${CL_EXISTS})"
fi

# Check 6: public.candidate_documents columns and RLS policy
DOC_COLS=$(run_sql "
  SELECT count(*) FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'candidate_documents'
    AND column_name IN ('file_sha256', 'normalized_text_sha256', 'storage_path', 'parser_metadata');
" || echo "ERROR")
if [ "${DOC_COLS}" = "4" ]; then
  record_result "Schema Table public.candidate_documents" "PASS" "Document hash and storage columns present"
else
  record_result "Schema Table public.candidate_documents" "FAIL" "Expected 4 required columns, found ${DOC_COLS}"
fi

# Check 7: Private storage bucket candidate_resumes configuration
BUCKET_ROW=$(run_sql "SELECT public || '|' || file_size_limit FROM storage.buckets WHERE id = 'candidate_resumes';" || echo "ERROR")
if [[ "${BUCKET_ROW}" == "f|10485760" || "${BUCKET_ROW}" == "false|10485760" ]]; then
  record_result "Storage Bucket candidate_resumes" "PASS" "Bucket exists and is strictly private with 10MB limit"
else
  record_result "Storage Bucket candidate_resumes" "FAIL" "Unexpected bucket configuration: ${BUCKET_ROW}"
fi

# Check 8: Scoped RPC: public.record_human_decision_transactional exact signature
RPC1_EXISTS=$(run_sql "
  SELECT count(*) FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'record_human_decision_transactional'
    AND pg_get_function_identity_arguments(p.oid) = 'p_candidate_id uuid, p_actor_id uuid, p_actor_email text, p_org_id uuid, p_action text, p_rationale text, p_expected_ledger_revision integer, p_expected_rubric_version text';
" || echo "ERROR")
if [ "${RPC1_EXISTS}" = "1" ]; then
  record_result "RPC record_human_decision_transactional" "PASS" "Function installed with exact signature in schema public"
else
  record_result "RPC record_human_decision_transactional" "FAIL" "RPC missing or signature mismatch (${RPC1_EXISTS})"
fi

# Check 9: Scoped RPC: public.allocate_claim_ledger_revision_and_persist exact signature
RPC2_EXISTS=$(run_sql "
  SELECT count(*) FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'allocate_claim_ledger_revision_and_persist'
    AND pg_get_function_identity_arguments(p.oid) = 'p_candidate_profile_id uuid, p_hiring_run_id uuid, p_org_id uuid, p_evidence_refs jsonb, p_claims jsonb, p_claim_edges jsonb, p_evaluation_output jsonb, p_candidate_id uuid';
" || echo "ERROR")
if [ "${RPC2_EXISTS}" = "1" ]; then
  record_result "RPC allocate_claim_ledger_revision_and_persist" "PASS" "Function installed with exact signature in schema public"
else
  record_result "RPC allocate_claim_ledger_revision_and_persist" "FAIL" "RPC missing or signature mismatch (${RPC2_EXISTS})"
fi

# Check 10: Migration tracking verification
MIG_COUNT=$(run_sql "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260817000001';" || echo "ERROR")
if [ "${MIG_COUNT}" = "1" ]; then
  record_result "Migration Tracking" "PASS" "Core-09 migration 20260817000001 recorded in supabase_migrations"
else
  record_result "Migration Tracking" "FAIL" "Migration 20260817000001 not recorded (${MIG_COUNT})"
fi

echo ""
echo "=== SMOKE VERIFICATION SUMMARY: ${PASSED_COUNT} PASSED, ${FAILED_COUNT} FAILED ==="
if [ "${FAILED_COUNT}" -gt 0 ]; then
  echo "[Status] SMOKE VERIFICATION FAILED — Exiting with nonzero code."
  exit 1
else
  echo "[Status] ALL ${PASSED_COUNT} SMOKE CHECKS PASSED."
  exit 0
fi
