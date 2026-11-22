import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { verifyInviteToken } from '../invite/route';

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

    const { token } = body;
    if (!token) {
      return NextResponse.json({ error: 'Invitation token is required' }, { status: 400 });
    }

    const payload = verifyInviteToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'INVALID_OR_EXPIRED_INVITATION', message: 'This invitation is invalid or has expired.' }, { status: 400 });
    }

    const { org_id, role = 'recruiter', org_name } = payload;

    // Idempotent upsert into organization_memberships
    const { error: memErr } = await supabase
      .from('organization_memberships')
      .upsert([{
        organization_id: org_id,
        user_id: user.id,
        membership_role: role,
        membership_status: 'active'
      }], { onConflict: 'organization_id,user_id' });

    if (memErr) {
      console.error('[Accept Invite] Membership error:', memErr);
      return NextResponse.json({ error: 'Failed to join organization' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      org_id,
      org_name,
      membership_role: role,
      message: `Successfully joined ${org_name} as ${role}.`
    });

  } catch (err) {
    console.error('[Accept Invite] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

