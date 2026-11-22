import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as DataVertex from '@/lib/datavertex/client';

describe('DataVertex Adapter Unit Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('fails closed when DATAVERTEX_API_KEY is missing', async () => {
    delete process.env.DATAVERTEX_API_KEY;

    await expect(DataVertex.getAccount()).rejects.toThrow('DataVertex API is unconfigured');
    await expect(DataVertex.searchCandidates({ free_text_search: 'test' })).rejects.toThrow('DataVertex API is unconfigured');
    await expect(DataVertex.lookupCandidate({ linkedin_url: 'https://linkedin.com/in/test' })).rejects.toThrow('DataVertex API is unconfigured');
  });

  it('validates mutual exclusivity of free_text_search and jd_search', async () => {
    process.env.DATAVERTEX_API_KEY = 'test_key_123';

    await expect(
      DataVertex.searchCandidates({
        free_text_search: 'Software Engineer',
        jd_search: 'We are seeking an engineer...',
      })
    ).rejects.toThrow('free_text_search and jd_search cannot be used in the same request');
  });

  it('validates input length constraints', async () => {
    process.env.DATAVERTEX_API_KEY = 'test_key_123';

    // free_text_search exceeds 300 characters
    const longFreeText = 'a'.repeat(301);
    await expect(
      DataVertex.searchCandidates({ free_text_search: longFreeText })
    ).rejects.toThrow('exceeds maximum length of 300 characters');

    // jd_search exceeds 8500 characters
    const longJdText = 'b'.repeat(8501);
    await expect(
      DataVertex.searchCandidates({ jd_search: longJdText })
    ).rejects.toThrow('exceeds maximum length of 8,500 characters');
  });

  it('rejects lookup when neither linkedin_url nor candidate_id is provided', async () => {
    process.env.DATAVERTEX_API_KEY = 'test_key_123';

    await expect(
      DataVertex.lookupCandidate({})
    ).rejects.toThrow('valid linkedin_url or candidate_id is required');
  });

  it('enforces credit ceiling', async () => {
    process.env.DATAVERTEX_API_KEY = 'test_key_123';
    process.env.DATAVERTEX_MAX_CREDITS = '0'; // Immediately hit ceiling

    await expect(
      DataVertex.searchCandidates({ free_text_search: 'Engineer' })
    ).rejects.toThrow('credit ceiling reached');
  });

  it('sanitizes undocumented skills from search_criteria and populates free_text_search', async () => {
    process.env.DATAVERTEX_API_KEY = 'test_key_123';

    let capturedBody = null;
    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          data: { profiles: [], pagination: {} },
          credits: { used: 1, remaining: 19 },
        }),
      };
    });

    const res = await DataVertex.searchCandidates({
      search_criteria: {
        current_title: 'Senior Engineer',
        skills: ['Distributed Systems', 'Go'],
      },
    });

    expect(res.success).toBe(true);
    expect(capturedBody).toBeDefined();
    // search_criteria must NOT contain 'skills'
    expect(capturedBody.search_criteria.skills).toBeUndefined();
    expect(capturedBody.search_criteria.current_title).toEqual(['Senior Engineer']);
    // skills should be transferred cleanly to free_text_search
    expect(capturedBody.free_text_search).toBe('Distributed Systems, Go');
  });

  it('handles 404 lookup cleanly by returning full_profile_unavailable', async () => {
    process.env.DATAVERTEX_API_KEY = 'test_key_123';

    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      };
    });

    const res = await DataVertex.lookupCandidate({
      linkedin_url: 'https://linkedin.com/in/unknown-candidate-12345',
      enrich_profile: true,
    });

    expect(res.success).toBe(true);
    expect(res.full_profile_unavailable).toBe(true);
    expect(res.message).toBe('Full profile unavailable; showing search summary.');
    expect(res.contact).toBeNull();
  });

  it('calls atomic credit reservation RPC when supabase client is provided', async () => {
    process.env.DATAVERTEX_API_KEY = 'test_key_123';

    const rpcMock = vi.fn().mockImplementation(async (fnName, params) => {
      if (fnName === 'datavertex_reserve_credits') {
        return {
          data: [{ allowed: true, current_consumed: 1, remaining_credits: 19, ledger_id: 'ledger_uuid_123' }],
          error: null,
        };
      }
      if (fnName === 'datavertex_settle_credits') {
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });

    const mockSupabase = { rpc: rpcMock };

    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({
          data: { profiles: [], pagination: {} },
          credits: { used: 1, remaining: 19 },
        }),
      };
    });

    const res = await DataVertex.searchCandidates({
      supabase: mockSupabase,
      org_id: 'org_123',
      hiring_run_id: 'run_123',
      actor_id: 'actor_123',
      free_text_search: 'Staff Backend Architect',
    });

    expect(res.success).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('datavertex_reserve_credits', expect.objectContaining({
      p_org_id: 'org_123',
      p_hiring_run_id: 'run_123',
      p_actor_id: 'actor_123',
      p_expected_cost: 1,
      p_hard_ceiling: expect.any(Number),
    }));
    expect(rpcMock).toHaveBeenCalledWith('datavertex_settle_credits', expect.objectContaining({
      p_settled_credits: 1,
    }));
  });

  it('routes candidate search to DataVertex as primary provider', async () => {
    process.env.DATAVERTEX_API_KEY = 'test_key_123';

    let calledUrl = null;
    global.fetch = vi.fn().mockImplementation(async (url) => {
      calledUrl = url;
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: { profiles: [{ id: 'dv_1', name: 'Alice' }], pagination: { total: 1 } },
          credits: { used: 1, remaining: 299 },
        }),
      };
    });

    const res = await DataVertex.searchCandidates({
      free_text_search: 'Principal Engineer',
    });

    expect(res.success).toBe(true);
    expect(calledUrl).toContain('api.data-vertex.com/v1/search');
    expect(res.provider).toBe('DataVertex Candidate Network (Primary)');
    expect(res.data.profiles[0].name).toBe('Alice');
  });

  it('transparently falls back to Coresignal secondary when DataVertex fails', async () => {
    process.env.DATAVERTEX_API_KEY = 'test_key_123';
    process.env.CORESIGNAL_API_KEY = 'test_coresignal_key';

    // DataVertex primary returns 500
    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      if (url.includes('api.data-vertex.com')) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ message: 'DataVertex internal error' }),
        };
      }
      if (url.includes('api.coresignal.com')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: 999,
                full_name: 'Bob Backup',
                active_experience_title: 'Staff Engineer',
                company_name: 'Acme',
              },
            ],
          }),
        };
      }
      return { ok: false, status: 404 };
    });

    const res = await DataVertex.searchCandidates({
      free_text_search: 'Staff Engineer',
    });

    expect(res.success).toBe(true);
    expect(res.provider).toBe('Coresignal Talent Network (Secondary Backup)');
    expect(res.fallback_active).toBe(true);
    expect(res.data.profiles.length).toBeGreaterThan(0);
    expect(res.data.profiles[0].name).toBe('Bob Backup');
  });
});
