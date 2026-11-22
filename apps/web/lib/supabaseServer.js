import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function createSupabaseServerClient(request, useServiceRole = false) {
  const authHeader = request?.headers?.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  // 1. Check for Bearer token (API calls)
  // 2. Check for Cookies (Browser redirects/navigations)
  let sessionToken = token;
  if (!sessionToken && typeof cookies === 'function') {
    try {
      const cookieStore = await cookies();
      // Supabase default cookie name pattern: sb-<project-id>-auth-token
      const projectHost = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0];
      const cookieName = `sb-${projectHost}-auth-token`;
      const cookie = cookieStore.get(cookieName);
      
      if (cookie) {
        const decodedValue = decodeURIComponent(cookie.value);
        const parsed = JSON.parse(decodedValue);
        sessionToken = parsed.access_token;
        console.log(`[SupabaseServer] Found cookie: ${cookieName}, Token prefix: ${sessionToken?.substring(0, 5)}...`);
      } else {
        console.log(`[SupabaseServer] Cookie NOT found: ${cookieName}`);
      }
    } catch (e) {
      console.error(`[SupabaseServer] Error reading cookies: ${e.message}`);
    }
  }

  // Deprecated mock token negative rejection: fail closed before selecting service role or building client
  const isDeprecatedMock = sessionToken === 'mock-token';
  const effectiveSessionToken = isDeprecatedMock ? null : sessionToken;
  const effectiveUseServiceRole = isDeprecatedMock ? false : useServiceRole;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (effectiveUseServiceRole && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('FAIL-CLOSED ERROR: SUPABASE_SERVICE_ROLE_KEY is required when useServiceRole=true.');
  }
  const supabaseKey = effectiveUseServiceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration missing');
  }

  return createClient(supabaseUrl, supabaseKey, {
    global: { headers: (effectiveSessionToken && !effectiveUseServiceRole) ? { Authorization: `Bearer ${effectiveSessionToken}` } : {} },
  });
}
