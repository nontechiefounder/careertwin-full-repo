import { NextResponse } from 'next/server';
import { contextScope, contextFetch, ContextError } from '@/lib/contextClient';
import { validateEngineResponse } from '@/lib/engineConfig';

const ALLOWED_MODES = ['retrieval_only', 'retrieval_augmented'];

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

  // 2. Parse and Validate Request Payload
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload', code: 'INVALID_JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Request body must be a valid object', code: 'INVALID_BODY' }, { status: 400 });
  }

  // Reject client-authoritative scope overrides
  if (['org_id', 'workspace_id'].some((k) => k in body)) {
    return NextResponse.json(
      { error: 'Client scope override is prohibited', code: 'CLIENT_SCOPE_OVERRIDE' },
      { status: 400 }
    );
  }

  const { hiring_run_id, question, mode = 'retrieval_augmented', limit = 5 } = body;

  // Hiring run validation: explicit string required
  if (!hiring_run_id || typeof hiring_run_id !== 'string' || !hiring_run_id.trim()) {
    return NextResponse.json(
      {
        error: 'A valid hiring_run_id is required to resolve authorized organization and corpus context.',
        code: 'MISSING_HIRING_RUN',
      },
      { status: 400 }
    );
  }

  // Question validation
  if (!question || typeof question !== 'string' || !question.trim()) {
    return NextResponse.json({ error: 'Question is required', code: 'QUESTION_REQUIRED' }, { status: 400 });
  }

  const trimmedQuestion = question.trim();
  if (trimmedQuestion.length < 3) {
    return NextResponse.json(
      { error: 'Question must be at least 3 characters long', code: 'QUESTION_TOO_SHORT' },
      { status: 400 }
    );
  }
  if (trimmedQuestion.length > 1000) {
    return NextResponse.json(
      { error: 'Question exceeds maximum length of 1,000 characters', code: 'QUESTION_TOO_LONG' },
      { status: 400 }
    );
  }

  // Mode validation
  if (!ALLOWED_MODES.includes(mode)) {
    return NextResponse.json(
      { error: `Invalid mode '${mode}'. Allowed: ${ALLOWED_MODES.join(', ')}`, code: 'INVALID_MODE' },
      { status: 400 }
    );
  }

  // Limit validation: Strict integer between 1 and 20
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 20) {
    return NextResponse.json(
      { error: 'Limit must be a strict integer between 1 and 20', code: 'INVALID_LIMIT' },
      { status: 400 }
    );
  }

  // 3. Authenticate User, Membership, and Server-Owned Workspace Scope
  let scope;
  try {
    scope = await contextScope(request, hiring_run_id, 'retrieve');
    if (scope.errorResponse) return scope.errorResponse;
  } catch (err) {
    if (err instanceof ContextError) {
      if (err.code === 'RUN_NOT_FOUND') {
        return NextResponse.json(
          { error: 'Hiring run not found or access denied', code: 'FORBIDDEN' },
          { status: 404 }
        );
      }
      if (err.code === 'ACCESS_DENIED') {
        return NextResponse.json(
          { error: 'Forbidden: User does not belong to authorized organization', code: 'FORBIDDEN' },
          { status: 403 }
        );
      }
      if (err.code === 'MAPPING_REVOKED') {
        return NextResponse.json(
          { error: 'Context engine mapping revoked or inactive for this hiring run', code: 'MAPPING_REVOKED' },
          { status: 403 }
        );
      }
      if (err.code === 'UNMAPPED_WORKSPACE') {
        return NextResponse.json(
          { error: 'No context engine workspace is mapped for this hiring run', code: 'UNMAPPED_WORKSPACE' },
          { status: 403 }
        );
      }
      if (
        err.code === 'ENGINE_CONFIG_MISSING' ||
        err.code === 'ENGINE_CONFIG_INVALID' ||
        err.code === 'CONTEXT_CONFIG_MISSING' ||
        err.code === 'CONTEXT_CONFIG_INVALID' ||
        err.code === 'TLS_REQUIRED' ||
        err.code === 'MAPPING_CONFIG_INVALID'
      ) {
        return NextResponse.json(
          { error: 'Context engine service is not configured properly', code: 'ENGINE_CONFIG_MISSING' },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: err.message || 'Authorization failure', code: err.code },
        { status: err.status || 500 }
      );
    }
    return NextResponse.json(
      { error: 'Internal authorization error', code: 'AUTH_ERROR' },
      { status: 500 }
    );
  }

  // Reject conflicting client-supplied role_id
  if (body.role_id && typeof body.role_id === 'string' && body.role_id.trim() && body.role_id.trim() !== scope.roleId) {
    return NextResponse.json(
      { error: 'Client-supplied role_id contradicts server-mapped role for this hiring run', code: 'ROLE_CONTEXT_CONFLICT' },
      { status: 400 }
    );
  }

  // 4. Forward Scoped Request to Authoritative Memory Service
  try {
    const payload = {
      question: trimmedQuestion,
      mode,
      limit,
    };
    if (typeof body.as_of === 'number' && !isNaN(body.as_of) && body.as_of > 0) {
      payload.as_of = body.as_of;
    } else if (typeof body.as_of === 'string' && body.as_of.trim()) {
      const parsed = Date.parse(body.as_of.trim());
      if (!isNaN(parsed)) {
        payload.as_of = parsed / 1000;
      } else {
        const num = parseFloat(body.as_of.trim());
        if (!isNaN(num) && num > 0) payload.as_of = num;
      }
    }

    const upstreamRes = await contextFetch(scope, '/research-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const upstreamData = upstreamRes.body;
    const validation = validateEngineResponse(upstreamData, mode);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.message, code: validation.code },
        { status: validation.status || 502 }
      );
    }

    const validated = validation.data;
    const corpusScope = scope.corpusScope || 'TENANT_PRIVATE';

    return NextResponse.json({
      mode: validated.mode,
      answer: validated.answer,
      status: validated.status,
      company_name: scope.companyName,
      role_id: scope.roleId,
      corpus_scope: corpusScope,
      disclaimer:
        validated.disclaimer ||
        (corpusScope === 'PUBLIC_RESEARCH'
          ? 'PUBLIC RESEARCH / NOT EMPLOYER-APPROVED. This information is derived from indexed reference documents for recruiter context only. It does not establish candidate competence or modify hiring rubrics.'
          : 'CONFIDENTIAL TENANT CORPUS / NOT EMPLOYER-APPROVED. This information is retrieved from private tenant documents. It does not establish candidate competence or modify hiring rubrics.'),
      citations: validated.citations,
      passages: validated.passages || validated.citations,
      retrieved_count: validated.retrieved_count ?? validated.citations.length,
      has_validation_errors: validated.has_validation_errors,
      latency_ms: validated.latency_ms,
      execution_provenance: validated.execution_provenance,
      diagnostics: validated.diagnostics || [],
    });
  } catch (err) {
    if (err instanceof ContextError) {
      if (err.status === 401 || err.status === 403) {
        return NextResponse.json(
          { error: 'Internal service or delegated authorization failure', code: 'ENGINE_AUTH_ERROR' },
          { status: 502 }
        );
      }
      if (err.status === 404) {
        return NextResponse.json(
          { error: 'Research workspace not found in engine', code: 'WORKSPACE_NOT_FOUND' },
          { status: 404 }
        );
      }
      if (err.status === 504) {
        return NextResponse.json(
          { error: 'Research QA request timed out after 30 seconds', code: 'GATEWAY_TIMEOUT' },
          { status: 504 }
        );
      }
      if (
        err.code === 'LIVE_GENERATION_UNAVAILABLE' ||
        err.code === 'GENERATION_NOT_IMPLEMENTED' ||
        err.code === 'BLOCKED_PENDING_KEY_ROTATION'
      ) {
        return NextResponse.json(
          {
            error: 'Provider credential unconfigured. Live generation is BLOCKED pending key configuration.',
            code: 'BLOCKED_PENDING_KEY_ROTATION',
            status: 'INSUFFICIENT_EVIDENCE',
            disclaimer: 'Live provider calls are blocked pending key configuration.',
            citations: [],
            execution_provenance: 'BLOCKED_PENDING_KEY_ROTATION',
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: 'Context engine execution failed: ' + err.code, code: 'ENGINE_ERROR' },
        { status: err.status || 503 }
      );
    }
    return NextResponse.json(
      { error: 'Context engine service temporarily unavailable', code: 'SERVICE_UNAVAILABLE' },
      { status: 503 }
    );
  }
}
