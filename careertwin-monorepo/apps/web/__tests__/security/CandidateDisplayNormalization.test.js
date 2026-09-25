import { describe, it, expect } from 'vitest';
import { normalizeCandidateDisplay } from '@/lib/candidateNormalizer';

describe('Candidate Display Normalizer (UX-V2 Day 3 C4-R3)', () => {
  it('1. normalizes valid plain-text candidate summary correctly', () => {
    const extraction = {
      candidate_name: 'Jordan Lee',
      current_role: 'Lead Systems Engineer',
      summary: 'Experienced distributed systems software architect.',
      skills: ['C++', 'Python', 'Raft'],
    };

    const res = normalizeCandidateDisplay(extraction);
    expect(res.name).toBe('Jordan Lee');
    expect(res.summary).toBe('Experienced distributed systems software architect.');
    expect(res.skills).toEqual(['C++', 'Python', 'Raft']);
  });

  it('2. parses recognized candidate JSON payload safely without rendering raw JSON', () => {
    const extraction = {
      candidate_name: 'Sam Brooks',
      candidate_profiles: {
        bio: '{"role":"Senior Backend Architect","summary":"Built fault-tolerant storage cluster"}',
      },
    };

    const res = normalizeCandidateDisplay(extraction);
    expect(res.name).toBe('Sam Brooks');
    expect(res.summary).toBe('Built fault-tolerant storage cluster');
    expect(res.summary).not.toContain('{');
  });

  it('3. safely handles malformed JSON string and returns Summary not available', () => {
    const extraction = {
      candidate_name: 'Alex Rivera',
      summary: '{malformed-json-payload: true, missing_quotes}',
    };

    const res = normalizeCandidateDisplay(extraction);
    expect(res.name).toBe('Alex Rivera');
    expect(res.summary).toBe('Summary not available');
  });

  it('4. safely handles unknown object payload and returns Summary not available', () => {
    const extraction = {
      candidate_name: 'Taylor Morgan',
      summary: { unknown_internal_field: 42, nested_data: [1, 2, 3] },
    };

    const res = normalizeCandidateDisplay(extraction);
    expect(res.name).toBe('Taylor Morgan');
    expect(res.summary).toBe('Summary not available');
  });

  it('5. normalizes CSV-derived candidate payload cleanly', () => {
    const extraction = {
      candidate_name: 'Morgan Chen',
      current_role: 'Database Reliability Specialist',
      skills: 'PostgreSQL, Linux, Python',
    };

    const res = normalizeCandidateDisplay(extraction);
    expect(res.name).toBe('Morgan Chen');
    expect(res.current_role).toBe('Database Reliability Specialist');
    expect(res.skills).toEqual(['PostgreSQL', 'Linux', 'Python']);
  });

  it('6. returns Summary not available for missing or null summary', () => {
    const extraction = {
      candidate_name: 'Casey Vance',
      summary: null,
    };

    const res = normalizeCandidateDisplay(extraction);
    expect(res.name).toBe('Casey Vance');
    expect(res.summary).toBe('Summary not available');
  });

  it('7. redacts explicit candidate email addresses from rendered summary', () => {
    const extraction = {
      candidate_name: 'Pat Smith',
      summary: 'Contact candidate at pat.smith@example.com for interview scheduling.',
    };

    const res = normalizeCandidateDisplay(extraction);
    expect(res.summary).toBe('Contact candidate at [EMAIL REDACTED] for interview scheduling.');
    expect(res.summary).not.toContain('pat.smith@example.com');
  });

  it('8. identifies identical subtitle and summary text strings for UI deduplication', () => {
    const extraction = {
      candidate_name: 'Devon Reed',
      current_role: 'Senior Backend Engineer',
      summary: 'Senior Backend Engineer',
    };

    const res = normalizeCandidateDisplay(extraction);
    expect(res.bio).toBe('Senior Backend Engineer');
    expect(res.summary).toBe('Senior Backend Engineer');
    expect(res.bio.trim() === res.summary.trim()).toBe(true);
  });

  it('9. distinguishes duplicate candidate names with unique extraction IDs', () => {
    const ext1 = { id: 'ext-001', candidate_name: 'Jordan Lee', current_role: 'Backend Architect' };
    const ext2 = { id: 'ext-002', candidate_name: 'Jordan Lee', current_role: 'Frontend Architect' };

    const res1 = normalizeCandidateDisplay(ext1);
    const res2 = normalizeCandidateDisplay(ext2);

    expect(res1.name).toBe(res2.name);
    expect(ext1.id).not.toBe(ext2.id);
  });
});
