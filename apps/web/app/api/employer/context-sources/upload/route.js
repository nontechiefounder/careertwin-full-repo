import { NextResponse } from 'next/server';
import { contextScope, contextFetch } from '@/lib/contextClient';
function errorResponse(error) { return NextResponse.json({error: error.code || 'CONTEXT_UNAVAILABLE'}, {status: error.status || 503}); }
export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function' || !file.size) return NextResponse.json({error:'FILE_REQUIRED'}, {status:422});
    if (file.size > 50 * 1024 * 1024) return NextResponse.json({error:'FILE_TOO_LARGE'}, {status:413});
    if (form.has('org_id') || form.has('workspace_id') || form.has('role_id')) return NextResponse.json({error:'CLIENT_SCOPE_OVERRIDE'}, {status:400});
    const scope = await contextScope(request, form.get('hiring_run_id'), 'upload');
    if (scope.errorResponse) return scope.errorResponse;
    const outgoing = new FormData();
    outgoing.set('file', file);
    // source_key serves as a display label; without explicit target_source_id,
    // the backend assigns a distinct source identity to prevent filename collisions.
    const customLabel = (form.get('source_key') || '').trim();
    outgoing.set('source_key', customLabel || file.name);
    if (form.has('target_source_id') && form.get('target_source_id')) {
      outgoing.set('target_source_id', form.get('target_source_id').trim());
    }
    const idempotencyKey = request.headers.get('idempotency-key') || form.get('idempotency_key');
    if (idempotencyKey) {
      outgoing.set('idempotency_key', idempotencyKey);
    }
    const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    const result = await contextFetch(scope, '/sources', {method:'POST', body:outgoing, headers});
    return NextResponse.json(result.body, {status:result.status});
  } catch(error) { return errorResponse(error); }
}
