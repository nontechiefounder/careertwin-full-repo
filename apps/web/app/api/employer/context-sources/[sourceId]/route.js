import { NextResponse } from 'next/server';
import { contextScope, contextFetch } from '@/lib/contextClient';

function errorResponse(error) {
  return NextResponse.json({ error: error.code || 'CONTEXT_UNAVAILABLE' }, { status: error.status || 503 });
}

export async function DELETE(request, { params }) {
  try {
    const { sourceId } = await params;
    const searchParams = new URL(request.url).searchParams;
    const hiringRunId = searchParams.get('hiring_run_id');

    const scope = await contextScope(request, hiringRunId, 'delete');
    if (scope.errorResponse) return scope.errorResponse;

    const result = await contextFetch(scope, `/sources/${encodeURIComponent(sourceId)}`, {
      method: 'DELETE',
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return errorResponse(error);
  }
}
