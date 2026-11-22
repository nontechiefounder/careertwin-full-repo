import { NextResponse } from 'next/server';
import { contextScope, contextFetch } from '@/lib/contextClient';

function errorResponse(error) {
  return NextResponse.json(
    { error: error.code || 'CONTEXT_UNAVAILABLE' },
    { status: error.status || 503 }
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const scope = await contextScope(request, body.hiring_run_id, 'retrieve');
    if (scope.errorResponse) return scope.errorResponse;
    if (typeof body.question !== 'string' || body.question.trim().length < 3) {
      return NextResponse.json({ error: 'QUESTION_REQUIRED' }, { status: 400 });
    }
    const result = await contextFetch(scope, '/research-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: body.question.trim(),
        mode: 'retrieval_augmented',
        limit: 5
      })
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return errorResponse(error);
  }
}
