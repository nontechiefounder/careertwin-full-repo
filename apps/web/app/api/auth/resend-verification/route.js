import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { deliverVerificationEmail } from '@/lib/verificationEmail';

const RESEND_COOLDOWN_MS = 60_000;
const MAX_LIST_USERS_PAGES = 25;
const LIST_USERS_PER_PAGE = 1000;
const MAX_DIRECTORY_CALLS_PER_WINDOW = 50;
const DIRECTORY_BUDGET_WINDOW_MS = 60_000;
const DEFAULT_MAX_COOLDOWN_ENTRIES = 2000;
const GENERIC_PUBLIC_MESSAGE = 'If an unverified account exists for this email, a verification email will be sent.';

export function createMemoryCooldownStore({ maxEntries = DEFAULT_MAX_COOLDOWN_ENTRIES } = {}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new RangeError('maxEntries must be a positive integer');
  }
  const map = new Map();

  function pruneExpired(now) {
    for (const [k, exp] of map.entries()) {
      if (exp <= now) {
        map.delete(k);
      }
    }
  }

  return {
    tryReserve(key, ttlMs) {
      const now = Date.now();
      const existing = map.get(key);
      // Always check existing reservation before capacity rejection
      if (existing && existing > now) {
        return { admitted: false, retryAfterSeconds: Math.max(1, Math.ceil((existing - now) / 1000)) };
      }
      if (existing !== undefined && existing <= now) {
        map.delete(key);
      }
      if (map.size >= 64 || map.size >= maxEntries) {
        pruneExpired(now);
      }
      // Fail closed for new keys at capacity instead of evicting unexpired active reservations
      if (map.size >= maxEntries) {
        return { admitted: false, capacityLimited: true, retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)) };
      }
      map.set(key, now + ttlMs);
      return { admitted: true, retryAfterSeconds: 0 };
    },
    size() {
      return map.size;
    },
    clear() {
      map.clear();
    },
  };
}

let activeCooldownStore = createMemoryCooldownStore();
let directoryWindowStart = 0;
let directoryWindowCalls = 0;

export function setResendCooldownStore(store) {
  activeCooldownStore = store || createMemoryCooldownStore();
}

export function __resetResendCooldownForTests() {
  if (typeof activeCooldownStore.clear === 'function') {
    activeCooldownStore.clear();
  }
  directoryWindowStart = 0;
  directoryWindowCalls = 0;
}

function hasDirectoryCallBudget() {
  const now = Date.now();
  if (now - directoryWindowStart >= DIRECTORY_BUDGET_WINDOW_MS) {
    directoryWindowStart = now;
    directoryWindowCalls = 0;
  }
  return directoryWindowCalls < MAX_DIRECTORY_CALLS_PER_WINDOW;
}

function consumeDirectoryCallBudget() {
  if (!hasDirectoryCallBudget()) {
    return false;
  }
  directoryWindowCalls += 1;
  return true;
}

async function findUserByEmail(admin, normalizedEmail, maxPages = MAX_LIST_USERS_PAGES) {
  if (typeof admin?.getUserByEmail === 'function') {
    if (!consumeDirectoryCallBudget()) {
      return { user: null, incomplete: true, budgetExceeded: true, error: new Error('Directory lookup budget exhausted') };
    }
    const res = await admin.getUserByEmail(normalizedEmail);
    if (res?.error) {
      return { user: null, incomplete: false, error: res.error };
    }
    if (!res?.data || !Object.prototype.hasOwnProperty.call(res.data, 'user')) {
      return { user: null, incomplete: true, error: new Error('Malformed direct user lookup payload') };
    }
    const directUser = res.data.user;
    if (directUser !== null && (typeof directUser !== 'object' || typeof directUser.email !== 'string')) {
      return { user: null, incomplete: true, error: new Error('Malformed direct user record') };
    }
    return { user: directUser, incomplete: false, error: null };
  }

  if (typeof admin?.listUsers !== 'function') {
    return { user: null, incomplete: true, error: new Error('Admin user lookup unavailable') };
  }

  for (let page = 1; page <= maxPages; page++) {
    if (!consumeDirectoryCallBudget()) {
      return { user: null, incomplete: true, budgetExceeded: true, error: new Error('Directory lookup budget exhausted') };
    }
    const { data: listData, error: listErr } = await admin.listUsers({
      page,
      perPage: LIST_USERS_PER_PAGE,
    });
    if (listErr) {
      return { user: null, incomplete: false, error: listErr };
    }
    if (!Array.isArray(listData?.users)) {
      return { user: null, incomplete: true, error: new Error('Malformed admin user directory response') };
    }

    const users = listData.users;
    const nextPage = listData?.nextPage ?? null;
    const lastPage = listData?.lastPage;
    const advertisesMore = nextPage !== null || users.length === LIST_USERS_PER_PAGE;

    if (nextPage !== null && (!Number.isInteger(nextPage) || nextPage <= page)) {
      return { user: null, incomplete: true, error: new Error('Invalid nextPage pagination metadata') };
    }
    if (advertisesMore && (!Number.isInteger(lastPage) || lastPage < page || lastPage > maxPages)) {
      // Fail uniformly BEFORE scanning page 1 when lastPage is missing, invalid, or exceeds synchronous cap (closes V9-R2 & V8-R2)
      return { user: null, incomplete: true, error: new Error('Admin user directory pagination missing valid bounded lastPage') };
    }

    const match = users.find(
      (u) => typeof u?.email === 'string' && u.email.trim().toLowerCase() === normalizedEmail
    );
    if (match) {
      return { user: match, incomplete: false, error: null };
    }
    const hasMore = nextPage !== null || (users.length === LIST_USERS_PER_PAGE && Number.isInteger(lastPage) && page < lastPage);
    if (!hasMore) {
      return { user: null, incomplete: false, error: null };
    }
  }
  return { user: null, incomplete: true, error: new Error('Admin user directory pagination cap reached before exhaustion') };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    // Check global directory budget before churning the per-email cooldown store
    if (!hasDirectoryCallBudget()) {
      return NextResponse.json(
        {
          error: 'RATE_LIMITED',
          retry_after_seconds: 60,
          message: 'Too many verification requests. Please wait and try again.',
        },
        { status: 429 }
      );
    }

    // Atomic per-email cooldown reservation with expired-entry pruning & fail-closed capacity (never evicts active keys)
    const reservation = await activeCooldownStore.tryReserve(email, RESEND_COOLDOWN_MS);
    if (!reservation?.admitted) {
      return NextResponse.json(
        {
          error: 'RATE_LIMITED',
          retry_after_seconds: reservation?.retryAfterSeconds || 60,
          message: 'Please wait before requesting another verification email.',
        },
        { status: 429 }
      );
    }

    const supabase = await createSupabaseServerClient(null, true);
    const { user: existing, incomplete, budgetExceeded, error: lookupErr } = await findUserByEmail(supabase.auth?.admin, email);
    if (budgetExceeded) {
      return NextResponse.json(
        {
          error: 'RATE_LIMITED',
          retry_after_seconds: 60,
          message: 'Too many verification requests. Please wait and try again.',
        },
        { status: 429 }
      );
    }
    if (lookupErr || incomplete) {
      console.error('[API Resend Verification] Directory lookup failed or incomplete:', {
        incomplete: Boolean(incomplete),
        error: lookupErr?.name || 'LookupError',
      });
      return NextResponse.json(
        {
          error: 'VERIFICATION_LOOKUP_UNAVAILABLE',
          delivery_status: 'unavailable',
          message: 'Verification lookup is temporarily unavailable. Please try again later.',
        },
        { status: 503 }
      );
    }

    if (!existing || existing.email_confirmed_at) {
      return NextResponse.json({
        delivery_status: 'accepted',
        message: GENERIC_PUBLIC_MESSAGE,
      });
    }

    const delivery = await deliverVerificationEmail({ supabase, email, isResend: true });
    if (!delivery.ok) {
      console.error('[API Resend Verification] Private delivery failure:', {
        stage: delivery.error || 'VERIFICATION_EMAIL_DELIVERY_FAILED',
        status: delivery.status,
      });
    }

    return NextResponse.json({
      delivery_status: 'accepted',
      message: GENERIC_PUBLIC_MESSAGE,
    });
  } catch (error) {
    console.error('[API Resend Verification] Unexpected error:', error?.name || 'UnexpectedError');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
