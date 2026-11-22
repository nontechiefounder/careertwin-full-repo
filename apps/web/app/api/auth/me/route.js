import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

const SAFE_PROFILE_COLUMNS =
  'id, email, name, role, company, gmail_connected, gmail_email, created_at, updated_at';

export async function GET(request) {
  try {
    const supabase = await createSupabaseServerClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Fetch explicit non-credential profile fields only
    const { data: profile } = await supabase
      .from('profiles')
      .select(SAFE_PROFILE_COLUMNS)
      .eq('id', user.id)
      .single();

    // Fetch memberships and organizations
    let orgs = [];
    try {
      const { data: memberships } = await supabase
        .from('organization_memberships')
        .select('organization_id, membership_role, membership_status, organizations(id, name)')
        .eq('user_id', user.id);

      if (memberships && Array.isArray(memberships)) {
        orgs = memberships.map((m) => ({
          id: m.organization_id,
          name: m.organizations?.name || 'Organization',
          role: m.membership_role,
          status: m.membership_status,
        }));
      }
    } catch (orgErr) {
      console.warn('[Auth Me] Organization lookup non-blocking warning:', orgErr);
    }

    const safeProfile = profile
      ? {
          id: profile.id,
          email: profile.email ?? user.email,
          role: profile.role ?? user.user_metadata?.role ?? 'employer',
          name: profile.name ?? user.user_metadata?.name ?? 'User',
          company: profile.company ?? null,
          gmail_connected: Boolean(profile.gmail_connected),
          gmail_email: profile.gmail_email ?? null,
          created_at: profile.created_at ?? null,
          updated_at: profile.updated_at ?? null,
        }
      : {
          id: user.id,
          email: user.email,
          role: user.user_metadata?.role || 'employer',
          name: user.user_metadata?.name || 'User',
          company: user.user_metadata?.company || null,
          gmail_connected: false,
          gmail_email: null,
          is_fallback: true,
        };

    return NextResponse.json({
      ...safeProfile,
      organizations: orgs,
      active_organization_id: orgs[0]?.id || null,
    });
  } catch (err) {
    console.error('Auth check error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
