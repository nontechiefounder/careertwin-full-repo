#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
STAGING_DIR="/tmp/wbctx_canonical_package_staging"
PACKAGE_NAME="WorkByLine_V2_Canonical_Review_Package"
TARGET_DIR="${STAGING_DIR}/${PACKAGE_NAME}"
OUTER_ZIP="${WORKTREE_ROOT}/../${PACKAGE_NAME}.zip"

echo "=== ASSEMBLING CANONICAL WORKBYLINE V2 REVIEW PACKAGE ==="
echo "Worktree root: ${WORKTREE_ROOT}"
echo "Staging dir:   ${TARGET_DIR}"
echo "Outer ZIP:     ${OUTER_ZIP}"

rm -rf "${STAGING_DIR}" "${OUTER_ZIP}"
mkdir -p "${TARGET_DIR}"

# 1. Copy top-level documentation and identity files
cp "${WORKTREE_ROOT}/SOURCE_IDENTITY.md" "${TARGET_DIR}/"
cp "${WORKTREE_ROOT}/FINDINGS_RESOLUTION.md" "${TARGET_DIR}/"
cp "${WORKTREE_ROOT}/CAPABILITY_STATUS.md" "${TARGET_DIR}/"
cp "${WORKTREE_ROOT}/FOUNDER_UAT.md" "${TARGET_DIR}/"
cp "${WORKTREE_ROOT}/INDEPENDENT_CODE_REVIEW.md" "${TARGET_DIR}/"
cp "${WORKTREE_ROOT}/ENGINE_ACCEPTANCE_CONTRACT.md" "${TARGET_DIR}/"
cp "${WORKTREE_ROOT}/00_START_HERE.md" "${TARGET_DIR}/" 2>/dev/null || true
cp "${WORKTREE_ROOT}/README.md" "${TARGET_DIR}/" 2>/dev/null || true
cp "${WORKTREE_ROOT}/AGENTS.md" "${TARGET_DIR}/" 2>/dev/null || true
cp "${WORKTREE_ROOT}/.env.example" "${TARGET_DIR}/" 2>/dev/null || true
cp "${WORKTREE_ROOT}/package.json" "${TARGET_DIR}/" 2>/dev/null || true
cp "${WORKTREE_ROOT}/package-lock.json" "${TARGET_DIR}/" 2>/dev/null || true
cp "${WORKTREE_ROOT}/pyproject.toml" "${TARGET_DIR}/" 2>/dev/null || true

# 2. Copy source directories with exclusions
echo "  Copying service/ ..."
mkdir -p "${TARGET_DIR}/service"
rsync -av --exclude "__pycache__" --exclude "*.pyc" "${WORKTREE_ROOT}/service/" "${TARGET_DIR}/service/"

echo "  Copying tests/ ..."
mkdir -p "${TARGET_DIR}/tests"
rsync -av --exclude "__pycache__" --exclude "*.pyc" "${WORKTREE_ROOT}/tests/" "${TARGET_DIR}/tests/"

echo "  Copying scripts/ ..."
mkdir -p "${TARGET_DIR}/scripts"
rsync -av --exclude "__pycache__" --exclude "*.pyc" "${WORKTREE_ROOT}/scripts/" "${TARGET_DIR}/scripts/"

echo "  Copying migrations/ ..."
mkdir -p "${TARGET_DIR}/migrations"
rsync -av "${WORKTREE_ROOT}/migrations/" "${TARGET_DIR}/migrations/"

echo "  Copying infra/ ..."
mkdir -p "${TARGET_DIR}/infra"
rsync -av "${WORKTREE_ROOT}/infra/" "${TARGET_DIR}/infra/"

echo "  Copying rollback/ ..."
mkdir -p "${TARGET_DIR}/rollback"
rsync -av --exclude "rehearsal_*" "${WORKTREE_ROOT}/rollback/" "${TARGET_DIR}/rollback/"

echo "  Copying packages/ ..."
if [ -d "${WORKTREE_ROOT}/packages" ]; then
  mkdir -p "${TARGET_DIR}/packages"
  rsync -av --exclude "node_modules" "${WORKTREE_ROOT}/packages/" "${TARGET_DIR}/packages/"
fi

echo "  Copying apps/web (excluding build artifacts and dependencies) ..."
mkdir -p "${TARGET_DIR}/apps/web"
rsync -av \
  --exclude "node_modules" \
  --exclude ".next" \
  --exclude ".env.local" \
  --exclude ".env.production" \
  --exclude "tmp_*" \
  "${WORKTREE_ROOT}/apps/web/" "${TARGET_DIR}/apps/web/"

echo "  Copying evidence/ (logs, benchmarks, screenshots, patch) ..."
mkdir -p "${TARGET_DIR}/evidence"
rsync -av "${WORKTREE_ROOT}/evidence/" "${TARGET_DIR}/evidence/"

# 3. Clean any leftover unwanted files (.DS_Store, etc.)
find "${TARGET_DIR}" -name ".DS_Store" -delete
find "${TARGET_DIR}" -name "*.pyc" -delete
find "${TARGET_DIR}" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true

# 4. Generate per-file SHA-256 manifest INSIDE target directory
echo "  Generating per-file SHA-256 manifest..."
(
  cd "${TARGET_DIR}"
  find . -type f ! -name "MANIFEST_SHA256.txt" | sort | while read -r f; do
    shasum -a 256 "$f" | sed 's|^\([0-9a-f]*\)  \./|\1  |'
  done > MANIFEST_SHA256.txt
)
TOTAL_FILES=$(wc -l < "${TARGET_DIR}/MANIFEST_SHA256.txt" | tr -d ' ')
echo "  Manifest generated with ${TOTAL_FILES} files."

# 5. Create outer ZIP archive
echo "  Creating outer ZIP archive: ${OUTER_ZIP} ..."
(
  cd "${STAGING_DIR}"
  zip -r -q -9 "${OUTER_ZIP}" "${PACKAGE_NAME}"
)

# 6. Compute outer ZIP metrics
ZIP_SIZE=$(stat -f%z "${OUTER_ZIP}" 2>/dev/null || stat -c%s "${OUTER_ZIP}")
ZIP_SHA256=$(shasum -a 256 "${OUTER_ZIP}" | awk '{print $1}')

echo ""
echo "=== CANONICAL PACKAGE CREATED SUCCESSFULLY ==="
echo "Package Path:   ${OUTER_ZIP}"
echo "Byte Size:      ${ZIP_SIZE} bytes"
echo "SHA256 Checksum: ${ZIP_SHA256}"
echo "Total Files:    ${TOTAL_FILES}"

# 7. Verification: Clean extraction test in isolated temporary directory
echo ""
echo "--- Verifying Clean Extraction in Isolated Directory ---"
EXTRACT_TEST_DIR="/tmp/wbctx_extract_verification_test"
rm -rf "${EXTRACT_TEST_DIR}"
mkdir -p "${EXTRACT_TEST_DIR}"
unzip -q "${OUTER_ZIP}" -d "${EXTRACT_TEST_DIR}"

if [ -f "${EXTRACT_TEST_DIR}/${PACKAGE_NAME}/SOURCE_IDENTITY.md" ] && \
   [ -f "${EXTRACT_TEST_DIR}/${PACKAGE_NAME}/FINDINGS_RESOLUTION.md" ] && \
   [ -f "${EXTRACT_TEST_DIR}/${PACKAGE_NAME}/CAPABILITY_STATUS.md" ] && \
   [ -f "${EXTRACT_TEST_DIR}/${PACKAGE_NAME}/FOUNDER_UAT.md" ] && \
   [ -f "${EXTRACT_TEST_DIR}/${PACKAGE_NAME}/evidence/CUMULATIVE_V2_ENGINE.patch" ] && \
   [ -f "${EXTRACT_TEST_DIR}/${PACKAGE_NAME}/evidence/BENCHMARK_RESULTS.json" ]; then
  echo "  -> [PASS] Verified critical deliverables present in extracted archive."
else
  echo "  -> [FAIL] Missing critical deliverable files in extracted archive!"
  exit 1
fi

# Verify manifest integrity
echo "  Verifying manifest checksums..."
(
  cd "${EXTRACT_TEST_DIR}/${PACKAGE_NAME}"
  shasum -a 256 -c MANIFEST_SHA256.txt >/dev/null 2>&1
)
echo "  -> [PASS] All ${TOTAL_FILES} file checksums matched manifest with 100% integrity."

rm -rf "${EXTRACT_TEST_DIR}" "${STAGING_DIR}"
echo "=== PACKAGE VERIFICATION COMPLETE: ALL CHECKS PASSED ==="
