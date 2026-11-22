import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';

const ALLOWED_INVITE_ROLES = ['admin', 'recruiter', 'hiring_manager', 'auditor'];
const INVITATION_SECRET = process.env.SUPABASE_JWT_SECRET || process.env.SYSTEM_EMAIL_PASS || 'workbyline_secure_invite_secret_key';

export function signInviteToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', INVITATION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyInviteToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }
  const [data, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', INVITATION_SECRET).update(data).digest('base64url');
  if (sig !== expectedSig) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token parameter is required' }, { status: 400 });
    }

    const payload = verifyInviteToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'INVALID_OR_EXPIRED_INVITATION', message: 'This invitation is invalid or has expired.' }, { status: 400 });
    }

    return NextResponse.json({
      valid: true,
      org_id: payload.org_id,
      org_name: payload.org_name,
      email: payload.email,
      role: payload.role,
      expires_at: new Date(payload.exp).toISOString()
    });
  } catch (err) {
    console.error('[Invite GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const { org_id, email, role = 'recruiter' } = body;

    if (!org_id || !email) {
      return NextResponse.json({ error: 'org_id and email are required' }, { status: 400 });
    }

    if (!ALLOWED_INVITE_ROLES.includes(role)) {
      return NextResponse.json({ error: `Invalid role. Allowed roles: ${ALLOWED_INVITE_ROLES.join(', ')}` }, { status: 400 });
    }

    // Authorization: User must be owner or admin of the organization
    const membership = await getVerifiedOrgMembership(supabase, user.id, org_id);
    if (!membership || !['owner', 'admin'].includes(membership.membership_role)) {
      return NextResponse.json({ error: 'Forbidden: Only organization owners or admins can issue invitations' }, { status: 403 });
    }

    // Retrieve organization details
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', org_id)
      .single();

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Generate signed invitation token (valid for 7 days)
    const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const token = signInviteToken({
      org_id: org.id,
      org_name: org.name,
      email: email.trim().toLowerCase(),
      role,
      inviter_id: user.id,
      exp
    });

    const inviteLink = `${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/auth?invite=${token}`;

    // Dry-run email suppression check
    const isDryRun = process.env.CAREERTWIN_DRY_RUN_EMAIL !== 'false';
    if (!isDryRun) {
      try {
        const { sendSMTPEmail } = await import('@/lib/smtp');
        await sendSMTPEmail({
          to: email,
          subject: `You have been invited to join ${org.name} on workBYLiNE`,
          body: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2>Join ${org.name} on workBYLiNE</h2>
              <p>You have been invited as a <strong>${role}</strong>.</p>
              <p><a href="${inviteLink}" style="background: #00D604; color: #000; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">Accept Invitation</a></p>
            </div>
          `
        });
      } catch (emailErr) {
        console.error('[Invite POST] Email sending error:', emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      invite_token: token,
      invite_link: inviteLink,
      email,
      role,
      dry_run_active: isDryRun
    });

  } catch (err) {
    console.error('[Invite POST] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

