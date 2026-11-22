#!/usr/bin/env bash
# ==============================================================================
# WorkByLine V2 — Unified Staging & Local Rehearsal Deployment Script
# Usage:
#   DATABASE_URL="postgres://..." ./infra/deployment/deploy_staging.sh [--path=existing|fresh] [--target=staging]
#   DISPOSABLE_DB_CONTAINER="wbctx-..." ./infra/deployment/deploy_staging.sh [--path=existing|fresh] [--target=local-rehearsal]
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Source unified target safety guard
source "${SCRIPT_DIR}/db_target_guard.sh"

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
MIGRATION_PATH="existing"

for arg in "$@"; do
  case "${arg}" in
    --target=staging)
      TARGET="staging"
      ;;
    --target=local-rehearsal)
      TARGET="local-rehearsal"
      ;;
    --path=existing)
      MIGRATION_PATH="existing"
      ;;
    --path=fresh)
      MIGRATION_PATH="fresh"
      ;;
    --help|-h)
      echo "Usage: $0 [--target=staging|local-rehearsal] [--path=existing|fresh]"
      exit 0
      ;;
    *)
      echo "Unknown argument: ${arg}" >&2
      echo "Usage: $0 [--target=staging|local-rehearsal] [--path=existing|fresh]" >&2
      exit 1
      ;;
  esac
done

echo "=== WORKBYLINE V2: DEPLOYMENT START ==="
echo "Worktree root: ${WORKTREE_ROOT}"
echo "Current timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "Deployment Target: ${TARGET}"
echo "Migration Path: ${MIGRATION_PATH}"

# 3. Target Verification & Fail-Closed Setup
if [ "${TARGET}" = "staging" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "[SECURITY REJECTION] Staging deployment requires DATABASE_URL to be explicitly set." >&2
    echo "[SECURITY REJECTION] Silent fallback to local Docker is removed and disabled." >&2
    exit 42
  fi
  setup_guarded_sql_exec "${DATABASE_URL}"
  echo "[Target] Verified target: Staging database at $(mask_target_identity "${DATABASE_URL}")"
elif [ "${TARGET}" = "local-rehearsal" ]; then
  if [ -z "${DISPOSABLE_DB_CONTAINER:-}" ]; then
    echo "[SECURITY REJECTION] Local rehearsal requires DISPOSABLE_DB_CONTAINER to be explicitly set." >&2
    echo "[SECURITY REJECTION] Shared container 'supabase_db_careertwin-local-baseline' is protected from destructive test writes." >&2
    exit 42
  fi
  setup_guarded_sql_exec "${DISPOSABLE_DB_CONTAINER}"
  echo "[Target] Verified target: Disposable container $(mask_target_identity "${DISPOSABLE_DB_CONTAINER}")"
else
  echo "[Error] Invalid target: ${TARGET}" >&2
  exit 1
fi

# 4. Prerequisites Verification
echo "[Step 1/5] Verifying database connectivity and prerequisites..."
exec_guarded_sql_cmd "SELECT 1;" >/dev/null
echo "  -> Database connection active and responsive."

echo "  -> Checking PostgreSQL server version..."
PG_VERSION=$(exec_guarded_sql_cmd "SHOW server_version;")
echo "  -> Connected to PostgreSQL server version: ${PG_VERSION}"

# Ensure schema_migrations table exists
exec_guarded_sql_cmd "
  CREATE SCHEMA IF NOT EXISTS supabase_migrations;
  CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version text NOT NULL PRIMARY KEY,
    statements text[],
    name text
  );
"

# 5. Migration Execution & Reconciliation
echo "[Step 2/5] Reconciling schema migrations (Path: ${MIGRATION_PATH})..."
MIG_DIR="${WORKTREE_ROOT}/supabase/migrations"
MIG_FILES=($(find "${MIG_DIR}" -maxdepth 1 -name "*.sql" | sort))

if [ "${#MIG_FILES[@]}" -eq 0 ]; then
  echo "[Error] No migration files found in ${MIG_DIR}"
  exit 1
fi

echo "Found ${#MIG_FILES[@]} migration files."

for mig_path in "${MIG_FILES[@]}"; do
  mig_filename="$(basename "${mig_path}")"
  mig_version="${mig_filename%%_*}"
  mig_name="${mig_filename#*_}"
  mig_name="${mig_name%.sql}"

  IS_APPLIED=$(exec_guarded_sql_cmd "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '${mig_version}';")

  if [ "${IS_APPLIED}" = "1" ]; then
    echo "  -> [Skipped] Migration ${mig_filename} (already recorded in schema_migrations)"
  else
    echo "  -> [Applying Atomically] Migration ${mig_filename}..."
    MIG_SQL="$(cat <<EOF
BEGIN;
$(cat "${mig_path}")
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${mig_version}', '${mig_name}') ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
COMMIT;
EOF
)"
    exec_guarded_sql_cmd "${MIG_SQL}"
    echo "  -> [Recorded Atomically] Migration ${mig_version} marked complete."
  fi
done
echo "[Migrations] All migrations successfully reconciled."

# 6. Storage Bucket Configuration Query & Enforcement (Fail-Closed)
echo "[Step 3/5] Querying and validating storage bucket configuration..."
BUCKET_INFO=$(exec_guarded_sql_cmd "
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

if [ "${B_PUBLIC}" != "false" ]; then
  echo "[Error] Safety violation: Bucket 'candidate_resumes' is marked public."
  exit 1
fi

# 7. Clean Installation & Production Build Verification
echo "[Step 4/5] Executing clean installation and building production bundle..."
WEB_DIR="${WORKTREE_ROOT}/apps/web"

if [ ! -d "${WEB_DIR}" ]; then
  echo "[Error] Web application directory not found at ${WEB_DIR}"
  exit 1
fi

echo "  -> Verifying dependencies..."
(cd "${WEB_DIR}" && npm ci --prefer-offline --no-audit)

echo "  -> Executing production build..."
(cd "${WEB_DIR}" && npm run build)

echo "[Build] Next.js production build succeeded."

# 8. Service Readout & Deployment Readiness Summary
echo "[Step 5/5] Deployment preparation completed successfully."
echo "To start production application service:"
echo "  cd \"${WEB_DIR}\" && PORT=\${PORT:-3000} npm run start"
echo "=== WORKBYLINE V2: DEPLOYMENT READY ==="
exit 0
