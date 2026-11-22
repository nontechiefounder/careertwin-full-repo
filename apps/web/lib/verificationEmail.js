export async function deliverVerificationEmail({ supabase, email, isResend = false }) {
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
  let linkRes;
  try {
    linkRes = await supabase.auth.admin.generateLink({
      type: 'signup',
      email,
      options: {
        redirectTo: `${baseUrl}/dashboard`,
      },
    });
  } catch (err) {
    console.error(`[API Auth] Link generation threw for verification email: ${err?.name || 'LinkError'}`);
    return {
      ok: false,
      status: 500,
      error: 'VERIFICATION_LINK_FAILED',
      delivery_status: 'not_attempted',
      email_sent: false,
      retry_supported: true,
      message: isResend
        ? 'Could not generate a verification link. Please try again.'
        : 'Account created, but verification link generation failed. Please retry sending the verification email.',
    };
  }

  const { data: linkData, error: linkError } = linkRes || {};
  if (linkError || !linkData?.properties?.hashed_token) {
    console.error('[API Auth] Link generation failed for verification email.');
    return {
      ok: false,
      status: 500,
      error: 'VERIFICATION_LINK_FAILED',
      delivery_status: 'not_attempted',
      email_sent: false,
      retry_supported: true,
      message: isResend
        ? 'Could not generate a verification link. Please try again.'
        : 'Account created, but verification link generation failed. Please retry sending the verification email.',
    };
  }

  const tokenHash = linkData.properties.hashed_token;
  const verificationUrl = `${baseUrl}/api/auth/confirm?token_hash=${tokenHash}&type=signup&next=/employer`;
  const isDryRun = process.env.CAREERTWIN_DRY_RUN_EMAIL !== 'false';

  if (isDryRun) {
    console.log(`[API Auth] Dry run active: verification email for ${email} suppressed.`);
    return {
      ok: true,
      status: 200,
      delivery_status: 'suppressed_dry_run',
      email_sent: false,
      retry_supported: false,
      message: isResend
        ? 'Verification email suppressed (dry-run mode active).'
        : 'Account created (dry-run mode: verification email delivery suppressed).',
    };
  }

  const { sendSMTPEmail } = await import('@/lib/smtp');
  try {
    await sendSMTPEmail({
      to: email,
      subject: 'Verify your workBYLiNE account',
      body: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #333;">Welcome to workBYLiNE!</h2>
          <p>Thank you for signing up. Please click the button below to verify your email address and get started.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify Email Address</a>
          </div>
          <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="color: #0070f3; font-size: 12px; word-break: break-all;">${verificationUrl}</p>
        </div>
      `,
    });
    console.log(`[API Auth] Verification email delivered to: ${email}`);
    return {
      ok: true,
      status: 200,
      delivery_status: 'sent',
      email_sent: true,
      retry_supported: false,
      message: isResend
        ? 'Verification email sent! Please check your email to verify your account.'
        : 'Signup successful! Please check your email to verify your account.',
    };
  } catch (err) {
    console.error(`[API Auth] Verification email delivery failed for ${email}: ${err?.name || 'DeliveryError'}`);
    return {
      ok: false,
      status: 503,
      error: 'VERIFICATION_EMAIL_DELIVERY_FAILED',
      delivery_status: 'failed',
      email_sent: false,
      retry_supported: true,
      message: isResend
        ? 'We still could not send the verification email. Please try again later.'
        : 'Account was created, but we could not send the verification email. Please retry sending the verification email.',
    };
  }
}
