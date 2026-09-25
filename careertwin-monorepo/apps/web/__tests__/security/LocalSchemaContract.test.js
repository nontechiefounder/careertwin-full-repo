import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Local Operational Baseline Schema Contract Tests (Step 4B5.2-D1.1)', () => {
  const rootDir = path.resolve(__dirname, '../../../..');
  const migrationFile = path.join(rootDir, 'supabase/migrations/20260803000001_operational_schema_baseline.sql');
  const seedFile = path.join(rootDir, 'supabase/seed.sql');

  test('1. Migration file exists in repository source control', () => {
    expect(fs.existsSync(migrationFile)).toBe(true);
  });

  test('2. Complete literal operational tables are created in baseline migration', () => {
    const content = fs.readFileSync(migrationFile, 'utf-8');
    const requiredTables = [
      'profiles',
      'candidate_profiles',
      'proof_profiles',
      'hiring_runs',
      'sourcing_sessions',
      'candidates',
      'screening_sessions',
      'screening_answers',
      'screening_summaries',
      'activity_events',
      'scheduled_emails'
    ];

    for (const table of requiredTables) {
      expect(content).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  test('3. Complete literal documented columns exist for candidate_profiles', () => {
    const content = fs.readFileSync(migrationFile, 'utf-8');
    const fields = [
      'name TEXT',
      'email TEXT UNIQUE',
      'github_url TEXT',
      'resume_link TEXT',
      'target_roles TEXT[]',
      'location TEXT',
      'compensation_min INTEGER',
      'compensation_max INTEGER',
      'search_urgency TEXT',
      'bio TEXT',
      'created_at TIMESTAMPTZ',
      'updated_at TIMESTAMPTZ',
      'source VARCHAR'
    ];

    for (const field of fields) {
      expect(content).toContain(field);
    }
  });

  test('4. Complete literal documented columns exist for proof_profiles', () => {
    const content = fs.readFileSync(migrationFile, 'utf-8');
    const fields = [
      'candidate_id UUID REFERENCES candidate_profiles',
      'summary TEXT',
      'proof_completeness DOUBLE PRECISION',
      'proof_strength DOUBLE PRECISION',
      'inferred_capabilities TEXT[]',
      'top_work_examples JSONB',
      'verification_readiness TEXT',
      'recommended_next_action TEXT'
    ];

    for (const field of fields) {
      expect(content).toContain(field);
    }
  });

  test('5. Complete literal documented columns exist for hiring_runs', () => {
    const content = fs.readFileSync(migrationFile, 'utf-8');
    const fields = [
      'job_description TEXT',
      'must_haves TEXT[]',
      'nice_to_haves TEXT[]',
      'disqualifiers TEXT[]',
      'company TEXT',
      'company_stage TEXT',
      'hiring_notes TEXT',
      'brief_json JSONB',
      'crustdata_credits_spent INTEGER',
      'location TEXT'
    ];

    for (const field of fields) {
      expect(content).toContain(field);
    }
  });

  test('6. Complete literal documented columns exist for sourcing_sessions and candidates', () => {
    const content = fs.readFileSync(migrationFile, 'utf-8');
    expect(content).toContain('hiring_run_id UUID REFERENCES hiring_runs');
    expect(content).toContain('profiles_scanned INTEGER');
    expect(content).toContain('shortlisted_count INTEGER');
    expect(content).toContain('fit_score DOUBLE PRECISION');
    expect(content).toContain('highlights TEXT[]');
    expect(content).toContain('fit_summary TEXT');
    expect(content).toContain('decision_packet JSONB');
  });

  test('7. Screening_summaries.session_id contains UNIQUE constraint', () => {
    const content = fs.readFileSync(migrationFile, 'utf-8');
    expect(content).toContain('session_id UUID UNIQUE REFERENCES screening_sessions');
  });

  test('8. Row Level Security (RLS) is enabled on all 11 operational tables', () => {
    const content = fs.readFileSync(migrationFile, 'utf-8');
    const requiredTables = [
      'profiles',
      'candidate_profiles',
      'proof_profiles',
      'hiring_runs',
      'sourcing_sessions',
      'candidates',
      'screening_sessions',
      'screening_answers',
      'screening_summaries',
      'activity_events',
      'scheduled_emails'
    ];

    for (const table of requiredTables) {
      expect(content).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  test('9. Candidates table RLS uses explicit EXISTS query and NOT permissive USING true', () => {
    const content = fs.readFileSync(migrationFile, 'utf-8');
    expect(content).not.toContain('candidates FOR ALL TO authenticated USING (true)');
    expect(content).not.toContain('candidates FOR ALL TO authenticated WITH CHECK (true)');
    expect(content).not.toContain('candidates USING (true)');
    expect(content).toContain('EXISTS (SELECT 1 FROM hiring_runs h WHERE h.id = candidates.hiring_run_id');
  });

  test('10. Baseline migration does NOT pre-approve unevidenced candidates.user_id column', () => {
    const content = fs.readFileSync(migrationFile, 'utf-8');
    const candidatesMatch = content.match(/CREATE TABLE IF NOT EXISTS candidates \(([\s\S]*?)\);/);
    expect(candidatesMatch).not.toBeNull();
    const candidatesDdl = candidatesMatch[1];
    expect(candidatesDdl).not.toContain('user_id');
  });

  test('11. Scheduled_emails revokes client access explicitly', () => {
    const content = fs.readFileSync(migrationFile, 'utf-8');
    expect(content).toContain('REVOKE ALL ON scheduled_emails FROM anon, authenticated;');
  });

  test('12. Alembic-only future domain tables are absent from local operational baseline', () => {
    const content = fs.readFileSync(migrationFile, 'utf-8');
    const alembicTables = ['evidence_refs', 'claims', 'claim_edges', 'requirement_matches', 'trust_packets', 'workflow_runs'];

    for (const table of alembicTables) {
      expect(content).not.toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  test('13. Synthetic seed file contains conditional auth.users insertion and zero credential patterns', () => {
    expect(fs.existsSync(seedFile)).toBe(true);
    const seedContent = fs.readFileSync(seedFile, 'utf-8');
    expect(seedContent).toContain('INSERT INTO auth.users');
    expect(seedContent).not.toContain('eyJ'); // No JWT tokens
    expect(seedContent).not.toContain('sbp_'); // No Supabase access tokens
    expect(seedContent).toContain('@example.invalid'); // Synthetic-only domain
  });

  test('14. Screening_answers contains UNIQUE constraint (session_id, question_index) for upsert conflict target', () => {
    const content = fs.readFileSync(migrationFile, 'utf-8');
    expect(content).toContain('CONSTRAINT uq_screening_answers_session_question UNIQUE (session_id, question_index)');
  });
});

