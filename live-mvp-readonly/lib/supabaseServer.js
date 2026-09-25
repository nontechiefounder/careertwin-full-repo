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

  // Mock token support for development and testing
  if (sessionToken === 'mock-token') {
    return {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: '00000000-0000-0000-0000-000000000000',
              email: 'admin@gmail.com',
              user_metadata: { role: 'employer', name: 'Admin Tester' }
            }
          },
          error: null
        })
      },
      from: () => ({
        select: (cols) => ({
          eq: (col, val) => ({
            single: async () => ({ data: null, error: { message: 'Mock data' } }),
            limit: (l) => ({ data: [], error: null })
          }),
          single: async () => ({ data: null, error: { message: 'Mock data' } }),
          limit: (l) => ({ data: [], error: null }),
          order: (col, opts) => ({ limit: (l) => ({ data: [], error: null }) })
        }),
        insert: (data) => ({
          select: () => ({
            single: async () => ({ data: { ...data, id: 'mock-id' }, error: null })
          })
        }),
        upsert: (data) => ({
          select: () => ({
            single: async () => ({ data: { ...data, id: 'mock-id' }, error: null })
          })
        }),
        update: (data) => ({
          eq: (col, val) => ({
            select: () => ({
              single: async () => ({ data: { ...data, id: 'mock-id' }, error: null })
            })
          })
        })
      }),
      isMock: true
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = useServiceRole 
    ? (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration missing');
  }

  return createClient(supabaseUrl, supabaseKey, {
    global: { headers: (sessionToken && !useServiceRole) ? { Authorization: `Bearer ${sessionToken}` } : {} },
  });
}
