import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.CAREERTWIN_STAGING_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.CAREERTWIN_STAGING_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pwd = process.env.CAREERTWIN_STAGING_TEST_PASSWORD;

describe('PART 2 — COMPLETE TENANT-SECURITY & RPC INTEGRITY SUITE', () => {
  let alphaClient, betaClient, anonClient, serviceClient;

  beforeAll(async () => {
    anonClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Employer Alpha client with isolated session storage
    alphaClient = createClient(supabaseUrl, anonKey, { auth: { storageKey: 'alpha_auth_session', persistSession: false } });
    const { error: alphaErr } = await alphaClient.auth.signInWithPassword({
      email: 'd2c.alpha.owner@example.com',
      password: pwd
    });
    if (alphaErr) throw new Error(`Alpha Signin Failed: ${alphaErr.message}`);

    // Employer Beta client with isolated session storage
    betaClient = createClient(supabaseUrl, anonKey, { auth: { storageKey: 'beta_auth_session', persistSession: false } });
    const { error: betaErr } = await betaClient.auth.signInWithPassword({
      email: 'd2c.beta.owner@example.com',
      password: pwd
    });
    if (betaErr) throw new Error(`Beta Signin Failed: ${betaErr.message}`);
  });

  it('1. Alpha reads Alpha candidate_documents', async () => {
    const { data, error } = await alphaClient
      .from('candidate_documents')
      .select('*')
      .eq('org_id', '00000000-0000-4000-d2c0-000000000001');

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.length).toBeGreaterThan(0);
  });

  it('2. Alpha reads Alpha claim_ledgers', async () => {
    const { data, error } = await alphaClient
      .from('claim_ledgers')
      .select('*')
      .eq('org_id', '00000000-0000-4000-d2c0-000000000001');

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.length).toBeGreaterThan(0);
  });

  it('3. Beta reads Beta candidate_documents', async () => {
    const { data, error } = await betaClient
      .from('candidate_documents')
      .select('*')
      .eq('org_id', '00000000-0000-4000-d2c0-000000000002');

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.length).toBeGreaterThan(0);
  });

  it('4. Beta reads Beta claim_ledgers', async () => {
    const { data, error } = await betaClient
      .from('claim_ledgers')
      .select('*')
      .eq('org_id', '00000000-0000-4000-d2c0-000000000002');

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.length).toBeGreaterThan(0);
  });

  it('5. Alpha CANNOT read Beta candidate_documents (Cross-tenant denial)', async () => {
    const { data, error } = await alphaClient
      .from('candidate_documents')
      .select('*')
      .eq('org_id', '00000000-0000-4000-d2c0-000000000002');

    expect(data).toBeDefined();
    expect(data.length).toBe(0);
  });

  it('6. Alpha CANNOT read Beta claim_ledgers (Cross-tenant denial)', async () => {
    const { data, error } = await alphaClient
      .from('claim_ledgers')
      .select('*')
      .eq('org_id', '00000000-0000-4000-d2c0-000000000002');

    expect(data).toBeDefined();
    expect(data.length).toBe(0);
  });

  it('7. Beta CANNOT read Alpha candidate_documents (Cross-tenant denial)', async () => {
    const { data, error } = await betaClient
      .from('candidate_documents')
      .select('*')
      .eq('org_id', '00000000-0000-4000-d2c0-000000000001');

    expect(data).toBeDefined();
    expect(data.length).toBe(0);
  });

  it('8. Beta CANNOT read Alpha claim_ledgers (Cross-tenant denial)', async () => {
    const { data, error } = await betaClient
      .from('claim_ledgers')
      .select('*')
      .eq('org_id', '00000000-0000-4000-d2c0-000000000001');

    expect(data).toBeDefined();
    expect(data.length).toBe(0);
  });

  it('9. Anonymous CANNOT read candidate_documents', async () => {
    const { data, error } = await anonClient.from('candidate_documents').select('*');
    expect(data === null || data.length === 0 || error !== null).toBe(true);
  });

  it('10. Anonymous CANNOT read claim_ledgers', async () => {
    const { data, error } = await anonClient.from('claim_ledgers').select('*');
    expect(data === null || data.length === 0 || error !== null).toBe(true);
  });

  it('11. Direct RPC execution denied for Anonymous caller', async () => {
    const { data, error } = await anonClient.rpc('allocate_claim_ledger_revision_and_persist', {
      p_candidate_profile_id: '38732c8a-2690-4cc2-8ea5-1953c2cdf456',
      p_hiring_run_id: '11111111-1111-4111-d2c1-111111111111',
      p_org_id: '00000000-0000-4000-d2c0-000000000001',
      p_evidence_refs: [],
      p_claims: [],
      p_claim_edges: [],
      p_evaluation_output: {},
      p_candidate_id: 'b3735538-0b96-4c7b-a484-be6c107d38d5'
    });

    expect(error).not.toBeNull();
  });

  it('12. Direct RPC execution denied for ordinary authenticated Alpha caller', async () => {
    const { data, error } = await alphaClient.rpc('allocate_claim_ledger_revision_and_persist', {
      p_candidate_profile_id: '38732c8a-2690-4cc2-8ea5-1953c2cdf456',
      p_hiring_run_id: '11111111-1111-4111-d2c1-111111111111',
      p_org_id: '00000000-0000-4000-d2c0-000000000001',
      p_evidence_refs: [],
      p_claims: [],
      p_claim_edges: [],
      p_evaluation_output: {},
      p_candidate_id: 'b3735538-0b96-4c7b-a484-be6c107d38d5'
    });

    expect(error).not.toBeNull();
  });

  it('13. Direct RPC execution denied for ordinary authenticated Beta caller', async () => {
    const { data, error } = await betaClient.rpc('allocate_claim_ledger_revision_and_persist', {
      p_candidate_profile_id: '38732c8a-2690-4cc2-8ea5-1953c2cdf456',
      p_hiring_run_id: '11111111-1111-4111-d2c1-111111111111',
      p_org_id: '00000000-0000-4000-d2c0-000000000001',
      p_evidence_refs: [],
      p_claims: [],
      p_claim_edges: [],
      p_evaluation_output: {},
      p_candidate_id: 'b3735538-0b96-4c7b-a484-be6c107d38d5'
    });

    expect(error).not.toBeNull();
  });

  it('14. RPC in-transaction validation rejects forged Alpha candidate + Beta org', async () => {
    const { data, error } = await serviceClient.rpc('allocate_claim_ledger_revision_and_persist', {
      p_candidate_profile_id: '38732c8a-2690-4cc2-8ea5-1953c2cdf456',
      p_hiring_run_id: '11111111-1111-4111-d2c1-111111111111',
      p_org_id: '00000000-0000-4000-d2c0-000000000002', // Forged Org Beta
      p_evidence_refs: [],
      p_claims: [],
      p_claim_edges: [],
      p_evaluation_output: { normalized_text_sha256: '6e6f951f9ffa210b5789b0cd312052deeff8eb4b372633079c0855a5be9c8d88' },
      p_candidate_id: 'b3735538-0b96-4c7b-a484-be6c107d38d5'
    });

    expect(error).not.toBeNull();
    expect(error.message).toContain('RPC_VALIDATION_ERROR');
  });

  it('15. RPC in-transaction validation rejects forged candidate + unrelated hiring run', async () => {
    const { data, error } = await serviceClient.rpc('allocate_claim_ledger_revision_and_persist', {
      p_candidate_profile_id: '38732c8a-2690-4cc2-8ea5-1953c2cdf456',
      p_hiring_run_id: '11111111-1111-4111-d2c1-222222222222', // Forged Hiring Run Beta
      p_org_id: '00000000-0000-4000-d2c0-000000000001',
      p_evidence_refs: [],
      p_claims: [],
      p_claim_edges: [],
      p_evaluation_output: { normalized_text_sha256: '6e6f951f9ffa210b5789b0cd312052deeff8eb4b372633079c0855a5be9c8d88' },
      p_candidate_id: 'b3735538-0b96-4c7b-a484-be6c107d38d5'
    });

    expect(error).not.toBeNull();
    expect(error.message).toContain('RPC_VALIDATION_ERROR');
  });

  it('16. RPC in-transaction validation rejects forged normalized-text hash', async () => {
    const { data, error } = await serviceClient.rpc('allocate_claim_ledger_revision_and_persist', {
      p_candidate_profile_id: '38732c8a-2690-4cc2-8ea5-1953c2cdf456',
      p_hiring_run_id: '11111111-1111-4111-d2c1-111111111111',
      p_org_id: '00000000-0000-4000-d2c0-000000000001',
      p_evidence_refs: [],
      p_claims: [],
      p_claim_edges: [],
      p_evaluation_output: { normalized_text_sha256: '0000000000000000000000000000000000000000000000000000000000000000' }, // Forged Hash
      p_candidate_id: 'b3735538-0b96-4c7b-a484-be6c107d38d5'
    });

    expect(error).not.toBeNull();
    expect(error.message).toContain('RPC_VALIDATION_ERROR');
  });
});
