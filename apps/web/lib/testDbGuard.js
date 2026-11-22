/**
 * Test Database Safety Guard
 * Prevents any test, script, or fixture loader from targeting or mutating
 * the shared baseline database (supabase_db_careertwin-local-baseline on port 54332).
 * 
 * Supports:
 *   - PostgreSQL URI strings (postgres://, postgresql://, postgresql+psycopg://, etc.)
 *   - libpq keyword strings (e.g. 'host = 127.0.0.1 port = 54399 user = postgres')
 *   - Disposable docker containers (wbctx-disposable-eval-pg, etc.)
 * 
 * Enforces:
 *   - Immediate rejection (ProtectedDatabaseError) of port 54332 and shared container
 *   - Subprocess execution using argument arrays (execFileSync / spawn)
 *   - Redaction of credentials even with encoded chars, raw '@', query strings, and SQLAlchemy schemes
 */
import { execFileSync, spawn } from 'child_process';
import { URL } from 'url';

export const PROTECTED_CONTAINER_NAMES = [
  'supabase_db_careertwin-local-baseline',
  'careertwin-local-baseline',
];

export const PROTECTED_PORTS = ['54332'];

export class ProtectedDatabaseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProtectedDatabaseError';
    this.code = 'PROTECTED_DATABASE_MUTATION_REJECTED';
  }
}

/**
 * Returns a safe, redacted descriptor of a database target without credentials.
 * Example: 'host: 127.0.0.1, port: 54399, db: postgres, user: postgres'
 */
export function getSafeTargetIdentity(urlOrContainer) {
  if (!urlOrContainer) return 'none';
  const raw = String(urlOrContainer).trim();
  const lower = raw.toLowerCase();

  // 1. URI strings (postgres://, postgresql://, postgresql+psycopg://, etc.)
  if (/^[a-z0-9+]+:\/\//i.test(raw)) {
    try {
      // Normalize SQLAlchemy scheme for standard URL parser
      const normalized = raw.replace(/^postgresql\+[a-z0-9_]+:\/\//i, 'postgresql://');
      const parsed = new URL(normalized);
      const port = parsed.port || '5432';
      const host = parsed.hostname || 'localhost';
      const pathname = parsed.pathname.replace(/^\//, '') || 'postgres';
      const username = parsed.username || 'unknown';
      return `host: ${host}, port: ${port}, db: ${pathname.split('?')[0]}, user: ${username}`;
    } catch {
      // Robust regex fallback that strips out password between username: and @ even with unencoded chars or raw '@'
      const match = raw.match(/^[a-z0-9+]+:\/\/([^:]+)(?::[^@]*)?@([^:/]+)(?::(\d+))?(?:\/(.*))?$/i);
      if (match) {
        const user = match[1];
        const host = match[2] || 'localhost';
        const port = match[3] || '5432';
        const db = (match[4] || 'postgres').split('?')[0].split('#')[0];
        return `host: ${host}, port: ${port}, db: ${db}, user: ${user}`;
      }
      return 'malformed-url';
    }
  }

  // 2. libpq key-value strings (e.g. host=127.0.0.1 port = 54399 user=postgres)
  if (/[a-zA-Z_]+\s*=/i.test(raw)) {
    const hostMatch = raw.match(/\bhost\s*=\s*['"]?([^'"\s]+)/i);
    const portMatch = raw.match(/\bport\s*=\s*['"]?([^'"\s]+)/i);
    const dbMatch = raw.match(/\bdbname\s*=\s*['"]?([^'"\s]+)/i);
    const userMatch = raw.match(/\buser\s*=\s*['"]?([^'"\s]+)/i);

    const host = hostMatch ? hostMatch[1] : 'localhost';
    const port = portMatch ? portMatch[1] : '5432';
    const db = dbMatch ? dbMatch[1] : 'postgres';
    const user = userMatch ? userMatch[1] : 'unknown';

    return `host: ${host}, port: ${port}, db: ${db}, user: ${user} (libpq)`;
  }

  // 3. Container names
  return `container: ${raw}`;
}

/**
 * Validates that a target is not the protected shared database.
 * Throws ProtectedDatabaseError if any protected identity matches.
 */
export function assertDisposableTarget(target) {
  if (!target) {
    return {
      allowed: false,
      blocked: true,
      reason: 'BLOCKED: No disposable test database configured. Set DISPOSABLE_DATABASE_URL or DISPOSABLE_DB_CONTAINER.',
    };
  }

  const raw = String(target).trim();
  const lower = raw.toLowerCase();

  // 1. Container name check (case-insensitive substring)
  for (const name of PROTECTED_CONTAINER_NAMES) {
    if (lower === name.toLowerCase() || lower.includes(name.toLowerCase())) {
      throw new ProtectedDatabaseError(
        `PROTECTED_DATABASE_MUTATION_REJECTED: Container '${name}' is the protected shared baseline. Refusing write.`
      );
    }
  }

  // 2. Port check across all connection formats:
  //    - host:54332
  //    - port = 54332 (with arbitrary whitespace around =)
  //    - port='54332' / port="54332"
  //    - ?port=54332
  const portRegex = /(?::54332\b|\bport\s*=\s*['"]?54332\b|[?&]port=54332\b)/i;
  if (portRegex.test(lower)) {
    throw new ProtectedDatabaseError(
      'PROTECTED_DATABASE_MUTATION_REJECTED: Port 54332 is bound to the protected shared baseline. Refusing write.'
    );
  }

  // 3. Format validation
  const isValidUrl = /^(postgres|postgresql|postgresql\+[a-z0-9_]+):\/\//i.test(raw);
  const isValidLibpq = /\b(host|dbname|user|port)\s*=/i.test(raw);
  const isValidContainer = /^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(raw) && !raw.includes('/');

  if (!isValidUrl && !isValidLibpq && !isValidContainer) {
    throw new ProtectedDatabaseError(
      `PROTECTED_DATABASE_MUTATION_REJECTED: Unsupported or malformed database target format: ${getSafeTargetIdentity(raw)}`
    );
  }

  return {
    allowed: true,
    blocked: false,
    safeIdentity: getSafeTargetIdentity(raw),
  };
}

/**
 * Retrieves the current test database configuration.
 * Strictly avoids silent fallback to the shared container.
 */
export function getTestDbConfig() {
  const disposableUrl = process.env.DISPOSABLE_DATABASE_URL;
  const disposableContainer = process.env.DISPOSABLE_DB_CONTAINER;
  const target = disposableUrl || disposableContainer;

  if (!target) {
    return {
      isAvailable: false,
      target: null,
      safeIdentity: 'none',
      reason: 'BLOCKED: No disposable test database configured (DISPOSABLE_DATABASE_URL or DISPOSABLE_DB_CONTAINER required).',
    };
  }

  // Check safety guard (throws ProtectedDatabaseError if targeting protected DB)
  assertDisposableTarget(target);

  return {
    isAvailable: true,
    isUrl: Boolean(disposableUrl),
    isContainer: Boolean(disposableContainer && !disposableUrl),
    target,
    safeIdentity: getSafeTargetIdentity(target),
    reason: null,
  };
}

/**
 * Synchronous execution of SQL against the configured disposable database.
 * Uses argument-array subprocess execution (no shell string interpolation).
 */
export function runDisposablePsql(sql, options = {}) {
  const config = getTestDbConfig();
  if (!config.isAvailable) {
    throw new Error(config.reason);
  }

  let command;
  let args;

  if (config.isUrl) {
    command = 'psql';
    args = [config.target, '-v', 'ON_ERROR_STOP=1', '-t', '-A'];
  } else {
    command = 'docker';
    args = ['exec', '-i', config.target, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A'];
  }

  try {
    const stdout = execFileSync(command, args, {
      input: sql,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: options.timeout || 15000,
    });
    return (stdout || '').trim();
  } catch (err) {
    const errText = ((err.stdout ? err.stdout.toString() : '') + ' ' + (err.stderr ? err.stderr.toString() : '') + ' ' + err.message).trim();
    return errText;
  }
}

/**
 * Asynchronous execution of SQL against the configured disposable database.
 * Uses argument-array subprocess execution and handles EPIPE gracefully.
 */
export function runDisposablePsqlAsync(sql, options = {}) {
  const config = getTestDbConfig();
  if (!config.isAvailable) {
    return Promise.reject(new Error(config.reason));
  }

  let command;
  let args;

  if (config.isUrl) {
    command = 'psql';
    args = [config.target, '-v', 'ON_ERROR_STOP=1', '-t', '-A'];
  } else {
    command = 'docker';
    args = ['exec', '-i', config.target, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A'];
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: options.timeout || 15000,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.stdin.on('error', (err) => {
      if (err.code !== 'EPIPE') reject(err);
    });

    child.on('close', (code) => {
      resolve((stdout + ' ' + stderr).trim());
    });

    child.on('error', (err) => {
      if (err.code !== 'EPIPE') reject(err);
    });

    try {
      child.stdin.write(sql);
      child.stdin.end();
    } catch (err) {
      if (err.code !== 'EPIPE') reject(err);
    }
  });
}
