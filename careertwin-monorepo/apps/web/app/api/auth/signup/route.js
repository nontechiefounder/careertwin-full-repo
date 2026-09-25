import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password, data } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // 1. Initialize Supabase with Service Role
    const supabase = await createSupabaseServerClient(null, true);

    console.log(`[API Signup] Creating unconfirmed user: ${email}`);

    // 2. Create the user (unconfirmed by default)
    const { data: authData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: data || {},
    });

    if (createError) {
      console.error('[API Signup] Creation Error:', createError);
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    // 3. Generate the verification link/token
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/dashboard`,
      }
    });

    if (linkError) {
      console.error('[API Signup] Link Gen Error:', linkError);
      return NextResponse.json({ error: 'Failed to generate verification link' }, { status: 500 });
    }

    // 4. Extract the hashed token for our custom URL
    const tokenHash = linkData.properties.hashed_token;
    const nextPath = '/employer';
    const verificationUrl = `${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/auth/confirm?token_hash=${tokenHash}&type=signup&next=${nextPath}`;

    // 5. Send custom email via our SMTP
    const { sendSMTPEmail } = await import('@/lib/smtp');
    try {
      await sendSMTPEmail({
        to: email,
        subject: 'Verify your CareerTWiN account',
        body: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #333;">Welcome to CareerTWiN!</h2>
            <p>Thank you for signing up. Please click the button below to verify your email address and get started.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify Email Address</a>
            </div>
            <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="color: #0070f3; font-size: 12px; word-break: break-all;">${verificationUrl}</p>
          </div>
        `
      });
      console.log(`[API Signup] Verification email sent to: ${email}`);
    } catch (emailErr) {
      console.error('[API Signup] Email Send Error:', emailErr);
      // We don't return 500 here because the user is created, just notify them
    }

    return NextResponse.json({
      user: authData.user,
      message: 'Signup successful! Please check your email to verify your account.'
    });
  } catch (error) {
    console.error('[API Signup] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
