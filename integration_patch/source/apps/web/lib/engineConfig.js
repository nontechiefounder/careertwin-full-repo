/**
 * Context Engine Configuration & Delegated Authorization
 * 
 * Enforces:
 * 1. Strict fail-closed configuration without fallback tokens.
 * 2. Exact server-owned tenant + hiring run mapping (no client authority, no memberships[0] default).
 * 3. Cryptographic delegated request authorization (HMAC-SHA256 bearer tokens).
 * 4. Discriminated mode-specific upstream contracts (retrieval_only vs retrieval_augmented/full_context).
 * 5. Safe abstention on grounding failures (never return unverified text as grounded).
 * 6. Latency unit reconciliation (seconds -> ms) and sanitized error envelopes.
 */

import crypto from 'crypto';

export const ALLOWED_MODES = ['retrieval_augmented', 'retrieval_only', 'full_context'];

export const ALLOWED_STATUSES_GENERATED = [
  'GROUNDED',
  'AMBIGUOUS',
  'DISAGREEMENT',
  'INSUFFICIENT_EVIDENCE',
  'UNVERIFIED_STATUS',
];

export const ALLOWED_STATUSES_RETRIEVAL = [
  'RETRIEVAL_ONLY_COMPLETE',
  'NO_RELEVANT_PASSAGES',
];

export const ALLOWED_PROVENANCE = [
  'LIVE_LOCAL_RETRIEVAL',
  'LIVE_MODEL_SYNTHESIS',
  'BLOCKED_PENDING_KEY_ROTATION',
  'STATIC_EVALUATION',
];

/**
 * Validates that context engine configuration is explicitly set and non-empty.
 * Fails closed if missing, empty, or whitespace-only.
 */
export function validateEngineConfig() {
  const rawUrl = process.env.WORKBYLINE_ENGINE_URL;
  const rawKey = process.env.WORKBYLINE_INTERNAL_SERVICE_KEY;

  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return {
      ok: false,
      status: 503,
      code: 'ENGINE_CONFIG_MISSING',
      message: 'Context engine URL is not configured (WORKBYLINE_ENGINE_URL is required).',
    };
  }

  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
    return {
      ok: false,
      status: 503,
      code: 'ENGINE_CONFIG_INVALID',
      message: 'Context engine URL must be a valid HTTP or HTTPS address.',
    };
  }

  if (!rawKey || typeof rawKey !== 'string' || !rawKey.trim()) {
    return {
      ok: false,
      status: 503,
      code: 'ENGINE_CONFIG_MISSING',
      message: 'Context engine service key is not configured (WORKBYLINE_INTERNAL_SERVICE_KEY is required).',
    };
  }

  return {
    ok: true,
    engineBaseUrl: trimmedUrl.replace(/\/+$/, ''),
    engineServiceKey: rawKey.trim(),
  };
}

/**
 * Server-owned registry mapping V2 organizations and exact hiring runs to isolated engine workspaces.
 * Never accepts client-supplied workspace IDs.
 * Requires exact run entries; rejects unmapped, revoked, or inconsistent context.
 */
export function resolveEngineContext(orgId, hiringRunId, clientRoleId = null) {
  if (!orgId || typeof orgId !== 'string' || !orgId.trim()) {
    return {
      ok: false,
      status: 400,
      code: 'ORG_CONTEXT_REQUIRED',
      message: 'Organization context must be verified before accessing research engine.',
    };
  }

  if (!hiringRunId || typeof hiringRunId !== 'string' || !hiringRunId.trim()) {
    return {
      ok: false,
      status: 400,
      code: 'HIRING_RUN_REQUIRED',
      message: 'Hiring run context must be verified before accessing research engine.',
    };
  }

  const cleanOrgId = orgId.trim();
  const cleanRunId = hiringRunId.trim();

  // 1. Check dynamic environment mapping (JSON formatted)
  let dynamicMappings = null;
  if (process.env.WORKBYLINE_ENGINE_MAPPINGS) {
    try {
      dynamicMappings = JSON.parse(process.env.WORKBYLINE_ENGINE_MAPPINGS);
    } catch {
      return {
        ok: false,
        status: 500,
        code: 'MALFORMED_ENGINE_MAPPINGS',
        message: 'WORKBYLINE_ENGINE_MAPPINGS contains malformed JSON configuration.',
      };
    }
  }

  const registry = dynamicMappings; // No named demo tenant fallback in application resolution.

  // Validate mapping dictionary existence
  if (!registry || typeof registry !== 'object' || Array.isArray(registry) || Object.keys(registry).length === 0) {
    return {
      ok: false,
      status: 403,
      code: 'UNMAPPED_WORKSPACE',
      message: `No context engine workspace is mapped for organization '${cleanOrgId}'.`,
    };
  }

  const orgConfig = registry[cleanOrgId];
  if (!orgConfig || typeof orgConfig !== 'object') {
    return {
      ok: false,
      status: 403,
      code: 'UNMAPPED_WORKSPACE',
      message: `No context engine workspace is mapped for organization '${cleanOrgId}'.`,
    };
  }

  // Exact run lookup required
  const runs = orgConfig.runs || {};
  if (typeof runs !== 'object' || Object.keys(runs).length === 0) {
    return {
      ok: false,
      status: 403,
      code: 'UNMAPPED_WORKSPACE',
      message: `Organization '${cleanOrgId}' has no active run mappings.`,
    };
  }

  const runConfig = runs[cleanRunId];
  if (!runConfig || typeof runConfig !== 'object') {
    return {
      ok: false,
      status: 403,
      code: 'UNMAPPED_WORKSPACE',
      message: `Hiring run '${cleanRunId}' is not mapped to an engine workspace for organization '${cleanOrgId}'.`,
    };
  }

  // Validate run status (must not be revoked or disabled)
  if (runConfig.status && runConfig.status !== 'active') {
    return {
      ok: false,
      status: 403,
      code: 'MAPPING_REVOKED',
      message: `Engine mapping for hiring run '${cleanRunId}' is '${runConfig.status}'.`,
    };
  }

  const resolvedWorkspaceId = runConfig.workspaceId || runConfig.workspace_id;
  const resolvedRoleId = runConfig.roleId || runConfig.role_id;
  const companyName = orgConfig.companyName || orgConfig.company_name || 'Authorized Workspace';
  const corpusScope = runConfig.corpusScope || runConfig.corpus_scope || orgConfig.corpusScope || 'TENANT_PRIVATE';

  if (!resolvedWorkspaceId || typeof resolvedWorkspaceId !== 'string') {
    return {
      ok: false,
      status: 500,
      code: 'INCOMPLETE_MAPPING',
      message: `Mapping for hiring run '${cleanRunId}' is missing workspaceId.`,
    };
  }

  if (!resolvedRoleId || typeof resolvedRoleId !== 'string') {
    return {
      ok: false,
      status: 500,
      code: 'INCOMPLETE_MAPPING',
      message: `Mapping for hiring run '${cleanRunId}' is missing roleId.`,
    };
  }

  // Reject client role conflict if supplied
  if (clientRoleId && clientRoleId !== resolvedRoleId) {
    return {
      ok: false,
      status: 400,
      code: 'ROLE_CONTEXT_CONFLICT',
      message: `Client-supplied role_id '${clientRoleId}' conflicts with server-authorized role '${resolvedRoleId}'.`,
    };
  }

  return {
    ok: true,
    workspaceId: resolvedWorkspaceId,
    roleId: resolvedRoleId,
    companyName,
    corpusScope,
  };
}

/**
 * Creates an HMAC-SHA256 signed delegated authorization token.
 * Cryptographically binds: actor, org, hiring run, workspace, role, operation, audience, and expiry.
 */
export function generateDelegatedAuthorizationToken({
  actorId,
  actorEmail,
  orgId,
  hiringRunId,
  workspaceId,
  roleId,
  operation = 'research_qa',
  secretKey,
  ttlSeconds = 300,
}) {
  if (!secretKey) {
    throw new Error('Secret key is required to generate delegated authorization token');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload = {
    iss: 'workbyline-v2-web',
    aud: 'workbyline-context-engine',
    actor_id: String(actorId || 'anon'),
    actor_email: String(actorEmail || 'unspecified'),
    org_id: String(orgId),
    hiring_run_id: String(hiringRunId),
    workspace_id: String(workspaceId),
    role_id: String(roleId),
    operation: String(operation),
    iat: now,
    exp: now + ttlSeconds,
    jti: crypto.randomUUID(),
  };

  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(`${b64Header}.${b64Payload}`)
    .digest('base64url');

  return `${b64Header}.${b64Payload}.${signature}`;
}

/**
 * Cryptographically verifies an HMAC-SHA256 delegated authorization token.
 * Validates signature, expiration, audience, workspace binding, role binding, and operation.
 */
export function verifyDelegatedAuthorizationToken(token, secretKey, options = {}) {
  if (!token || typeof token !== 'string') {
    return { ok: false, error: 'Token missing or invalid format', code: 'INVALID_TOKEN' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, error: 'Invalid token structure', code: 'MALFORMED_TOKEN' };
  }

  const [b64Header, b64Payload, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', secretKey)
    .update(`${b64Header}.${b64Payload}`)
    .digest('base64url');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    return { ok: false, error: 'Invalid token signature', code: 'SIGNATURE_MISMATCH' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf-8'));
  } catch {
    return { ok: false, error: 'Invalid payload JSON', code: 'MALFORMED_PAYLOAD' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    return { ok: false, error: 'Delegated token has expired', code: 'TOKEN_EXPIRED' };
  }

  if (payload.aud !== 'workbyline-context-engine') {
    return { ok: false, error: 'Audience mismatch', code: 'AUDIENCE_MISMATCH' };
  }

  if (options.requiredWorkspace && payload.workspace_id !== options.requiredWorkspace) {
    return { ok: false, error: 'Workspace binding mismatch', code: 'WORKSPACE_MISMATCH' };
  }

  if (options.requiredRole && payload.role_id !== options.requiredRole) {
    return { ok: false, error: 'Role binding mismatch', code: 'ROLE_MISMATCH' };
  }

  if (options.requiredOperation && payload.operation !== options.requiredOperation) {
    return { ok: false, error: 'Operation not authorized', code: 'OPERATION_UNAUTHORIZED' };
  }

  return { ok: true, payload };
}

/**
 * Validates upstream engine response strictly against mode-specific contracts.
 * Discriminates between 'retrieval_only' and 'retrieval_augmented'/'full_context'.
 * Enforces fail-closed grounding: never returns unverified answer text when citations fail.
 */
export function validateEngineResponse(engineData, mode = 'retrieval_augmented') {
  if (!engineData || typeof engineData !== 'object' || Array.isArray(engineData)) {
    return {
      ok: false,
      status: 502,
      code: 'MALFORMED_ENGINE_RESPONSE',
      message: 'Upstream context engine returned a non-object payload.',
    };
  }

  // Reconcile latency units: engine returns latency_seconds or latency_ms
  let latencyMs = null;
  if (typeof engineData.latency_ms === 'number' && Number.isFinite(engineData.latency_ms)) {
    latencyMs = Math.round(engineData.latency_ms);
  } else if (typeof engineData.latency_seconds === 'number' && Number.isFinite(engineData.latency_seconds)) {
    latencyMs = Math.round(engineData.latency_seconds * 1000);
  }

  // Reconcile provenance
  let executionProvenance = 'UNVERIFIED_PROVENANCE';
  if (engineData.execution_provenance && ALLOWED_PROVENANCE.includes(engineData.execution_provenance)) {
    executionProvenance = engineData.execution_provenance;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DISCRIMINATED BRANCH: RETRIEVAL ONLY
  // ─────────────────────────────────────────────────────────────────────────────
  if (mode === 'retrieval_only') {
    let status = engineData.status;
    if (!status || !ALLOWED_STATUSES_RETRIEVAL.includes(status)) {
      return {
        ok: false,
        status: 502,
        code: 'INVALID_ENGINE_STATUS',
        message: `Upstream engine returned invalid status for retrieval_only: '${status}'.`,
      };
    }

    const rawPassages = Array.isArray(engineData.passages)
      ? engineData.passages
      : Array.isArray(engineData.citations)
      ? engineData.citations
      : [];

    const validPassages = [];
    for (const p of rawPassages) {
      if (!p || typeof p !== 'object') continue;
      const spanId = p.span_id || p.id;
      if (!spanId || typeof spanId !== 'string') continue;

      let safeUrl = null;
      if (p.source_url && typeof p.source_url === 'string') {
        const trimmed = p.source_url.trim();
        if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
          safeUrl = trimmed;
        }
      }

      validPassages.push({
        span_id: spanId.trim(),
        document_id: p.document_id || null,
        source_id: p.source_id || null,
        filename: typeof p.filename === 'string' ? p.filename : 'source_document.md',
        text: typeof p.text === 'string' ? p.text : (typeof p.quote === 'string' ? p.quote : ''),
        score: typeof p.score === 'number' ? p.score : null,
        source_url: safeUrl,
        employer_approval: ['APPROVED', 'NOT_OBTAINED'].includes(p.employer_approval) ? p.employer_approval : 'NOT_OBTAINED',
      });
    }

    return {
      ok: true,
      data: {
        mode: 'retrieval_only',
        status: validPassages.length === 0 ? 'NO_RELEVANT_PASSAGES' : status,
        answer: null, // retrieval_only does not require answer text
        passages: validPassages,
        citations: validPassages,
        retrieved_count: validPassages.length,
        has_validation_errors: false,
        latency_ms: latencyMs,
        execution_provenance: executionProvenance,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DISCRIMINATED BRANCH: GENERATED / RETRIEVAL AUGMENTED & FULL CONTEXT
  // ─────────────────────────────────────────────────────────────────────────────

  // 1. Status enum validation
  let status = engineData.status;
  if (!status || !ALLOWED_STATUSES_GENERATED.includes(status)) {
    return {
      ok: false,
      status: 502,
      code: 'INVALID_ENGINE_STATUS',
      message: `Upstream engine returned unsupported status: '${status}'.`,
    };
  }

  // 2. Strict boolean validation for has_validation_errors (must be literal boolean)
  if (typeof engineData.has_validation_errors !== 'boolean') {
    return {
      ok: false,
      status: 502,
      code: 'MALFORMED_VALIDATION_FLAG',
      message: 'Upstream has_validation_errors flag must be a strict literal boolean.',
    };
  }
  const hasValidationErrors = engineData.has_validation_errors;

  // 3. Citations parsing and sanitation
  const rawCitations = Array.isArray(engineData.citations) ? engineData.citations : [];
  const validCitations = [];

  for (const c of rawCitations) {
    if (!c || typeof c !== 'object') continue;
    if (!c.span_id || typeof c.span_id !== 'string') continue;
    if (!c.quote || typeof c.quote !== 'string' || !c.quote.trim()) continue;

    // Do NOT require a public URL for valid private citations
    let safeUrl = null;
    if (c.source_url && typeof c.source_url === 'string') {
      const trimmedUrl = c.source_url.trim();
      if (trimmedUrl.startsWith('https://') || trimmedUrl.startsWith('http://')) {
        safeUrl = trimmedUrl;
      }
    }

    validCitations.push({
      span_id: c.span_id.trim(),
      quote: c.quote.trim(),
      filename: typeof c.filename === 'string' ? c.filename : null,
      locator: typeof c.locator === 'string' ? c.locator : null,
      source_url: safeUrl,
    });
  }

  // 4. Grounding Contract & Abstention Enforcement:
  // - GROUNDED cannot coexist with has_validation_errors: true
  // - GROUNDED requires at least one valid citation
  let answer = typeof engineData.answer === 'string' ? engineData.answer.trim() : '';
  const isGroundedInvalid = hasValidationErrors || status === 'UNVERIFIED_STATUS' || (status === 'GROUNDED' && validCitations.length === 0);

  if (isGroundedInvalid) {
    status = 'INSUFFICIENT_EVIDENCE';
    // CRITICAL: Never return unsupported original answer text as a normal answer
    answer = '[Evidence Abstention: The retrieved reference passages do not contain verifiable evidence to ground a factual answer.]';
  }

  // If answer is empty or invalid type
  if (!answer) {
    return {
      ok: false,
      status: 502,
      code: 'INVALID_ANSWER_TYPE',
      message: 'Upstream engine answer must be a valid non-empty string.',
    };
  }

  return {
    ok: true,
    data: {
      mode,
      answer,
      status,
      citations: validCitations,
      has_validation_errors: hasValidationErrors,
      latency_ms: latencyMs,
      execution_provenance: executionProvenance,
      diagnostics: Array.isArray(engineData.validation_errors) ? engineData.validation_errors : [],
    },
  };
}
