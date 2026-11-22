/**
 * Canonical Fit Score & Proof Metric Helpers
 *
 * All persisted and returned fit_score values in the application operate on a
 * single canonical [0, 1] unit interval (or null when unassessed).
 * Percent displays (0-100%) are purely presentation formatting derived from [0, 1].
 */

export function isValidCanonicalScore(score) {
  return typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 1;
}

export function parseCanonicalScore(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return isValidCanonicalScore(parsed) ? parsed : null;
  }
  return isValidCanonicalScore(value) ? value : null;
}

export function assertCanonicalScore(value, label = 'fit_score') {
  if (value === null || value === undefined) return null;
  if (!isValidCanonicalScore(value)) {
    throw new RangeError(`${label} must be a finite number in canonical range [0, 1] or null (received: ${value})`);
  }
  return value;
}

export function formatCanonicalScoreDecimal(score, digits = 2) {
  const canonical = parseCanonicalScore(score);
  return canonical == null ? '—' : canonical.toFixed(digits);
}

export function formatCanonicalScorePercent(score) {
  const canonical = parseCanonicalScore(score);
  return canonical == null ? '—' : `${Math.round(canonical * 100)}%`;
}

export function hasAuthoritativeEvaluation(packet) {
  return Boolean(
    packet &&
    typeof packet === 'object' &&
    !Array.isArray(packet) &&
    Object.keys(packet).length > 0 &&
    (
      Object.prototype.hasOwnProperty.call(packet, 'fit_score') ||
      packet.evaluation_metrics != null ||
      packet.spec_version != null ||
      packet.calculation_digest != null ||
      packet.evaluated_at != null ||
      packet.evaluation_timestamp != null ||
      packet.what_is_verified != null
    )
  );
}

/**
 * Resolve canonical fit_score without letting a stale candidateRow.fit_score
 * override an intentional packet-null evaluation result.
 */
export function resolveAuthoritativeFitScore(packet, candidateRow = null) {
  if (hasAuthoritativeEvaluation(packet)) {
    return parseCanonicalScore(packet.fit_score);
  }
  return parseCanonicalScore(candidateRow?.fit_score);
}

/**
 * Explicit boundary conversion for legacy percent-100 inputs only.
 * Never guesses scale from value magnitude (> 1 vs <= 1).
 */
export function normalizeLegacyFitScoreAtBoundary(value, sourceScale) {
  if (value === null || value === undefined) return null;
  if (sourceScale === 'percent_100') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
      throw new RangeError(`Legacy percent_100 fit_score must be in [0, 100] (received: ${value})`);
    }
    return Number((value / 100).toFixed(4));
  }
  if (sourceScale === 'canonical_0_1') {
    return assertCanonicalScore(value, 'fit_score');
  }
  throw new Error(`Explicit sourceScale ('canonical_0_1' or 'percent_100') is required for legacy fit_score conversion`);
}
