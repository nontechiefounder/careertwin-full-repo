import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAshbySandboxJobs, importAshbySandboxJob } from '@/lib/integrations/ashby/ashbySandbox';
import { importAshbyLiveJob } from '@/lib/integrations/ashby/ashbyPipeline';

describe('Ashby Intake Pipeline Unit & Contract Suite', () => {
  const mockOrgId = '00000000-0000-4000-c000-000000000001';
  const mockUserId = '11111111-1111-4111-a111-111111111111';

  let mockSupabase;
  let mockHiringRuns;
  let mockCandidateProfiles;
  let mockCandidates;
  let mockDocuments;

  beforeEach(() => {
    mockHiringRuns = [];
    mockCandidateProfiles = [];
    mockCandidates = [];
    mockDocuments = [];

    mockSupabase = {
      from: vi.fn((table) => {
        if (table === 'hiring_runs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col, val) => {
                const filtered = mockHiringRuns.filter(r => r[col] === val);
                return Promise.resolve({ data: filtered, error: null });
              })
            }),
            insert: vi.fn().mockImplementation((rows) => {
              const inserted = rows.map((r, i) => ({
                id: `run-${mockHiringRuns.length + i + 1}`,
                ...r
              }));
              mockHiringRuns.push(...inserted);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: inserted[0], error: null })
                })
              };
            }),
            update: vi.fn().mockImplementation((updates) => ({
              eq: vi.fn().mockImplementation((col, val) => {
                const idx = mockHiringRuns.findIndex(r => r[col] === val);
                if (idx >= 0) {
                  mockHiringRuns[idx] = { ...mockHiringRuns[idx], ...updates };
                }
                return Promise.resolve({ data: mockHiringRuns[idx], error: null });
              })
            }))
          };
        }

        if (table === 'candidates') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col, val) => {
                const filtered = mockCandidates.filter(c => c[col] === val);
                return Promise.resolve({ data: filtered, error: null });
              })
            }),
            insert: vi.fn().mockImplementation((rows) => {
              const inserted = rows.map((r, i) => ({
                id: `cand-${mockCandidates.length + i + 1}`,
                ...r
              }));
              mockCandidates.push(...inserted);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: inserted[0], error: null })
                })
              };
            }),
            update: vi.fn().mockImplementation((fields) => ({
              eq: vi.fn().mockImplementation((col, val) => {
                const found = mockCandidates.find(c => c[col] === val);
                if (found) Object.assign(found, fields);
                return Promise.resolve({ data: found || {}, error: null });
              })
            }))
          };
        }

        if (table === 'candidate_profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col, val) => ({
                maybeSingle: vi.fn().mockImplementation(() => {
                  const found = mockCandidateProfiles.find(p => p[col] === val);
                  return Promise.resolve({ data: found || null, error: null });
                })
              }))
            }),
            insert: vi.fn().mockImplementation((rows) => {
              const inserted = rows.map((r, i) => ({
                id: `prof-${mockCandidateProfiles.length + i + 1}`,
                ...r
              }));
              mockCandidateProfiles.push(...inserted);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: inserted[0], error: null })
                })
              };
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: {}, error: null })
            })
          };
        }

        if (table === 'candidate_documents') {
          return {
            insert: vi.fn().mockImplementation((rows) => {
              mockDocuments.push(...rows);
              return Promise.resolve({ data: rows, error: null });
            })
          };
        }

        return {};
      })
    };
  });

  it('1. getAshbySandboxJobs returns available sandbox jobs catalog', () => {
    const jobs = getAshbySandboxJobs();
    expect(jobs).toBeInstanceOf(Array);
    expect(jobs.length).toBeGreaterThanOrEqual(1);

    const first = jobs[0];
    expect(first.id).toBe('ashby_job_dist_sys_01');
    expect(first.title).toBe('Senior Distributed Systems Engineer');
    expect(first.department).toBe('Core Infrastructure');
    expect(first.applications_count).toBe(3);
  });

  it('2. importAshbySandboxJob dry-run validates candidate count without mutating database', async () => {
    const dryRunResult = await importAshbySandboxJob({
      supabase: mockSupabase,
      userId: mockUserId,
      orgId: mockOrgId,
      jobId: 'ashby_job_dist_sys_01',
      dryRun: true
    });

    expect(dryRunResult.ok).toBe(true);
    expect(dryRunResult.dry_run).toBe(true);
    expect(dryRunResult.applications_count).toBe(3);
    expect(dryRunResult.candidates.length).toBe(3);
    expect(mockHiringRuns.length).toBe(0);
    expect(mockCandidates.length).toBe(0);
  });

  it('3. importAshbySandboxJob creates hiring run, candidate records, and resume documents with tenant binding', async () => {
    const result = await importAshbySandboxJob({
      supabase: mockSupabase,
      userId: mockUserId,
      orgId: mockOrgId,
      jobId: 'ashby_job_dist_sys_01',
      dryRun: false
    });

    expect(result.ok).toBe(true);
    expect(result.is_new_run).toBe(true);
    expect(result.applications_processed).toBe(3);
    expect(result.candidates_imported).toBe(3);

    // Verify hiring run properties
    expect(mockHiringRuns.length).toBe(1);
    const run = mockHiringRuns[0];
    expect(run.org_id).toBe(mockOrgId);
    expect(run.employer_id).toBe(mockUserId);
    expect(run.role_title).toBe('Senior Distributed Systems Engineer');

    // Strict boundary: ATS metadata is separated from approved criteria
    expect(run.brief_json.ats_metadata.source).toBe('ashby');
    expect(run.brief_json.ats_metadata.external_job_id).toBe('ashby_job_dist_sys_01');
    expect(run.brief_json.ats_metadata.criteria_approved).toBe(false);
    expect(run.brief_json.contract_approved).toBe(false);

    // Verify candidates created
    expect(mockCandidates.length).toBe(3);
    expect(mockCandidateProfiles.length).toBe(3);
    // Elena Rostova, Marcus Vance, Aria Chen
    expect(mockCandidateProfiles.map(p => p.name)).toContain('Elena Rostova');
    expect(mockCandidateProfiles.map(p => p.name)).toContain('Marcus Vance');
    expect(mockCandidateProfiles.map(p => p.name)).toContain('Aria Chen');

    // Verify resume documents
    expect(mockDocuments.length).toBe(3);
    expect(mockDocuments[0].document_type).toBe('resume');
    expect(mockDocuments[0].metadata.source).toBe('ashby');
  });

  it('4. importAshbySandboxJob is strictly idempotent: re-running does NOT duplicate run or candidates', async () => {
    // Initial run
    await importAshbySandboxJob({
      supabase: mockSupabase,
      userId: mockUserId,
      orgId: mockOrgId,
      jobId: 'ashby_job_dist_sys_01',
      dryRun: false
    });

    expect(mockHiringRuns.length).toBe(1);
    expect(mockCandidates.length).toBe(3);

    // Second run with same job
    const retryResult = await importAshbySandboxJob({
      supabase: mockSupabase,
      userId: mockUserId,
      orgId: mockOrgId,
      jobId: 'ashby_job_dist_sys_01',
      dryRun: false
    });

    expect(retryResult.ok).toBe(true);
    expect(retryResult.is_new_run).toBe(false);
    expect(mockHiringRuns.length).toBe(1); // 0 duplicate runs created
    expect(retryResult.candidates_updated).toBe(3);
    expect(retryResult.candidates_imported).toBe(0);
  });

  it('5. importAshbyLiveJob calls ashbyClient endpoints, ingests with ashby_live_api provenance, and reports partial failures', async () => {
    const mockAshbyClient = {
      getJobInfo: vi.fn().mockResolvedValue({
        results: {
          id: 'live-job-1',
          title: 'Staff Systems Architect',
          department: { name: 'Platform' },
          location: { name: 'Remote' },
          employmentType: 'FullTime',
          descriptionPlain: 'Build resilient systems.'
        }
      }),
      listApplications: vi.fn().mockResolvedValue({
        results: [
          { id: 'app-1', candidateId: 'cand-1', status: 'Active' },
          { id: 'app-2', candidateId: 'cand-2', status: 'Active' }
        ]
      }),
      getCandidateInfo: vi.fn().mockImplementation(async (id) => {
        if (id === 'cand-1') {
          return {
            results: {
              id: 'cand-1',
              name: 'Jordan Lee',
              primaryEmailAddress: { value: 'jordan@example.com' },
              position: 'Staff Engineer',
              company: 'Acme',
              tags: [{ title: 'Rust' }, { title: 'Distributed Systems' }]
            }
          };
        }
        throw new Error('Candidate lookup 404');
      }),
      getCandidateResume: vi.fn().mockResolvedValue({
        results: { id: 'doc-1', name: 'Jordan_Resume.pdf', revision: 2, text: 'Rust systems' }
      })
    };

    const result = await importAshbyLiveJob({
      ashbyClient: mockAshbyClient,
      supabase: mockSupabase,
      userId: mockUserId,
      orgId: mockOrgId,
      jobId: 'live-job-1',
      dryRun: false
    });

    expect(mockAshbyClient.getJobInfo).toHaveBeenCalledWith('live-job-1');
    expect(mockAshbyClient.listApplications).toHaveBeenCalledWith({ jobId: 'live-job-1' });
    expect(result.ok).toBe(true);
    expect(result.source_type).toBe('ashby_live_api');
    expect(result.candidates_imported).toBe(1);
    expect(result.partial_failures).toHaveLength(1);
    expect(result.partial_failures[0].candidate_id).toBe('cand-2');
    expect(mockHiringRuns[0].brief_json.ats_metadata.source_type).toBe('ashby_live_api');
  });
});
