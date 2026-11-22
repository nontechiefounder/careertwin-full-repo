import { NextResponse } from 'next/server';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import {
  validateEngineConfig,
  resolveEngineContext,
  generateDelegatedAuthorizationToken,
  validateEngineResponse,
  ALLOWED_MODES,
} from '@/lib/engineConfig';

const ALLOWED_EMPLOYER_ROLES = ['owner', 'admin', 'recruiter', 'member'];

export async function POST(request) {
  // 1. Feature Flag Enforcement (Disabled by default)
  const isFeatureEnabled =
    process.env.NEXT_PUBLIC_ENABLE_RESEARCH_QA === 'true' ||
    process.env.ENABLE_RESEARCH_QA === 'true';

  if (!isFeatureEnabled) {
    return NextResponse.json(
      {
        error: 'The Research QA feature is disabled by organization policy.',
        code: 'RESEARCH_QA_DISABLED',
        safe_next_action: 'Enable NEXT_PUBLIC_ENABLE_RESEARCH_QA to access document QA.',
      },
      { status: 403 }
    );
  }

  // 2. Authenticate User via Real Supabase Session
  const authRes = await requireUser(request);
  if (authRes.errorResponse) return authRes.errorResponse;
  const { user, supabase } = authRes;

  // 3. Parse and Validate Request Payload
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload', code: 'INVALID_JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Request body must be a valid object', code: 'INVALID_BODY' }, { status: 400 });
  }

  const { hiring_run_id, role_id, question, mode = 'retrieval_augmented', limit = 5 } = body;

  // Question validation
  if (!question || typeof question !== 'string' || !question.trim()) {
    return NextResponse.json({ error: 'Question is required', code: 'QUESTION_REQUIRED' }, { status: 400 });
  }

  const trimmedQuestion = question.trim();
  if (trimmedQuestion.length < 3) {
    return NextResponse.json({ error: 'Question must be at least 3 characters long', code: 'QUESTION_TOO_SHORT' }, { status: 400 });
  }
  if (trimmedQuestion.length > 1000) {
    return NextResponse.json({ error: 'Question exceeds maximum length of 1,000 characters', code: 'QUESTION_TOO_LONG' }, { status: 400 });
  }

  // Mode validation
  if (!ALLOWED_MODES.includes(mode)) {
    return NextResponse.json(
      { error: `Invalid mode '${mode}'. Allowed: ${ALLOWED_MODES.join(', ')}`, code: 'INVALID_MODE' },
      { status: 400 }
    );
  }

  // Limit validation: Strict integer between 1 and 20 (reject "5junk", 1.9, etc.)
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 20) {
    return NextResponse.json(
      { error: 'Limit must be a strict integer between 1 and 20', code: 'INVALID_LIMIT' },
      { status: 400 }
    );
  }

  // 4. Strict Workspace Authorization & Server-Owned Mapping (Finding A1)
  // Require explicit hiring_run_id; never choose memberships[0]
  if (!hiring_run_id || typeof hiring_run_id !== 'string' || !hiring_run_id.trim()) {
    return NextResponse.json(
      {
        error: 'A valid hiring_run_id is required to resolve authorized organization and corpus context.',
        code: 'MISSING_HIRING_RUN',
      },
      { status: 400 }
    );
  }

  // Verify hiring run and organization membership in database
  const { data: run, error: runErr } = await supabase
    .from('hiring_runs')
    .select('id, org_id')
    .eq('id', hiring_run_id.trim())
    .single();

  if (runErr || !run) {
    return NextResponse.json(
      { error: 'Hiring run not found or access denied', code: 'FORBIDDEN' },
      { status: 404 }
    );
  }

  const membership = await getVerifiedOrgMembership(supabase, user.id, run.org_id);
  if (!membership || !ALLOWED_EMPLOYER_ROLES.includes(membership.membership_role)) {
    return NextResponse.json(
      { error: 'Forbidden: User does not belong to authorized organization', code: 'FORBIDDEN' },
      { status: 403 }
    );
  }

  // Resolve server-owned engine workspace & role mapping
  const contextRes = resolveEngineContext(run.org_id, run.id, role_id || null);
  if (!contextRes.ok) {
    return NextResponse.json(
      { error: contextRes.message, code: contextRes.code },
      { status: contextRes.status }
    );
  }

  // 5. Configuration Validation — Must Fail Closed (Finding A2)
  const configRes = validateEngineConfig();
  if (!configRes.ok) {
    return NextResponse.json(
      { error: configRes.message, code: configRes.code },
      { status: configRes.status }
    );
  }

  const { engineBaseUrl, engineServiceKey } = configRes;
  const { workspaceId, roleId, companyName, corpusScope } = contextRes;

  // 6. Engine-Side Delegated Authorization (Finding A2)
  // Issue HMAC-SHA256 signed bearer token binding actor, org, run, workspace, role, and op
  const delegatedToken = generateDelegatedAuthorizationToken({
    actorId: user.id,
    actorEmail: user.email,
    orgId: run.org_id,
    hiringRunId: run.id,
    workspaceId,
    roleId,
    operation: mode === 'retrieval_only' ? 'retrieve' : 'research_qa',
    secretKey: engineServiceKey,
    ttlSeconds: 300,
  });

  // 7. Scoped Server-to-Server Request with 30s Timeout Protection (Finding A4)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const engineRes = await fetch(
      `${engineBaseUrl}/v1/workspaces/${encodeURIComponent(workspaceId)}/research-qa`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${engineServiceKey}`,
          'X-Delegated-Authorization': `Bearer ${delegatedToken}`,
        },
        body: JSON.stringify({
          question: trimmedQuestion,
          mode,
          limit,
          role_id: roleId,
        }),
        signal: controller.signal,
      }
    );

    // Authentication failure on upstream engine
    if (engineRes.status === 401 || engineRes.status === 403) {
      clearTimeout(timeoutId);
      return NextResponse.json(
        { error: 'Internal service or delegated authorization failure', code: 'ENGINE_AUTH_ERROR' },
        { status: 502 }
      );
    }

    // Workspace not found upstream
    if (engineRes.status === 404) {
      clearTimeout(timeoutId);
      return NextResponse.json(
        { error: 'Research workspace not found in engine', code: 'WORKSPACE_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Upstream engine error response
    if (!engineRes.ok) {
      clearTimeout(timeoutId);
      const errData = await engineRes.json().catch(() => ({}));
      const detailStr = String(errData.detail || errData.error || '');

      // Check if upstream provider call was blocked due to missing/unprovisioned key
      if (
        detailStr.includes('GEMINI_API_KEY environment variable is not set') ||
        detailStr.includes('provider credential') ||
        detailStr.includes('BLOCKED_PENDING_KEY_ROTATION')
      ) {
        return NextResponse.json(
          {
            error: 'Provider credential unconfigured. Live generation is BLOCKED pending key configuration.',
            code: 'BLOCKED_PENDING_KEY_ROTATION',
            status: 'INSUFFICIENT_EVIDENCE',
            disclaimer:
              corpusScope === 'PUBLIC_RESEARCH'
                ? 'PUBLIC RESEARCH / NOT EMPLOYER-APPROVED. Live provider calls are blocked pending key configuration.'
                : 'CONFIDENTIAL TENANT CORPUS / NOT EMPLOYER-APPROVED. Live provider calls are blocked pending key configuration.',
            citations: [],
            execution_provenance: 'BLOCKED_PENDING_KEY_ROTATION',
          },
          { status: 503 }
        );
      }

      return NextResponse.json(
        { error: errData.detail || 'Context engine execution failed', code: 'ENGINE_ERROR' },
        { status: engineRes.status }
      );
    }

    const rawEngineData = await engineRes.json();
    clearTimeout(timeoutId);

    // 8. Strict Discriminated Response Contract Validation (Finding A3)
    const validationRes = validateEngineResponse(rawEngineData, mode);
    if (!validationRes.ok) {
      return NextResponse.json(
        { error: validationRes.message, code: validationRes.code },
        { status: validationRes.status }
      );
    }

    const validatedData = validationRes.data;

    // 9. Return Sanitized Payload with Company, Scope & Mode Context (Finding A5)
    return NextResponse.json({
      mode: validatedData.mode,
      answer: validatedData.answer,
      status: validatedData.status,
      company_name: companyName,
      role_id: roleId,
      corpus_scope: corpusScope,
      disclaimer:
        corpusScope === 'PUBLIC_RESEARCH'
          ? 'PUBLIC RESEARCH / NOT EMPLOYER-APPROVED. This information is derived from indexed reference documents for recruiter context only. It does not establish candidate competence or modify hiring rubrics.'
          : 'CONFIDENTIAL TENANT CORPUS / NOT EMPLOYER-APPROVED. This information is retrieved from private tenant documents. It does not establish candidate competence or modify hiring rubrics.',
      citations: validatedData.citations,
      passages: validatedData.passages || [],
      retrieved_count: validatedData.retrieved_count || (validatedData.citations ? validatedData.citations.length : 0),
      has_validation_errors: validatedData.has_validation_errors,
      latency_ms: validatedData.latency_ms,
      execution_provenance: validatedData.execution_provenance,
      diagnostics: validatedData.diagnostics || [],
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Research QA request timed out after 30 seconds', code: 'GATEWAY_TIMEOUT' },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: 'Context engine service temporarily unavailable', code: 'SERVICE_UNAVAILABLE' },
      { status: 503 }
    );
  }
}
