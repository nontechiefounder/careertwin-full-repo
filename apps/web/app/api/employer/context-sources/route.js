import { NextResponse } from 'next/server';
import { contextScope, contextFetch } from '@/lib/contextClient';
function errorResponse(error) {
  console.error('[context-sources GET error]:', error.code, error.status, error.message, error.stack);
  return NextResponse.json({error: error.code || 'CONTEXT_UNAVAILABLE'}, {status: error.status || 503});
}
export async function GET(request) {
  try {
    const scope = await contextScope(request, new URL(request.url).searchParams.get('hiring_run_id'));
    if (scope.errorResponse) return scope.errorResponse;
    const result = await contextFetch(scope, '/sources');
    return NextResponse.json(result.body, { status: result.status });
  } catch(error) { return errorResponse(error); }
}
