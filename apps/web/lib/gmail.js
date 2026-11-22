import crypto from 'node:crypto';
import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export const GMAIL_OAUTH_STATE_COOKIE = 'wbl_gmail_oauth_state';
const GMAIL_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_TRACKED_NONCES = 2000;

export function createMemoryGmailNonceStore({ maxEntries = DEFAULT_MAX_TRACKED_NONCES } = {}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new RangeError('maxEntries must be a positive integer >= 1');
  }
  const nonces = new Map();

  function pruneExpired(now) {
    for (const [nonce, expiresAt] of nonces.entries()) {
      if (expiresAt <= now) {
        nonces.delete(nonce);
      }
    }
  }

  return {
    consume(nonce, expiresAt, now = Date.now()) {
      pruneExpired(now);
      if (nonces.has(nonce)) {
        return { ok: false, reason: 'replayed_state' };
      }
      // Fail closed at capacity: never evict unexpired replay records
      if (nonces.size >= maxEntries) {
        return { ok: false, reason: 'replay_store_full' };
      }
      nonces.set(nonce, expiresAt);
      return { ok: true };
    },
    size() {
      return nonces.size;
    },
    clear() {
      nonces.clear();
    },
  };
}

let activeNonceStore = createMemoryGmailNonceStore();

export function setGmailNonceStore(store) {
  if (!store || typeof store.consume !== 'function') {
    throw new TypeError('Gmail nonce store must implement consume(nonce, expiresAt, now)');
  }
  activeNonceStore = store;
}

function getOAuthStateSecret() {
  // Dedicated GMAIL_OAUTH_STATE_SECRET is preferred for key isolation/rotation;
  // falls back to SUPABASE_SERVICE_ROLE_KEY or GOOGLE_CLIENT_SECRET when unset.
  const secret = (
    process.env.GMAIL_OAUTH_STATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.GOOGLE_CLIENT_SECRET ||
    ''
  ).trim();
  if (!secret) {
    throw new Error('GMAIL_OAUTH_STATE_SECRET is not configured');
  }
  return secret;
}

export function createGmailOAuthState(userId, now = Date.now()) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Authenticated userId is required for Gmail OAuth state');
  }
  const secret = getOAuthStateSecret();
  const nonce = crypto.randomBytes(24).toString('base64url');
  const payload = {
    sub: userId,
    nonce,
    iat: now,
    exp: now + GMAIL_OAUTH_STATE_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return {
    state: `${encoded}.${sig}`,
    nonce,
    maxAgeSeconds: Math.floor(GMAIL_OAUTH_STATE_TTL_MS / 1000),
  };
}

export function verifyAndConsumeGmailOAuthState({
  state,
  expectedUserId,
  cookieNonce,
  now = Date.now(),
}) {
  if (!state || typeof state !== 'string' || !expectedUserId || !cookieNonce || typeof cookieNonce !== 'string') {
    return { ok: false, reason: 'missing_state_or_session' };
  }
  const parts = state.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: 'malformed_state' };
  }
  const [encoded, providedSig] = parts;
  let secret;
  try {
    secret = getOAuthStateSecret();
  } catch {
    return { ok: false, reason: 'missing_server_secret' };
  }
  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const providedBuf = Buffer.from(providedSig);
  const expectedBuf = Buffer.from(expectedSig);
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'invalid_payload' };
  }

  if (!payload || typeof payload.sub !== 'string' || typeof payload.nonce !== 'string' || typeof payload.exp !== 'number') {
    return { ok: false, reason: 'invalid_claims' };
  }
  if (payload.sub !== expectedUserId) {
    return { ok: false, reason: 'session_mismatch' };
  }
  const nonceBuf = Buffer.from(payload.nonce);
  const cookieBuf = Buffer.from(cookieNonce);
  if (nonceBuf.length !== cookieBuf.length || !crypto.timingSafeEqual(nonceBuf, cookieBuf)) {
    return { ok: false, reason: 'cookie_mismatch' };
  }
  if (now >= payload.exp) {
    return { ok: false, reason: 'expired_state' };
  }

  const consumed = activeNonceStore.consume(payload.nonce, payload.exp, now);
  if (!consumed.ok) {
    return { ok: false, reason: consumed.reason || 'replayed_state' };
  }
  return { ok: true, sub: payload.sub };
}

export function clearConsumedGmailNoncesForTest() {
  if (typeof activeNonceStore.clear === 'function') {
    activeNonceStore.clear();
  }
}

export function getAuthUrl(state) {
  if (!state || typeof state !== 'string') {
    throw new Error('OAuth state is required');
  }
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // Critical for getting a refresh token
    scope: SCOPES,
    prompt: 'consent', // Ensures we always get a refresh token
    state,
  });
}

export async function getTokens(code) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Sends an email using a saved refresh token
 */
export async function sendGmailEmail(refreshToken, { to, subject, body }) {
  // Fail-Closed Dry-Run Safety Guard (RC-C1.2 Condition 5)
  if (process.env.CAREERTWIN_DRY_RUN_EMAIL !== 'false') {
    console.log(`[Gmail API] Dry run active: external email to ${to} suppressed for safety.`);
    return { id: 'dry-run-suppressed', dryRun: true };
  }
  console.log(`[Gmail API] Attempting to send email to: ${to} | Subject: ${subject}`);
  
  oauth2Client.setCredentials({
    refresh_token: refreshToken
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const messageParts = [
    `To: ${to}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    `Subject: ${utf8Subject}`,
    '',
    body,
  ];
  const message = messageParts.join('\n');

  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log(`[Gmail API] Success! Message ID: ${res.data.id}`);
    return res.data;
  } catch (error) {
    console.error(`[Gmail API] Failed to send email:`, error.response?.data || error.message);
    throw error;
  }
}

