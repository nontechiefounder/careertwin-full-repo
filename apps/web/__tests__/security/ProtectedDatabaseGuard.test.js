import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  assertDisposableTarget,
  getSafeTargetIdentity,
  getTestDbConfig,
  runDisposablePsql,
  ProtectedDatabaseError,
} from '@/lib/testDbGuard';

describe('Protected Database Rejection Guard Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.DISPOSABLE_DATABASE_URL;
    delete process.env.DISPOSABLE_DB_CONTAINER;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('1. Rejection of Protected Identities', () => {
    it('1.1 rejects shared container name supabase_db_careertwin-local-baseline with PROTECTED_DATABASE_MUTATION_REJECTED', () => {
      expect(() => {
        assertDisposableTarget('supabase_db_careertwin-local-baseline');
      }).toThrow(ProtectedDatabaseError);

      try {
        assertDisposableTarget('supabase_db_careertwin-local-baseline');
      } catch (err) {
        expect(err.code).toBe('PROTECTED_DATABASE_MUTATION_REJECTED');
        expect(err.message).toContain("Container 'supabase_db_careertwin-local-baseline' is the protected shared baseline");
      }
    });

    it('1.2 rejects shared container identity case-insensitively', () => {
      expect(() => {
        assertDisposableTarget('SUPABASE_DB_CAREERTWIN-LOCAL-BASELINE');
      }).toThrow(ProtectedDatabaseError);
    });

    it('1.3 rejects connection string containing port 54332', () => {
      const protectedUrl = 'postgresql://postgres:secret_password@127.0.0.1:54332/postgres';
      expect(() => {
        assertDisposableTarget(protectedUrl);
      }).toThrow(ProtectedDatabaseError);

      try {
        assertDisposableTarget(protectedUrl);
      } catch (err) {
        expect(err.code).toBe('PROTECTED_DATABASE_MUTATION_REJECTED');
        expect(err.message).toContain('Port 54332 is bound to the protected shared baseline');
      }
    });

    it('1.4 rejects connection string with query param port=54332', () => {
      const protectedUrl = 'postgres://postgres:pass@localhost/db?port=54332';
      expect(() => {
        assertDisposableTarget(protectedUrl);
      }).toThrow(ProtectedDatabaseError);
    });

    it('1.5 rejects libpq connection string with whitespace around port 54332', () => {
      const libpqStr = 'host = 127.0.0.1 port = 54332 user = postgres dbname = postgres';
      expect(() => {
        assertDisposableTarget(libpqStr);
      }).toThrow(ProtectedDatabaseError);
    });

    it('1.6 rejects SQLAlchemy connection scheme targeting port 54332', () => {
      const saUrl = 'postgresql+psycopg://user:pass@localhost:54332/db';
      expect(() => {
        assertDisposableTarget(saUrl);
      }).toThrow(ProtectedDatabaseError);
    });
  });

  describe('2. Fail-Closed Behavior on Missing Configuration', () => {
    it('2.1 returns blocked state when no disposable database is configured', () => {
      const result = assertDisposableTarget(null);
      expect(result.allowed).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('BLOCKED: No disposable test database configured');
    });

    it('2.2 getTestDbConfig reports isAvailable: false when no env var is present', () => {
      const config = getTestDbConfig();
      expect(config.isAvailable).toBe(false);
      expect(config.reason).toContain('BLOCKED');
    });

    it('2.3 runDisposablePsql throws BLOCKED error without falling back to shared DB', () => {
      expect(() => {
        runDisposablePsql('SELECT 1;');
      }).toThrow(/BLOCKED/);
    });
  });

  describe('3. DSN Safe Identity Redaction', () => {
    it('3.1 redacts passwords with special URL-encoded characters completely', () => {
      const complexUrl = 'postgresql://test_user:P%40ss%23w0rd%21%3Acomplex@127.0.0.1:54399/disposable_db';
      const safe = getSafeTargetIdentity(complexUrl);

      expect(safe).toBe('host: 127.0.0.1, port: 54399, db: disposable_db, user: test_user');
      expect(safe).not.toContain('P%40ss');
      expect(safe).not.toContain('password');
      expect(safe).not.toContain('secret');
    });

    it('3.2 handles container names without leaking credentials', () => {
      const safe = getSafeTargetIdentity('wbctx-expansion-disposable-pg');
      expect(safe).toBe('container: wbctx-expansion-disposable-pg');
    });

    it('3.3 handles malformed URLs safely', () => {
      const safe = getSafeTargetIdentity('postgres://invalid url with spaces:5432');
      expect(safe).toBe('malformed-url');
    });

    it('3.4 redacts credentials in SQLAlchemy schemes and handles query params', () => {
      const saUrl = 'postgresql+psycopg://audit_user:Super%21Secret%40Pass@127.0.0.1:54399/targetdb?sslmode=disable';
      const safe = getSafeTargetIdentity(saUrl);
      expect(safe).toBe('host: 127.0.0.1, port: 54399, db: targetdb, user: audit_user');
      expect(safe).not.toContain('Secret');
      expect(safe).not.toContain('Super');
    });
  });

  describe('4. Permitted Disposable Targets', () => {
    it('4.1 allows disposable container with unreserved port (e.g. 54399)', () => {
      const disposableUrl = 'postgresql://postgres:postgres@127.0.0.1:54399/postgres';
      const result = assertDisposableTarget(disposableUrl);
      expect(result.allowed).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.safeIdentity).toBe('host: 127.0.0.1, port: 54399, db: postgres, user: postgres');
    });

    it('4.2 allows named disposable container (e.g. wbctx-eval-disposable)', () => {
      const result = assertDisposableTarget('wbctx-eval-disposable');
      expect(result.allowed).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.safeIdentity).toBe('container: wbctx-eval-disposable');
    });
  });
});
