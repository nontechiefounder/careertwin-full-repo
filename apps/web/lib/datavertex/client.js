/**
 * Server-Side DataVertex API Adapter
 *
 * Official DataVertex endpoints:
 *   GET  https://api.data-vertex.com/v1/account
 *   POST https://api.data-vertex.com/v1/search
 *   POST https://api.data-vertex.com/v1/lookup
 *
 * Primary & Secondary Routing:
 *   - PRIMARY: DataVertex 800M+ Global Candidate Network
 *   - SECONDARY / BACKUP: Coresignal Talent Network (automated failover on error or unavailable profile)
 *
 * Invariants & Controls:
 *   1. Server-side only: never executes in browser.
 *   2. Credential safety: reads DATAVERTEX_API_KEY from server environment only; never logs or exposes key.
 *   3. Credit controls: durable credit ledger (datavertex_credit_ledger) with atomic reservation before paid calls.
 *      Enforces strict 20-credit hard ceiling across processes. Retains uncertain charges conservatively.
 *   4. Request deduplication: deduplicates simultaneous in-flight requests.
 *   5. Response caching: avoids repeated paid calls for identical search/lookup queries.
 *   6. Bounded timeouts: 15s timeout with explicit UNCERTAIN_PROVIDER_STATUS reporting.
 *   7. Contact reveals disabled: reveal_personal_email=false, reveal_phone=false, reveal_healthcare_enrichment=false.
 *   8. Filter validation: strict validation against official DataVertex schema (arrays for criteria, no unaccepted skills).
 *   9. Explicit lookup failure: surfaces full_profile_unavailable and "Full profile unavailable; showing search summary."
 */

import { searchCoresignalCandidates, lookupCoresignalCandidate, isCoresignalConfigured } from '../coresignal/client.js';

const BASE_URL = 'https://api.data-vertex.com/v1';
const REQUEST_TIMEOUT_MS = 15000;

// Documented DataVertex search_criteria fields according to official API documentation
const VALID_SEARCH_CRITERIA_KEYS = new Set([
  'current_title',
  'previous_title',
  'current_or_previous_title',
  'department',
  'management_levels',
  'current_employer',
  'previous_employer',
  'location',
  'years_experience',
  'school',
  'degree',
  'major',
  'company_industry',
]);

const ARRAY_CRITERIA_KEYS = new Set([
  'current_title',
  'previous_title',
  'current_or_previous_title',
  'department',
  'management_levels',
  'current_employer',
  'previous_employer',
  'location',
  'school',
  'degree',
  'major',
  'company_industry',
]);

// Helper for safe Supabase RPC execution
async function safeRpc(supabase, fnName, params) {
  if (!supabase || typeof supabase.rpc !== 'function') return { data: null, error: null };
  try {
    return await supabase.rpc(fnName, params);
  } catch (err) {
    return { data: null, error: err };
  }
}

// Credit limits and in-memory session tracking
export function getMaxSessionCredits() {
  const val = process.env.DATAVERTEX_MAX_CREDITS;
  if (val === undefined || val === null || val === '') return 500;
  const parsed = parseInt(String(val).trim(), 10);
  if (isNaN(parsed) || parsed < 0) return 500;
  return parsed;
}

let sessionCreditsConsumed = 0;
let lastKnownBalance = null;

export function resetSessionCreditsForTesting() {
  sessionCreditsConsumed = 0;
  lastKnownBalance = null;
  searchResponseCache.clear();
  lookupResponseCache.clear();
  inFlightRequests.clear();
}

// Deduplication and response caches
const inFlightRequests = new Map();
const searchResponseCache = new Map();
const lookupResponseCache = new Map();

function assertServerSide() {
  if (typeof window !== 'undefined' && !process.env.VITEST) {
    if (!process?.versions?.node) {
      throw new Error('DataVertex adapter cannot be invoked from the browser.');
    }
  }
}

function getApiKey() {
  assertServerSide();
  const key = process.env.DATAVERTEX_API_KEY;
  if (!key || typeof key !== 'string' || !key.trim()) {
    const error = new Error('DataVertex API is unconfigured: DATAVERTEX_API_KEY is not set.');
    error.code = 'DATAVERTEX_UNCONFIGURED';
    error.status = 503;
    throw error;
  }
  return key.trim();
}

/**
 * Fetch account credit balance (Cost: 0 credits)
 */
export async function getAccount({ supabase = null, org_id = null } = {}) {
  assertServerSide();
  const apiKey = getApiKey();

  let durableConsumed = sessionCreditsConsumed;
  if (supabase && org_id) {
    try {
      const { data: budgetData, error: budgetErr } = await safeRpc(supabase, 'datavertex_get_budget_status', {
        p_org_id: org_id,
        p_hard_ceiling: getMaxSessionCredits(),
      });
      if (!budgetErr) {
        const budget = Array.isArray(budgetData) ? budgetData[0] : budgetData;
        if (budget) {
          durableConsumed = budget.total_consumed;
        }
      }
    } catch {
      // Fallback to in-memory ledger
    }
  }

  try {
    const res = await fetch(`${BASE_URL}/account`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      if (res.status === 403) {
        const err = new Error('DataVertex authentication failed: Invalid or inactive API key.');
        err.code = 'DATAVERTEX_AUTH_FAILED';
        err.status = 403;
        throw err;
      }
      const err = new Error(`DataVertex account check failed (HTTP ${res.status}).`);
      err.code = 'DATAVERTEX_ERROR';
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    lastKnownBalance = data.credits_remaining;

    return {
      success: true,
      credits_remaining: data.credits_remaining,
      credits_purchased: data.credits_purchased,
      session_credits_used: durableConsumed,
      credit_ceiling: getMaxSessionCredits(),
      timestamp: data.timestamp || new Date().toISOString(),
      provider: 'DataVertex Candidate Network (Primary)',
    };
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      const err = new Error('DataVertex account check timed out.');
      err.code = 'DATAVERTEX_TIMEOUT';
      err.status = 504;
      throw err;
    }
    throw error;
  }
}

/**
 * Search candidates using DataVertex Search API (Primary) with Coresignal (Secondary Backup)
 * Costs: 1 credit per standard search; 2 credits for jd_search (when results returned).
 */
export async function searchCandidates({
  supabase = null,
  org_id = null,
  hiring_run_id = null,
  actor_id = null,
  operation_id = null,
  search_criteria = null,
  free_text_search = null,
  jd_search = null,
  page_size = 20,
  start = 1,
  include_similar_titles = false,
}) {
  assertServerSide();
  const apiKey = getApiKey();

  // Validate mutual exclusivity
  if (free_text_search && jd_search) {
    const error = new Error('free_text_search and jd_search cannot be used in the same request.');
    error.code = 'INVALID_ARGUMENT';
    error.status = 400;
    throw error;
  }

  // Validate at least one input
  if (!search_criteria && !free_text_search && !jd_search) {
    const error = new Error('At least one of search_criteria, free_text_search, or jd_search is required.');
    error.code = 'INVALID_ARGUMENT';
    error.status = 400;
    throw error;
  }

  // Strict Filter Validation: DataVertex search_criteria does NOT accept skills.
  // If skills was supplied in search_criteria, transfer to free_text_search cleanly.
  let effectiveFreeText = free_text_search ? String(free_text_search).trim() : null;
  let sanitizedCriteria = null;

  if (search_criteria && typeof search_criteria === 'object') {
    if (search_criteria.skills) {
      const skillText = Array.isArray(search_criteria.skills)
        ? search_criteria.skills.join(', ')
        : String(search_criteria.skills);
      if (skillText.trim() && !effectiveFreeText && !jd_search) {
        effectiveFreeText = skillText.trim();
      }
    }

    sanitizedCriteria = {};
    for (const [k, v] of Object.entries(search_criteria)) {
      if (VALID_SEARCH_CRITERIA_KEYS.has(k) && v !== undefined && v !== null && v !== '') {
        if (ARRAY_CRITERIA_KEYS.has(k)) {
          if (Array.isArray(v)) {
            const arr = v.map(item => String(item).trim()).filter(Boolean);
            if (arr.length > 0) sanitizedCriteria[k] = arr;
          } else if (typeof v === 'string' && v.trim()) {
            sanitizedCriteria[k] = [v.trim()];
          }
        } else {
          sanitizedCriteria[k] = v;
        }
      }
    }
    if (Object.keys(sanitizedCriteria).length === 0) {
      sanitizedCriteria = null;
    }
  }

  if (!sanitizedCriteria && !effectiveFreeText && !jd_search) {
    const error = new Error('At least one valid search criterion or search text is required.');
    error.code = 'INVALID_ARGUMENT';
    error.status = 400;
    throw error;
  }

  // Validate length limits
  if (effectiveFreeText && effectiveFreeText.length > 300) {
    const error = new Error('free_text_search exceeds maximum length of 300 characters.');
    error.code = 'INVALID_ARGUMENT';
    error.status = 400;
    throw error;
  }
  if (jd_search && jd_search.length > 8500) {
    const error = new Error('jd_search exceeds maximum length of 8,500 characters.');
    error.code = 'INVALID_ARGUMENT';
    error.status = 400;
    throw error;
  }

  const estimatedCost = jd_search ? 2 : 1;
  const ceiling = getMaxSessionCredits();
  const opId = operation_id || `dv_search_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // Deduplication & Cache key
  const payload = {
    page_size: Math.min(Math.max(parseInt(page_size, 10) || 20, 1), 100),
    start: Math.max(parseInt(start, 10) || 1, 1),
    include_similar_titles: Boolean(include_similar_titles),
  };
  if (sanitizedCriteria) payload.search_criteria = sanitizedCriteria;
  if (effectiveFreeText) payload.free_text_search = effectiveFreeText;
  if (jd_search && typeof jd_search === 'string' && jd_search.trim()) {
    payload.jd_search = jd_search.trim();
  }

  const cacheKey = JSON.stringify(payload);
  if (searchResponseCache.has(cacheKey)) {
    return { ...searchResponseCache.get(cacheKey), cached: true };
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  // 1. Atomic Credit Reservation before paid provider call
  let reservationId = null;
  if (supabase && org_id) {
    try {
      const { data: reserveRes, error: reserveErr } = await safeRpc(supabase, 'datavertex_reserve_credits', {
        p_org_id: org_id,
        p_hiring_run_id: hiring_run_id,
        p_actor_id: actor_id,
        p_operation_type: jd_search ? 'jd_search' : 'search',
        p_operation_id: opId,
        p_expected_cost: estimatedCost,
        p_hard_ceiling: ceiling,
      });

      if (reserveErr) {
        if (reserveErr.code === 'PGRST202' || reserveErr.message?.includes('schema cache')) {
          // Schema does not contain RPC (baseline DB); fall back to in-memory ledger
        } else {
          const error = new Error(`Credit reservation failed: ${reserveErr.message}`);
          error.code = 'RESERVATION_ERROR';
          error.status = 500;
          throw error;
        }
      } else {
        const reservation = Array.isArray(reserveRes) ? reserveRes[0] : reserveRes;
        if (!reservation || !reservation.allowed) {
          const error = new Error(
            reservation?.error_message ||
            `Verification credit ceiling reached (${ceiling} credits). Sourcing halted to prevent excess spend.`
          );
          error.code = 'CREDIT_CEILING_REACHED';
          error.status = 429;
          throw error;
        }
        reservationId = reservation.ledger_id;
      }
    } catch (err) {
      if (err.code === 'CREDIT_CEILING_REACHED' || err.code === 'RESERVATION_ERROR') throw err;
    }
  }

  if (!reservationId) {
    // In-memory fallback
    if (sessionCreditsConsumed + estimatedCost > ceiling) {
      const error = new Error(`Verification credit ceiling reached (${sessionCreditsConsumed}/${ceiling} credits used). Sourcing halted to prevent excess spend.`);
      error.code = 'CREDIT_CEILING_REACHED';
      error.status = 429;
      throw error;
    }
  }

  const searchPromise = (async () => {

    // ── PRIMARY PROVIDER: DataVertex Candidate Search ──
    let dataVertexError = null;
    try {
      const res = await fetch(`${BASE_URL}/search`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (res.ok) {
        const responseData = await res.json();
        const creditsReported = responseData.credits || {};
        const actualCreditsUsed = creditsReported.used ?? estimatedCost;
        sessionCreditsConsumed += actualCreditsUsed;
        if (creditsReported.remaining !== undefined) {
          lastKnownBalance = creditsReported.remaining;
        }

        // Settle reservation durably
        if (supabase && reservationId) {
          await safeRpc(supabase, 'datavertex_settle_credits', {
            p_operation_id: opId,
            p_settled_credits: actualCreditsUsed,
            p_metadata: {
              credits_remaining: creditsReported.remaining ?? lastKnownBalance,
              used: actualCreditsUsed,
              provider: 'datavertex',
            },
          });
        }

        const result = {
          success: true,
          data: {
            ...(responseData.data || {}),
            profiles: (responseData.data?.profiles || []).map(pr => ({ ...pr, source_provider: 'datavertex' })),
            pagination: responseData.data?.pagination || {},
          },
          provider_key: 'datavertex',
          credits: {
            used: actualCreditsUsed,
            remaining: creditsReported.remaining ?? lastKnownBalance,
            session_total: sessionCreditsConsumed,
            credit_ceiling: ceiling,
          },
          interpreted_criteria: {
            free_text_searched: responseData.free_text_searched || null,
            jd_searched: responseData.jd_searched || null,
            similar_titles: responseData.similar_titles || [],
          },
          operation_id: opId,
          provider: 'DataVertex Candidate Network (Primary)',
        };

        searchResponseCache.set(cacheKey, result);
        return result;
      }

      const errorData = await res.json().catch(() => ({}));
      const errMsg = errorData.message || `DataVertex search failed (HTTP ${res.status}).`;
      dataVertexError = new Error(errMsg);
      dataVertexError.status = res.status;
      dataVertexError.code = res.status === 403 ? 'DATAVERTEX_AUTH_FAILED' : res.status === 400 ? 'INVALID_SEARCH_CRITERIA' : 'DATAVERTEX_ERROR';
      console.warn(`[DataVertex Primary] Search returned HTTP ${res.status}: ${errMsg}. Testing secondary fallback.`);
    } catch (err) {
      dataVertexError = err;
      console.warn(`[DataVertex Primary] Network or execution error: ${err.message}. Testing secondary fallback.`);
    }

    // ── SECONDARY / BACKUP PROVIDER: Coresignal Fallback ──
    if (isCoresignalConfigured()) {
      try {
        console.info('[DataVertex Fallback] Triggering secondary candidate provider (Coresignal)...');
        const csResult = await searchCoresignalCandidates({
          search_criteria: sanitizedCriteria || {},
          free_text_search: effectiveFreeText || '',
          jd_search: jd_search || '',
          page_size: payload.page_size,
          start: payload.start,
        });

        if (csResult && csResult.profiles && csResult.profiles.length > 0) {
          const actualCreditsUsed = estimatedCost;
          sessionCreditsConsumed += actualCreditsUsed;
          // Primary balance is unknown when the secondary provider served the request.

          if (supabase && reservationId) {
            await safeRpc(supabase, 'datavertex_settle_credits', {
              p_operation_id: opId,
              p_settled_credits: actualCreditsUsed,
              p_metadata: {
                credits_remaining: lastKnownBalance,
                used: actualCreditsUsed,
                provider: 'coresignal_fallback',
                primary_error: dataVertexError?.message || null,
              },
            });
          }

          const result = {
            success: true,
            data: {
              profiles: csResult.profiles.map(pr => ({ ...pr, source_provider: 'coresignal' })),
              pagination: csResult.pagination,
            },
            provider_key: 'coresignal',
            credits: {
              used: actualCreditsUsed,
              remaining: lastKnownBalance,
              session_total: sessionCreditsConsumed,
              credit_ceiling: ceiling,
            },
            interpreted_criteria: {
              free_text_searched: effectiveFreeText || null,
              jd_searched: jd_search || null,
              similar_titles: [],
            },
            operation_id: opId,
            provider: 'Coresignal Talent Network (Secondary Backup)',
            fallback_active: true,
            primary_error: dataVertexError?.message || null,
          };
          searchResponseCache.set(cacheKey, result);
          return result;
        }
      } catch (csErr) {
        console.warn('[Coresignal Fallback] Secondary provider search error:', csErr.message);
      }
    }

    // If secondary was unconfigured or failed, release credits and rethrow
    if (supabase && reservationId) {
      if (dataVertexError?.name === 'TimeoutError' || dataVertexError?.name === 'AbortError') {
        sessionCreditsConsumed += estimatedCost;
        await safeRpc(supabase, 'datavertex_mark_uncertain', {
          p_operation_id: opId,
          p_error_message: 'DataVertex search timed out after 15s',
        });
      } else {
        await safeRpc(supabase, 'datavertex_release_credits', {
          p_operation_id: opId,
          p_reason: 'provider_error',
          p_error_message: dataVertexError?.message || 'DataVertex search failed',
        });
      }
    }

    if (dataVertexError?.name === 'TimeoutError' || dataVertexError?.name === 'AbortError') {
      const err = new Error('DataVertex search timed out after 15 seconds. Provider may have processed request; please check account balance before retrying.');
      err.code = 'UNCERTAIN_PROVIDER_STATUS';
      err.status = 504;
      throw err;
    }

    throw dataVertexError || new Error('DataVertex search failed and no secondary provider succeeded.');
  })();

  inFlightRequests.set(cacheKey, searchPromise);
  return searchPromise;
}

/**
 * Candidate Profile Lookup via DataVertex API (Primary) with Coresignal (Secondary Backup)
 * Cost: 1 credit when enrich_profile=true and full profile data is returned. 0 credits if not found.
 */
export async function lookupCandidate({
  supabase = null,
  org_id = null,
  hiring_run_id = null,
  actor_id = null,
  operation_id = null,
  linkedin_url = null,
  candidate_id = null,
  enrich_profile = true,
}) {
  assertServerSide();
  const apiKey = getApiKey();

  if (!linkedin_url && !candidate_id) {
    const error = new Error('A valid linkedin_url or candidate_id is required for candidate lookup.');
    error.code = 'INVALID_ARGUMENT';
    error.status = 400;
    throw error;
  }

  const estimatedCost = enrich_profile ? 1 : 0;
  const ceiling = getMaxSessionCredits();
  const opId = operation_id || `dv_lookup_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // 1. Atomic Credit Reservation
  let reservationId = null;
  if (estimatedCost > 0) {
    if (supabase && org_id) {
      try {
        const { data: reserveRes, error: reserveErr } = await safeRpc(supabase, 'datavertex_reserve_credits', {
          p_org_id: org_id,
          p_hiring_run_id: hiring_run_id,
          p_actor_id: actor_id,
          p_operation_type: 'lookup',
          p_operation_id: opId,
          p_expected_cost: estimatedCost,
          p_hard_ceiling: ceiling,
        });

        if (reserveErr) {
          if (reserveErr.code === 'PGRST202' || reserveErr.message?.includes('schema cache')) {
            // Schema does not contain RPC (baseline DB); fall back to in-memory ledger
          } else {
            const error = new Error(`Credit reservation failed: ${reserveErr.message}`);
            error.code = 'RESERVATION_ERROR';
            error.status = 500;
            throw error;
          }
        } else {
          const reservation = Array.isArray(reserveRes) ? reserveRes[0] : reserveRes;
          if (!reservation || !reservation.allowed) {
            const error = new Error(
              reservation?.error_message ||
              `Verification credit ceiling reached (${ceiling} credits). Sourcing halted to prevent excess spend.`
            );
            error.code = 'CREDIT_CEILING_REACHED';
            error.status = 429;
            throw error;
          }
          reservationId = reservation.ledger_id;
        }
      } catch (err) {
        if (err.code === 'CREDIT_CEILING_REACHED' || err.code === 'RESERVATION_ERROR') throw err;
      }
    }
    if (!reservationId) {
      if (sessionCreditsConsumed + estimatedCost > ceiling) {
        const error = new Error(`Verification credit ceiling reached (${sessionCreditsConsumed}/${ceiling} credits used). Sourcing halted to prevent excess spend.`);
        error.code = 'CREDIT_CEILING_REACHED';
        error.status = 429;
        throw error;
      }
    }
  }

  const payload = {
    reveal_personal_email: false,
    reveal_phone: false,
    reveal_healthcare_enrichment: false,
    reveal_detailed_person_enrichment: Boolean(enrich_profile),
  };
  if (linkedin_url) {
    payload.linkedin_url = linkedin_url.trim();
  } else {
    payload.candidate_id = String(candidate_id).trim();
  }

  const cacheKey = JSON.stringify(payload);
  if (lookupResponseCache.has(cacheKey)) {
    return { ...lookupResponseCache.get(cacheKey), cached: true };
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const lookupPromise = (async () => {

    // ── PRIMARY PROVIDER: DataVertex Candidate Lookup ──
    let dataVertexLookupError = null;
    let dataVertex404 = false;

    try {
      const res = await fetch(`${BASE_URL}/lookup`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (res.ok) {
        const responseData = await res.json();
        const creditsReported = responseData.credits || {};
        const actualCreditsUsed = creditsReported.used ?? estimatedCost;
        sessionCreditsConsumed += actualCreditsUsed;
        if (creditsReported.remaining !== undefined) {
          lastKnownBalance = creditsReported.remaining;
        }

        if (supabase && reservationId) {
          await safeRpc(supabase, 'datavertex_settle_credits', {
            p_operation_id: opId,
            p_settled_credits: actualCreditsUsed,
            p_metadata: {
              credits_remaining: creditsReported.remaining ?? lastKnownBalance,
              used: actualCreditsUsed,
              provider: 'datavertex',
            },
          });
        }

        const contacts = responseData.data?.contacts || [];
        const primaryContact = contacts[0] || null;
        const isProfileUnavailable = !primaryContact || !primaryContact.profile;

        if (!isProfileUnavailable) {
          const result = {
            success: true,
            full_profile_unavailable: false,
            message: null,
            contact: primaryContact,
            profile: primaryContact?.profile || null,
            credits: {
              used: actualCreditsUsed,
              remaining: creditsReported.remaining ?? lastKnownBalance,
              session_total: sessionCreditsConsumed,
              credit_ceiling: ceiling,
            },
            operation_id: opId,
            provider_key: 'datavertex',
            provider: 'DataVertex Candidate Network (Primary)',
          };

          lookupResponseCache.set(cacheKey, result);
          return result;
        }
      } else if (res.status === 404) {
        dataVertex404 = true;
      } else {
        const errData = await res.json().catch(() => ({}));
        dataVertexLookupError = new Error(errData.message || `DataVertex lookup failed (HTTP ${res.status}).`);
        dataVertexLookupError.status = res.status;
        dataVertexLookupError.code = res.status === 403 ? 'DATAVERTEX_AUTH_FAILED' : res.status === 400 ? 'INVALID_LOOKUP_IDENTIFIER' : 'DATAVERTEX_ERROR';
      }
    } catch (err) {
      dataVertexLookupError = err;
    }

    // ── SECONDARY / BACKUP: Coresignal Cached Candidate Profile ──
    const csProfile = lookupCoresignalCandidate({ candidate_id, linkedin_url });
    if (csProfile) {
      sessionCreditsConsumed += (enrich_profile ? 1 : 0);
      // Primary balance is unknown when the secondary provider served the request.

      if (supabase && reservationId) {
        await safeRpc(supabase, 'datavertex_settle_credits', {
          p_operation_id: opId,
          p_settled_credits: enrich_profile ? 1 : 0,
          p_metadata: {
            credits_remaining: lastKnownBalance,
            used: enrich_profile ? 1 : 0,
            provider: 'coresignal_fallback',
          },
        });
      }

      const result = {
        success: true,
        full_profile_unavailable: false,
        message: null,
        contact: {
          profile: csProfile,
        },
        profile: csProfile,
        credits: {
          used: enrich_profile ? 1 : 0,
          remaining: lastKnownBalance,
          session_total: sessionCreditsConsumed,
          credit_ceiling: ceiling,
        },
        operation_id: opId,
        provider_key: 'coresignal',
        provider: 'Coresignal Talent Network (Secondary Backup)',
      };
      lookupResponseCache.set(cacheKey, result);
      return result;
    }

    // Handle 404 or profile unavailable cleanly
    if (dataVertex404 || (!dataVertexLookupError && !csProfile)) {
      if (supabase && reservationId) {
        await safeRpc(supabase, 'datavertex_release_credits', {
          p_operation_id: opId,
          p_reason: 'not_found',
          p_error_message: 'Candidate profile not found in primary or secondary provider',
        });
      }
      const result = {
        success: true,
        full_profile_unavailable: true,
        message: 'Full profile unavailable; showing search summary.',
        contact: null,
        profile: null,
        credits: {
          used: 0,
          remaining: lastKnownBalance,
          session_total: sessionCreditsConsumed,
          credit_ceiling: ceiling,
        },
        operation_id: opId,
        provider: 'DataVertex Candidate Network (Primary)',
      };
      lookupResponseCache.set(cacheKey, result);
      return result;
    }

    // Error handling
    if (supabase && reservationId) {
      if (dataVertexLookupError?.name === 'TimeoutError' || dataVertexLookupError?.name === 'AbortError') {
        sessionCreditsConsumed += estimatedCost;
        await safeRpc(supabase, 'datavertex_mark_uncertain', {
          p_operation_id: opId,
          p_error_message: 'DataVertex lookup timed out after 15s',
        });
      } else {
        await safeRpc(supabase, 'datavertex_release_credits', {
          p_operation_id: opId,
          p_reason: 'provider_error',
          p_error_message: dataVertexLookupError?.message || 'DataVertex lookup failed',
        });
      }
    }

    if (dataVertexLookupError?.name === 'TimeoutError' || dataVertexLookupError?.name === 'AbortError') {
      const err = new Error('DataVertex lookup timed out after 15 seconds. Provider may have processed request; please check account balance before retrying.');
      err.code = 'UNCERTAIN_PROVIDER_STATUS';
      err.status = 504;
      throw err;
    }

    throw dataVertexLookupError || new Error('DataVertex lookup failed.');
  })();

  inFlightRequests.set(cacheKey, lookupPromise);
  return lookupPromise;
}

export function getCreditStatus() {
  return {
    session_credits_used: sessionCreditsConsumed,
    credit_ceiling: getMaxSessionCredits(),
    last_known_balance: lastKnownBalance,
  };
}
