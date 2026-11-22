import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { deliverVerificationEmail } from '@/lib/verificationEmail';

export async function POST(request) {
  try {
    const body = await request.json();
    const rawEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = body?.password;
    const data = body?.data;

    if (!rawEmail || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // 1. Initialize Supabase with Service Role
    const supabase = await createSupabaseServerClient(null, true);

    console.log(`[API Signup] Creating unconfirmed user: ${rawEmail}`);

    // 2. Create the user (unconfirmed by default)
    const { data: authData, error: createError } = await supabase.auth.admin.createUser({
      email: rawEmail,
      password,
      email_confirm: false,
      user_metadata: data || {},
    });

    if (createError) {
      console.error('[API Signup] Creation Error:', createError.message);
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    // 3. Generate verification link & deliver email without swallowing failures
    const delivery = await deliverVerificationEmail({ supabase, email: rawEmail, isResend: false });

    const payload = {
      user: authData.user,
      account_created: true,
      verification_required: true,
      delivery_status: delivery.delivery_status,
      email_sent: delivery.email_sent,
      retry_supported: delivery.retry_supported,
      message: delivery.message,
      ...(delivery.error ? { error: delivery.error } : {}),
    };

    return NextResponse.json(payload, { status: delivery.status });
  } catch (error) {
    console.error('[API Signup] Unexpected error:', error?.message || error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
