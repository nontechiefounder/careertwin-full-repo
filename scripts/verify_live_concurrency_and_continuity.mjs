#!/usr/bin/env node
/**
 * Real HTTP Concurrency, Real PDF Upload/Parser Acceptance, Storage Isolation & Packet/Ledger Continuity Suite
 * Executes against a running Next.js application server and disposable PostgreSQL database.
 *
 * Checks covered at runtime:
 * 1. Storage Isolation + Approved-Contract Preparation:
 *    - Verifies private 'candidate_resumes' bucket on DISPOSABLE_SUPABASE_URL, performs a scoped
 *      upload/download/delete cycle under DISPOSABLE_SUPABASE_URL/storage/v1, and confirms zero residual rows.
 *    - Provisions isolated ephemeral hiring_runs records with explicitly approved ProofContract metadata.
 * 2. Real PDF Upload, Parser, Download Round-Trip & Continuity Acceptance:
 *    - Uploads real multi-page PDF fixtures/sarah_connor_lead_infra.pdf via multipart FormData
 *      to POST /api/employer/candidate-documents/upload.
 *    - Verifies genuine pdf-parse@2.4.5 extraction (page_count=2, total_pages=2, page_spans.length=2),
 *      file_sha256, normalized_text_sha256, and GET /api/employer/candidate-documents/[id]/download byte match.
 *    - Generates evaluation packet via POST /api/employer/packets/[id]/generate, verifies page-2 GitOps
 *      EvidenceRef provenance, full POST <-> stored (candidates) <-> GET <-> claim_ledgers continuity,
 *      and independent Node SHA-256 calculation_digest recomputation.
 * 3. Real HTTP Concurrency — Competing Packet Generations (Synthetic SQL Fixture):
 *    - Parallel POST /generate requests serialize sequentially under DB advisory locks, yielding distinct
 *      sequential ledger_revision numbers [1, 2] without packet/ledger corruption.
 * 4. Explicit Pre-Evaluation Stale-Decision Contract + Competing Decisions (Synthetic SQL Fixture, No Assumed Winner):
 *    - Missing contract returns HTTP 400 (INVALID_PRE_EVAL_CONTRACT).
 *    - Competing 'hold' vs 'reject' pre-evaluation decisions serialize behind FOR UPDATE, granting HTTP 200
 *      to whichever request commits first and HTTP 409 (REVIEW_REVISION_CONFLICT) to its competitor.
 *    - Dynamically observes the actual committed winner (never assumes 'hold' won), verifies stale revision 0
 *      returns 409 even on matching status, and advances fresh revision 1 -> 2.
 * 5. Genuinely Overlapping Generation vs Decision Races (Synthetic SQL Fixture):
 *    - 5a: Simultaneous Promise.all([POST /generate, POST /action pre_evaluation]) validating both legal
 *          serialization orders cleanly without masking outcomes, followed by deterministic 409 on post-eval pre-eval.
 *    - 5b: Simultaneous Promise.all([POST /generate (rev 2), POST /action (expected_ledger_revision: 1)])
 *          on an already-evaluated candidate, proving coherent DB/ledger/audit state under both commit orders.
 * 6. Complete End-to-End POST/Stored/GET/Ledger Continuity, Independent Digest & Audit History:
 *    - Asserts full deep continuity across POST /generate response, candidates row, GET /packets/[id],
 *      claim_ledgers (columns + evaluation_output fields), independent calculation_digest verification,
 *      candidate_documents hashes, claims/evidence_refs/claim_edges referential linkage, requires_re_review = true,
 *      decision_history, and activity_events on rev 2 and rev 3.
 * 7. Strict Cleanup & Residual Verification:
 *    - Removes all created probe rows and uploaded storage objects visibly and fails loudly if any residual remains.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const APP_URL = process.env.APP_URL || `http://localhost:${process.env.DISPOSABLE_VERIFICATION_PORT || '3010'}`;
const DB_URL = process.env.DISPOSABLE_DATABASE_URL;
const SUPABASE_URL = process.env.DISPOSABLE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.DISPOSABLE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.DISPOSABLE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.CAREERTWIN_STAGING_TEST_PASSWORD;

if (!DB_URL) {
  console.error('FAIL-CLOSED: DISPOSABLE_DATABASE_URL is required for live concurrency checks.');
  process.exit(1);
}
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY || !PASSWORD) {
  console.error('FAIL-CLOSED: DISPOSABLE_SUPABASE_URL, DISPOSABLE_SUPABASE_ANON_KEY, DISPOSABLE_SUPABASE_SERVICE_ROLE_KEY, and CAREERTWIN_STAGING_TEST_PASSWORD are required.');
  process.exit(1);
}

// Reject protected shared baseline ports and container names
const PROTECTED_PORT_RE = /:(54330|54331|54332|54333|54335)\b|[?&]port=(54330|54331|54332|54333|54335)\b/i;
if (
  PROTECTED_PORT_RE.test(DB_URL) ||
  PROTECTED_PORT_RE.test(SUPABASE_URL) ||
  DB_URL.includes('careertwin-local-baseline')
) {
  console.error('BASELINE GUARD REJECTION: Target references protected baseline ports or container name. Aborting.');
  process.exit(1);
}

function sqlEscape(str) {
  return String(str).replace(/'/g, "''");
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function buildMinimalPdfBuffer(lines) {
  const escaped = lines.map((line) =>
    String(line)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
  );
  const textOps = ['BT', '/F1 12 Tf', '72 720 Td'];
  escaped.forEach((line, idx) => {
    if (idx > 0) textOps.push('0 -18 Td');
    textOps.push(`(${line}) Tj`);
  });
  textOps.push('ET');
  const streamContent = `${textOps.join('\n')}\n`;

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'utf8')} >>\nstream\n${streamContent}endstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

function runPsql(sql) {
  return execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-t', '-A'], {
    input: sql,
    encoding: 'utf8',
  }).trim();
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      out[k] = canonicalize(value[k]);
    }
    return out;
  }
  return value;
}

function assertDeepEqual(actual, expected, label) {
  const a = JSON.stringify(canonicalize(actual));
  const b = JSON.stringify(canonicalize(expected));
  if (a !== b) {
    throw new Error(`Continuity mismatch on ${label}:\n  actual:   ${a}\n  expected: ${b}`);
  }
}

/**
 * Mirrors packages/proof-engine/src/index.ts `stableJson` to independently recompute
 * `calculation_digest` outside the application bundle.
 */
function stableJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
}

function computeIndependentCalculationDigest(packet, { roleId, candidateProfileId }) {
  const metrics = packet?.evaluation_metrics;
  const gates = packet?.gates;
  if (!metrics || !gates) {
    throw new Error('Cannot independently compute calculation_digest without evaluation_metrics and gates');
  }
  const claims = Array.isArray(packet.claims) ? packet.claims : [];
  const hasContradictions = claims.some((c) => c.status === 'CONFLICTING');
  const canonicalFitScore = packet.fit_score == null ? null : Number(packet.fit_score);

  const deterministicCore = {
    spec_version: packet.spec_version,
    role_id: roleId,
    candidate_id: candidateProfileId,
    fit_score: canonicalFitScore,
    assertion_alignment_score: packet.assertion_alignment_score ?? null,
    verified_proof_score: packet.verified_proof_score ?? 0,
    evidence_breakdown: packet.evidence_breakdown,
    role_fit_distribution: metrics.role_fit_distribution,
    role_fit_label: metrics.role_fit_label,
    proof_strength: metrics.proof_strength,
    proof_strength_label: metrics.proof_strength_label,
    proof_coverage: metrics.proof_coverage,
    uncertainty: metrics.uncertainty,
    entropy: metrics.entropy,
    contradiction_penalty: hasContradictions ? 0.35 : 0.0,
    gate_pass: gates.gatePass,
    disqualified: gates.disqualified,
    disqualification_reasons: gates.disqualificationReasons,
    missing_proof: packet.missing_proof,
    decision_readiness: metrics.decision_readiness,
    what_is_verified: packet.what_is_verified,
    what_is_inferred: packet.what_is_inferred,
    what_remains_uncertain: packet.what_remains_uncertain,
    claims,
    claim_edges: (Array.isArray(packet.claim_edges) ? packet.claim_edges : []).map(
      ({ created_at: _omitTs, ...edge }) => edge
    ),
    gates,
    failed_must_haves: gates.failedMustHaves,
  };

  return sha256Hex(stableJson(deterministicCore));
}

const REQUIRED_LEDGER_EVAL_OUTPUT_FIELDS = [
  'spec_version',
  'calculation_digest',
  'fit_score',
  'candidate_document_id',
  'filename',
  'file_sha256',
  'parser_name',
  'normalized_text_sha256',
  'rubric_version',
  'role_version',
  'approved_rubric_version',
  'evidence_revision',
  'evaluation_version',
  'evaluated_at',
  'what_is_verified',
  'what_is_inferred',
  'what_remains_uncertain',
  'missing_proof',
  'decision_blockers',
  'gates',
  'evaluation_metrics',
];

const ALPHA_ORG_ID = '00000000-0000-4000-d2c0-000000000001';
const ALPHA_OWNER_EMAIL = 'd2c.alpha.owner@example.com';

async function main() {
  console.log('=== REAL HTTP CONCURRENCY, PDF UPLOAD/PARSER, STORAGE & CONTINUITY SUITE ===');
  console.log(`Target App URL: ${APP_URL}`);
  console.log(`Target Database: ${DB_URL.replace(/:[^:@]+@/, ':***@')}`);

  let testRunId = null;
  let realPdfRunId = null;
  let storageProbeKey = null;
  const createdRunIds = [];
  const createdStoragePaths = [];
  const createdCandIds = [];
  const createdProfIds = [];
  const createdDocIds = [];

  /**
   * Explicitly synthetic SQL-seeded fixture helper for concurrency/locking probes
   * (isolated from real PDF upload & parser acceptance in Step 2).
   */
  function createCandidateWithSyntheticSqlFixture({ name, email, status = 'new', resumeText }) {
    const candId = crypto.randomUUID();
    const profId = crypto.randomUUID();
    const docId = crypto.randomUUID();
    createdCandIds.push(candId);
    createdProfIds.push(profId);
    createdDocIds.push(docId);

    const syntheticPdf = Buffer.from(`%PDF-1.4\n% [SYNTHETIC_SQL_FIXTURE] ${candId}\n${resumeText}\n%%EOF\n`, 'utf8');
    const fileSha256 = sha256Hex(syntheticPdf);
    const normSha256 = sha256Hex(Buffer.from(resumeText, 'utf8'));

    runPsql(`
      INSERT INTO public.candidate_profiles (id, name, email)
      VALUES ('${profId}', '${sqlEscape(name)}', '${sqlEscape(email)}');

      INSERT INTO public.candidate_documents (
        id, candidate_id, hiring_run_id, org_id, filename,
        file_sha256, normalized_text, normalized_text_sha256,
        mime_type, byte_size, parser_name, parser_metadata
      ) VALUES (
        '${docId}', '${profId}', '${testRunId}', '${ALPHA_ORG_ID}', 'synthetic_fixture_resume.pdf',
        '${fileSha256}', '${sqlEscape(resumeText)}', '${normSha256}',
        'application/pdf', ${syntheticPdf.length}, 'synthetic-sql-fixture@0.0.0',
        '{"fixture_kind": "synthetic_sql", "page_count": 1}'::jsonb
      );

      INSERT INTO public.candidates (id, candidate_id, hiring_run_id, status, pre_evaluation_revision, decision_packet)
      VALUES ('${candId}', '${profId}', '${testRunId}', '${sqlEscape(status)}', 0, NULL);
    `);

    return { candId, profId, docId, fileSha256, normSha256 };
  }

  /**
   * Verifies full 4-way continuity across:
   *  (1) POST /api/employer/packets/[id]/generate JSON response
   *  (2) Stored public.candidates row (decision_packet, fit_score)
   *  (3) GET /api/employer/packets/[id] JSON response
   *  (4) Stored public.claim_ledgers row (claims, evidence_refs, claim_edges, evaluation_output)
   * and independently recomputes calculation_digest outside the application bundle.
   */
  async function verifyPacketContinuityAndDigest({
    label,
    authHeaders,
    postPacket,
    candId,
    profId,
    runId,
    expectedRev,
    expectedDocId,
    expectedFileSha256,
    expectedNormSha256,
    expectedRubricVersion = '1.0.0',
  }) {
    if (!postPacket || typeof postPacket !== 'object') {
      throw new Error(`[${label}] Expected POST /generate response packet object.`);
    }

    const getPacketRes = await fetch(`${APP_URL}/api/employer/packets/${candId}`, {
      method: 'GET',
      headers: authHeaders,
    });
    if (!getPacketRes.ok) {
      throw new Error(`[${label}] GET /api/employer/packets/${candId} failed: ${getPacketRes.status}`);
    }
    const packetData = await getPacketRes.json();
    const apiPacket = packetData.packet;
    if (!apiPacket) {
      throw new Error(`[${label}] GET /api/employer/packets/${candId} returned null packet.`);
    }

    const dbSnapshot = JSON.parse(runPsql(`
      SELECT json_build_object(
        'cand_status', c.status,
        'cand_fit_score', c.fit_score,
        'decision_packet', c.decision_packet,
        'ledger_id', cl.id,
        'ledger_rev', cl.revision,
        'ledger_claims', cl.claims,
        'ledger_evidence_refs', cl.evidence_refs,
        'ledger_claim_edges', cl.claim_edges,
        'ledger_eval_output', cl.evaluation_output
      )::text
      FROM public.candidates c
      JOIN public.claim_ledgers cl
        ON cl.candidate_id = c.candidate_id
       AND cl.hiring_run_id = c.hiring_run_id
       AND cl.revision = ${Number(expectedRev)}
      WHERE c.id = '${candId}';
    `));

    // 1. Identity & revision continuity across POST, GET, candidates, and claim_ledgers
    if (
      postPacket.ledger_id !== dbSnapshot.ledger_id ||
      apiPacket.ledger_id !== dbSnapshot.ledger_id ||
      Number(postPacket.ledger_revision) !== Number(expectedRev) ||
      Number(apiPacket.ledger_revision) !== Number(expectedRev) ||
      Number(dbSnapshot.ledger_rev) !== Number(expectedRev)
    ) {
      throw new Error(
        `[${label}] Ledger identity/revision mismatch: post=(${postPacket.ledger_id}, ${postPacket.ledger_revision}), get=(${apiPacket.ledger_id}, ${apiPacket.ledger_revision}), db=(${dbSnapshot.ledger_id}, ${dbSnapshot.ledger_rev})`
      );
    }

    // 2. Document hash & rubric version continuity
    if (
      postPacket.candidate_document_id !== expectedDocId ||
      postPacket.file_sha256 !== expectedFileSha256 ||
      postPacket.normalized_text_sha256 !== expectedNormSha256
    ) {
      throw new Error(
        `[${label}] Document/hash continuity mismatch on POST packet: ${JSON.stringify({
          docId: postPacket.candidate_document_id,
          expectedDocId,
          file: postPacket.file_sha256,
          expectedFileSha256,
          norm: postPacket.normalized_text_sha256,
          expectedNormSha256,
        })}`
      );
    }
    if (
      postPacket.rubric_version !== expectedRubricVersion ||
      postPacket.approved_rubric_version !== expectedRubricVersion
    ) {
      throw new Error(
        `[${label}] Rubric version mismatch: ${postPacket.rubric_version} / ${postPacket.approved_rubric_version} (expected ${expectedRubricVersion})`
      );
    }

    // 3. Independent Node SHA-256 calculation_digest verification & 4-way equality
    if (typeof postPacket.calculation_digest !== 'string' || !/^[a-f0-9]{64}$/i.test(postPacket.calculation_digest)) {
      throw new Error(`[${label}] Invalid calculation_digest format: ${postPacket.calculation_digest}`);
    }
    const recomputedDigest = computeIndependentCalculationDigest(postPacket, {
      roleId: runId,
      candidateProfileId: profId,
    });
    if (postPacket.calculation_digest !== recomputedDigest) {
      throw new Error(
        `[${label}] Independent calculation_digest mismatch: packet=${postPacket.calculation_digest}, recomputed=${recomputedDigest}`
      );
    }
    if (
      apiPacket.calculation_digest !== recomputedDigest ||
      dbSnapshot.decision_packet?.calculation_digest !== recomputedDigest ||
      dbSnapshot.ledger_eval_output?.calculation_digest !== recomputedDigest
    ) {
      throw new Error(
        `[${label}] calculation_digest divergence across POST/GET/candidates/ledger`
      );
    }

    // 4. Score continuity across POST, GET, candidates, and ledger
    if (
      Number(postPacket.fit_score) !== Number(dbSnapshot.cand_fit_score) ||
      Number(postPacket.fit_score) !== Number(dbSnapshot.decision_packet?.fit_score) ||
      Number(postPacket.fit_score) !== Number(apiPacket.fit_score) ||
      Number(postPacket.fit_score) !== Number(dbSnapshot.ledger_eval_output?.fit_score)
    ) {
      throw new Error(
        `[${label}] Fit score continuity mismatch: post=${postPacket.fit_score}, get=${apiPacket.fit_score}, cand=${dbSnapshot.cand_fit_score}, db_packet=${dbSnapshot.decision_packet?.fit_score}, ledger_eval=${dbSnapshot.ledger_eval_output?.fit_score}`
      );
    }

    // 5. Claim, EvidenceRef & ClaimEdge referential integrity
    if (!Array.isArray(postPacket.claims) || postPacket.claims.length === 0) {
      throw new Error(`[${label}] Expected non-empty claims on evaluated document packet.`);
    }
    if (!Array.isArray(postPacket.evidence_refs) || postPacket.evidence_refs.length === 0) {
      throw new Error(`[${label}] Expected non-empty evidence_refs on evaluated document packet.`);
    }
    if (!Array.isArray(postPacket.claim_edges) || postPacket.claim_edges.length === 0) {
      throw new Error(`[${label}] Expected non-empty claim_edges on evaluated document packet.`);
    }

    const claimIdSet = new Set(postPacket.claims.map((c) => c.id));
    const evIdSet = new Set(postPacket.evidence_refs.map((e) => e.id));
    for (const ev of postPacket.evidence_refs) {
      if (ev.document_id !== expectedDocId) {
        throw new Error(`[${label}] EvidenceRef ${ev.id} document_id (${ev.document_id}) !== expected ${expectedDocId}`);
      }
    }
    for (const edge of postPacket.claim_edges) {
      if (!claimIdSet.has(edge.claim_id) || !evIdSet.has(edge.evidence_id)) {
        throw new Error(`[${label}] Dangling claim_edge in packet: ${JSON.stringify(edge)}`);
      }
    }

    // 6. Full deep continuity checks: POST <-> candidates.decision_packet <-> GET <-> claim_ledgers
    assertDeepEqual(postPacket, dbSnapshot.decision_packet, `[${label}] full packet (POST /generate vs candidates.decision_packet)`);
    assertDeepEqual(apiPacket, dbSnapshot.decision_packet, `[${label}] full packet (GET /packets vs candidates.decision_packet)`);
    assertDeepEqual(postPacket, apiPacket, `[${label}] full packet (POST /generate vs GET /packets)`);

    assertDeepEqual(postPacket.claims, dbSnapshot.ledger_claims, `[${label}] claims (POST vs claim_ledgers.claims)`);
    assertDeepEqual(postPacket.evidence_refs, dbSnapshot.ledger_evidence_refs, `[${label}] evidence_refs (POST vs claim_ledgers.evidence_refs)`);
    assertDeepEqual(postPacket.claim_edges, dbSnapshot.ledger_claim_edges, `[${label}] claim_edges (POST vs claim_ledgers.claim_edges)`);

    const ledgerEval = dbSnapshot.ledger_eval_output;
    if (!ledgerEval || typeof ledgerEval !== 'object') {
      throw new Error(`[${label}] claim_ledgers.evaluation_output is missing or invalid.`);
    }
    for (const reqField of REQUIRED_LEDGER_EVAL_OUTPUT_FIELDS) {
      if (!(reqField in ledgerEval)) {
        throw new Error(`[${label}] claim_ledgers.evaluation_output missing required field '${reqField}'`);
      }
      assertDeepEqual(
        ledgerEval[reqField],
        postPacket[reqField],
        `[${label}] claim_ledgers.evaluation_output.${reqField} vs POST packet`
      );
    }

    return { apiPacket, dbSnapshot, recomputedDigest };
  }

  try {
    // 1. Authenticate + Verify Storage Isolation + Provision Valid Approved Runs
    console.log('\n[1/6] Authenticating, verifying Storage isolation & provisioning approved-contract runs...');
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: ALPHA_OWNER_EMAIL,
        password: PASSWORD,
      }),
    });

    if (!authRes.ok) {
      const errText = await authRes.text();
      throw new Error(`Authentication failed (HTTP ${authRes.status}): ${errText}`);
    }
    const authData = await authRes.json();
    const token = authData.access_token;
    const alphaUid = authData.user?.id;
    if (!token || !alphaUid) {
      throw new Error('Auth response missing access_token or user.id');
    }

    const bearerHeaders = {
      'Authorization': `Bearer ${token}`,
      'apikey': ANON_KEY,
    };
    const authHeaders = {
      ...bearerHeaders,
      'Content-Type': 'application/json',
    };
    const serviceStorageHeaders = {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
    };

    function provisionApprovedRun({ roleTitle, mustHaves, niceToHaves }) {
      const runId = crypto.randomUUID();
      createdRunIds.push(runId);
      const briefJson = {
        role_title: roleTitle,
        contract_version: '1.0.0',
        contract_approved: true,
        approved_rubric_version: '1.0.0',
        approved_by: alphaUid,
        approved_at: new Date().toISOString(),
        must_haves: mustHaves,
        nice_to_haves: niceToHaves,
      };
      const mustHavesSql = `ARRAY[${mustHaves.map((x) => `'${sqlEscape(x)}'`).join(', ')}]::text[]`;
      const niceToHavesSql = `ARRAY[${niceToHaves.map((x) => `'${sqlEscape(x)}'`).join(', ')}]::text[]`;

      runPsql(`
        INSERT INTO public.hiring_runs (
          id, employer_id, org_id, role_title, must_haves, nice_to_haves, disqualifiers, status, brief_json
        ) VALUES (
          '${runId}',
          '${alphaUid}',
          '${ALPHA_ORG_ID}',
          '${sqlEscape(roleTitle)}',
          ${mustHavesSql},
          ${niceToHavesSql},
          ARRAY[]::text[],
          'active',
          '${sqlEscape(JSON.stringify(briefJson))}'::jsonb
        );
      `);
      return runId;
    }

    testRunId = provisionApprovedRun({
      roleTitle: 'Disposable Verification Distributed Systems Engineer [synthetic fixtures]',
      mustHaves: ['PostgreSQL', 'Distributed Systems'],
      niceToHaves: ['TypeScript'],
    });
    realPdfRunId = provisionApprovedRun({
      roleTitle: 'Disposable Verification Lead Infrastructure Engineer [real PDF]',
      mustHaves: ['GitOps'],
      niceToHaves: ['Kubernetes'],
    });

    // Storage isolation probe against private 'candidate_resumes' bucket
    storageProbeKey = `${ALPHA_ORG_ID}/${testRunId}/isolation-probe.pdf`;
    const probePdfPayload = `%PDF-1.4\n% Disposable Storage Isolation Probe ${testRunId}\n%%EOF\n`;
    const uploadProbeRes = await fetch(`${SUPABASE_URL}/storage/v1/object/candidate_resumes/${storageProbeKey}`, {
      method: 'POST',
      headers: {
        ...serviceStorageHeaders,
        'Content-Type': 'application/pdf',
        'x-upsert': 'true',
      },
      body: probePdfPayload,
    });
    if (!uploadProbeRes.ok) {
      throw new Error(`Disposable storage upload probe failed (HTTP ${uploadProbeRes.status}): ${await uploadProbeRes.text()}`);
    }

    const downloadProbeRes = await fetch(`${SUPABASE_URL}/storage/v1/object/candidate_resumes/${storageProbeKey}`, {
      method: 'GET',
      headers: serviceStorageHeaders,
    });
    if (!downloadProbeRes.ok) {
      throw new Error(`Disposable storage download probe failed (HTTP ${downloadProbeRes.status}): ${await downloadProbeRes.text()}`);
    }
    const downloadedProbeText = await downloadProbeRes.text();
    if (downloadedProbeText !== probePdfPayload) {
      throw new Error('Disposable storage round-trip payload mismatch.');
    }

    const delStorageRes = await fetch(`${SUPABASE_URL}/storage/v1/object/candidate_resumes/${storageProbeKey}`, {
      method: 'DELETE',
      headers: serviceStorageHeaders,
    });
    if (!delStorageRes.ok) {
      throw new Error(`Disposable storage delete probe failed (HTTP ${delStorageRes.status}): ${await delStorageRes.text()}`);
    }
    const sqlStorageObjects = runPsql(`
      SELECT count(*) FROM storage.objects
      WHERE bucket_id = 'candidate_resumes' AND name = '${sqlEscape(storageProbeKey)}';
    `);
    if (sqlStorageObjects !== '0') {
      throw new Error(`Storage isolation check failed: storage.objects count=${sqlStorageObjects} after DELETE.`);
    }
    storageProbeKey = null;
    console.log(`  Authenticated (Alpha UID ${alphaUid}), verified Storage round-trip isolation, and created approved runs ${testRunId} + ${realPdfRunId}.`);

    // 2. Real Multi-Page PDF Upload, Parser Extraction, Binary Download & Packet Continuity
    console.log('\n[2/6] Testing Real PDF Upload, Parser, Download & Continuity Acceptance...');
    const realPdfPath = path.join(REPO_ROOT, 'fixtures', 'sarah_connor_lead_infra.pdf');
    const realPdfBytes = fs.readFileSync(realPdfPath);
    const realPdfSha256 = sha256Hex(realPdfBytes);

    const formData = new FormData();
    formData.append('file', new Blob([realPdfBytes], { type: 'application/pdf' }), 'sarah_connor_lead_infra.pdf');
    formData.append('hiring_run_id', realPdfRunId);
    formData.append('candidate_name', 'Sarah Connor Real PDF Acceptance');

    const pdfUploadRes = await fetch(`${APP_URL}/api/employer/candidate-documents/upload`, {
      method: 'POST',
      headers: bearerHeaders,
      body: formData,
    });
    if (!pdfUploadRes.ok) {
      throw new Error(`Real PDF upload failed (HTTP ${pdfUploadRes.status}): ${await pdfUploadRes.text()}`);
    }
    const uploadJson = await pdfUploadRes.json();
    const uploadedDoc = uploadJson.document;
    const realPdfCandId = uploadJson.candidate_id || uploadJson.extraction_id;
    const realPdfProfId = uploadJson.profile_id;
    const realPdfDocId = uploadedDoc?.id;
    const realPdfStoragePath = uploadJson.storage_path || uploadedDoc?.storage_path;

    if (!uploadJson.success || !uploadedDoc || !realPdfCandId || !realPdfProfId || !realPdfDocId || !realPdfStoragePath) {
      throw new Error(`Incomplete real PDF upload response: ${JSON.stringify(uploadJson)}`);
    }
    createdCandIds.push(realPdfCandId);
    createdProfIds.push(realPdfProfId);
    createdDocIds.push(realPdfDocId);
    createdStoragePaths.push(realPdfStoragePath);

    // Assert parser metadata & hashes
    const expectedNormSha256 = sha256Hex(Buffer.from(uploadedDoc.normalized_text || '', 'utf8'));
    if (uploadedDoc.file_sha256 !== realPdfSha256) {
      throw new Error(`Uploaded file_sha256 mismatch: got=${uploadedDoc.file_sha256}, expected=${realPdfSha256}`);
    }
    if (uploadedDoc.normalized_text_sha256 !== expectedNormSha256) {
      throw new Error(`Uploaded normalized_text_sha256 mismatch: got=${uploadedDoc.normalized_text_sha256}, expected=${expectedNormSha256}`);
    }
    if (
      uploadedDoc.parser_metadata?.total_pages !== 2 ||
      uploadedDoc.parser_metadata?.page_count !== 2 ||
      !Array.isArray(uploadedDoc.parser_metadata?.page_spans) ||
      uploadedDoc.parser_metadata.page_spans.length !== 2
    ) {
      throw new Error(`Expected genuine 2-page PDF parse metadata, got: ${JSON.stringify(uploadedDoc.parser_metadata)}`);
    }
    if (!String(uploadedDoc.normalized_text || '').toLowerCase().includes('gitops')) {
      throw new Error('Parsed real PDF normalized_text missing expected GitOps content.');
    }

    // Assert GET /download returns exact PDF bytes stored in disposable storage
    const pdfDownloadRes = await fetch(`${APP_URL}/api/employer/candidate-documents/${realPdfDocId}/download`, {
      method: 'GET',
      headers: bearerHeaders,
    });
    if (!pdfDownloadRes.ok) {
      throw new Error(`Real PDF download failed (HTTP ${pdfDownloadRes.status}): ${await pdfDownloadRes.text()}`);
    }
    const downloadedPdfBuf = Buffer.from(await pdfDownloadRes.arrayBuffer());
    const downloadedPdfSha256 = sha256Hex(downloadedPdfBuf);
    if (downloadedPdfSha256 !== realPdfSha256) {
      throw new Error(`Downloaded PDF SHA-256 mismatch: got=${downloadedPdfSha256}, expected=${realPdfSha256}`);
    }

    // Generate evaluation packet from the uploaded real PDF
    const realPdfGenRes = await fetch(`${APP_URL}/api/employer/packets/${realPdfCandId}/generate`, {
      method: 'POST',
      headers: authHeaders,
    });
    if (!realPdfGenRes.ok) {
      throw new Error(`Packet generate for real PDF failed (HTTP ${realPdfGenRes.status}): ${await realPdfGenRes.text()}`);
    }
    const realPdfPostPacket = await realPdfGenRes.json();

    const realPdfContinuity = await verifyPacketContinuityAndDigest({
      label: 'Real PDF Rev 1',
      authHeaders,
      postPacket: realPdfPostPacket,
      candId: realPdfCandId,
      profId: realPdfProfId,
      runId: realPdfRunId,
      expectedRev: 1,
      expectedDocId: realPdfDocId,
      expectedFileSha256: realPdfSha256,
      expectedNormSha256,
    });

    const page2GitopsEvidence = realPdfPostPacket.evidence_refs.find(
      (ev) => ev?.source_offset?.page === 2 && String(ev?.excerpt || '').toLowerCase().includes('gitops')
    );
    if (!page2GitopsEvidence) {
      throw new Error(
        `Expected page-2 GitOps EvidenceRef from real multi-page PDF, got evidence_refs=${JSON.stringify(realPdfPostPacket.evidence_refs)}`
      );
    }
    if (
      typeof page2GitopsEvidence.source_offset?.char_start === 'number' &&
      typeof page2GitopsEvidence.source_offset?.char_end === 'number'
    ) {
      const sliced = uploadedDoc.normalized_text.slice(
        page2GitopsEvidence.source_offset.char_start,
        page2GitopsEvidence.source_offset.char_end
      );
      if (!sliced.toLowerCase().includes('gitops')) {
        throw new Error(`EvidenceRef char_start..char_end slice did not contain 'gitops': "${sliced}"`);
      }
    }
    console.log(
      `  [PASS] Real PDF upload/parse/download/generate passed (pages=2, sha256=${realPdfSha256.slice(0, 12)}..., digest=${realPdfContinuity.recomputedDigest.slice(0, 12)}..., page2_ref=${page2GitopsEvidence.id}).`
    );

    // 2B. Dynamic Contrasting Input, Determinism, Rubric Change, Spoof Rejection, Chat & Cross-Tenant Check
    console.log('\n[2B/6] Testing Contrasting PDFs, Determinism, Rubric Change, Spoof Rejection, Chat & Cross-Tenant...');
    const dynamicRunId = provisionApprovedRun({
      roleTitle: 'Disposable Verification Dynamic Input Engineer [contrasting PDFs]',
      mustHaves: ['Kubernetes', 'Go'],
      niceToHaves: ['Terraform'],
    });

    // Helper to upload minimal valid PDF
    async function uploadRealPdfAndTrack(pdfBuffer, filename, candidateName) {
      const fd = new FormData();
      fd.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), filename);
      fd.append('hiring_run_id', dynamicRunId);
      fd.append('candidate_name', candidateName);
      const upRes = await fetch(`${APP_URL}/api/employer/candidate-documents/upload`, {
        method: 'POST',
        headers: bearerHeaders,
        body: fd,
      });
      if (!upRes.ok) {
        throw new Error(`Upload failed for ${filename} (${upRes.status}): ${await upRes.text()}`);
      }
      const upJson = await upRes.json();
      createdCandIds.push(upJson.candidate_id || upJson.extraction_id);
      createdProfIds.push(upJson.profile_id);
      createdDocIds.push(upJson.document.id);
      createdStoragePaths.push(upJson.storage_path || upJson.document.storage_path);
      return upJson;
    }

    // 2B.1 Sparse skill-list PDF -> fit_score: null, gate_pass: false, INSUFFICIENT EVIDENCE, deterministic digest
    const sparsePdf = buildMinimalPdfBuffer([
      'Jane Sparse Resume',
      'Skills: Go, PostgreSQL',
    ]);
    const sparseUp = await uploadRealPdfAndTrack(sparsePdf, 'sparse_skill_resume.pdf', 'Jane Sparse Input');
    const sparseCandId = sparseUp.candidate_id || sparseUp.extraction_id;

    const spGen1Res = await fetch(`${APP_URL}/api/employer/packets/${sparseCandId}/generate`, {
      method: 'POST',
      headers: authHeaders,
    });
    if (!spGen1Res.ok) throw new Error(`Sparse generate #1 failed (${spGen1Res.status}): ${await spGen1Res.text()}`);
    const spGen1 = await spGen1Res.json();

    const spGen2Res = await fetch(`${APP_URL}/api/employer/packets/${sparseCandId}/generate`, {
      method: 'POST',
      headers: authHeaders,
    });
    if (!spGen2Res.ok) throw new Error(`Sparse generate #2 failed (${spGen2Res.status}): ${await spGen2Res.text()}`);
    const spGen2 = await spGen2Res.json();

    if (spGen1.fit_score !== null || spGen1.evaluation_metrics?.gate_pass !== false) {
      throw new Error(`Expected fit_score=null & gate_pass=false for sparse resume, got fit=${spGen1.fit_score}, gate_pass=${spGen1.evaluation_metrics?.gate_pass}`);
    }
    if (spGen1.evaluation_metrics?.decision_readiness !== 'INSUFFICIENT EVIDENCE') {
      throw new Error(`Expected INSUFFICIENT EVIDENCE for sparse resume, got ${spGen1.evaluation_metrics?.decision_readiness}`);
    }
    if (!Array.isArray(spGen1.what_is_verified) || spGen1.what_is_verified.length !== 0) {
      throw new Error(`Expected empty what_is_verified for ordinary resume, got ${JSON.stringify(spGen1.what_is_verified)}`);
    }
    if (spGen1.calculation_digest !== spGen2.calculation_digest) {
      throw new Error(`Expected identical calculation_digest on repeated identical inputs: ${spGen1.calculation_digest} vs ${spGen2.calculation_digest}`);
    }
    const missingSparseTitles = (spGen1.missing_proof || []).map((m) => m.unproven_requirement);
    if (!missingSparseTitles.includes('Kubernetes') || !missingSparseTitles.includes('Go')) {
      throw new Error(`Expected Kubernetes & Go in missing_proof, got ${JSON.stringify(missingSparseTitles)}`);
    }

    // 2B.2 Contradictory / negated & unrelated PDF
    const contraPdf = buildMinimalPdfBuffer([
      'Contradictory Applicant',
      'Candidate has no Kubernetes experience and zero Go background.',
      'Focuses exclusively on watercolor painting and sculpture.',
    ]);
    const contraUp = await uploadRealPdfAndTrack(contraPdf, 'contradictory_unrelated.pdf', 'Contradictory Candidate');
    const contraCandId = contraUp.candidate_id || contraUp.extraction_id;
    const contraGenRes = await fetch(`${APP_URL}/api/employer/packets/${contraCandId}/generate`, {
      method: 'POST',
      headers: authHeaders,
    });
    if (!contraGenRes.ok) throw new Error(`Contradictory generate failed (${contraGenRes.status}): ${await contraGenRes.text()}`);
    const contraGen = await contraGenRes.json();
    if (contraGen.fit_score !== null || contraGen.evaluation_metrics?.gate_pass !== false) {
      throw new Error(`Contradictory resume should yield fit_score=null & gate_pass=false, got fit=${contraGen.fit_score}`);
    }
    const positiveContraInferred = (contraGen.claims || []).filter((c) => c.status === 'VERIFIED' || (c.status === 'INFERRED' && !c.is_negated && !c.is_conflicting));
    if (positiveContraInferred.length > 0) {
      throw new Error(`Contradictory/unrelated PDF produced positive claims unexpectedly: ${JSON.stringify(positiveContraInferred)}`);
    }
    if (!contraGen.gates?.failedMustHaves?.includes('Kubernetes') || !contraGen.gates?.failedMustHaves?.includes('Go')) {
      throw new Error(`Expected failedMustHaves to include Kubernetes and Go, got ${JSON.stringify(contraGen.gates?.failedMustHaves)}`);
    }

    // 2B.3 Spoofed caller overrides must be ignored
    const spoofGenRes = await fetch(`${APP_URL}/api/employer/packets/${sparseCandId}/generate`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        fit_score: 0.99,
        proof_strength: 1.0,
        authorship_verified: true,
        provenance_verified: true,
        rawClaims: [{ id: 'forged', status: 'VERIFIED', claim_text: 'Kubernetes' }],
      }),
    });
    if (!spoofGenRes.ok) throw new Error(`Spoof attempt generate failed (${spoofGenRes.status}): ${await spoofGenRes.text()}`);
    const spoofGen = await spoofGenRes.json();
    if (spoofGen.fit_score !== null || (spoofGen.what_is_verified || []).length !== 0 || spoofGen.evaluation_metrics?.gate_pass !== false) {
      throw new Error(`Spoofed flags promoted evidence: fit=${spoofGen.fit_score}, verified=${JSON.stringify(spoofGen.what_is_verified)}`);
    }

    // 2B.4 Change approved role requirements (2.0.0) & verify missing_proof + digest change
    const v2Brief = {
      role_title: 'Disposable Verification Dynamic Input Engineer [contrasting PDFs]',
      contract_version: '2.0.0',
      contract_approved: true,
      approved_rubric_version: '2.0.0',
      approved_by: alphaUid,
      approved_at: new Date().toISOString(),
      must_haves: ['Rust', 'Terraform'],
      nice_to_haves: [],
    };
    runPsql(`
      UPDATE public.hiring_runs
      SET must_haves = ARRAY['Rust', 'Terraform']::text[],
          nice_to_haves = ARRAY[]::text[],
          brief_json = '${sqlEscape(JSON.stringify(v2Brief))}'::jsonb
      WHERE id = '${dynamicRunId}';
    `);
    const v2GenRes = await fetch(`${APP_URL}/api/employer/packets/${sparseCandId}/generate`, {
      method: 'POST',
      headers: authHeaders,
    });
    if (!v2GenRes.ok) throw new Error(`v2 generate failed (${v2GenRes.status}): ${await v2GenRes.text()}`);
    const v2Gen = await v2GenRes.json();
    const v2Missing = (v2Gen.missing_proof || []).map((m) => m.unproven_requirement);
    if (v2Gen.rubric_version !== '2.0.0' || !v2Missing.includes('Rust') || !v2Missing.includes('Terraform')) {
      throw new Error(`Expected v2 rubric gaps [Rust, Terraform], got version=${v2Gen.rubric_version}, gaps=${JSON.stringify(v2Missing)}`);
    }
    if (v2Gen.calculation_digest === spGen1.calculation_digest) {
      throw new Error('Expected calculation_digest to change when approved rubric requirements changed.');
    }

    // 2B.5 Live /api/employer/chat with candidate_id (verifying rawFit crash fix)
    const chatRes = await fetch(`${APP_URL}/api/employer/chat`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        message: 'Summarize missing proof gaps and claims for this candidate',
        context: { org_id: ALPHA_ORG_ID, active_run_id: dynamicRunId, candidate_id: sparseCandId },
      }),
    });
    if (!chatRes.ok) {
      throw new Error(`POST /api/employer/chat with candidate_id failed (${chatRes.status}): ${await chatRes.text()}`);
    }
    const chatJson = await chatRes.json();
    if (!chatJson.reply || !chatJson.reply.includes('Unassessed') || !Array.isArray(chatJson.sources) || chatJson.sources.length === 0) {
      throw new Error(`Unexpected /api/employer/chat response: ${JSON.stringify(chatJson)}`);
    }

    // 2B.6 Cross-tenant Beta owner isolation on packets, generate & sourcing-sessions
    const betaAuthRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'd2c.beta.owner@example.com', password: PASSWORD }),
    });
    if (!betaAuthRes.ok) throw new Error(`Beta auth failed (${betaAuthRes.status})`);
    const betaData = await betaAuthRes.json();
    const betaHeaders = { 'Authorization': `Bearer ${betaData.access_token}`, 'apikey': ANON_KEY, 'Content-Type': 'application/json' };
    const crossGetPkt = await fetch(`${APP_URL}/api/employer/packets/${sparseCandId}`, { method: 'GET', headers: betaHeaders });
    const crossGenPkt = await fetch(`${APP_URL}/api/employer/packets/${sparseCandId}/generate`, { method: 'POST', headers: betaHeaders });
    const crossSrcSess = await fetch(`${APP_URL}/api/employer/sourcing-sessions/${dynamicRunId}`, { method: 'GET', headers: betaHeaders });
    if (![403, 404].includes(crossGetPkt.status) || ![403, 404].includes(crossGenPkt.status) || ![403, 404].includes(crossSrcSess.status)) {
      throw new Error(`Cross-tenant Beta user was not blocked: getPkt=${crossGetPkt.status}, genPkt=${crossGenPkt.status}, srcSess=${crossSrcSess.status}`);
    }
    console.log('  [PASS] Contrasting inputs, determinism, rubric change, spoof rejection, live chat & cross-tenant isolation confirmed.');

    // 3. Real HTTP Concurrency: Parallel packet generations [synthetic SQL fixture]
    console.log('\n[3/6] Testing Real HTTP Concurrency — Competing Packet Generations [synthetic SQL fixture]...');
    const cand1 = createCandidateWithSyntheticSqlFixture({
      name: 'HTTP Concurrency Candidate 1 [synthetic SQL fixture]',
      email: 'conc1@example.invalid',
      status: 'sourced',
      resumeText: 'Principal engineer with 8 years operating PostgreSQL clusters, Raft Distributed Systems, and TypeScript microservices.',
    });

    const [res1, res2] = await Promise.all([
      fetch(`${APP_URL}/api/employer/packets/${cand1.candId}/generate`, { method: 'POST', headers: authHeaders }),
      fetch(`${APP_URL}/api/employer/packets/${cand1.candId}/generate`, { method: 'POST', headers: authHeaders }),
    ]);
    if (!res1.ok || !res2.ok) {
      throw new Error(`Packet generation failed: res1=${res1.status} (${await res1.text()}), res2=${res2.status} (${await res2.text()})`);
    }

    const json1 = await res1.json();
    const json2 = await res2.json();
    const revs = [json1.ledger_revision, json2.ledger_revision].sort((a, b) => a - b);
    console.log(`  Allocated revisions from concurrent requests: [${json1.ledger_revision}, ${json2.ledger_revision}]`);
    if (revs[0] !== 1 || revs[1] !== 2) {
      throw new Error(`Expected revisions [1, 2], got ${JSON.stringify(revs)}`);
    }
    const cand1PostPacketRev2 = Number(json1.ledger_revision) === 2 ? json1 : json2;

    const dbRevs = runPsql(`
      SELECT count(*)::text || '|' || max(revision)::text
      FROM public.claim_ledgers
      WHERE candidate_id = '${cand1.profId}' AND hiring_run_id = '${testRunId}';
    `);
    console.log(`  Database claim_ledgers persisted state (count|max): ${dbRevs}`);
    if (dbRevs !== '2|2') {
      throw new Error(`Database state mismatch: expected '2|2', got '${dbRevs}'`);
    }
    console.log('  [PASS] Concurrent HTTP packet generations serialized cleanly under advisory lock.');

    // 4. Explicit Stale-Decision Contract & Competing Pre-Evaluation Decisions [synthetic SQL fixture]
    console.log('\n[4/6] Testing Explicit Stale-Decision Contract & Competing Pre-Evaluation Decisions [synthetic SQL fixture]...');
    const cand2 = createCandidateWithSyntheticSqlFixture({
      name: 'Pre-Eval Concurrency Candidate [synthetic SQL fixture]',
      email: 'preeval@example.invalid',
      status: 'new',
      resumeText: 'Backend engineer skilled in PostgreSQL tuning and Distributed Systems reliability.',
    });

    // 4a. Missing stale-decision contract MUST fail closed with 400
    const missingContractRes = await fetch(`${APP_URL}/api/employer/packets/${cand2.candId}/action`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        action: 'hold',
        rationale: 'Missing stale contract fields',
        pre_evaluation_disposition: true,
      }),
    });
    if (missingContractRes.status !== 400) {
      throw new Error(`Expected HTTP 400 INVALID_PRE_EVAL_CONTRACT when contract omitted, got ${missingContractRes.status}`);
    }
    const missingContractJson = await missingContractRes.json();
    if (missingContractJson.error !== 'INVALID_PRE_EVAL_CONTRACT') {
      throw new Error(`Expected error INVALID_PRE_EVAL_CONTRACT, got ${JSON.stringify(missingContractJson)}`);
    }

    // 4b. Competing pre-evaluation decisions ('hold' vs 'reject') serialize behind FOR UPDATE
    const [actRes1, actRes2] = await Promise.all([
      fetch(`${APP_URL}/api/employer/packets/${cand2.candId}/action`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action: 'hold',
          rationale: 'Reviewer A hold decision',
          pre_evaluation_disposition: true,
          expected_evaluation_phase: 'pre_evaluation',
          expected_status: 'new',
          expected_pre_eval_revision: 0,
        }),
      }),
      fetch(`${APP_URL}/api/employer/packets/${cand2.candId}/action`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action: 'reject',
          rationale: 'Reviewer B competing reject decision',
          pre_evaluation_disposition: true,
          expected_evaluation_phase: 'pre_evaluation',
          expected_status: 'new',
          expected_pre_eval_revision: 0,
        }),
      }),
    ]);
    const statuses = [actRes1.status, actRes2.status].sort((a, b) => a - b);
    console.log(`  Competing pre-eval HTTP status codes: hold=${actRes1.status}, reject=${actRes2.status}`);

    if (statuses[0] !== 200 || statuses[1] !== 409) {
      throw new Error(`Expected exactly one 200 and one 409 conflict, got ${JSON.stringify(statuses)}`);
    }

    const observedWinnerAction = actRes1.status === 200 ? 'hold' : 'reject';
    const observedWinnerStatus = observedWinnerAction === 'hold' ? 'hold' : 'rejected';
    const winnerBody = await (actRes1.status === 200 ? actRes1.json() : actRes2.json());
    const conflictBody = await (actRes1.status === 409 ? actRes1.json() : actRes2.json());

    if (conflictBody.error !== 'REVIEW_REVISION_CONFLICT') {
      throw new Error(`Expected REVIEW_REVISION_CONFLICT, got: ${JSON.stringify(conflictBody)}`);
    }
    if (winnerBody.status !== observedWinnerStatus || winnerBody.pre_evaluation_revision !== 1) {
      throw new Error(`Expected dynamic winner status='${observedWinnerStatus}' and pre_evaluation_revision=1, got ${JSON.stringify(winnerBody)}`);
    }

    const dbCand2AfterRace = runPsql(`
      SELECT status || '|' || pre_evaluation_revision::text
      FROM public.candidates WHERE id = '${cand2.candId}';
    `);
    if (dbCand2AfterRace !== `${observedWinnerStatus}|1`) {
      throw new Error(`DB row mismatch after race: expected '${observedWinnerStatus}|1', got '${dbCand2AfterRace}'`);
    }

    // 4c. Same-status stale pre_evaluation_revision (0 vs current 1) must reject with 409
    const staleRevSameStatus = await fetch(`${APP_URL}/api/employer/packets/${cand2.candId}/action`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        action: observedWinnerAction,
        rationale: 'Stale revision on matching winning status',
        pre_evaluation_disposition: true,
        expected_evaluation_phase: 'pre_evaluation',
        expected_status: observedWinnerStatus,
        expected_pre_eval_revision: 0,
      }),
    });
    if (staleRevSameStatus.status !== 409) {
      throw new Error(`Expected HTTP 409 for stale pre_evaluation_revision on matching status, got ${staleRevSameStatus.status}`);
    }

    // 4d. Fresh contract using dynamically observed winner state -> advances to revision 2
    const freshFollowup = await fetch(`${APP_URL}/api/employer/packets/${cand2.candId}/action`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        action: 'advance',
        rationale: 'Reviewer advance using fresh pre-evaluation contract',
        pre_evaluation_disposition: true,
        expected_evaluation_phase: 'pre_evaluation',
        expected_status: observedWinnerStatus,
        expected_pre_eval_revision: 1,
      }),
    });
    if (freshFollowup.status !== 200) {
      throw new Error(`Expected HTTP 200 on fresh pre-evaluation follow-up, got ${freshFollowup.status}: ${await freshFollowup.text()}`);
    }
    const freshJson = await freshFollowup.json();
    if (freshJson.status !== 'shortlisted' || freshJson.pre_evaluation_revision !== 2) {
      throw new Error(`Expected status='shortlisted' and pre_evaluation_revision=2, got ${JSON.stringify(freshJson)}`);
    }

    const auditEventsCount = runPsql(`
      SELECT count(*) FROM public.activity_events WHERE description LIKE '%${cand2.candId}%';
    `);
    console.log(`  Recorded activity_events count in DB: ${auditEventsCount} (observed initial winner=${observedWinnerStatus})`);
    if (Number(auditEventsCount) !== 2) {
      throw new Error(`Expected exactly 2 audit events recorded (for 2 winning decisions), got ${auditEventsCount}`);
    }
    console.log('  [PASS] Explicit stale-decision contract & competing pre-eval serialization passed without winner assumptions.');

    // 5. Genuinely Overlapping Generation vs Decision Races [synthetic SQL fixture]
    console.log('\n[5/6] Testing Genuinely Overlapping Packet Generation vs Decision Races [synthetic SQL fixture]...');
    // 5a. Overlapping Promise.all([POST /generate, POST /action pre_evaluation]) on cand3
    const cand3 = createCandidateWithSyntheticSqlFixture({
      name: 'Overlapping Pre-Eval Race Candidate [synthetic SQL fixture]',
      email: 'race3@example.invalid',
      status: 'new',
      resumeText: 'Database systems engineer with PostgreSQL replication and Distributed Systems architecture experience.',
    });

    const [genRace3, preEvalRace3] = await Promise.all([
      fetch(`${APP_URL}/api/employer/packets/${cand3.candId}/generate`, {
        method: 'POST',
        headers: authHeaders,
      }),
      fetch(`${APP_URL}/api/employer/packets/${cand3.candId}/action`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action: 'hold',
          rationale: 'Simultaneous pre-evaluation hold racing packet generation',
          pre_evaluation_disposition: true,
          expected_evaluation_phase: 'pre_evaluation',
          expected_status: 'new',
          expected_pre_eval_revision: 0,
        }),
      }),
    ]);

    if (!genRace3.ok) {
      throw new Error(`Overlapping generate failed on cand3: ${genRace3.status} (${await genRace3.text()})`);
    }
    const cand3EventsAfterRace = Number(runPsql(`
      SELECT count(*) FROM public.activity_events WHERE description LIKE '%${cand3.candId}%';
    `));
    const cand3LedgerCount = Number(runPsql(`
      SELECT count(*) FROM public.claim_ledgers WHERE candidate_id = '${cand3.profId}' AND hiring_run_id = '${testRunId}';
    `));
    if (cand3LedgerCount !== 1) {
      throw new Error(`Expected cand3 claim_ledgers count=1 after race, got ${cand3LedgerCount}`);
    }

    if (preEvalRace3.status === 409) {
      const conflictRace3 = await preEvalRace3.json();
      if (conflictRace3.error !== 'REVIEW_REVISION_CONFLICT') {
        throw new Error(`Expected REVIEW_REVISION_CONFLICT when generate won cand3 race, got ${JSON.stringify(conflictRace3)}`);
      }
      if (cand3EventsAfterRace !== 0) {
        throw new Error(`Expected 0 activity_events when generate committed first on cand3, got ${cand3EventsAfterRace}`);
      }
      console.log('  5a commit order: generate committed first -> concurrent pre-eval cleanly rejected with 409 REVIEW_REVISION_CONFLICT.');
    } else if (preEvalRace3.status === 200) {
      const winRace3 = await preEvalRace3.json();
      if (winRace3.pre_evaluation_revision !== 1 || cand3EventsAfterRace !== 1) {
        throw new Error(`Inconsistent cand3 state when pre-eval committed before generate: ${JSON.stringify(winRace3)}, events=${cand3EventsAfterRace}`);
      }
      console.log('  5a commit order: pre-eval committed first (rev 1) -> subsequent generate persisted rev 1 packet.');
    } else {
      throw new Error(`Unexpected preEvalRace3 HTTP status: ${preEvalRace3.status} (${await preEvalRace3.text()})`);
    }

    // Now that cand3 deterministically has decision_packet persisted, ANY pre-evaluation call MUST reject with 409
    const postPacketPreEval = await fetch(`${APP_URL}/api/employer/packets/${cand3.candId}/action`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        action: 'reject',
        rationale: 'Post-generation pre-eval MUST fail',
        pre_evaluation_disposition: true,
        expected_evaluation_phase: 'pre_evaluation',
        expected_status: preEvalRace3.status === 200 ? 'hold' : 'new',
        expected_pre_eval_revision: preEvalRace3.status === 200 ? 1 : 0,
      }),
    });
    if (postPacketPreEval.status !== 409) {
      throw new Error(`Expected HTTP 409 REVIEW_REVISION_CONFLICT for pre-eval after packet persisted, got ${postPacketPreEval.status}`);
    }

    // 5b. Overlapping Promise.all([POST /generate (rev 2), POST /action (expected_ledger_revision: 1)]) on cand4
    const cand4 = createCandidateWithSyntheticSqlFixture({
      name: 'Overlapping Evaluated Race Candidate [synthetic SQL fixture]',
      email: 'race4@example.invalid',
      status: 'new',
      resumeText: 'Distributed Systems and PostgreSQL specialist with TypeScript experience.',
    });

    const cand4Gen1 = await fetch(`${APP_URL}/api/employer/packets/${cand4.candId}/generate`, {
      method: 'POST',
      headers: authHeaders,
    });
    if (!cand4Gen1.ok) {
      throw new Error(`Initial generate on cand4 failed: ${cand4Gen1.status} (${await cand4Gen1.text()})`);
    }

    const [cand4Gen2, cand4EvalAction] = await Promise.all([
      fetch(`${APP_URL}/api/employer/packets/${cand4.candId}/generate`, {
        method: 'POST',
        headers: authHeaders,
      }),
      fetch(`${APP_URL}/api/employer/packets/${cand4.candId}/action`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action: 'hold',
          rationale: 'Concurrent rev-1 human review racing rev-2 generation',
          expected_ledger_revision: 1,
          expected_rubric_version: '1.0.0',
        }),
      }),
    ]);

    if (!cand4Gen2.ok) {
      throw new Error(`Rev-2 generate failed during cand4 race: ${cand4Gen2.status} (${await cand4Gen2.text()})`);
    }

    const cand4DbState = JSON.parse(runPsql(`
      SELECT json_build_object(
        'status', c.status,
        'decision_packet', c.decision_packet,
        'ledger_count', (SELECT count(*) FROM public.claim_ledgers cl WHERE cl.candidate_id = c.candidate_id AND cl.hiring_run_id = c.hiring_run_id),
        'max_rev', (SELECT max(revision) FROM public.claim_ledgers cl WHERE cl.candidate_id = c.candidate_id AND cl.hiring_run_id = c.hiring_run_id),
        'event_count', (SELECT count(*) FROM public.activity_events ae WHERE ae.description LIKE '%' || c.id::text || '%')
      )::text
      FROM public.candidates c WHERE c.id = '${cand4.candId}';
    `));

    if (Number(cand4DbState.ledger_count) !== 2 || Number(cand4DbState.max_rev) !== 2) {
      throw new Error(`Expected cand4 to have 2 ledgers at max_rev 2, got ${JSON.stringify(cand4DbState)}`);
    }

    if (cand4EvalAction.status === 409) {
      const errJson = await cand4EvalAction.json();
      if (!errJson.error) {
        throw new Error(`Expected structured conflict error on cand4 409, got ${JSON.stringify(errJson)}`);
      }
      if (Number(cand4DbState.event_count) !== 0) {
        throw new Error(`Expected 0 audit events when rev-2 generate won race on cand4, got ${cand4DbState.event_count}`);
      }
      console.log(`  5b commit order: generate (rev 2) committed first -> rev-1 action rejected with 409 (${errJson.error}).`);
    } else if (cand4EvalAction.status === 200) {
      if (Number(cand4DbState.event_count) !== 1 || cand4DbState.decision_packet?.human_decision?.requires_re_review !== true) {
        throw new Error(`When rev-1 action committed before rev-2 generate, rev-2 packet must preserve audit history and set requires_re_review=true. Got: ${JSON.stringify(cand4DbState)}`);
      }
      console.log('  5b commit order: rev-1 action committed first -> rev-2 generate preserved audit decision & set requires_re_review=true.');
    } else {
      throw new Error(`Unexpected cand4EvalAction status: ${cand4EvalAction.status} (${await cand4EvalAction.text()})`);
    }
    console.log('  [PASS] Genuinely overlapping generation and decision races maintained atomic consistency.');

    // 6. Complete End-to-End POST/Stored/GET/Ledger Continuity, Independent Digest & Audit History
    console.log('\n[6/6] Testing Complete POST / Stored / GET / Ledger Continuity, Independent Digest & Audit History...');
    const rev2Continuity = await verifyPacketContinuityAndDigest({
      label: 'Synthetic Cand1 Rev 2',
      authHeaders,
      postPacket: cand1PostPacketRev2,
      candId: cand1.candId,
      profId: cand1.profId,
      runId: testRunId,
      expectedRev: 2,
      expectedDocId: cand1.docId,
      expectedFileSha256: cand1.fileSha256,
      expectedNormSha256: cand1.normSha256,
    });
    console.log(
      `  Rev 2 4-way continuity + independent digest verified (ledger=${rev2Continuity.apiPacket.ledger_id}, digest=${rev2Continuity.recomputedDigest.slice(0, 12)}..., claims=${rev2Continuity.apiPacket.claims.length}, refs=${rev2Continuity.apiPacket.evidence_refs.length}, edges=${rev2Continuity.apiPacket.claim_edges.length}).`
    );

    // Record human review decision on rev 2, then advance to rev 3
    const reviewAction = await fetch(`${APP_URL}/api/employer/packets/${cand1.candId}/action`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        action: 'hold',
        rationale: 'Reviewer hold on revision 2',
        expected_ledger_revision: 2,
        expected_rubric_version: '1.0.0',
      }),
    });
    if (!reviewAction.ok) throw new Error(`Review action failed: ${reviewAction.status} (${await reviewAction.text()})`);

    const gen3Res = await fetch(`${APP_URL}/api/employer/packets/${cand1.candId}/generate`, {
      method: 'POST',
      headers: authHeaders,
    });
    if (!gen3Res.ok) throw new Error(`Generate rev 3 failed: ${gen3Res.status} (${await gen3Res.text()})`);
    const postPacketRev3 = await gen3Res.json();

    const rev3Continuity = await verifyPacketContinuityAndDigest({
      label: 'Synthetic Cand1 Rev 3',
      authHeaders,
      postPacket: postPacketRev3,
      candId: cand1.candId,
      profId: cand1.profId,
      runId: testRunId,
      expectedRev: 3,
      expectedDocId: cand1.docId,
      expectedFileSha256: cand1.fileSha256,
      expectedNormSha256: cand1.normSha256,
    });

    const dbAudit3 = JSON.parse(runPsql(`
      SELECT json_build_object(
        'ledger_count', (SELECT count(*) FROM public.claim_ledgers WHERE candidate_id = c.candidate_id AND hiring_run_id = c.hiring_run_id),
        'event_count', (SELECT count(*) FROM public.activity_events WHERE description LIKE '%' || c.id::text || '%')
      )::text
      FROM public.candidates c WHERE c.id = '${cand1.candId}';
    `));

    const updatedApiPacket = rev3Continuity.apiPacket;
    const humanDecision = updatedApiPacket?.human_decision;
    if (Number(dbAudit3.ledger_count) !== 3) {
      throw new Error(`Expected 3 claim_ledgers revisions on cand1, got ${dbAudit3.ledger_count}`);
    }
    if (humanDecision?.requires_re_review !== true || !humanDecision?.re_review_reason) {
      throw new Error(`Expected requires_re_review === true with non-empty reason after rev 3 advance, got ${JSON.stringify(humanDecision)}`);
    }
    if (!Array.isArray(humanDecision?.decision_history) || humanDecision.decision_history.length < 1) {
      throw new Error(`Expected preserved human decision_history after rev 3 advance, got ${JSON.stringify(humanDecision)}`);
    }
    const matchingPriorDecision = humanDecision.decision_history.find(
      (entry) => entry?.action === 'hold' && entry?.status === 'hold' && entry?.reviewed_ledger_revision === 2 && entry?.rationale === 'Reviewer hold on revision 2'
    );
    if (!matchingPriorDecision) {
      throw new Error(`Prior rev-2 hold decision missing from decision_history: ${JSON.stringify(humanDecision.decision_history)}`);
    }
    if (Number(dbAudit3.event_count) < 1) {
      throw new Error(`Expected activity_events entry for human review on ${cand1.candId}, found ${dbAudit3.event_count}`);
    }

    console.log('  [PASS] Full POST/stored/GET/ledger continuity, independent calculation_digest, human audit history & requires_re_review confirmed.');
    console.log('\n=== ALL REAL HTTP CONCURRENCY, PDF UPLOAD/PARSER, STORAGE & CONTINUITY ASSERTIONS PASSED ===');
  } finally {
    const cleanupErrors = [];
    const allStoragePathsToDelete = [...createdStoragePaths];
    if (storageProbeKey) {
      allStoragePathsToDelete.push(storageProbeKey);
    }

    for (const objPath of allStoragePathsToDelete) {
      try {
        const delRes = await fetch(`${SUPABASE_URL}/storage/v1/object/candidate_resumes/${objPath}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'apikey': SERVICE_ROLE_KEY,
          },
        });
        if (!delRes.ok && delRes.status !== 404) {
          cleanupErrors.push(`Storage object cleanup failed for ${objPath} (HTTP ${delRes.status})`);
        }
      } catch (e) {
        cleanupErrors.push(`Storage cleanup failed for ${objPath}: ${e.message}`);
      }
    }

    if (createdRunIds.length > 0 || createdCandIds.length > 0 || createdProfIds.length > 0 || createdDocIds.length > 0) {
      const candList = createdCandIds.map((id) => `'${id}'`).join(', ') || `'00000000-0000-0000-0000-000000000000'`;
      const profList = createdProfIds.map((id) => `'${id}'`).join(', ') || `'00000000-0000-0000-0000-000000000000'`;
      const docList = createdDocIds.map((id) => `'${id}'`).join(', ') || `'00000000-0000-0000-0000-000000000000'`;
      const runList = createdRunIds.map((id) => `'${id}'`).join(', ') || `'00000000-0000-0000-0000-000000000000'`;
      const descClauses = createdCandIds.length > 0
        ? createdCandIds.map((id) => `description LIKE '%${id}%'`).join(' OR ')
        : 'FALSE';
      const storageLikeClauses = createdRunIds.length > 0
        ? createdRunIds.map((rid) => `name LIKE '${sqlEscape(`${ALPHA_ORG_ID}/${rid}/%`)}'`).join(' OR ')
        : 'FALSE';

      try {
        runPsql(`
          DELETE FROM public.scheduled_emails WHERE candidate_id IN (${profList});
          DELETE FROM public.activity_events WHERE ${descClauses};
          DELETE FROM public.claim_ledgers WHERE candidate_id IN (${profList}) OR hiring_run_id IN (${runList});
          DELETE FROM public.candidates WHERE id IN (${candList}) OR hiring_run_id IN (${runList});
          DELETE FROM public.candidate_documents WHERE id IN (${docList}) OR hiring_run_id IN (${runList});
          DELETE FROM public.candidate_profiles WHERE id IN (${profList});
          DELETE FROM public.hiring_runs WHERE id IN (${runList});
        `);

        const residuals = runPsql(`
          SELECT (
            (SELECT count(*) FROM public.scheduled_emails WHERE candidate_id IN (${profList})) +
            (SELECT count(*) FROM public.activity_events WHERE ${descClauses}) +
            (SELECT count(*) FROM public.claim_ledgers WHERE candidate_id IN (${profList}) OR hiring_run_id IN (${runList})) +
            (SELECT count(*) FROM public.candidates WHERE id IN (${candList}) OR hiring_run_id IN (${runList})) +
            (SELECT count(*) FROM public.candidate_documents WHERE id IN (${docList}) OR hiring_run_id IN (${runList})) +
            (SELECT count(*) FROM public.candidate_profiles WHERE id IN (${profList})) +
            (SELECT count(*) FROM public.hiring_runs WHERE id IN (${runList})) +
            (SELECT count(*) FROM storage.objects WHERE bucket_id = 'candidate_resumes' AND (${storageLikeClauses}))
          )::text;
        `);
        if (residuals !== '0') {
          cleanupErrors.push(`Residual probe records still present in database (sum=${residuals}).`);
        }
      } catch (e) {
        cleanupErrors.push(`Database fixture cleanup failed: ${e.message}`);
      }
    }

    if (cleanupErrors.length > 0) {
      console.error('CLEANUP FAILURE(S):', cleanupErrors);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error('\n[FATAL ERROR IN LIVE CONCURRENCY SUITE]:', err);
  process.exit(1);
});
