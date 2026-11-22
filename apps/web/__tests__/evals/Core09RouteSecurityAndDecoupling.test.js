import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// Mock serverAuth helpers, supabaseServer, and @supabase/supabase-js admin client
vi.mock('@/lib/serverAuth', () => ({
  requireUser: vi.fn(),
  getVerifiedOrgMembership: vi.fn(),
}));

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

// Mock parseDocument
vi.mock('@/lib/parser/documentParser', () => ({
  parseDocument: vi.fn().mockResolvedValue({
    filename: 'test_resume.pdf',
    file_sha256: 'a'.repeat(64),
    normalized_text: 'Sarah Connor\nProgramming & Scripting: Go, Python, Bash\nCloud Infrastructure Architect',
    normalized_text_sha256: 'b'.repeat(64),
    parser_name: 'pdf-parse@2.4.5',
    page_count: 1,
    page_spans: [{ page_number: 1, start_char: 0, end_char: 100 }]
  })
}));

import { POST as uploadRoute } from '@/app/api/employer/candidate-documents/upload/route';
import { GET as downloadRoute } from '@/app/api/employer/candidate-documents/[documentId]/download/route';
import { POST as actionRoute } from '@/app/api/employer/packets/[extractionId]/action/route';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { createClient } from '@supabase/supabase-js';

function createMockFile(content = '%PDF-1.4 sample content', name = 'resume.pdf', type = 'application/pdf') {
  const buf = Buffer.from(content);
  return {
    name,
    type,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  };
}

function createMockUploadRequest(fields = {}, fileObj = null) {
  const map = new Map();
  for (const [k, v] of Object.entries(fields)) {
    map.set(k, v);
  }
  if (fileObj) {
    map.set('file', fileObj);
  }
  return {
    headers: new Headers(),
    formData: async () => ({
      get: (k) => map.get(k) || null
    })
  };
}

describe('CTW-V2-DEMO-CORE-09 Route Security, Account Decoupling & Revision Conflict Suite', () => {
  const ALPHA_ORG_ID = '00000000-0000-4000-c000-000000000001';
  const BETA_ORG_ID = '00000000-0000-4000-c000-000000000002';
  const ALPHA_USER = { id: '00000000-0000-4000-a000-000000000001', email: 'alpha@enterprise.com' };
  const BETA_USER = { id: '00000000-0000-4000-a000-000000000002', email: 'beta@enterprise.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    createClient.mockReset();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54421');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // 1. Upload Route Authorization, Tenant Isolation & Decoupling
  describe('1. Upload Route Authorization, Tenant Isolation & Independent Candidate Creation', () => {
    it('1.1 returns HTTP 400 when no file is uploaded', async () => {
      requireUser.mockResolvedValueOnce({
        errorResponse: null,
        user: ALPHA_USER,
        supabase: {}
      });

      const req = createMockUploadRequest({ hiring_run_id: '11111111-1111-4111-a111-111111111111' }, null);
      const res = await uploadRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('NO_FILE_UPLOADED');
    });

    it('1.2 returns HTTP 415 when uploaded file is not a PDF (DOCX / unsupported formats rejected)', async () => {
      requireUser.mockResolvedValueOnce({
        errorResponse: null,
        user: ALPHA_USER,
        supabase: {}
      });

      const fakeDocx = createMockFile('fake docx', 'resume.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      const req = createMockUploadRequest({ hiring_run_id: '11111111-1111-4111-a111-111111111111' }, fakeDocx);

      const res = await uploadRoute(req);
      expect(res.status).toBe(415);
      const data = await res.json();
      expect(data.error).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('1.3 returns HTTP 400 when hiring_run_id is malformed (no silent org substitution)', async () => {
      requireUser.mockResolvedValueOnce({
        errorResponse: null,
        user: ALPHA_USER,
        supabase: {}
      });

      const fakePdf = createMockFile();
      const req = createMockUploadRequest({ hiring_run_id: 'not-a-valid-uuid' }, fakePdf);

      const res = await uploadRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('INVALID_HIRING_RUN_ID');
    });

    it('1.4 returns HTTP 404 when hiring_run_id does not exist', async () => {
      const mockSupabase = {
        from: vi.fn((table) => {
          if (table === 'hiring_runs') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
            };
          }
          return {};
        })
      };

      requireUser.mockResolvedValueOnce({
        errorResponse: null,
        user: ALPHA_USER,
        supabase: mockSupabase
      });

      const fakePdf = createMockFile();
      const req = createMockUploadRequest({ hiring_run_id: '99999999-9999-4999-8999-999999999999' }, fakePdf);

      const res = await uploadRoute(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('HIRING_RUN_NOT_FOUND');
    });

    it('1.5 returns HTTP 403 when user attempts to access foreign tenant hiring run', async () => {
      const mockSupabase = {
        from: vi.fn((table) => {
          if (table === 'hiring_runs') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: '22222222-2222-4222-b222-222222222222', org_id: BETA_ORG_ID, status: 'active' },
                error: null
              })
            };
          }
          return {};
        })
      };

      requireUser.mockResolvedValueOnce({
        errorResponse: null,
        user: ALPHA_USER,
        supabase: mockSupabase
      });

      // User belongs to Alpha, but run belongs to Beta
      getVerifiedOrgMembership.mockResolvedValueOnce(null);

      const fakePdf = createMockFile();
      const req = createMockUploadRequest({ hiring_run_id: '22222222-2222-4222-b222-222222222222' }, fakePdf);

      const res = await uploadRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('FORBIDDEN');
    });

    it('1.6 returns HTTP 409 when candidate belongs to a different hiring run', async () => {
      const mockSupabase = {
        from: vi.fn((table) => {
          if (table === 'hiring_runs') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: '11111111-1111-4111-a111-111111111111', org_id: ALPHA_ORG_ID, status: 'active' },
                error: null
              })
            };
          }
          return {};
        })
      };

      const mockService = {
        from: vi.fn((table) => {
          if (table === 'candidates') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'cand-foreign-123', hiring_run_id: '99999999-9999-4999-a999-999999999999', candidate_id: 'prof-1' },
                error: null
              })
            };
          }
          return {};
        })
      };

      requireUser.mockResolvedValueOnce({
        errorResponse: null,
        user: ALPHA_USER,
        supabase: mockSupabase
      });
      createClient.mockReturnValue(mockSupabase);
      getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: 'owner' });
      createSupabaseServerClient.mockResolvedValueOnce(mockService);

      const fakePdf = createMockFile();
      const req = createMockUploadRequest({
        hiring_run_id: '11111111-1111-4111-a111-111111111111',
        candidate_id: '00000000-0000-4000-b000-000000000001'
      }, fakePdf);

      const res = await uploadRoute(req);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe('CANDIDATE_RUN_MISMATCH');
    });

    it('1.7 creates candidate independently of login accounts (no auth.admin.createUser)', async () => {
      const mockStorage = {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: null }),
          remove: vi.fn().mockResolvedValue({ error: null })
        })
      };

      const mockService = {
        storage: mockStorage,
        from: vi.fn((table) => {
          if (table === 'candidate_profiles') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'prof-new-123', name: 'Sarah Connor', bio: 'Infrastructure Architect' },
                    error: null
                  })
                })
              })
            };
          }
          if (table === 'candidates') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'cand-row-new-123', candidate_id: 'prof-new-123', hiring_run_id: '11111111-1111-4111-a111-111111111111' },
                    error: null
                  })
                })
              })
            };
          }
          if (table === 'candidate_documents') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'doc-new-123',
                      candidate_id: 'prof-new-123',
                      org_id: ALPHA_ORG_ID,
                      storage_path: `${ALPHA_ORG_ID}/11111111-1111-4111-a111-111111111111/doc-new-123/resume.pdf`
                    },
                    error: null
                  })
                })
              })
            };
          }
          return {};
        })
      };

      const mockSupabase = {
        from: vi.fn((table) => {
          if (table === 'hiring_runs') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: '11111111-1111-4111-a111-111111111111', org_id: ALPHA_ORG_ID, status: 'active' },
                error: null
              })
            };
          }
          return {};
        })
      };

      requireUser.mockResolvedValueOnce({
        errorResponse: null,
        user: ALPHA_USER,
        supabase: mockSupabase
      });
      createClient.mockReturnValue(mockSupabase);
      getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: 'owner' });
      createSupabaseServerClient.mockResolvedValueOnce(mockService);

      const fakePdf = createMockFile();
      const req = createMockUploadRequest({
        hiring_run_id: '11111111-1111-4111-a111-111111111111',
        candidate_name: 'Sarah Connor'
      }, fakePdf);

      const res = await uploadRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.candidate_id).toBe('cand-row-new-123');
      expect(data.profile_id).toBe('prof-new-123');
      expect(data.storage_path).toContain(ALPHA_ORG_ID);
    });

    it('1.8 rejects candidate document upload when candidate belongs to a foreign organization (no storage/db writes)', async () => {
      const mockStorage = {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: null })
        })
      };

      const mockService = {
        storage: mockStorage,
        from: vi.fn((table) => {
          if (table === 'candidates') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'cand-foreign-row',
                  hiring_run_id: 'run-foreign-999',
                  candidate_id: 'prof-foreign-999',
                  hiring_runs: { org_id: BETA_ORG_ID } // Foreign org!
                },
                error: null
              })
            };
          }
          return {};
        })
      };

      const mockSupabase = {
        from: vi.fn((table) => {
          if (table === 'hiring_runs') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: '11111111-1111-4111-a111-111111111111', org_id: ALPHA_ORG_ID, status: 'active' },
                error: null
              })
            };
          }
          return {};
        })
      };

      requireUser.mockResolvedValueOnce({
        errorResponse: null,
        user: ALPHA_USER,
        supabase: mockSupabase
      });
      createClient.mockReturnValue(mockSupabase);
      getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: 'owner' });
      createSupabaseServerClient.mockResolvedValueOnce(mockService);

      const fakePdf = createMockFile();
      const req = createMockUploadRequest({
        hiring_run_id: '11111111-1111-4111-a111-111111111111',
        candidate_id: '00000000-0000-4000-b000-000000000002' // Belongs to Beta
      }, fakePdf);

      const res = await uploadRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('FORBIDDEN');
      // Storage upload must NEVER have been called!
      expect(mockStorage.from().upload).not.toHaveBeenCalled();
    });

    it('1.9 rejects direct candidate_profiles lookup when candidate_profile has no relationship to caller organization', async () => {
      const mockStorage = {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: null })
        })
      };

      const mockService = {
        storage: mockStorage,
        from: vi.fn((table) => {
          if (table === 'candidates') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockImplementation((col, val) => {
                return {
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  then: (resolve) => resolve({ data: [], error: null })
                };
              })
            };
          }
          if (table === 'candidate_profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'prof-foreign-isolated', name: 'Isolated Profile' },
                error: null
              })
            };
          }
          if (table === 'candidate_documents') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockImplementation((col, val) => {
                return {
                  then: (resolve) => resolve({ data: [], error: null })
                };
              })
            };
          }
          return {};
        })
      };

      const mockSupabase = {
        from: vi.fn((table) => {
          if (table === 'hiring_runs') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: '11111111-1111-4111-a111-111111111111', org_id: ALPHA_ORG_ID, status: 'active' },
                error: null
              })
            };
          }
          return {};
        })
      };

      requireUser.mockResolvedValueOnce({
        errorResponse: null,
        user: ALPHA_USER,
        supabase: mockSupabase
      });
      createClient.mockReturnValue(mockSupabase);
      getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: 'owner' });
      createSupabaseServerClient.mockResolvedValueOnce(mockService);

      const fakePdf = createMockFile();
      const req = createMockUploadRequest({
        hiring_run_id: '11111111-1111-4111-a111-111111111111',
        candidate_id: '00000000-0000-4000-b000-000000000099'
      }, fakePdf);

      const res = await uploadRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('FORBIDDEN');
      expect(mockStorage.from().upload).not.toHaveBeenCalled();
    });
  });

  // 2. Download Route Security & Byte Hash Integrity
  describe('2. Download Route Tenant Security & Byte Verification', () => {
    it('2.1 returns HTTP 403 when user belongs to different organization', async () => {
      const mockService = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'doc-alpha-1', org_id: ALPHA_ORG_ID, storage_path: 'alpha/path.pdf' },
            error: null
          })
        })
      };

      requireUser.mockResolvedValueOnce({
        errorResponse: null,
        user: BETA_USER,
        supabase: {}
      });
      createSupabaseServerClient.mockResolvedValueOnce(mockService);
      getVerifiedOrgMembership.mockResolvedValueOnce(null);

      const req = new Request('http://localhost:3000/api/employer/candidate-documents/doc-alpha-1/download');
      const res = await downloadRoute(req, { params: Promise.resolve({ documentId: 'doc-alpha-1' }) });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('FORBIDDEN');
    });

    it('2.2 returns HTTP 200 and validates byte SHA-256 for authorized download', async () => {
      const samplePdfBytes = Buffer.from('%PDF-1.4 genuine content for testing');
      const expectedSha = crypto.createHash('sha256').update(samplePdfBytes).digest('hex');

      const mockService = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'doc-alpha-1',
              org_id: ALPHA_ORG_ID,
              storage_path: 'alpha/doc-1/resume.pdf',
              file_sha256: expectedSha,
              mime_type: 'application/pdf',
              filename: 'sarah_connor.pdf',
              parser_name: 'pdf-parse@2.4.5'
            },
            error: null
          })
        }),
        storage: {
          from: vi.fn().mockReturnValue({
            download: vi.fn().mockResolvedValue({
              data: {
                arrayBuffer: async () => samplePdfBytes.buffer.slice(samplePdfBytes.byteOffset, samplePdfBytes.byteOffset + samplePdfBytes.byteLength)
              },
              error: null
            })
          })
        }
      };

      requireUser.mockResolvedValueOnce({
        errorResponse: null,
        user: ALPHA_USER,
        supabase: {}
      });
      createSupabaseServerClient.mockResolvedValueOnce(mockService);
      getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: 'admin' });

      const req = new Request('http://localhost:3000/api/employer/candidate-documents/doc-alpha-1/download');
      const res = await downloadRoute(req, { params: Promise.resolve({ documentId: 'doc-alpha-1' }) });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
      expect(res.headers.get('X-File-SHA256')).toBe(expectedSha);
      expect(res.headers.get('X-Parser-Name')).toBe('pdf-parse@2.4.5');
    });
  });

  // 3. Human Decision Action Route Revision-Awareness
  describe('3. Action Route Revision Conflict & Atomic RPC Mapping', () => {
    it('3.1 returns HTTP 409 REVIEW_REVISION_CONFLICT when RPC raises revision conflict', async () => {
      const mockSupabase = {
        from: vi.fn((table) => {
          if (table === 'candidates') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'cand-123',
                  candidate_id: 'prof-123',
                  hiring_run_id: 'run-123',
                  decision_packet: { ledger_revision: 2, rubric_version: '1.0.0' },
                  hiring_runs: { id: 'run-123', org_id: ALPHA_ORG_ID, role_title: 'Architect' }
                },
                error: null
              })
            };
          }
          if (table === 'candidate_profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: 'prof-123', name: 'Sarah Connor', email: 'sarah@example.com' },
                error: null
              })
            };
          }
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: 'emp-1', name: 'Alpha Recruiter', gmail_email: 'recruiter@alpha.com' },
                error: null
              })
            };
          }
          if (table === 'activity_events' || table === 'scheduled_emails') {
            return {
              insert: vi.fn().mockResolvedValue({ data: null, error: null })
            };
          }
          return {};
        }),
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: {
            message: 'REVIEW_REVISION_CONFLICT: Expected ledger revision 1 does not match current packet revision 2'
          }
        })
      };

      requireUser.mockResolvedValueOnce({
        errorResponse: null,
        user: ALPHA_USER,
        supabase: mockSupabase
      });
      createClient.mockReturnValue(mockSupabase);
      getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: 'owner' });

      const req = new Request('http://localhost:3000/api/employer/packets/cand-123/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'advance',
          rationale: 'Looks great',
          expected_ledger_revision: 1,
          expected_rubric_version: '1.0.0'
        })
      });

      const res = await actionRoute(req, { params: Promise.resolve({ extractionId: 'cand-123' }) });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe('REVIEW_REVISION_CONFLICT');
      expect(data.requires_refresh).toBe(true);
    });

    it('3.2 returns HTTP 200 on successful transactional review update', async () => {
      const updatedPacket = {
        ledger_revision: 2,
        rubric_version: '1.0.0',
        human_decision: {
          action: 'advance',
          status: 'shortlisted',
          requires_re_review: false,
          decision_history: [{ action: 'advance' }]
        }
      };

      const mockSupabase = {
        from: vi.fn((table) => {
          if (table === 'candidates') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'cand-123',
                  candidate_id: 'prof-123',
                  hiring_run_id: 'run-123',
                  decision_packet: { ledger_revision: 2, rubric_version: '1.0.0' },
                  hiring_runs: { id: 'run-123', org_id: ALPHA_ORG_ID, role_title: 'Architect' }
                },
                error: null
              })
            };
          }
          if (table === 'candidate_profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: 'prof-123', name: 'Sarah Connor', email: 'sarah@example.com' },
                error: null
              })
            };
          }
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: 'emp-1', name: 'Alpha Recruiter', gmail_email: 'recruiter@alpha.com' },
                error: null
              })
            };
          }
          if (table === 'activity_events' || table === 'scheduled_emails') {
            return {
              insert: vi.fn().mockResolvedValue({ data: null, error: null })
            };
          }
          return {};
        }),
        rpc: vi.fn().mockResolvedValue({
          data: [{
            candidate_id: 'cand-123',
            status: 'shortlisted',
            decision_packet: updatedPacket,
            audit_event_id: 'evt-1'
          }],
          error: null
        })
      };

      requireUser.mockResolvedValueOnce({
        errorResponse: null,
        user: ALPHA_USER,
        supabase: mockSupabase
      });
      createClient.mockReturnValue(mockSupabase);
      getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: 'owner' });

      const req = new Request('http://localhost:3000/api/employer/packets/cand-123/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'advance',
          rationale: 'Verified against revision 2',
          expected_ledger_revision: 2,
          expected_rubric_version: '1.0.0'
        })
      });

      const res = await actionRoute(req, { params: Promise.resolve({ extractionId: 'cand-123' }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.status).toBe('shortlisted');
      expect(data.decision_packet.human_decision.requires_re_review).toBe(false);
    });

    it('3.3 rejects request when expected_ledger_revision is missing (HTTP 400 INVALID_REVISION)', async () => {
      requireUser.mockResolvedValueOnce({
        errorResponse: null,
        user: ALPHA_USER,
        supabase: {}
      });
      getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: 'owner' });

      const req = new Request('http://localhost:3000/api/employer/packets/cand-123/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'advance',
          rationale: 'Missing expected_ledger_revision',
          expected_rubric_version: '1.0.0'
        })
      });

      const res = await actionRoute(req, { params: Promise.resolve({ extractionId: 'cand-123' }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('INVALID_REVISION');
    });

    it('3.4 rejects request when expected_ledger_revision is malformed (HTTP 400 INVALID_REVISION)', async () => {
      requireUser.mockResolvedValueOnce({
        errorResponse: null,
        user: ALPHA_USER,
        supabase: {}
      });
      getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: 'owner' });

      const req = new Request('http://localhost:3000/api/employer/packets/cand-123/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'advance',
          rationale: 'Negative revision',
          expected_ledger_revision: -1,
          expected_rubric_version: '1.0.0'
        })
      });

      const res = await actionRoute(req, { params: Promise.resolve({ extractionId: 'cand-123' }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('INVALID_REVISION');
    });

    it('3.5 rejects request when expected_rubric_version is missing or empty (HTTP 400 INVALID_REVISION)', async () => {
      requireUser.mockResolvedValueOnce({
        errorResponse: null,
        user: ALPHA_USER,
        supabase: {}
      });
      getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: 'owner' });

      const req = new Request('http://localhost:3000/api/employer/packets/cand-123/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'advance',
          rationale: 'Missing expected_rubric_version',
          expected_ledger_revision: 1,
          expected_rubric_version: '   '
        })
      });

      const res = await actionRoute(req, { params: Promise.resolve({ extractionId: 'cand-123' }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('INVALID_RUBRIC_VERSION');
    });

    it('3.6 fails closed with HTTP 409 when candidate decision_packet metadata is missing', async () => {
      const mockSupabase = {
        from: vi.fn((table) => {
          if (table === 'candidates') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'cand-123',
                  candidate_id: 'prof-123',
                  hiring_run_id: 'run-123',
                  decision_packet: null, // Missing metadata!
                  hiring_runs: { id: 'run-123', org_id: ALPHA_ORG_ID, role_title: 'Architect' }
                },
                error: null
              })
            };
          }
          return {};
        })
      };

      requireUser.mockResolvedValueOnce({
        errorResponse: null,
        user: ALPHA_USER,
        supabase: mockSupabase
      });
      createClient.mockReturnValue(mockSupabase);
      getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: 'owner' });

      const req = new Request('http://localhost:3000/api/employer/packets/cand-123/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'advance',
          rationale: 'Testing packet metadata fail closed',
          expected_ledger_revision: 1,
          expected_rubric_version: '1.0.0'
        })
      });

      const res = await actionRoute(req, { params: Promise.resolve({ extractionId: 'cand-123' }) });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe('REVIEW_REVISION_CONFLICT');
      expect(data.requires_refresh).toBe(true);
    });

    it('3.7 returns HTTP 409 when expected_rubric_version does not match current packet rubric_version', async () => {
      const mockSupabase = {
        from: vi.fn((table) => {
          if (table === 'candidates') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'cand-123',
                  candidate_id: 'prof-123',
                  hiring_run_id: 'run-123',
                  decision_packet: { ledger_revision: 1, rubric_version: '2.0.0' },
                  hiring_runs: { id: 'run-123', org_id: ALPHA_ORG_ID, role_title: 'Architect' }
                },
                error: null
              })
            };
          }
          return {};
        })
      };

      requireUser.mockResolvedValueOnce({
        errorResponse: null,
        user: ALPHA_USER,
        supabase: mockSupabase
      });
      createClient.mockReturnValue(mockSupabase);
      getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: 'owner' });

      const req = new Request('http://localhost:3000/api/employer/packets/cand-123/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'advance',
          rationale: 'Mismatched rubric version',
          expected_ledger_revision: 1,
          expected_rubric_version: '1.0.0' // Expected 1.0.0, but current is 2.0.0
        })
      });

      const res = await actionRoute(req, { params: Promise.resolve({ extractionId: 'cand-123' }) });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe('REVIEW_REVISION_CONFLICT');
      expect(data.requires_refresh).toBe(true);
    });
  });
});
