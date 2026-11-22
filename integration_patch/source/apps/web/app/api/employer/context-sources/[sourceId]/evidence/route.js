import { NextResponse } from 'next/server';
import { contextScope, contextFetch } from '@/lib/contextClient';
function errorResponse(error) { return NextResponse.json({error: error.code || 'CONTEXT_UNAVAILABLE'}, {status: error.status || 503}); }
export async function GET(request, {params}) {
  try {
    const scope = await contextScope(request, new URL(request.url).searchParams.get('hiring_run_id'));
    if (scope.errorResponse) return scope.errorResponse;
    const {sourceId} = await params;
    const result = await contextFetch(scope, `/sources/${encodeURIComponent(sourceId)}`);
    return NextResponse.json(result.body, {status:result.status});
  } catch(error) { return errorResponse(error); }
}
