/**
 * evaluateProofContractReadiness
 *
 * Pure function — safe to import in both client and server components.
 * Canonical source of proof-contract readiness for a hiring run.
 *
 * MUST remain in sync with the copy in:
 *   apps/web/app/api/employer/hiring-runs/route.js
 * Any change here must be mirrored there and vice-versa.
 */
export function evaluateProofContractReadiness(runData) {
  const hasTitle = Boolean(
    runData?.role_title &&
    typeof runData.role_title === 'string' &&
    runData.role_title.trim().length > 0
  );
  const hasSummaryOrDesc = Boolean(
    (runData?.role_summary &&
      typeof runData.role_summary === 'string' &&
      runData.role_summary.trim().length >= 10) ||
    (runData?.job_description &&
      typeof runData.job_description === 'string' &&
      runData.job_description.trim().length >= 10)
  );
  const hasMustHaves = Boolean(
    (Array.isArray(runData?.must_haves) && runData.must_haves.length > 0) ||
    (Array.isArray(runData?.explicit_requirements) && runData.explicit_requirements.length > 0)
  );

  return {
    isComplete: hasTitle && hasSummaryOrDesc && hasMustHaves,
    missingFields: [
      !hasTitle && 'role_title',
      !hasSummaryOrDesc && 'job_description',
      !hasMustHaves && 'must_haves',
    ].filter(Boolean),
  };
}
