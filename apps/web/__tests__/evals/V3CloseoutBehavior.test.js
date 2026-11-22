import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockRequireUser = vi.fn();
const mockGetVerifiedOrgMembership = vi.fn();
const mockCreateSupabaseServerClient = vi.fn();
const mockGenerateChat = vi.fn();
const mockContextScope = vi.fn();
const mockContextFetch = vi.fn();

vi.mock('@/lib/serverAuth', () => ({
  requireUser: (...args) => mockRequireUser(...args),
  getVerifiedOrgMembership: (...args) => mockGetVerifiedOrgMembership(...args),
}));

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: (...args) => mockCreateSupabaseServerClient(...args),
}));

vi.mock('@/lib/contextClient', async () => {
  const actual = await vi.importActual('@/lib/contextClient');
  return {
    ...actual,
    contextScope: (...args) => mockContextScope(...args),
    contextFetch: (...args) => mockContextFetch(...args),
  };
});

import { resolveAuthoritativeFitScore, hasAuthoritativeEvaluation } from '@/lib/scoreUtils';
import { validateGroundedAnswer, verifySpanSupportsAnswer } from '@/lib/chatGrounding';
import { extractMultiSpanEvidenceAndClaims } from '@/lib/evidenceExtractor';
import { evaluateCandidateTrustPacket } from '@packages/proof-engine';
import { EvaluationOutputSchema } from '@/lib/evaluations';
import { generateChat, getProviderInventory } from '@/lib/ai';
import { GET as getContextSources } from '@/app/api/employer/context-sources/route';
import { GET as getContextEvidence } from '@/app/api/employer/context-sources/[sourceId]/evidence/route';
import { POST as postEmployerChat } from '@/app/api/employer/chat/route';

describe('WorkByLine V3 Closeout Behavioral Suite (F01–F09 & Blockers 1–8)', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  // ── Blocker 3: Intentional packet-null score preservation ──────────────────
  it('B3 / F03: preserves intentional packet-null fit_score without falling back to stale row score', () => {
    const packetWithNull = {
      fit_score: null,
      evaluation_metrics: { proof_strength: 0, decision_readiness: 'NEEDS PROOF' },
    };
    const staleRow = { fit_score: 0.88 };

    expect(hasAuthoritativeEvaluation(packetWithNull)).toBe(true);
    expect(resolveAuthoritativeFitScore(packetWithNull, staleRow)).toBeNull();

    // Pre-evaluation (no packet) may still read row fit_score
    expect(hasAuthoritativeEvaluation({})).toBe(false);
    expect(resolveAuthoritativeFitScore({}, staleRow)).toBe(0.88);
    expect(resolveAuthoritativeFitScore(null, { fit_score: null })).toBeNull();
  });

  // ── Blocker 2: Answer support validation separate from citation mentions ────
  it('B2 / F02: rejects counterexamples A/B/C, entity swaps, numeric reassignment, scope escalation, and refusal-prefix bypasses', () => {
    const aliceSpans = [
      {
        documentId: 'src_alice',
        documentName: 'evidence.pdf',
        versionId: 'ver_1',
        versionSha: 'abc12345',
        spanId: 'sp_alice_1',
        text: 'Alice built Kubernetes services. Alice mentored Bob. Alice has 5 years of Python and 2 years of Go. Alice built some Kubernetes services in staging.',
      },
    ];

    // Counterexample A: positive source -> negated answer
    const ceA = validateGroundedAnswer(
      'Alice never built Kubernetes services. See evidence.pdf.',
      aliceSpans,
      ''
    );
    expect(ceA.ok).toBe(false);
    expect(ceA.validatedSources).toEqual([]);

    // Counterexample B: supported clause + appended unsupported clause
    const ceB = validateGroundedAnswer(
      'Alice built Kubernetes services and secretly committed financial fraud. See evidence.pdf.',
      aliceSpans,
      ''
    );
    expect(ceB.ok).toBe(false);
    expect(ceB.validatedSources).toEqual([]);

    // Counterexample C: no evidence + refusal prefix + unsupported claim
    const ceC = validateGroundedAnswer(
      'I cannot answer everything. Alice stole confidential customer data.',
      [],
      ''
    );
    expect(ceC.ok).toBe(false);
    expect(ceC.isAbstention).toBe(false);
    expect(ceC.validatedSources).toEqual([]);

    // Entity swap (subject/object reversal & wrong person)
    expect(validateGroundedAnswer('Bob mentored Alice.', aliceSpans, '').ok).toBe(false);
    expect(validateGroundedAnswer('Bob built Kubernetes services.', aliceSpans, '').ok).toBe(false);

    // Numeric reassignment (5 belonged to Python, not Go)
    expect(validateGroundedAnswer('Alice has 5 years of Go.', aliceSpans, '').ok).toBe(false);

    // Scope escalation (some -> all, staging -> production)
    expect(validateGroundedAnswer('Alice built all Kubernetes services in production.', aliceSpans, '').ok).toBe(false);

    // Refusal-prefix bypass with mixed supported/unsupported
    expect(
      validateGroundedAnswer('I cannot answer everything. Alice built Kubernetes services, while Alice also stole confidential customer data.', aliceSpans, '').ok
    ).toBe(false);

    // Negative-to-positive polarity flip
    const kafkaSpans = [
      {
        documentId: 'src_1',
        documentName: 'infra_runbook.pdf',
        versionId: 'ver_1',
        versionSha: 'abc12345',
        spanId: 'sp_101',
        text: 'The payment service runs on Kubernetes with PostgreSQL 16 and has no Kafka dependency.',
      },
    ];
    expect(
      validateGroundedAnswer('According to infra_runbook.pdf (sp_101), the payment service runs Kafka in production.', kafkaSpans, '').ok
    ).toBe(false);
    expect(verifySpanSupportsAnswer('The service uses Kafka.', kafkaSpans[0].text)).toBe(false);

    // Valid supported controls & pure refusal control
    const validAlice = validateGroundedAnswer('Alice built Kubernetes services. See evidence.pdf.', aliceSpans, '');
    expect(validAlice.ok).toBe(true);
    expect(validAlice.validatedSources).toHaveLength(1);
    expect(validAlice.validatedSources[0].id).toBe('src_alice');

    const validNumeric = validateGroundedAnswer('Alice has 2 years of Go.', aliceSpans, '');
    expect(validNumeric.ok).toBe(false); // Paraphrases are not source excerpts.
    const exactNumeric = validateGroundedAnswer('Alice has 5 years of Python and 2 years of Go.', aliceSpans);
    expect(exactNumeric.ok).toBe(true);
    expect(exactNumeric.safeReply).toContain(aliceSpans[0].text);

    const pureAbstention = validateGroundedAnswer('I cannot answer that request from authorized records.', [], '');
    expect(pureAbstention.ok).toBe(true);
    expect(pureAbstention.isAbstention).toBe(true);
    expect(pureAbstention.validatedSources).toEqual([]);
  });

  // ── Blocker 5: Preserve pending, missing, and disabled context states ───────
  it('B5: preserves pending, lexical_only, disabled, and missing context states verbatim', async () => {
    mockContextScope.mockResolvedValue({
      base: 'http://127.0.0.1:8011',
      workspace: 'ws-1',
      token: 'tok',
    });
    mockContextFetch.mockResolvedValue({
      status: 200,
      body: {
        sources: [
          {
            source_id: 'src_pending',
            filename: 'notes.pdf',
            state: 'pending',
            parsing_state: 'pending',
            indexing_state: 'lexical_only',
            projection_state: 'disabled',
          },
        ],
      },
    });

    const listRes = await getContextSources(
      new Request('http://localhost:3010/api/employer/context-sources?hiring_run_id=11111111-1111-4111-a111-111111111111')
    );
    const listJson = await listRes.json();
    expect(listRes.status).toBe(200);
    expect(listJson.sources[0].state).toBe('pending');
    expect(listJson.sources[0].parsing_state).toBe('pending');
    expect(listJson.sources[0].indexing_state).toBe('lexical_only');
    expect(listJson.sources[0].projection_state).toBe('disabled');

    mockContextFetch.mockResolvedValue({
      status: 200,
      body: {
        source_id: 'src_pending',
        state: 'partial',
        parsing_state: 'partial',
        indexing_state: 'pending',
        projection_state: 'unprojected',
        parser: null,
      },
    });
    const evRes = await getContextEvidence(
      new Request('http://localhost:3010/api/employer/context-sources/src_pending/evidence?hiring_run_id=11111111-1111-4111-a111-111111111111'),
      { params: Promise.resolve({ sourceId: 'src_pending' }) }
    );
    const evJson = await evRes.json();
    expect(evJson.state).toBe('partial');
    expect(evJson.indexing_state).toBe('pending');
    expect(evJson.projection_state).toBe('unprojected');
    expect(evJson.parser_engine).toBeUndefined();
  });

  // ── Blocker 1: Employer chat Python fields, shipped SQL columns, and denial preservation
  it('B1 / F02: preserves UNMAPPED_WORKSPACE denial without SQL bypass and aligns Python/SQL fields', async () => {
    const orgId = '00000000-0000-4000-c000-000000000001';
    const runId = '11111111-1111-4111-a111-111111111111';
    const fromSpy = vi.fn((table) => {
      if (table === 'hiring_runs') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => Promise.resolve({
            data: [{ id: runId, role_title: 'Infra Lead', status: 'active', org_id: orgId, company: 'Acme', must_haves: ['Kubernetes'] }],
            error: null,
          }),
          maybeSingle: () => Promise.resolve({
            data: { id: runId, role_title: 'Infra Lead', company: 'Acme', job_description: 'Kubernetes platform.', must_haves: ['Kubernetes'], nice_to_haves: [], disqualifiers: [] },
            error: null,
          }),
        };
        return chain;
      }
      if (table === 'context_source_objects') {
        throw new Error('SECURITY_BYPASS: context_source_objects queried after mapping denial');
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      };
    });

    mockRequireUser.mockResolvedValue({
      user: { id: 'user-1', email: 'recruiter@acme.com' },
      supabase: { from: fromSpy },
    });
    mockGetVerifiedOrgMembership.mockResolvedValue({
      membership_role: 'recruiter',
      membership_status: 'active',
    });

    const { ContextError } = await vi.importActual('@/lib/contextClient');
    mockContextScope.mockRejectedValue(new ContextError(403, 'UNMAPPED_WORKSPACE'));

    process.env.GEMINI_API_KEY = 'fake-test-key';
    process.env.WORKBYLINE_GENERATION_GATE = 'true';
    process.env.WORKBYLINE_AI_PROVIDER = 'gemini';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'I am strictly scoped to the Infra Lead hiring workflow. Kubernetes is required.' }] } }],
      }),
    });

    const res = await postEmployerChat(
      new Request('http://localhost:3010/api/employer/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Tell me about attached context documents for this workflow',
          context: { org_id: orgId, active_run_id: runId },
        }),
      })
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.context_status).toBe('unmapped');
    // Confirmed: context_source_objects was NEVER queried when mapping was denied
    expect(fromSpy.mock.calls.some(([t]) => t === 'context_source_objects')).toBe(false);
  });

  // ── Blocker 1 (Part B): Python fields + shipped SQL columns on 503 ──────────
  it('B1: reads actual Python source_id/spans[].span_id fields and shipped SQL columns on 503 fallback', async () => {
    const orgId = '00000000-0000-4000-c000-000000000001';
    const runId = '11111111-1111-4111-a111-111111111111';
    let capturedSelect = '';

    const mockSupabase = {
      from: (table) => {
        if (table === 'hiring_runs') {
          const chain = {
            select: () => chain,
            eq: () => chain,
            order: () => Promise.resolve({
              data: [{ id: runId, role_title: 'Infra Lead', status: 'active', org_id: orgId, company: 'Acme', must_haves: ['Kubernetes'] }],
              error: null,
            }),
            maybeSingle: () => Promise.resolve({
              data: { id: runId, role_title: 'Infra Lead', company: 'Acme', job_description: 'Kubernetes platform.', must_haves: ['Kubernetes'], nice_to_haves: [], disqualifiers: [] },
              error: null,
            }),
          };
          return chain;
        }
        if (table === 'context_source_objects') {
          return {
            select: (sel) => {
              capturedSelect = sel;
              return {
                eq: () => Promise.resolve({
                  data: [
                    {
                      id: 'obj_1',
                      source_uri: 'tenant/notes.pdf',
                      context_source_versions: [
                        {
                          id: 'ver_1',
                          version_number: 1,
                          original_file_sha256: 'deadbeef1234',
                          status: 'completed',
                          context_parsed_artifacts: [
                            {
                              id: 'art_1',
                              parser_name: 'pypdf',
                              normalized_content_sha256: 'cafe',
                              normalized_text: 'Kubernetes multi-region failover runbook.',
                              context_evidence_spans: [
                                {
                                  id: 'sp_sql_1',
                                  span_key: 'k1',
                                  start_char: 0,
                                  end_char: 42,
                                  page_number: 1,
                                  exact_text: 'Kubernetes multi-region failover runbook.',
                                  span_type: 'PASSAGE',
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                  error: null,
                }),
              };
            },
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
      },
    };

    mockRequireUser.mockResolvedValue({
      user: { id: 'user-1', email: 'recruiter@acme.com' },
      supabase: mockSupabase,
    });
    mockGetVerifiedOrgMembership.mockResolvedValue({
      membership_role: 'recruiter',
      membership_status: 'active',
    });

    // Scope succeeds, Python service returns 503 CONTEXT_UNAVAILABLE -> fallback to shipped SQL columns
    const { ContextError } = await vi.importActual('@/lib/contextClient');
    mockContextScope.mockResolvedValue({ base: 'http://127.0.0.1:8011', workspace: runId, token: 'tok' });
    mockContextFetch.mockRejectedValue(new ContextError(503, 'CONTEXT_UNAVAILABLE'));

    process.env.GEMINI_API_KEY = 'fake-test-key';
    process.env.WORKBYLINE_GENERATION_GATE = 'true';
    process.env.WORKBYLINE_AI_PROVIDER = 'gemini';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Kubernetes multi-region failover runbook. [From Document: notes.pdf | Span: sp_sql_1]' }] } }],
      }),
    });

    const res = await postEmployerChat(
      new Request('http://localhost:3010/api/employer/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Explain our failover runbook',
          context: { org_id: orgId, active_run_id: runId },
        }),
      })
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.context_status).toBe('available');
    expect(json.grounding_validated).toBe(true);
    expect(capturedSelect).toContain('version_number');
    expect(capturedSelect).toContain('original_file_sha256');
    expect(capturedSelect).toContain('normalized_text');
    expect(capturedSelect).toContain('exact_text');
    expect(capturedSelect).not.toContain('span_text');
    expect(capturedSelect).not.toContain('content_text');
    expect(json.sources.some(s => s.id === 'obj_1')).toBe(true);

    // Controlled provider outputs returning Counterexamples A/B/C through actual handler must fail closed
    for (const badText of [
      'Alice never built Kubernetes services. See notes.pdf.',
      'Kubernetes multi-region failover runbook applies and secretly committed financial fraud. See notes.pdf.',
      'I cannot answer everything. Alice stole confidential customer data.'
    ]) {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: badText }] } }] }),
      });
      const badRes = await postEmployerChat(
        new Request('http://localhost:3010/api/employer/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'Explain our failover runbook',
            context: { org_id: orgId, active_run_id: runId },
          }),
        })
      );
      const badJson = await badRes.json();
      expect(badRes.status).toBe(200);
      expect(badJson.grounding_validated).toBe(false);
      expect(badJson.response_mode).toBe('grounded_abstention');
      expect(badJson.sources).toEqual([]);
      expect(badJson.reply).not.toContain('financial fraud');
      expect(badJson.reply).not.toContain('stole confidential');
    }
  });

  // ── F04: Evidence Extractor word boundaries, polarity, idioms ───────────────
  it('F04: avoids Django->Go collision, clean-record/track-record false positives, and early disqualifier return', () => {
    const res = extractMultiSpanEvidenceAndClaims(
      {
        id: 'doc-1',
        filename: 'resume.pdf',
        normalized_text:
          'Built high-throughput Django backend APIs in Python with a strong track record of uptime. Clean criminal record verified.',
        evidence_provenance: { authored: false },
      },
      {
        id: 'run-1',
        must_haves: ['Go microservices', 'Python'],
        nice_to_haves: [],
        disqualifiers: ['Criminal record'],
      }
    );

    const claimsText = res.claims.map(c => c.claim_text.toLowerCase()).join(' | ');
    expect(claimsText).toContain('python');
    expect(claimsText).not.toContain('criminal');
    const goClaim = res.claims.find(c => c.claim_text.toLowerCase().includes('go'));
    expect(goClaim?.status || 'MISSING').not.toBe('VERIFIED');
    expect(res.claims.some(c => c.status === 'CONFLICTING')).toBe(false);
  });

  // ── Blocker 6 / F05: Score-field semantics & contracts ─────────────────────
  it('B6 / F05: separates verified_proof_score from assertion_alignment_score without altering fit_score policy', () => {
    const run = {
      id: 'run-1',
      role_title: 'Backend Engineer',
      must_haves: ['Kubernetes', 'PostgreSQL'],
      nice_to_haves: [],
      disqualifiers: [],
    };
    const resumeEv = [
      {
        id: 'ev-1',
        document_id: 'doc-1',
        candidate_id: 'cand-1',
        role_id: 'run-1',
        org_id: 'org-1',
        filename: 'resume.pdf',
        file_type: 'pdf',
        sha256: 'abc123',
        source_offset: { start_offset: 0, end_offset: 40, excerpt_hash: 'ex123' },
        source_tier: 'resume',
        created_at: '2026-11-18T00:00:00Z',
        version: '1',
      },
    ];
    const resumeOnlyOut = evaluateCandidateTrustPacket({
      hiringRun: run,
      rawCandidateData: { id: 'cand-1' },
      rawClaims: [
        { id: 'c1', requirement_id: 'mh_1', claim_text: 'Kubernetes', status: 'INFERRED', source_type: 'resume_assertion', evidence_refs: resumeEv },
        { id: 'c2', requirement_id: 'mh_2', claim_text: 'PostgreSQL', status: 'INFERRED', source_type: 'resume_assertion', evidence_refs: resumeEv },
      ],
      allowedEvidenceRefs: resumeEv,
    });

    expect(resumeOnlyOut.fit_score).toBe(0.5);
    expect(resumeOnlyOut.verified_proof_score).toBe(0);
    expect(resumeOnlyOut.assertion_alignment_score).toBe(1);
    expect(resumeOnlyOut.gate_pass).toBe(false);
    expect(EvaluationOutputSchema.safeParse(resumeOnlyOut).success).toBe(true);

    const emptyOut = evaluateCandidateTrustPacket({
      hiringRun: run,
      rawCandidateData: { id: 'cand-2' },
      rawClaims: [],
      allowedEvidenceRefs: [],
    });
    expect(emptyOut.fit_score).toBeNull();
    expect(emptyOut.role_fit_label).toBe('Insufficient Evidence');
    expect(EvaluationOutputSchema.safeParse(emptyOut).success).toBe(true);
  });

  // ── Blocker 7 / F06: Provider selection preference vs strict mode ──────────
  it('B7 / F06: documents WORKBYLINE_AI_PROVIDER as preference and enforces WORKBYLINE_AI_STRICT_PROVIDER', async () => {
    process.env.WORKBYLINE_AI_PROVIDER = 'claude';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
    process.env.GROQ_API_KEY = 'gsk_test_key';
    delete process.env.WORKBYLINE_AI_STRICT_PROVIDER;

    const prefInv = getProviderInventory();
    const claudeEntry = prefInv.find(p => p.name === 'Claude');
    expect(claudeEntry.selectionMode).toBe('preference');
    expect(claudeEntry.isPreferred).toBe(true);

    // Preference mode falls back to Groq if Claude fails
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, text: async () => 'claude error' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
      });
    const fallbackRes = await generateChat('sys', 'usr', true);
    expect(fallbackRes).toEqual({ ok: true });

    // Strict mode does NOT fall back to Groq
    process.env.WORKBYLINE_AI_STRICT_PROVIDER = 'true';
    expect(getProviderInventory()[0].selectionMode).toBe('strict');
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, text: async () => 'claude strict error' });
    await expect(generateChat('sys', 'usr', true)).rejects.toThrow(/All providers failed/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
