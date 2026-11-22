import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';

const ALLOWED_MEMBERSHIP_ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager', 'auditor'];

export async function GET(request) {
  try {
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    const { data: memberships, error } = await supabase
      .from('organization_memberships')
      .select('organization_id, membership_role, membership_status, created_at, organizations(id, name, created_at)')
      .eq('user_id', user.id);

    if (error) {
      console.error('[Organizations GET] Error:', error);
      return NextResponse.json({ error: 'Failed to retrieve organizations' }, { status: 500 });
    }

    const orgs = (memberships || []).map(m => ({
      id: m.organization_id,
      name: m.organizations?.name || 'Organization',
      membership_role: m.membership_role,
      membership_status: m.membership_status,
      joined_at: m.created_at
    }));

    return NextResponse.json({
      organizations: orgs,
      count: orgs.length
    });
  } catch (err) {
    console.error('[Organizations GET] Unexpected error:', err);
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

    const { name } = body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 100) {
      return NextResponse.json({ error: 'Organization name exceeds maximum length of 100 characters' }, { status: 400 });
    }

    // Idempotency: Check if user already created an organization with this exact name
    const { data: existingOrgs } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('created_by', user.id)
      .eq('name', trimmedName);

    if (existingOrgs && existingOrgs.length > 0) {
      const existing = existingOrgs[0];
      // Ensure user membership exists
      await supabase
        .from('organization_memberships')
        .upsert([{
          organization_id: existing.id,
          user_id: user.id,
          membership_role: 'owner',
          membership_status: 'active'
        }], { onConflict: 'organization_id,user_id' });

      return NextResponse.json({
        organization: existing,
        membership_role: 'owner',
        is_new: false,
        message: 'Existing organization returned idempotently.'
      });
    }

    // Create new organization
    let { data: newOrg, error: orgError } = await supabase
      .from('organizations')
      .insert([{
        name: trimmedName,
        created_by: user.id
      }])
      .select()
      .single();

    let isNew = true;

    if (orgError) {
      if (orgError.code === '23505') {
        const { data: racedOrg, error: raceLookupError } = await supabase
          .from('organizations')
          .select('*')
          .eq('created_by', user.id)
          .eq('name', trimmedName)
          .maybeSingle();

        if (!raceLookupError && racedOrg) {
          newOrg = racedOrg;
          isNew = false;
        } else {
          return NextResponse.json(
            { error: 'An organization with this name already exists.' },
            { status: 409 }
          );
        }
      } else {
        console.error('[Organizations POST] Insert error:', orgError);
        return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
      }
    }

    // Bind user as owner in organization_memberships (idempotent upsert)
    const { error: memError } = await supabase
      .from('organization_memberships')
      .upsert([{
        organization_id: newOrg.id,
        user_id: user.id,
        membership_role: 'owner',
        membership_status: 'active'
      }], { onConflict: 'organization_id,user_id' });

    if (memError) {
      console.error('[Organizations POST] Membership error:', memError);
      return NextResponse.json(
        { error: 'Organization was created but failed to bind owner membership.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      organization: newOrg,
      membership_role: 'owner',
      is_new: isNew,
      message: isNew ? 'Organization created successfully.' : 'Organization already exists.'
    }, { status: isNew ? 201 : 200 });

  } catch (err) {
    console.error('[Organizations POST] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

