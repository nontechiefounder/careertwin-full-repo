/**
 * Candidate sourcing service — provider-neutral entry point.
 *
 * Application code (API routes, components, pages) must import sourcing
 * capabilities from here, never from a provider adapter directly.
 *
 * Provider adapters (implementation detail, server-only):
 *   - lib/datavertex/client.js  — primary provider; orchestrates fallback
 *   - lib/coresignal/client.js  — secondary provider used on primary failure
 *
 * No synthetic or catalog data is served from this layer. If no provider
 * is configured, calls fail closed with SOURCING_PROVIDER_UNCONFIGURED.
 */
export {
  getAccount,
  searchCandidates,
  lookupCandidate,
  getCreditStatus,
  getMaxSessionCredits,
} from '../datavertex/client.js';

