import { NextResponse } from 'next/server';
import { contextScope, contextFetch } from '@/lib/contextClient';
function errorResponse(error) { return NextResponse.json({error: error.code || 'CONTEXT_UNAVAILABLE'}, {status: error.status || 503}); }
export async function POST(request) {
  try {
    const body = await request.json();
    const scope = await contextScope(request, body.hiring_run_id, 'retrieve');
    if (scope.errorResponse) return scope.errorResponse;
    if (typeof body.question !== 'string' || body.question.trim().length < 3) return NextResponse.json({error:'QUESTION_REQUIRED'}, {status:400});
    const payload = {question: body.question.trim(), mode: 'retrieval_only', limit: body.limit || 5};
    if (typeof body.as_of === 'number' && !isNaN(body.as_of) && body.as_of > 0) {
      payload.as_of = body.as_of;
    } else if (typeof body.as_of === 'string' && body.as_of.trim()) {
      const parsed = Date.parse(body.as_of.trim());
      if (!isNaN(parsed)) {
        payload.as_of = parsed / 1000;
      } else {
        const num = parseFloat(body.as_of.trim());
        if (!isNaN(num) && num > 0) payload.as_of = num;
      }
    }
    const result = await contextFetch(scope, '/research-qa', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    return NextResponse.json(result.body, {status:result.status});
  } catch(error) { return errorResponse(error); }
}
