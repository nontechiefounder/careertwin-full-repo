#!/usr/bin/env node
/**
 * WorkByLine V3 Behavioral Regression Suite (F01–F09 & Blockers 1–8)
 *
 * Executes production modules and PGlite PostgreSQL WASM SQL/RPC directly
 * (no source-string grepping). Full Next.js route + Vitest behavioral suites
 * live in apps/web/__tests__/evals/V3CloseoutBehavior.test.js and
 * apps/web/__tests__/api/screeningCompleteBehavior.test.js.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

import { resolveAuthoritativeFitScore, hasAuthoritativeEvaluation } from '../apps/web/lib/scoreUtils.js';
import { validateGroundedAnswer, verifySpanSupportsAnswer } from '../apps/web/lib/chatGrounding.js';
import { generateChat, getProviderInventory } from '../apps/web/lib/ai.js';

const aliasPlugin = {
  name: 'workbyline-aliases',
  setup(build) {
    build.onResolve({ filter: /^@packages\/(.+)$/ }, (args) => {
      const pkg = args.path.replace('@packages/', '');
      return { path: path.join(ROOT, 'packages', pkg, 'src/index.ts') };
    });
    build.onResolve({ filter: /^@\/(.+)$/ }, (args) => {
      const sub = args.path.replace('@/', '');
      return { path: path.join(ROOT, 'apps/web', sub) };
    });
  },
};

const tmpBundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbl-v3-reg-'));
async function loadBundledModule(entryRelPath) {
  const outFile = path.join(tmpBundleDir, `${path.basename(entryRelPath, path.extname(entryRelPath))}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(ROOT, entryRelPath)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: outFile,
    plugins: [aliasPlugin],
    logLevel: 'silent',
  });
  return import(pathToFileURL(outFile).href);
}

const { extractMultiSpanEvidenceAndClaims } = await loadBundledModule('apps/web/lib/evidenceExtractor.js');
const { evaluateCandidateTrustPacket } = await loadBundledModule('packages/proof-engine/src/index.ts');

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

console.log('=== WORKBYLINE V3 BEHAVIORAL REGRESSION SUITE (PRODUCTION CODE + PGLITE) ===\n');

// 1. PGlite PostgreSQL WASM test of 20260822000001_transactional_screening_completion.sql
await runTest('B4 / F07: Transactional screening completion RPC persists structured fields, replays idempotently, and rolls back on invalid scores', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE TABLE public.screening_sessions (
        id UUID PRIMARY KEY,
        status TEXT DEFAULT 'not_started',
        completed_at TIMESTAMPTZ
      );
      CREATE TABLE public.screening_summaries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID UNIQUE REFERENCES public.screening_sessions(id) ON DELETE CASCADE,
        summary_text TEXT,
        technical_score DOUBLE PRECISION,
        communication_score DOUBLE PRECISION,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const migrationSql = fs.readFileSync(
      path.join(ROOT, 'supabase/migrations/20260822000001_transactional_screening_completion.sql'),
      'utf8'
    );
    await db.exec(migrationSql);

    const sessionId = '22222222-2222-4222-a222-222222222222';
    await db.query('INSERT INTO public.screening_sessions (id, status) VALUES ($1, $2)', [sessionId, 'in_progress']);

    // Reject out-of-range score atomically (session stays in_progress, 0 summary rows)
    await assert.rejects(
      db.query(
        'SELECT public.complete_screening_session_transactional($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)',
        [sessionId, 'Bad score', 1.4, 0.8, '[]', '[]', null]
      ),
      /INVALID_TECHNICAL_SCORE/
    );
    const afterBad = await db.query('SELECT status FROM public.screening_sessions WHERE id = $1', [sessionId]);
    assert.equal(afterBad.rows[0].status, 'in_progress');

    // First completion succeeds with structured fields
    const first = await db.query(
      'SELECT public.complete_screening_session_transactional($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7) AS res',
      [
        sessionId,
        'Strong Postgres reliability.',
        0.86,
        0.92,
        JSON.stringify(['WAL tuning', 'Failover automation']),
        JSON.stringify(['Limited Rust']),
        'Advance to systems interview',
      ]
    );
    const firstRes = first.rows[0].res;
    assert.equal(firstRes.replayed, false);
    assert.deepEqual(firstRes.summary.strengths, ['WAL tuning', 'Failover automation']);
    assert.deepEqual(firstRes.summary.concerns, ['Limited Rust']);
    assert.equal(firstRes.summary.recommended_next_step, 'Advance to systems interview');

    // Second (concurrent/replay) call returns identical stored summary without overwriting
    const replay = await db.query(
      'SELECT public.complete_screening_session_transactional($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7) AS res',
      [sessionId, 'Overwrite attempt', 0.1, 0.1, JSON.stringify(['X']), JSON.stringify(['Y']), 'Reject']
    );
    const replayRes = replay.rows[0].res;
    assert.equal(replayRes.replayed, true);
    assert.deepEqual(replayRes.summary, firstRes.summary);

    // Least-privilege check: anon and authenticated cannot execute RPC
    const privs = await db.query(
      "SELECT has_function_privilege('anon', 'public.complete_screening_session_transactional(uuid,text,double precision,double precision,jsonb,jsonb,text)', 'EXECUTE') AS anon_exec, has_function_privilege('authenticated', 'public.complete_screening_session_transactional(uuid,text,double precision,double precision,jsonb,jsonb,text)', 'EXECUTE') AS auth_exec"
    );
    assert.equal(privs.rows[0].anon_exec, false);
    assert.equal(privs.rows[0].auth_exec, false);
  } finally {
    await db.close();
  }
});

// 2. Blocker 2: Grounded answer support vs citation mentions & counterexamples A/B/C
await runTest('B2 / F02: chatGrounding rejects counterexamples A/B/C, entity swaps, numeric reassignment, scope escalation, and refusal-prefix bypasses', async () => {
  const aliceSpans = [
    {
      documentId: 'src_1',
      documentName: 'evidence.pdf',
      versionId: 'ver_1',
      versionSha: 'abc12345',
      spanId: 'sp_1',
      text: 'Alice built Kubernetes services. Alice mentored Bob. Alice has 5 years of Python and 2 years of Go. Alice built some Kubernetes services in staging.',
    },
  ];

  // Counterexamples A, B, C
  assert.equal(validateGroundedAnswer('Alice never built Kubernetes services. See evidence.pdf.', aliceSpans, '').ok, false);
  assert.equal(validateGroundedAnswer('Alice built Kubernetes services and secretly committed financial fraud. See evidence.pdf.', aliceSpans, '').ok, false);
  const ceC = validateGroundedAnswer('I cannot answer everything. Alice stole confidential customer data.', [], '');
  assert.equal(ceC.ok, false);
  assert.equal(ceC.isAbstention, false);

  // Entity swap, numeric reassignment, scope escalation
  assert.equal(validateGroundedAnswer('Bob mentored Alice.', aliceSpans, '').ok, false);
  assert.equal(validateGroundedAnswer('Alice has 5 years of Go.', aliceSpans, '').ok, false);
  assert.equal(validateGroundedAnswer('Alice built all Kubernetes services in production.', aliceSpans, '').ok, false);

  // Supported controls & pure refusal
  const valid = validateGroundedAnswer('Alice built Kubernetes services. See evidence.pdf.', aliceSpans, '');
  assert.equal(valid.ok, true);
  assert.equal(valid.validatedSources.length, 1);
  const pureRefusal = validateGroundedAnswer('I cannot answer that request from authorized records.', [], '');
  assert.equal(pureRefusal.ok, true);
  assert.equal(pureRefusal.isAbstention, true);
});

// 3. Blocker 3: Intentional packet-null score preservation
await runTest('B3 / F03: resolveAuthoritativeFitScore preserves packet-null scores without stale row fallback', async () => {
  assert.equal(hasAuthoritativeEvaluation({ fit_score: null }), true);
  assert.equal(resolveAuthoritativeFitScore({ fit_score: null }, { fit_score: 0.91 }), null);
  assert.equal(resolveAuthoritativeFitScore({}, { fit_score: 0.91 }), 0.91);
  assert.equal(resolveAuthoritativeFitScore({ fit_score: 0.75 }, { fit_score: 0.2 }), 0.75);
});

// 4. F04: Evidence Extractor real execution
await runTest('F04: evidenceExtractor avoids Django->Go substring collision and clean/track-record false positives', async () => {
  const res = extractMultiSpanEvidenceAndClaims(
    {
      id: 'doc-1',
      filename: 'resume.pdf',
      normalized_text: 'Built Django APIs in Python with a strong track record. Clean criminal record.',
      evidence_provenance: { authored: false },
    },
    {
      id: 'run-1',
      must_haves: ['Go microservices', 'Python'],
      nice_to_haves: [],
      disqualifiers: ['Criminal record'],
    }
  );
  assert.equal(res.claims.some(c => c.status === 'CONFLICTING'), false);
  assert.equal(res.claims.some(c => c.claim_text.toLowerCase().includes('python')), true);
  assert.equal(res.claims.some(c => c.claim_text.toLowerCase().includes('go microservices')), false);
});

// 5. Blocker 7 / F06: Provider preference vs strict restriction & Claude call execution
await runTest('B7 / F06: ai.js treats WORKBYLINE_AI_PROVIDER as preference and enforces strict mode when enabled', async () => {
  const origEnv = { ...process.env };
  const origFetch = global.fetch;
  try {
    process.env.WORKBYLINE_AI_PROVIDER = 'claude';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.GROQ_API_KEY = 'gsk_test';
    delete process.env.WORKBYLINE_AI_STRICT_PROVIDER;

    const inv = getProviderInventory();
    assert.equal(inv.find(p => p.name === 'Claude').selectionMode, 'preference');
    assert.equal(inv.find(p => p.name === 'Claude').isPreferred, true);

    global.fetch = async (url) => {
      if (String(url).includes('anthropic.com')) {
        return {
          ok: true,
          json: async () => ({ content: [{ type: 'text', text: '{"provider":"claude"}' }] }),
        };
      }
      throw new Error('Unexpected fallback');
    };
    const out = await generateChat('sys', 'usr', true);
    assert.deepEqual(out, { provider: 'claude' });

    process.env.WORKBYLINE_AI_STRICT_PROVIDER = 'true';
    assert.equal(getProviderInventory()[0].selectionMode, 'strict');
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return { ok: false, text: async () => 'fail' };
    };
    await assert.rejects(generateChat('sys', 'usr', true), /All providers failed/);
    assert.equal(calls, 1);
  } finally {
    process.env = origEnv;
    global.fetch = origFetch;
  }
});

// 6. Blocker 6 / F05: Proof engine score-field semantics
await runTest('B6 / F05: evaluateCandidateTrustPacket separates verified_proof_score from assertion_alignment_score without altering fit_score', async () => {
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
  const resumeOnly = evaluateCandidateTrustPacket({
    hiringRun: run,
    rawCandidateData: { id: 'cand-1' },
    rawClaims: [
      { id: 'c1', requirement_id: 'mh_1', claim_text: 'Kubernetes', status: 'INFERRED', source_type: 'resume_assertion', evidence_refs: resumeEv },
      { id: 'c2', requirement_id: 'mh_2', claim_text: 'PostgreSQL', status: 'INFERRED', source_type: 'resume_assertion', evidence_refs: resumeEv },
    ],
    allowedEvidenceRefs: resumeEv,
  });
  assert.equal(resumeOnly.fit_score, 0.5);
  assert.equal(resumeOnly.verified_proof_score, 0);
  assert.equal(resumeOnly.assertion_alignment_score, 1);
  assert.equal(resumeOnly.gate_pass, false);

  const empty = evaluateCandidateTrustPacket({
    hiringRun: run,
    rawCandidateData: { id: 'cand-2' },
    rawClaims: [],
    allowedEvidenceRefs: [],
  });
  assert.equal(empty.fit_score, null);
  assert.equal(empty.role_fit_label, 'Insufficient Evidence');
});

fs.rmSync(tmpBundleDir, { recursive: true, force: true });

console.log('\n=== SUITE EXECUTION SUMMARY ===');
console.log(`Total checks: ${passed + failed} | Passed: ${passed} | Failed: ${failed}\n`);

if (failed > 0) {
  console.error('SOME CHECKS FAILED.');
  process.exit(1);
}
console.log('ALL BEHAVIORAL REGRESSION CHECKS PASSED.');
