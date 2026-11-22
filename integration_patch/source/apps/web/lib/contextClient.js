// Server-only adapter. Mount into the complete V2 baseline before acceptance.
import 'server-only';
import crypto from 'node:crypto';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';

export class ContextError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

export async function contextScope(request, runId, operation = 'read') {
  if (typeof runId !== 'string' || !runId.trim()) throw new ContextError(400, 'HIRING_RUN_REQUIRED');
  const auth = await requireUser(request);
  if (auth.errorResponse) return { errorResponse: auth.errorResponse };
  const { data: run, error } = await auth.supabase.from('hiring_runs').select('id, org_id').eq('id', runId.trim()).single();
  if (error || !run) throw new ContextError(404, 'RUN_NOT_FOUND');
  const membership = await getVerifiedOrgMembership(auth.supabase, auth.user.id, run.org_id);
  const write = operation === 'upload' || operation === 'delete';
  const roles = write ? ['owner', 'admin', 'recruiter', 'hiring_manager'] : ['owner', 'admin', 'recruiter', 'hiring_manager', 'auditor'];
  if (!membership || membership.membership_status !== 'active' || !roles.includes(membership.membership_role)) throw new ContextError(403, 'ACCESS_DENIED');
  let registry;
  try { registry = JSON.parse(process.env.WORKBYLINE_ENGINE_MAPPINGS || '{}'); }
  catch { throw new ContextError(503, 'MAPPING_CONFIG_INVALID'); }
  const mapping = registry?.[run.org_id]?.runs?.[run.id];
  if (!mapping || mapping.status !== 'active' || typeof mapping.workspaceId !== 'string' || !mapping.workspaceId.trim() || typeof mapping.roleId !== 'string' || !mapping.roleId.trim()) throw new ContextError(403, 'UNMAPPED_WORKSPACE');
  const raw = process.env.WORKBYLINE_CONTEXT_SERVICE_URL;
  const secret = process.env.WORKBYLINE_CONTEXT_DELEGATION_SECRET;
  let url;
  try { url = new URL(raw); } catch { throw new ContextError(503, 'CONTEXT_CONFIG_MISSING'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !secret || secret.length < 32) throw new ContextError(503, 'CONTEXT_CONFIG_INVALID');
  if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new ContextError(503, 'TLS_REQUIRED');
  const now = Math.floor(Date.now() / 1000);
  const claims = {iss: 'workbyline-v2-web', aud: 'workbyline-context-evidence', actor: auth.user.id, org: run.org_id, run: run.id, workspace: mapping.workspaceId, role: mapping.roleId, operation, iat: now, exp: now + 60, jti: crypto.randomUUID()};
  const head = Buffer.from(JSON.stringify({alg: 'HS256', typ: 'JWT'})).toString('base64url');
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return {base: url.href.replace(/\/$/, ''), workspace: mapping.workspaceId, token: `${head}.${body}.${signature}`};
}

export async function contextFetch(scope, path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${scope.base}/v1/workspaces/${encodeURIComponent(scope.workspace)}${path}`, {...options, headers: {...options.headers, Authorization: `Bearer ${scope.token}`}, signal: controller.signal, cache: 'no-store'});
    const body = await response.json();
    if (!response.ok) throw new ContextError(response.status, /^[A-Z0-9_]+$/.test(body.error) ? body.error : 'CONTEXT_SERVICE_ERROR');
    return {body, status: response.status};
  } catch (error) {
    if (error instanceof ContextError) throw error;
    throw new ContextError(error.name === 'AbortError' ? 504 : 503, 'CONTEXT_UNAVAILABLE');
  } finally { clearTimeout(timer); }
}
