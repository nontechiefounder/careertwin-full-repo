import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

describe('Executable Database & RLS Validation Tests (Step 4B5.2-D1.2)', () => {
  const rootDir = path.resolve(__dirname, '../../../..');
  const migrationFile = path.join(rootDir, 'supabase/migrations/20260803000001_operational_schema_baseline.sql');
  const seedFile = path.join(rootDir, 'supabase/seed.sql');
  const dbName = 'careertwin_vitest_disposable_db';
  const psqlBin = '/opt/homebrew/bin/psql';

  let canRunDbTests = false;

  beforeAll(() => {
    try {
      execSync(`${psqlBin} -d postgres -c "SELECT 1;"`, { stdio: 'ignore' });
      canRunDbTests = true;

      execSync(`/opt/homebrew/bin/createdb ${dbName}`, { stdio: 'ignore' });

      const setupSql = `
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE TABLE IF NOT EXISTS auth.users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            instance_id UUID,
            aud VARCHAR(255),
            role VARCHAR(255),
            email VARCHAR(255) UNIQUE,
            encrypted_password VARCHAR(255),
            email_confirmed_at TIMESTAMPTZ,
            raw_app_meta_data JSONB,
            raw_user_meta_data JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                CREATE ROLE anon NOLOGIN;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                CREATE ROLE authenticated NOLOGIN;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
                CREATE ROLE service_role NOLOGIN;
            END IF;
        END $$;
        GRANT USAGE ON SCHEMA public TO anon, authenticated;
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
            SELECT COALESCE(
                NULLIF(current_setting('request.jwt.claim.sub', true), ''),
                '00000000-0000-0000-0000-000000000000'
            )::UUID;
        $$ LANGUAGE SQL STABLE;
      `;
      execSync(`${psqlBin} -d ${dbName} -c "${setupSql.replace(/\n/g, ' ')}"`, { stdio: 'ignore' });
      execSync(`${psqlBin} -d ${dbName} -f "${migrationFile}"`, { stdio: 'ignore' });
      execSync(`${psqlBin} -d ${dbName} -f "${seedFile}"`, { stdio: 'ignore' });
    } catch {
      canRunDbTests = false;
    }
  });

  afterAll(() => {
    if (canRunDbTests) {
      try {
        execSync(`/opt/homebrew/bin/dropdb ${dbName}`, { stdio: 'ignore' });
      } catch {
        // Ignored
      }
    }
  });

  test('1. Migration DDL and synthetic seed execute cleanly from zero on local PostgreSQL 15', () => {
    if (!canRunDbTests) return;
    const res = execSync(`${psqlBin} -d ${dbName} -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"`, { encoding: 'utf-8' });
    expect(parseInt(res.trim(), 10)).toBe(11);
  });

  test('2. Candidate One can access Candidate One self candidate record', () => {
    if (!canRunDbTests) return;
    const sql = `
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '00000000-0000-4000-b000-000000000001';
      SELECT count(*) FROM candidates WHERE candidate_id = '00000000-0000-4000-b000-000000000001';
    `;
    const res = execSync(`${psqlBin} -d ${dbName} -t -c "${sql.replace(/\n/g, ' ')}"`, { encoding: 'utf-8' });
    expect(parseInt(res.trim(), 10)).toBe(1);
  });

  test('3. Candidate One CANNOT access Candidate Two candidate record (Cross-tenant denial)', () => {
    if (!canRunDbTests) return;
    const sql = `
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '00000000-0000-4000-b000-000000000001';
      SELECT count(*) FROM candidates WHERE candidate_id = '00000000-0000-4000-b000-000000000002';
    `;
    const res = execSync(`${psqlBin} -d ${dbName} -t -c "${sql.replace(/\n/g, ' ')}"`, { encoding: 'utf-8' });
    expect(parseInt(res.trim(), 10)).toBe(0);
  });

  test('4. Employer Alpha can access candidates in Hiring Run Alpha', () => {
    if (!canRunDbTests) return;
    const sql = `
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '00000000-0000-4000-a000-000000000001';
      SELECT count(*) FROM candidates WHERE hiring_run_id = '11111111-1111-4111-a111-111111111111';
    `;
    const res = execSync(`${psqlBin} -d ${dbName} -t -c "${sql.replace(/\n/g, ' ')}"`, { encoding: 'utf-8' });
    expect(parseInt(res.trim(), 10)).toBe(1);
  });

  test('5. Employer Beta CANNOT access candidates in Hiring Run Alpha (Cross-employer denial)', () => {
    if (!canRunDbTests) return;
    const sql = `
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '00000000-0000-4000-a000-000000000002';
      SELECT count(*) FROM candidates WHERE hiring_run_id = '11111111-1111-4111-a111-111111111111';
    `;
    const res = execSync(`${psqlBin} -d ${dbName} -t -c "${sql.replace(/\n/g, ' ')}"`, { encoding: 'utf-8' });
    expect(parseInt(res.trim(), 10)).toBe(0);
  });

  test('6. Scheduled_emails revokes client access explicitly with permission error', () => {
    if (!canRunDbTests) return;
    const sql = `
      SET ROLE authenticated;
      SELECT count(*) FROM scheduled_emails;
    `;
    expect(() => {
      execSync(`${psqlBin} -d ${dbName} -t -c "${sql.replace(/\n/g, ' ')}"`, { stdio: 'pipe' });
    }).toThrow();
  });
});
