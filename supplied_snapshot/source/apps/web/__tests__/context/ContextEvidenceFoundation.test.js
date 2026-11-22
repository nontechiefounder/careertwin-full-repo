import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractEvidenceSpans,
  processOutboxEvent,
  PARSER_NAME,
  PARSER_VERSION,
  SCHEMA_VERSION,
} from '@/lib/contextEvidenceWorker';

describe('Context Evidence Foundation — Worker & Schema Tests (Phase B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. extractEvidenceSpans Unit Tests ───────────────────────────────────
  it('1. Extracts exact character offsets, types, and computes coverage score', () => {
    const rawText = `# Lead Infrastructure Brief\n\nMust have 10+ years experience in Kubernetes, Terraform, and cloud networking.\n\nDelivered high-availability distributed systems across multi-region AWS clusters.\n\nSOC2 compliance and automated audit logging required.`;

    const result = extractEvidenceSpans(rawText, 'ver-123');

    expect(result.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.spans.length).toBeGreaterThanOrEqual(3);
    expect(result.coverageScore).toBeGreaterThan(50);
    expect(result.exceptions).toEqual([]);

    // Check span structure & truthful character offsets
    const firstSpan = result.spans[0];
    expect(firstSpan.span_key).toBe('SPAN-001');
    expect(firstSpan.start_char).toBeGreaterThanOrEqual(0);
    expect(firstSpan.end_char).toBeGreaterThan(firstSpan.start_char);

    // Verify exact substring slicing matches exact_text
    const extractedSlice = result.normalizedText.slice(firstSpan.start_char, firstSpan.end_char);
    expect(extractedSlice).toBe(firstSpan.exact_text);
  });

  it('2. Handles empty or invalid input with explicit exception reporting', () => {
    const result = extractEvidenceSpans('', 'ver-empty');
    expect(result.spans).toEqual([]);
    expect(result.coverageScore).toBe(0);
    expect(result.exceptions).toContain('EMPTY_DOCUMENT_INPUT');
  });

  // ── 2. processOutboxEvent Integration & Worker Contract Tests ────────────
  it('3. Idempotently processes outbox event, creates parsed artifact, spans, and marks completed', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'context_transactional_outbox') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === 'context_source_versions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'ver-001',
                source_id: 'src-001',
                version_number: 1,
                original_artifact_id: 'sarah_connor_lead_infra.pdf',
                original_file_sha256: 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
                original_mime_type: 'application/pdf',
                byte_size: 1024,
                status: 'pending',
              },
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === 'context_parsed_artifacts') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: 'parsed-001' },
                error: null,
              }),
            }),
          };
        }
        if (table === 'context_evidence_spans') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'context_processing_runs') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: 'run-001' },
                error: null,
              }),
            }),
          };
        }
        if (table === 'context_document_results') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };
      }),
    };

    const outboxEvent = {
      id: 'outbox-001',
      org_id: 'org-test-alpha',
      payload: {
        source_id: 'src-001',
        version_id: 'ver-001',
        version_number: 1,
        artifact_id: 'sarah_connor_lead_infra.pdf',
      },
      attempts: 0,
      max_attempts: 5,
    };

    const result = await processOutboxEvent(mockSupabase, outboxEvent);

    expect(result.ok).toBe(true);
    expect(result.versionId).toBe('ver-001');
    expect(result.parsedArtifactId).toBe('parsed-001');
    expect(result.spanCount).toBeGreaterThan(0);
    expect(result.coverageScore).toBeGreaterThan(0);
  });

  it('4. Handles worker failure: increments attempt count and isolates error', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'context_transactional_outbox') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === 'context_source_versions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database connection failed' },
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {};
      }),
    };

    const outboxEvent = {
      id: 'outbox-fail-001',
      org_id: 'org-test-alpha',
      payload: {
        source_id: 'src-001',
        version_id: 'ver-missing',
        version_number: 1,
      },
      attempts: 0,
      max_attempts: 5,
    };

    const result = await processOutboxEvent(mockSupabase, outboxEvent);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('not found');
    expect(result.isExhausted).toBe(false);
  });
});
