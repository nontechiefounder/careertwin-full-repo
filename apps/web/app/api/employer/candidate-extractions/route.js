import { requireUser } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;

    return NextResponse.json(
      {
        error: 'ROUTE_DECOMMISSIONED',
        message: 'Manual candidate extraction injection is disabled. Use authenticated document upload or transactional provider sourcing.'
      },
      { status: 410 }
    );
  } catch (err) {
    console.error('Candidate extraction route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
