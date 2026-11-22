#!/usr/bin/env bash
# ==============================================================================
# WorkByline V2 — Staging Deployment Script
# Target Binding: Explicitly bound to Staging or Local Rehearsal
# Usage:
#   DATABASE_URL="postgres://..." ./infra/deployment/deploy_staging.sh [--path=existing|fresh] [--target=staging]
#   ./infra/deployment/deploy_staging.sh --target=local-rehearsal [--path=existing|fresh]
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
      # Strip comments and empty lines
      line="$(echo "${line}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
      if [[ -z "${line}" || "${line}" == \#* ]]; then
        continue
      fi
      if [[ "${line}" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
        local key="${BASH_REMATCH[1]}"
        local val="${BASH_REMATCH[2]}"
        # Strip surrounding quotes if present
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
MIGRATION_PATH="existing"

for arg in "$@"; do
  case "${arg}" in
    --target=staging)
      TARGET="staging"
      ;;
    --target=local-rehearsal)
      TARGET="local-rehearsal"
      ;;
    --path=fresh)
      MIGRATION_PATH="fresh"
      ;;
    --path=existing)
      MIGRATION_PATH="existing"
      ;;
    *)
      echo "[Error] Unknown argument: ${arg}"
      echo "Usage: $0 [--target=staging|local-rehearsal] [--path=existing|fresh]"
      exit 1
      ;;
  esac
done

echo "=== WORKBYLINE V2: DEPLOYMENT START ==="
echo "Worktree root: ${WORKTREE_ROOT}"
echo "Current timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "Deployment Target: ${TARGET}"
echo "Migration Path: ${MIGRATION_PATH}"

# Redact credentials function
mask_url() {
  local raw_url="$1"
  echo "${raw_url}" | sed -E 's|://([^:]+):(.*)@|://\1:****@|'
}

# 3. Target Verification & Fail-Closed Validation
EXEC_SQL=""
if [ "${TARGET}" = "staging" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "[Error] Staging deployment requires DATABASE_URL to be explicitly set."
    echo "[Error] Silent fallback to local Docker is removed and disabled."
    echo "Usage: DATABASE_URL=\"postgres://...\" $0 --target=staging"
    exit 1
  fi
  if ! command -v psql >/dev/null 2>&1; then
    echo "[Error] 'psql' client is required for staging deployment but not found in PATH."
    exit 1
  fi
  echo "[Target] Verified target: Staging database at $(mask_url "${DATABASE_URL}")"
  EXEC_SQL="psql \"${DATABASE_URL}\" -v ON_ERROR_STOP=1 -q -t -A"
elif [ "${TARGET}" = "local-rehearsal" ]; then
  echo "[Target] Mode: Explicit Local Rehearsal (Docker Target)"
  if ! docker ps --filter name=supabase_db_careertwin-local-baseline --format "{{.Names}}" | grep -q "supabase_db_careertwin-local-baseline"; then
    echo "[Error] Local Supabase container 'supabase_db_careertwin-local-baseline' is not running."
    exit 1
  fi
  EXEC_SQL="docker exec -i supabase_db_careertwin-local-baseline psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -t -A"
else
  echo "[Error] Invalid target: ${TARGET}"
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

# 4. Prerequisites Verification
echo "[Step 1/5] Verifying database connectivity and prerequisites..."
DB_CHECK=$(run_sql_cmd "SELECT 1;" || echo "FAILED")
if [ "${DB_CHECK}" != "1" ]; then
  echo "[Error] Database connection check failed."
  exit 1
fi

# Ensure schema_migrations table exists
run_sql_cmd "
  CREATE SCHEMA IF NOT EXISTS supabase_migrations;
  CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      statements text[],
      name text
  );
"

if [ "${MIGRATION_PATH}" = "existing" ]; then
  # Verify baseline prerequisite tables exist
  ORG_EXISTS=$(run_sql_cmd "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organizations';")
  if [ "${ORG_EXISTS}" != "1" ]; then
    echo "[Error] Existing migration path selected, but baseline table 'organizations' does not exist."
    echo "[Action] Run with '--path=fresh' to initialize all baseline migrations on an uninitialized database."
    exit 1
  fi
fi

# 5. Database Migrations Execution with Migration Tracking
echo "[Step 2/5] Applying migrations under '${MIGRATION_PATH}' path with tracking..."
MIGRATIONS_DIR="${WORKTREE_ROOT}/supabase/migrations"

# Collect all sql files safely even with spaces
MIG_FILES=()
while IFS= read -r -d $'\0' file; do
  MIG_FILES+=("${file}")
done < <(find "${MIGRATIONS_DIR}" -maxdepth 1 -name "*.sql" -print0 | sort -z)

if [ ${#MIG_FILES[@]} -eq 0 ]; then
  echo "[Error] No migration files found in ${MIGRATIONS_DIR}"
  exit 1
fi

for mig_path in "${MIG_FILES[@]}"; do
  mig_filename="$(basename "${mig_path}")"
  mig_version="${mig_filename%%_*}"
  mig_name="${mig_filename#*_}"
  mig_name="${mig_name%.sql}"

  IS_APPLIED=$(run_sql_cmd "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '${mig_version}';")

  if [ "${IS_APPLIED}" = "1" ]; then
    echo "  -> [Skipped] Migration ${mig_filename} (already recorded in schema_migrations)"
  else
    echo "  -> [Applying Atomically] Migration ${mig_filename}..."
    if [ "${TARGET}" = "staging" ]; then
      psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -q <<EOF
BEGIN;
\i '${mig_path}'
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${mig_version}', '${mig_name}') ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
COMMIT;
EOF
    else
      {
        echo "BEGIN;"
        cat "${mig_path}"
        echo ""
        echo "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${mig_version}', '${mig_name}') ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;"
        echo "COMMIT;"
      } | docker exec -i supabase_db_careertwin-local-baseline psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q
    fi
    echo "  -> [Recorded Atomically] Migration ${mig_version} marked complete."
  fi
done
echo "[Migrations] All migrations successfully reconciled."

# 6. Storage Bucket Configuration Query & Enforcement (Fail-Closed)
echo "[Step 3/5] Querying and validating storage bucket configuration..."
BUCKET_INFO=$(run_sql_cmd "
  SELECT public || '|' || file_size_limit || '|' || array_to_string(allowed_mime_types, ',')
  FROM storage.buckets
  WHERE id = 'candidate_resumes';
" || echo "ERROR")

if [ -z "${BUCKET_INFO}" ] || [ "${BUCKET_INFO}" = "ERROR" ]; then
  echo "[Error] Storage bucket 'candidate_resumes' does not exist in storage.buckets."
  exit 1
fi

IFS='|' read -r B_PUBLIC B_SIZE B_MIME <<< "${BUCKET_INFO}"
echo "  -> Bucket 'candidate_resumes': public=${B_PUBLIC}, max_size=${B_SIZE}, allowed_mime=${B_MIME}"

if [ "${B_PUBLIC}" != "f" ] && [ "${B_PUBLIC}" != "false" ]; then
  echo "[Error] Insecure storage: 'candidate_resumes' bucket must be private (public=false). Found: ${B_PUBLIC}"
  exit 1
fi

if [ "${B_SIZE}" != "10485760" ]; then
  echo "[Error] Storage bucket file size limit mismatch. Expected: 10485760, Found: ${B_SIZE}"
  exit 1
fi

if [[ "${B_MIME}" != *"application/pdf"* ]]; then
  echo "[Error] Storage bucket allowed mime types must include 'application/pdf'. Found: ${B_MIME}"
  exit 1
fi

# Query RLS policy on storage.objects
STORAGE_POLICY_COUNT=$(run_sql_cmd "
  SELECT count(*) FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'candidate_documents' AND policyname = 'candidate_documents_tenant_select';
")

if [ "${STORAGE_POLICY_COUNT}" -lt 1 ]; then
  echo "[Error] Table policy 'candidate_documents_tenant_select' missing on public.candidate_documents."
  exit 1
fi
echo "[Storage] Private storage bucket and tenant RLS policy verified."

# 7. Application Clean Install & Production Build
echo "[Step 4/5] Executing clean installation and building production bundle..."
cd "${WORKTREE_ROOT}/apps/web"
npm ci --prefer-offline
npm run build
echo "[Build] Next.js production build succeeded."

# 8. Ready Sign-off
echo "[Step 5/5] Deployment preparation completed successfully."
echo "To start production application service:"
echo "  cd \"${WORKTREE_ROOT}/apps/web\" && PORT=\${PORT:-3000} npm run start"
echo "=== WORKBYLINE V2: DEPLOYMENT READY ==="
