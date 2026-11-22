/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runDisposablePsql, getTestDbConfig } from '@/lib/testDbGuard';

const ORG1_ID = '00000000-0000-4000-c000-000000000001';
const ORG2_ID = '00000000-0000-4000-c000-000000000002';
const RUN1_ID = '11111111-1111-4111-a111-111111111111';

const ORG1_OWNER = '00000000-0000-4000-a000-000000000001';
const ORG1_RECRUITER = '00000000-0000-4000-a000-000000000003';
const ORG1_AUDITOR = '00000000-0000-4000-a000-000000000004';
const ORG2_OWNER = '00000000-0000-4000-a000-000000000002';

const CANDIDATE_USER_ID = '00000000-0000-4000-b000-000000000099';
const REVOKED_MEMBER_ID = '00000000-0000-4000-a000-000000000098';
const SEED_OP_ID = 'sec_seed_op_org1_20260821';

function runAsRole(role, { sub = null, jwtRole = null } = {}, sql) {
  const effectiveJwtRole = jwtRole || role;
  const subSetup = sub
    ? `SELECT set_config('request.jwt.claim.sub', '${sub}', true);`
    : `SELECT set_config('request.jwt.claim.sub', '', true);`;
  const wrapped = `
    BEGIN;
    SELECT set_config('request.jwt.claim.role', '${effectiveJwtRole}', true);
    ${subSetup}
    SET LOCAL ROLE ${role};
    ${sql}
    COMMIT;
  `;
  return runDisposablePsql(wrapped);
}

function getLedgerAndCandidateCounts() {
  const out = runDisposablePsql(`
    SELECT (SELECT COUNT(*) FROM public.datavertex_credit_ledger) || '|' ||
           (SELECT COUNT(*) FROM public.candidates) || '|' ||
           (SELECT COUNT(*) FROM public.candidate_profiles);
  `);
  return out;
}

describe('DataVertex Credit Ledger & Shortlist RPC Privilege Security', () => {
  const dbCfg = getTestDbConfig();
  let baselineCounts;

  beforeAll(() => {
    if (!dbCfg.isAvailable) {
      throw new Error(dbCfg.reason);
    }

    // Create synthetic candidate user, revoked org member, and baseline org1 ledger entry
    const setupRes = runDisposablePsql(`
      INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
      VALUES
        ('${CANDIDATE_USER_ID}', 'sec-cand@disposable.invalid', 'hash', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"role":"candidate"}'::jsonb, 'authenticated', 'authenticated'),
        ('${REVOKED_MEMBER_ID}', 'sec-revoked@disposable.invalid', 'hash', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"role":"employer"}'::jsonb, 'authenticated', 'authenticated')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.profiles (id, email, name, role)
      VALUES
        ('${CANDIDATE_USER_ID}', 'sec-cand@disposable.invalid', 'Sec Candidate', 'candidate'),
        ('${REVOKED_MEMBER_ID}', 'sec-revoked@disposable.invalid', 'Sec Revoked', 'employer')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.organization_memberships (organization_id, user_id, membership_role, membership_status)
      VALUES ('${ORG1_ID}', '${REVOKED_MEMBER_ID}', 'recruiter', 'removed')
      ON CONFLICT (organization_id, user_id) DO UPDATE SET membership_status = 'removed';

      INSERT INTO public.datavertex_credit_ledger (org_id, hiring_run_id, actor_id, operation_type, operation_id, reserved_credits, settled_credits, status)
      VALUES ('${ORG1_ID}', '${RUN1_ID}', '${ORG1_OWNER}', 'search', '${SEED_OP_ID}', 1, 1, 'settled')
      ON CONFLICT (operation_id) DO NOTHING;
    `);
    expect(setupRes).not.toMatch(/ERROR:/i);
    baselineCounts = getLedgerAndCandidateCounts();
  });

  afterAll(() => {
    if (!dbCfg.isAvailable) return;
    runDisposablePsql(`
      DELETE FROM public.candidates WHERE decision_packet->>'provider_candidate_id' LIKE 'sec_test_%';
      DELETE FROM public.candidate_profiles WHERE name LIKE 'Sec Test %';
      DELETE FROM public.datavertex_credit_ledger WHERE operation_id IN ('${SEED_OP_ID}', 'sec_svc_op_1', 'sec_svc_op_2') OR operation_id LIKE 'sec_neg_%';
      DELETE FROM public.organization_memberships WHERE user_id = '${REVOKED_MEMBER_ID}';
      DELETE FROM public.profiles WHERE id IN ('${CANDIDATE_USER_ID}', '${REVOKED_MEMBER_ID}');
      DELETE FROM auth.users WHERE id IN ('${CANDIDATE_USER_ID}', '${REVOKED_MEMBER_ID}');
    `);
  });

  it('enforces exact table, RLS policy, and RPC privilege catalog state', () => {
    const aclOut = runDisposablePsql(`
      SELECT
        has_table_privilege('anon', 'public.datavertex_credit_ledger', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS anon_any,
        has_table_privilege('authenticated', 'public.datavertex_credit_ledger', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS auth_any,
        has_table_privilege('service_role', 'public.datavertex_credit_ledger', 'SELECT,INSERT,UPDATE,DELETE') AS svc_rw,
        has_function_privilege('anon', 'public.datavertex_get_budget_status(uuid, integer)', 'EXECUTE') AS anon_budget,
        has_function_privilege('authenticated', 'public.datavertex_get_budget_status(uuid, integer)', 'EXECUTE') AS auth_budget,
        has_function_privilege('authenticated', 'public.datavertex_reserve_credits(uuid, uuid, uuid, text, text, integer, integer)', 'EXECUTE') AS auth_reserve,
        has_function_privilege('authenticated', 'public.datavertex_settle_credits(text, integer, jsonb)', 'EXECUTE') AS auth_settle,
        has_function_privilege('authenticated', 'public.datavertex_release_credits(text, text, text)', 'EXECUTE') AS auth_release,
        has_function_privilege('authenticated', 'public.datavertex_mark_uncertain(text, text)', 'EXECUTE') AS auth_uncertain,
        has_function_privilege('anon', 'public.shortlist_candidate_from_provider_transactional(uuid, uuid, text, text, text, text, text, text, text[], timestamp with time zone, text, jsonb)', 'EXECUTE') AS anon_shortlist,
        has_function_privilege('authenticated', 'public.shortlist_candidate_from_provider_transactional(uuid, uuid, text, text, text, text, text, text, text[], timestamp with time zone, text, jsonb)', 'EXECUTE') AS auth_shortlist,
        has_function_privilege('service_role', 'public.datavertex_reserve_credits(uuid, uuid, uuid, text, text, integer, integer)', 'EXECUTE') AS svc_reserve;
    `);
    expect(aclOut).toBe('f|f|t|f|f|f|f|f|f|f|t|t');

    const policyQual = runDisposablePsql(`
      SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'datavertex_credit_ledger' AND policyname = 'datavertex_credit_ledger_org_read';
    `);
    expect(policyQual).toContain('org_id IS NOT NULL');
    expect(policyQual).not.toContain('org_id IS NULL');
  });

  it('rejects all direct table access and RPC calls from anon without modifying state', () => {
    const ops = [
      `SELECT count(*) FROM public.datavertex_credit_ledger;`,
      `INSERT INTO public.datavertex_credit_ledger (org_id, operation_type, operation_id, reserved_credits) VALUES ('${ORG1_ID}', 'search', 'sec_neg_anon_ins', 1);`,
      `UPDATE public.datavertex_credit_ledger SET reserved_credits = 999 WHERE operation_id = '${SEED_OP_ID}';`,
      `DELETE FROM public.datavertex_credit_ledger WHERE operation_id = '${SEED_OP_ID}';`,
      `TRUNCATE TABLE public.datavertex_credit_ledger;`,
      `SELECT * FROM public.datavertex_get_budget_status('${ORG1_ID}', 20);`,
      `SELECT * FROM public.datavertex_reserve_credits('${ORG1_ID}', '${RUN1_ID}', '${ORG1_OWNER}', 'search', 'sec_neg_anon_res', 1, 20);`,
      `SELECT public.datavertex_settle_credits('${SEED_OP_ID}', 0, '{}'::jsonb);`,
      `SELECT public.datavertex_release_credits('${SEED_OP_ID}', 'failed_released', 'tamper');`,
      `SELECT public.datavertex_mark_uncertain('${SEED_OP_ID}', 'tamper');`,
      `SELECT * FROM public.shortlist_candidate_from_provider_transactional('${ORG1_OWNER}', '${RUN1_ID}', 'datavertex', 'sec_test_anon', 'https://example.invalid/anon', 'Sec Test Anon', 'SF', 'Eng', ARRAY['Go'], now(), 'sec_neg_anon_sl', '{}'::jsonb);`,
    ];

    for (const sql of ops) {
      const res = runAsRole('anon', { jwtRole: 'anon' }, sql);
      expect(res).toMatch(/permission denied/i);
    }

    expect(getLedgerAndCandidateCounts()).toBe(baselineCounts);
  }, 30000);

  it('rejects direct table access and all 5 credit ledger RPCs for authenticated same-org, cross-org, candidate, auditor, and revoked roles', () => {
    const actors = [
      { label: 'same-org-owner', sub: ORG1_OWNER },
      { label: 'same-org-recruiter', sub: ORG1_RECRUITER },
      { label: 'cross-org-owner', sub: ORG2_OWNER },
      { label: 'candidate', sub: CANDIDATE_USER_ID },
      { label: 'auditor', sub: ORG1_AUDITOR },
      { label: 'revoked-member', sub: REVOKED_MEMBER_ID },
    ];

    for (const actor of actors) {
      const tableOps = [
        `SELECT * FROM public.datavertex_credit_ledger;`,
        `INSERT INTO public.datavertex_credit_ledger (org_id, operation_type, operation_id, reserved_credits) VALUES ('${ORG1_ID}', 'search', 'sec_neg_${actor.label}', 1);`,
        `UPDATE public.datavertex_credit_ledger SET settled_credits = 0 WHERE operation_id = '${SEED_OP_ID}';`,
        `DELETE FROM public.datavertex_credit_ledger WHERE operation_id = '${SEED_OP_ID}';`,
        `TRUNCATE TABLE public.datavertex_credit_ledger;`,
        `SELECT * FROM public.datavertex_get_budget_status('${ORG1_ID}', 1000);`,
        `SELECT * FROM public.datavertex_reserve_credits('${ORG1_ID}', '${RUN1_ID}', '${actor.sub}', 'search', 'sec_neg_${actor.label}_res', 1, 999);`,
        `SELECT public.datavertex_settle_credits('${SEED_OP_ID}', 0, '{}'::jsonb);`,
        `SELECT public.datavertex_release_credits('${SEED_OP_ID}', 'failed_released', 'spoof');`,
        `SELECT public.datavertex_mark_uncertain('${SEED_OP_ID}', 'spoof');`,
      ];

      for (const sql of tableOps) {
        const res = runAsRole('authenticated', { sub: actor.sub, jwtRole: 'authenticated' }, sql);
        expect(res, `${actor.label} should be denied: ${sql}`).toMatch(/permission denied|RPC_FORBIDDEN/i);
      }
    }

    expect(getLedgerAndCandidateCounts()).toBe(baselineCounts);
  }, 30000);

  it('prevents actor impersonation and cross-org/candidate/auditor/revoked mutations in shortlist_candidate_from_provider_transactional', () => {
    // 1. Same-org recruiter spoofing owner fails
    const spoofByRecruiter = runAsRole(
      'authenticated',
      { sub: ORG1_RECRUITER, jwtRole: 'authenticated' },
      `SELECT * FROM public.shortlist_candidate_from_provider_transactional('${ORG1_OWNER}', '${RUN1_ID}', 'datavertex', 'sec_test_spoof1', 'https://example.invalid/s1', 'Sec Test Spoof1', 'SF', 'Eng', ARRAY['Go'], now(), 'sec_neg_s1', '{}'::jsonb);`
    );
    expect(spoofByRecruiter).toMatch(/RPC_FORBIDDEN.*cannot impersonate actor/i);

    // 2. Cross-org user calling with own sub OR spoofing ORG1_OWNER fails
    const crossOrgDirect = runAsRole(
      'authenticated',
      { sub: ORG2_OWNER, jwtRole: 'authenticated' },
      `SELECT * FROM public.shortlist_candidate_from_provider_transactional('${ORG2_OWNER}', '${RUN1_ID}', 'datavertex', 'sec_test_cross1', 'https://example.invalid/c1', 'Sec Test Cross1', 'SF', 'Eng', ARRAY['Go'], now(), 'sec_neg_c1', '{}'::jsonb);`
    );
    expect(crossOrgDirect).toMatch(/RPC_FORBIDDEN.*not an active member/i);

    const crossOrgSpoof = runAsRole(
      'authenticated',
      { sub: ORG2_OWNER, jwtRole: 'authenticated' },
      `SELECT * FROM public.shortlist_candidate_from_provider_transactional('${ORG1_OWNER}', '${RUN1_ID}', 'datavertex', 'sec_test_cross2', 'https://example.invalid/c2', 'Sec Test Cross2', 'SF', 'Eng', ARRAY['Go'], now(), 'sec_neg_c2', '{}'::jsonb);`
    );
    expect(crossOrgSpoof).toMatch(/RPC_FORBIDDEN.*cannot impersonate actor/i);

    // 3. Candidate, auditor, and revoked member fail
    const candidateShortlist = runAsRole(
      'authenticated',
      { sub: CANDIDATE_USER_ID, jwtRole: 'authenticated' },
      `SELECT * FROM public.shortlist_candidate_from_provider_transactional('${CANDIDATE_USER_ID}', '${RUN1_ID}', 'datavertex', 'sec_test_cand', 'https://example.invalid/cand', 'Sec Test Cand', 'SF', 'Eng', ARRAY['Go'], now(), 'sec_neg_cand', '{}'::jsonb);`
    );
    expect(candidateShortlist).toMatch(/RPC_FORBIDDEN.*not an active member/i);

    const auditorShortlist = runAsRole(
      'authenticated',
      { sub: ORG1_AUDITOR, jwtRole: 'authenticated' },
      `SELECT * FROM public.shortlist_candidate_from_provider_transactional('${ORG1_AUDITOR}', '${RUN1_ID}', 'datavertex', 'sec_test_aud', 'https://example.invalid/aud', 'Sec Test Aud', 'SF', 'Eng', ARRAY['Go'], now(), 'sec_neg_aud', '{}'::jsonb);`
    );
    expect(auditorShortlist).toMatch(/RPC_FORBIDDEN.*Auditor accounts/i);

    const revokedShortlist = runAsRole(
      'authenticated',
      { sub: REVOKED_MEMBER_ID, jwtRole: 'authenticated' },
      `SELECT * FROM public.shortlist_candidate_from_provider_transactional('${REVOKED_MEMBER_ID}', '${RUN1_ID}', 'datavertex', 'sec_test_rev', 'https://example.invalid/rev', 'Sec Test Rev', 'SF', 'Eng', ARRAY['Go'], now(), 'sec_neg_rev', '{}'::jsonb);`
    );
    expect(revokedShortlist).toMatch(/RPC_FORBIDDEN.*not an active member/i);

    expect(getLedgerAndCandidateCounts()).toBe(baselineCounts);

    // 4. Positive test: authorized same-org recruiter calling with matching auth.uid() succeeds
    const allowedShortlist = runAsRole(
      'authenticated',
      { sub: ORG1_RECRUITER, jwtRole: 'authenticated' },
      `SELECT status FROM public.shortlist_candidate_from_provider_transactional('${ORG1_RECRUITER}', '${RUN1_ID}', 'datavertex', 'sec_test_allowed', 'https://example.invalid/allowed', 'Sec Test Allowed', 'SF', 'Eng', ARRAY['Go'], now(), 'sec_pos_recruiter', '{"provider_candidate_id":"sec_test_allowed"}'::jsonb);`
    );
    expect(allowedShortlist).toContain('sourced');
  });

  it('allows service_role to run credit lifecycle RPCs and blocks cross-org operation_id replay', () => {
    const reserveRes = runAsRole(
      'service_role',
      { jwtRole: 'service_role' },
      `SELECT allowed, current_consumed FROM public.datavertex_reserve_credits('${ORG1_ID}', '${RUN1_ID}', '${ORG1_OWNER}', 'search', 'sec_svc_op_1', 2, 20);`
    );
    expect(reserveRes).toMatch(/^t\|\d+/m);

    // Cross-org replay with same operation_id must fail
    const crossOrgReplay = runAsRole(
      'service_role',
      { jwtRole: 'service_role' },
      `SELECT * FROM public.datavertex_reserve_credits('${ORG2_ID}', '${RUN1_ID}', '${ORG2_OWNER}', 'search', 'sec_svc_op_1', 2, 20);`
    );
    expect(crossOrgReplay).toMatch(/RPC_FORBIDDEN.*another organization/i);

    const settleRes = runAsRole(
      'service_role',
      { jwtRole: 'service_role' },
      `SELECT public.datavertex_settle_credits('sec_svc_op_1', 2, '{"ok":true}'::jsonb);`
    );
    expect(settleRes).not.toMatch(/ERROR:/i);

    const budgetRes = runAsRole(
      'service_role',
      { jwtRole: 'service_role' },
      `SELECT settled_count, remaining_budget FROM public.datavertex_get_budget_status('${ORG1_ID}', 20);`
    );
    expect(budgetRes).toMatch(/^\d+\|\d+/m);

    const markUncertainRes = runAsRole(
      'service_role',
      { jwtRole: 'service_role' },
      `SELECT * FROM public.datavertex_reserve_credits('${ORG1_ID}', '${RUN1_ID}', '${ORG1_OWNER}', 'lookup', 'sec_svc_op_2', 1, 20);
       SELECT public.datavertex_mark_uncertain('sec_svc_op_2', 'timeout');
       SELECT public.datavertex_release_credits('sec_svc_op_2', 'failed_released', 'cleaned');`
    );
    expect(markUncertainRes).not.toMatch(/ERROR:/i);
  });
});
