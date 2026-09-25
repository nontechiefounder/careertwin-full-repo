import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Hardcoded dev credentials for testing (to match frontend logic if needed, 
    // though usually better to keep this in one place)
    if (email === 'admin@gmail.com' && password === '123') {
        return NextResponse.json({
            user: {
                id: '00000000-0000-0000-0000-000000000000',
                email: 'admin@gmail.com',
                user_metadata: { 
                    role: 'employer', 
                    name: 'Admin Tester',
                    company: 'CareerTWiN Dev'
                },
                is_mock: true
            },
            session: {
                access_token: 'mock-token',
                refresh_token: 'mock-refresh-token',
                expires_in: 3600,
                token_type: 'bearer',
                user: {
                    id: '00000000-0000-0000-0000-000000000000',
                    email: 'admin@gmail.com'
                }
            }
        });
    }

    // Initialize Supabase client
    const supabase = await createSupabaseServerClient(null, false);

    console.log(`[API Signin] Attempting login for: ${email}`);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('[API Signin] Auth Error:', error);
      return NextResponse.json({ error: error.message }, { status: error.status || 401 });
    }

    return NextResponse.json({
      user: data.user,
      session: data.session,
    });
  } catch (error) {
    console.error('[API Signin] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
