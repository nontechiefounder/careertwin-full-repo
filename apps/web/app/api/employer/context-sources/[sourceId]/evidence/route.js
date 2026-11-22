import { NextResponse } from 'next/server';
import { contextScope, contextFetch } from '@/lib/contextClient';
function errorResponse(error) { return NextResponse.json({error: error.code || 'CONTEXT_UNAVAILABLE'}, {status: error.status || 503}); }
export async function GET(request, {params}) {
  try {
    const url = new URL(request.url);
    const scope = await contextScope(request, url.searchParams.get('hiring_run_id'));
    if (scope.errorResponse) return scope.errorResponse;
    const {sourceId} = await params;
    const qp = new URLSearchParams();
    if (url.searchParams.get('as_of')) qp.set('as_of', url.searchParams.get('as_of'));
    if (url.searchParams.get('version')) qp.set('version', url.searchParams.get('version'));
    const qs = qp.toString() ? `?${qp.toString()}` : '';
    const result = await contextFetch(scope, `/sources/${encodeURIComponent(sourceId)}${qs}`);
    return NextResponse.json(result.body, { status: result.status });
  } catch(error) { return errorResponse(error); }
}
