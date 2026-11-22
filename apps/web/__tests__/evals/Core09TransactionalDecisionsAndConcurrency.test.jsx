/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exec, execSync } from 'child_process';
import crypto from 'crypto';
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import HumanDecisionRail from '@/components/packet/HumanDecisionRail';

import { runDisposablePsql, runDisposablePsqlAsync, getTestDbConfig } from '@/lib/testDbGuard';

function runPsqlAsync(sql) {
  return runDisposablePsqlAsync(sql);
}

function runPsql(sql) {
  return runDisposablePsql(sql);
}

describe.sequential('CTW-V2-DEMO-CORE-09 Transactional Decisions & Concurrency Suite', () => {
  const TEST_ORG_ID = '00000000-0000-4000-c000-000000000001';
  const FOREIGN_ORG_ID = '00000000-0000-4000-c000-000000000002';
  const ACTOR_1 = '00000000-0000-4000-a000-000000000001'; // Org 1 owner
  const ACTOR_2 = '00000000-0000-4000-a000-000000000003'; // Org 1 recruiter
  const FOREIGN_ACTOR = '00000000-0000-4000-a000-000000000002'; // Org 2 owner

  let testHiringRunId;
  let testProfileId;
  let testCandidateId;
  const createdRunIds = [];
  const createdProfIds = [];
  const createdCandIds = [];

  function trackFixture(runId, profId, candId) {
    if (runId) createdRunIds.push(runId);
    if (profId) createdProfIds.push(profId);
    if (candId) createdCandIds.push(candId);
  }

  afterAll(() => {
    const runList = createdRunIds.map((id) => `'${id}'`).join(', ') || `'00000000-0000-0000-0000-000000000000'`;
    const profList = createdProfIds.map((id) => `'${id}'`).join(', ') || `'00000000-0000-0000-0000-000000000000'`;
    const candList = createdCandIds.map((id) => `'${id}'`).join(', ') || `'00000000-0000-0000-0000-000000000000'`;
    const eventLikes = createdCandIds.length > 0
      ? createdCandIds.map((id) => `description LIKE '%${id}%'`).join(' OR ')
      : 'FALSE';
    runPsql(`
      DELETE FROM public.activity_events WHERE ${eventLikes};
      DELETE FROM public.claim_ledgers WHERE hiring_run_id IN (${runList}) OR candidate_id IN (${profList});
      DELETE FROM public.candidates WHERE id IN (${candList}) OR hiring_run_id IN (${runList});
      DELETE FROM public.candidate_profiles WHERE id IN (${profList});
      DELETE FROM public.hiring_runs WHERE id IN (${runList});
    `);
  });

  beforeAll(() => {
    testHiringRunId = crypto.randomUUID();
    testProfileId = crypto.randomUUID();
    testCandidateId = crypto.randomUUID();
    trackFixture(testHiringRunId, testProfileId, testCandidateId);

    // Setup isolated test entities
    runPsql(`
      INSERT INTO public.hiring_runs (id, org_id, role_title, brief_json)
      VALUES ('${testHiringRunId}', '${TEST_ORG_ID}', 'Principal Systems Architect', jsonb_build_object(
        'contract_approved', true,
        'approved_rubric_version', '1.0.0',
        'approved_by', '${ACTOR_1}',
        'approved_at', now()
      ));

      INSERT INTO public.candidate_profiles (id, name, bio)
      VALUES ('${testProfileId}', 'Concurrency Candidate', 'High-Scale Concurrency Engineer');

      INSERT INTO public.candidates (id, candidate_id, hiring_run_id, status, decision_packet)
      VALUES ('${testCandidateId}', '${testProfileId}', '${testHiringRunId}', 'new', jsonb_build_object(
        'ledger_revision', 1,
        'rubric_version', '1.0.0',
        'fit_score', 0.88
      ));

      INSERT INTO public.claim_ledgers (id, candidate_id, hiring_run_id, org_id, revision, claims, evidence_refs, claim_edges, evaluation_output)
      VALUES (gen_random_uuid(), '${testProfileId}', '${testHiringRunId}', '${TEST_ORG_ID}', 1, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb);
    `);
  });

  // A. Two simultaneous reviewer actions retain both accepted events in decision_history
  it('A. Sequential reviewer actions retain both accepted events in decision_history without data loss', () => {
    // Reviewer 1 advances candidate
    const res1 = runPsql(`
      SELECT status, (decision_packet->'human_decision'->>'action') AS act,
             jsonb_array_length(decision_packet->'human_decision'->'decision_history') AS hist_len
      FROM public.record_human_decision_transactional(
        '${testCandidateId}'::uuid,
        '${ACTOR_1}'::uuid,
        'reviewer1@alpha.com',
        '${TEST_ORG_ID}'::uuid,
        'advance',
        'Reviewer 1 approved: Production architecture thoroughly verified.',
        1,
        '1.0.0'
      );
    `);

    expect(res1).toContain('shortlisted|advance|1');

    // Reviewer 2 updates candidate to hold
    const res2 = runPsql(`
      SELECT status, (decision_packet->'human_decision'->>'action') AS act,
             jsonb_array_length(decision_packet->'human_decision'->'decision_history') AS hist_len
      FROM public.record_human_decision_transactional(
        '${testCandidateId}'::uuid,
        '${ACTOR_2}'::uuid,
        'reviewer2@alpha.com',
        '${TEST_ORG_ID}'::uuid,
        'hold',
        'Reviewer 2 hold: Requesting secondary security clearance evidence.',
        1,
        '1.0.0'
      );
    `);

    expect(res2).toContain('hold|hold|2');

    // Verify both events exist in history and activity_events table
    const historyCheck = runPsql(`
      SELECT (decision_packet->'human_decision'->'decision_history'->0->>'action') || ' | ' ||
             (decision_packet->'human_decision'->'decision_history'->1->>'action')
      FROM public.candidates WHERE id = '${testCandidateId}';
    `);

    expect(historyCheck).toBe('advance | hold');

    const activityCount = runPsql(`
      SELECT count(*) FROM public.activity_events
      WHERE event_type IN ('shortlisted', 'hold');
    `);

    expect(Number(activityCount)).toBeGreaterThanOrEqual(2);
  });

  // A2. Deterministic simultaneous concurrency test: Two reviewers execute concurrently with transaction row locks
  it('A2. Two truly simultaneous reviewer actions block-and-serialize via row lock, retaining both accepted events', async () => {
    const simCandId = crypto.randomUUID();
    const simProfId = crypto.randomUUID();
    const simRunId = crypto.randomUUID();
    trackFixture(simRunId, simProfId, simCandId);

    runPsql(`
      INSERT INTO public.hiring_runs (id, org_id, role_title, brief_json)
      VALUES ('${simRunId}', '${TEST_ORG_ID}', 'Concurrent Test Role', jsonb_build_object('approved_rubric_version', '1.0.0'));
      INSERT INTO public.candidate_profiles (id, name) VALUES ('${simProfId}', 'Simultaneous Candidate');
      INSERT INTO public.candidates (id, candidate_id, hiring_run_id, status, decision_packet)
      VALUES ('${simCandId}', '${simProfId}', '${simRunId}', 'new', jsonb_build_object('ledger_revision', 1, 'rubric_version', '1.0.0'));
      INSERT INTO public.claim_ledgers (id, candidate_id, hiring_run_id, org_id, revision)
      VALUES (gen_random_uuid(), '${simProfId}', '${simRunId}', '${TEST_ORG_ID}', 1);
    `);

    const p1 = runPsqlAsync(`
      BEGIN;
      SELECT * FROM public.record_human_decision_transactional('${simCandId}'::uuid, '${ACTOR_1}'::uuid, 'reviewer1@alpha.com', '${TEST_ORG_ID}'::uuid, 'advance', 'Reviewer 1 concurrent advance', 1, '1.0.0');
      SELECT pg_sleep(0.4);
      COMMIT;
    `);

    // Launch p2 slightly after p1 has acquired row lock
    await new Promise(r => setTimeout(r, 100));

    const p2 = runPsqlAsync(`
      BEGIN;
      SELECT * FROM public.record_human_decision_transactional('${simCandId}'::uuid, '${ACTOR_2}'::uuid, 'reviewer2@alpha.com', '${TEST_ORG_ID}'::uuid, 'hold', 'Reviewer 2 concurrent hold', 1, '1.0.0');
      COMMIT;
    `);

    const [res1, res2] = await Promise.all([p1, p2]);

    expect(res1).toContain('shortlisted');
    expect(res2).toContain('hold');

    const historyCount = runPsql(`
      SELECT jsonb_array_length(decision_packet->'human_decision'->'decision_history')
      FROM public.candidates WHERE id = '${simCandId}';
    `);
    expect(Number(historyCount)).toBe(2);
  });

  // B. Deterministic overlapping regeneration vs. review concurrency preserves newer evaluation data and serializes safely (C09-06)
  it('B. Deterministic overlapping regeneration vs. review concurrency preserves newer evaluation data and serializes safely (C09-06)', async () => {
    const concCandId = crypto.randomUUID();
    const concProfId = crypto.randomUUID();
    const concRunId = crypto.randomUUID();
    trackFixture(concRunId, concProfId, concCandId);

    runPsql(`
      INSERT INTO public.hiring_runs (id, org_id, role_title, brief_json)
      VALUES ('${concRunId}', '${TEST_ORG_ID}', 'Concurrent Gen Role', jsonb_build_object(
        'contract_approved', true,
        'approved_rubric_version', '1.0.0',
        'approved_by', '${ACTOR_1}',
        'approved_at', now()
      ));
      INSERT INTO public.candidate_profiles (id, name) VALUES ('${concProfId}', 'Conc Gen Candidate');
      INSERT INTO public.candidates (id, candidate_id, hiring_run_id, status, decision_packet)
      VALUES ('${concCandId}', '${concProfId}', '${concRunId}', 'hold', jsonb_build_object(
        'ledger_revision', 1,
        'rubric_version', '1.0.0',
        'human_decision', jsonb_build_object(
          'action', 'hold',
          'status', 'hold',
          'requires_re_review', false,
          'decision_history', jsonb_build_array(jsonb_build_object('action', 'hold'))
        )
      ));
      INSERT INTO public.claim_ledgers (id, candidate_id, hiring_run_id, org_id, revision)
      VALUES (gen_random_uuid(), '${concProfId}', '${concRunId}', '${TEST_ORG_ID}', 1);
    `);

    // Launch regeneration transaction holding row lock with pg_sleep
    const pGen = runPsqlAsync(`
      BEGIN;
      SELECT * FROM public.allocate_claim_ledger_revision_and_persist(
        '${concProfId}'::uuid,
        '${concRunId}'::uuid,
        '${TEST_ORG_ID}'::uuid,
        '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
        jsonb_build_object(
          'rubric_version', '1.0.0',
          'approved_rubric_version', '1.0.0',
          'fit_score', null,
          'evaluation_metrics', jsonb_build_object('decision_readiness', 'INSUFFICIENT EVIDENCE')
        ),
        '${concCandId}'::uuid
      );
      SELECT pg_sleep(0.5);
      COMMIT;
    `);

    // Wait 200ms so pGen transaction starts and acquires row lock first
    await new Promise(r => setTimeout(r, 200));

    // Overlapping review transaction attempts decision with expected_ledger_revision = 1
    const pReview = runPsqlAsync(`
      BEGIN;
      SELECT * FROM public.record_human_decision_transactional(
        '${concCandId}'::uuid,
        '${ACTOR_1}'::uuid,
        'reviewer@alpha.com',
        '${TEST_ORG_ID}'::uuid,
        'advance',
        'Overlapping review attempt on revision 1',
        1,
        '1.0.0'
      );
      COMMIT;
    `);

    const [resGen, resReview] = await Promise.all([pGen, pReview]);

    // Regeneration committed revision 2
    expect(resGen).toContain('2');

    // Concurrent review serialized behind pGen and caught revision mismatch
    expect(resReview).toContain('REVIEW_REVISION_CONFLICT');

    // Confirm candidate packet has revision 2, hold status, and requires_re_review = true
    const candState = runPsql(`
      SELECT (decision_packet->>'ledger_revision') || '|' ||
             status || '|' ||
             (decision_packet->'human_decision'->>'requires_re_review')
      FROM public.candidates WHERE id = '${concCandId}';
    `);
    expect(candState).toBe('2|hold|true');

    // Also advance testCandidateId to revision 2 with requires_re_review = true for downstream tests C and E
    const testGen = runPsql(`
      SELECT revision,
             (decision_packet->'human_decision'->>'requires_re_review') AS req_review,
             (decision_packet->'human_decision'->>'status') AS decision_status
      FROM public.allocate_claim_ledger_revision_and_persist(
        '${testProfileId}'::uuid,
        '${testHiringRunId}'::uuid,
        '${TEST_ORG_ID}'::uuid,
        '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
        jsonb_build_object(
          'rubric_version', '1.0.0',
          'approved_rubric_version', '1.0.0',
          'fit_score', null,
          'evaluation_metrics', jsonb_build_object('decision_readiness', 'INSUFFICIENT EVIDENCE')
        ),
        '${testCandidateId}'::uuid
      );
    `);
    expect(testGen).toContain('2|true|hold');
  });

  // C. A stale review cannot clear requires_re_review on a newer revision
  it('C. Rejects stale review with REVIEW_REVISION_CONFLICT without mutating candidate state', () => {
    // Reviewer attempts action expecting revision 1 when packet is at revision 2
    const staleRes = runPsql(`
      SELECT * FROM public.record_human_decision_transactional(
        '${testCandidateId}'::uuid,
        '${ACTOR_1}'::uuid,
        'reviewer1@alpha.com',
        '${TEST_ORG_ID}'::uuid,
        'advance',
        'Stale review attempt from cached UI tab',
        1, -- Stale revision! Current is 2
        '1.0.0'
      );
    `);

    expect(staleRes).toContain('REVIEW_REVISION_CONFLICT');
    expect(staleRes).toContain('Expected ledger revision 1 does not match current packet revision 2');

    // Confirm candidate remains at requires_re_review = true and status = hold
    const candStatus = runPsql(`
      SELECT status || '|' || (decision_packet->'human_decision'->>'requires_re_review')
      FROM public.candidates WHERE id = '${testCandidateId}';
    `);

    expect(candStatus).toBe('hold|true');
  });

  // D. Forces activity_events failure AFTER candidate decision update and proves complete transaction rollback (C09-06)
  it('D. Forces activity_events failure AFTER candidate decision update and proves complete transaction rollback (C09-06)', () => {
    const rollCandId = crypto.randomUUID();
    const rollProfId = crypto.randomUUID();
    const rollRunId = crypto.randomUUID();
    trackFixture(rollRunId, rollProfId, rollCandId);

    try {
      runPsql(`
        INSERT INTO public.hiring_runs (id, org_id, role_title, brief_json)
        VALUES ('${rollRunId}', '${TEST_ORG_ID}', 'Rollback Test Role', jsonb_build_object(
          'contract_approved', true,
          'approved_rubric_version', '1.0.0',
          'approved_by', '${ACTOR_1}',
          'approved_at', now()
        ));
        INSERT INTO public.candidate_profiles (id, name) VALUES ('${rollProfId}', 'Rollback Candidate');
        INSERT INTO public.candidates (id, candidate_id, hiring_run_id, status, decision_packet)
        VALUES ('${rollCandId}', '${rollProfId}', '${rollRunId}', 'new', jsonb_build_object(
          'ledger_revision', 1,
          'rubric_version', '1.0.0'
        ));
        INSERT INTO public.claim_ledgers (id, candidate_id, hiring_run_id, org_id, revision)
        VALUES (gen_random_uuid(), '${rollProfId}', '${rollRunId}', '${TEST_ORG_ID}', 1);

        -- Install BEFORE INSERT trigger on activity_events that fails specifically for rollCandId AFTER candidate update occurs
        CREATE OR REPLACE FUNCTION trigger_force_activity_failure()
        RETURNS trigger AS $$
        BEGIN
          IF NEW.description LIKE '%' || '${rollCandId}' || '%' THEN
            RAISE EXCEPTION 'FORCED_ACTIVITY_EVENTS_FAILURE_AFTER_DECISION_UPDATE';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_test_force_activity_failure ON public.activity_events;
        CREATE TRIGGER trg_test_force_activity_failure
        BEFORE INSERT ON public.activity_events
        FOR EACH ROW EXECUTE FUNCTION trigger_force_activity_failure();
      `);

      const initialCand = runPsql(`SELECT status || '|' || decision_packet::text FROM public.candidates WHERE id = '${rollCandId}';`);

      // Execute decision RPC - candidate update would occur, but activity_events insertion triggers error
      const rpcRes = runPsql(`
        SELECT * FROM public.record_human_decision_transactional(
          '${rollCandId}'::uuid,
          '${ACTOR_1}'::uuid,
          'reviewer@alpha.com',
          '${TEST_ORG_ID}'::uuid,
          'advance',
          'Testing atomic rollback on audit failure',
          1,
          '1.0.0'
        );
      `);

      expect(rpcRes).toContain('FORCED_ACTIVITY_EVENTS_FAILURE_AFTER_DECISION_UPDATE');

      // PROVE complete rollback: candidate row must be 100% identical to initial state!
      const afterCand = runPsql(`SELECT status || '|' || decision_packet::text FROM public.candidates WHERE id = '${rollCandId}';`);
      expect(afterCand).toBe(initialCand);
    } finally {
      // Clean up trigger unconditionally
      runPsql(`
        DROP TRIGGER IF EXISTS trg_test_force_activity_failure ON public.activity_events;
        DROP FUNCTION IF EXISTS trigger_force_activity_failure();
      `);
    }
  });

  it('E. Successful fresh review for revision 2 clears requires_re_review and appends to audit history', () => {
    const freshRes = runPsql(`
      SELECT status, (decision_packet->'human_decision'->>'requires_re_review') AS req_review,
             jsonb_array_length(decision_packet->'human_decision'->'decision_history') AS hist_len
      FROM public.record_human_decision_transactional(
        '${testCandidateId}'::uuid,
        '${ACTOR_1}'::uuid,
        'reviewer1@alpha.com',
        '${TEST_ORG_ID}'::uuid,
        'advance',
        'Fresh review conducted against revision 2 evaluation: Advanced with full confidence.',
        2, -- Current revision!
        '1.0.0'
      );
    `);

    expect(freshRes).toContain('shortlisted|false|3');
  });

  // F. Visible DOM assertion for Fresh Review Required warning banner (C09-06)
  it('F. Captures Fresh Review Required warning with a visible DOM assertion in HumanDecisionRail (C09-06)', () => {
    const mockExtraction = {
      id: 'cand-stale-dom-test',
      status: 'hold',
      decision_rationale: 'Prior review preserved across revision advance',
      decision_packet: {
        ledger_revision: 2,
        rubric_version: '1.0.0',
        human_decision: {
          action: 'hold',
          status: 'hold',
          requires_re_review: true,
          re_review_reason: 'Evaluation revised to revision 2 since previous decision.',
          rationale: 'Prior review preserved across revision advance',
          decision_history: [{ action: 'hold', rationale: 'Prior review preserved across revision advance' }]
        }
      }
    };

    render(
      <HumanDecisionRail
        extraction={mockExtraction}
        onAction={() => {}}
      />
    );

    const banner = screen.getByTestId('stale-review-warning');
    expect(banner).toBeInTheDocument();
    expect(banner).toBeVisible();
    expect(banner.textContent).toContain('Fresh Review Required:');
    expect(banner.textContent).toContain('Evaluation revised to revision 2 since previous decision.');
  });

  // G. Real Postgres concurrency test: Competing pre-evaluation decisions serialize behind FOR UPDATE and reject stale writer
  it('G. Competing pre-evaluation decisions serialize via FOR UPDATE, log activity_events atomically, and reject stale competitor', async () => {
    const preCandId = crypto.randomUUID();
    const preProfId = crypto.randomUUID();
    const preRunId = crypto.randomUUID();
    trackFixture(preRunId, preProfId, preCandId);

    runPsql(`
      INSERT INTO public.hiring_runs (id, org_id, role_title, brief_json)
      VALUES ('${preRunId}', '${TEST_ORG_ID}', 'Pre-Eval Concurrency Role', jsonb_build_object(
        'contract_approved', true,
        'approved_rubric_version', '1.0.0',
        'approved_by', '${ACTOR_1}',
        'approved_at', now()
      ));
      INSERT INTO public.candidate_profiles (id, name) VALUES ('${preProfId}', 'Pre-Eval Competitor');
      INSERT INTO public.candidates (id, candidate_id, hiring_run_id, status, decision_packet)
      VALUES ('${preCandId}', '${preProfId}', '${preRunId}', 'new', NULL);
    `);

    const p1 = runPsqlAsync(`
      BEGIN;
      SELECT status, pre_evaluation_revision, activity_event_id FROM public.record_pre_evaluation_decision_transactional(
        '${preCandId}'::uuid, '${ACTOR_1}'::uuid, 'reviewer1@alpha.com', '${TEST_ORG_ID}'::uuid, 'advance', 'Reviewer 1 pre-eval advance', 'new', 0
      );
      SELECT pg_sleep(0.4);
      COMMIT;
    `);

    await new Promise(r => setTimeout(r, 120));

    const p2 = runPsqlAsync(`
      BEGIN;
      SELECT status, pre_evaluation_revision, activity_event_id FROM public.record_pre_evaluation_decision_transactional(
        '${preCandId}'::uuid, '${ACTOR_2}'::uuid, 'reviewer2@alpha.com', '${TEST_ORG_ID}'::uuid, 'reject', 'Reviewer 2 competing pre-eval reject', 'new', 0
      );
      COMMIT;
    `);

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1).toContain('shortlisted');
    expect(res2).toContain('REVIEW_REVISION_CONFLICT');

    const finalState = runPsql(`SELECT status || '|' || pre_evaluation_revision::text || '|' || COALESCE(decision_packet::text, 'NULL') FROM public.candidates WHERE id = '${preCandId}';`);
    expect(finalState).toBe('shortlisted|1|NULL');

    // Explicit stale-decision contract: NULL expected fields raise RPC_VALIDATION_ERROR, and stale pre_evaluation_revision=0 after shortlisted->shortlisted fails with 409 conflict
    const missingContractErr = runPsql(`
      SELECT * FROM public.record_pre_evaluation_decision_transactional(
        '${preCandId}'::uuid, '${ACTOR_1}'::uuid, 'reviewer1@alpha.com', '${TEST_ORG_ID}'::uuid, 'hold', 'Missing contract check', NULL::text, 1
      );
    `);
    expect(missingContractErr).toContain('RPC_VALIDATION_ERROR');

    const staleRevSameStatus = runPsql(`
      SELECT * FROM public.record_pre_evaluation_decision_transactional(
        '${preCandId}'::uuid, '${ACTOR_2}'::uuid, 'reviewer2@alpha.com', '${TEST_ORG_ID}'::uuid, 'hold', 'Stale revision on matching status', 'shortlisted', 0
      );
    `);
    expect(staleRevSameStatus).toContain('REVIEW_REVISION_CONFLICT');

    const auditCount = runPsql(`SELECT count(*) FROM public.activity_events WHERE description LIKE '%${preCandId}%';`);
    expect(Number(auditCount)).toBe(1);
  });

  // H. Real Postgres concurrency test: Pre-evaluation decision racing against packet generation serializes behind FOR UPDATE
  it('H. Packet generation racing against pre-evaluation decision serializes cleanly and rejects stale pre-eval write', async () => {
    const raceCandId = crypto.randomUUID();
    const raceProfId = crypto.randomUUID();
    const raceRunId = crypto.randomUUID();
    trackFixture(raceRunId, raceProfId, raceCandId);

    runPsql(`
      INSERT INTO public.hiring_runs (id, org_id, role_title, brief_json)
      VALUES ('${raceRunId}', '${TEST_ORG_ID}', 'Pre-Eval vs Generate Race Role', jsonb_build_object(
        'contract_approved', true,
        'approved_rubric_version', '1.0.0',
        'approved_by', '${ACTOR_1}',
        'approved_at', now()
      ));
      INSERT INTO public.candidate_profiles (id, name) VALUES ('${raceProfId}', 'Race Candidate');
      INSERT INTO public.candidates (id, candidate_id, hiring_run_id, status, decision_packet)
      VALUES ('${raceCandId}', '${raceProfId}', '${raceRunId}', 'new', NULL);
    `);

    const pGen = runPsqlAsync(`
      BEGIN;
      SELECT revision FROM public.allocate_claim_ledger_revision_and_persist(
        '${raceProfId}'::uuid,
        '${raceRunId}'::uuid,
        '${TEST_ORG_ID}'::uuid,
        '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
        jsonb_build_object(
          'rubric_version', '1.0.0',
          'approved_rubric_version', '1.0.0',
          'fit_score', null,
          'evaluation_metrics', jsonb_build_object('decision_readiness', 'INSUFFICIENT EVIDENCE')
        ),
        '${raceCandId}'::uuid
      );
      SELECT pg_sleep(0.4);
      COMMIT;
    `);

    await new Promise(r => setTimeout(r, 120));

    const pPreEval = runPsqlAsync(`
      BEGIN;
      SELECT * FROM public.record_pre_evaluation_decision_transactional(
        '${raceCandId}'::uuid, '${ACTOR_1}'::uuid, 'reviewer@alpha.com', '${TEST_ORG_ID}'::uuid, 'hold', 'Concurrent pre-eval hold', 'new', 0
      );
      COMMIT;
    `);

    const [resGen, resPreEval] = await Promise.all([pGen, pPreEval]);
    expect(resGen).toContain('1');
    expect(resPreEval).toContain('REVIEW_REVISION_CONFLICT');

    const raceFinal = runPsql(`SELECT status || '|' || (decision_packet->>'ledger_revision') FROM public.candidates WHERE id = '${raceCandId}';`);
    expect(raceFinal).toBe('new|1');
  });

  // I. Forced activity_events failure AFTER pre-eval candidate status update proves complete transaction rollback
  it('I. Forces activity_events failure AFTER pre-eval candidate status update and proves full rollback', () => {
    const rbCandId = crypto.randomUUID();
    const rbProfId = crypto.randomUUID();
    const rbRunId = crypto.randomUUID();
    trackFixture(rbRunId, rbProfId, rbCandId);

    try {
      runPsql(`
        INSERT INTO public.hiring_runs (id, org_id, role_title, brief_json)
        VALUES ('${rbRunId}', '${TEST_ORG_ID}', 'Pre-Eval Rollback Role', '{}'::jsonb);
        INSERT INTO public.candidate_profiles (id, name) VALUES ('${rbProfId}', 'Pre-Eval Rollback Candidate');
        INSERT INTO public.candidates (id, candidate_id, hiring_run_id, status, decision_packet)
        VALUES ('${rbCandId}', '${rbProfId}', '${rbRunId}', 'new', NULL);

        CREATE OR REPLACE FUNCTION trigger_force_pre_eval_activity_failure()
        RETURNS trigger AS $$
        BEGIN
          IF NEW.description LIKE '%' || '${rbCandId}' || '%' THEN
            RAISE EXCEPTION 'FORCED_PRE_EVAL_AUDIT_FAILURE';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_test_force_pre_eval_activity_failure ON public.activity_events;
        CREATE TRIGGER trg_test_force_pre_eval_activity_failure
        BEFORE INSERT ON public.activity_events
        FOR EACH ROW EXECUTE FUNCTION trigger_force_pre_eval_activity_failure();
      `);

      const rpcRes = runPsql(`
        SELECT * FROM public.record_pre_evaluation_decision_transactional(
          '${rbCandId}'::uuid, '${ACTOR_1}'::uuid, 'reviewer@alpha.com', '${TEST_ORG_ID}'::uuid, 'reject', 'Should roll back on audit error', 'new', 0
        );
      `);
      expect(rpcRes).toContain('FORCED_PRE_EVAL_AUDIT_FAILURE');

      const afterStatus = runPsql(`SELECT status FROM public.candidates WHERE id = '${rbCandId}';`);
      expect(afterStatus).toBe('new');
    } finally {
      runPsql(`
        DROP TRIGGER IF EXISTS trg_test_force_pre_eval_activity_failure ON public.activity_events;
        DROP FUNCTION IF EXISTS trigger_force_pre_eval_activity_failure();
      `);
    }
  });
});
