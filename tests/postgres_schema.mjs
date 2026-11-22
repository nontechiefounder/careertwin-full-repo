// PGlite executes real PostgreSQL in WASM. This is not hosted Supabase or a
// PostgreSQL network/worker-concurrency acceptance test.
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
const db = new PGlite();
const root = new URL('../', import.meta.url);
const results=[];
await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
await db.exec(fs.readFileSync(new URL('migrations/001_evidence_service.sql',root),'utf8'));
const tables=await db.query("SELECT count(*)::int AS count FROM pg_tables WHERE tablename LIKE 'wbctx_%' AND rowsecurity");
if(tables.rows[0].count!==7)throw Error('Expected 7 protected repair-service tables');
results.push({check:'service_schema_executes_and_rls_enabled',passed:true,count:tables.rows[0].count});
for(const role of ['anon','authenticated']) {
  await db.exec(`SET ROLE ${role}`);
  let denied=false;
  try{await db.query('SELECT * FROM wbctx_artifacts');}catch(e){denied=e.message.includes('permission denied');}
  await db.exec('RESET ROLE');
  if(!denied)throw Error('Client role accessed private service data');
  results.push({check:`${role}_direct_read_denied`,passed:true});
}
await db.exec('CREATE TABLE organizations(id uuid PRIMARY KEY); CREATE TABLE organization_memberships(organization_id uuid,user_id uuid); CREATE TABLE hiring_runs(id uuid PRIMARY KEY); CREATE TABLE claim_ledgers(id uuid PRIMARY KEY); CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;');
const legacy=fs.readFileSync(new URL('supplied_snapshot/migrations/20260818000001_context_evidence_foundation.sql',root),'utf8');
let expectedFailure=false;
try{await db.exec('BEGIN;'+legacy+'COMMIT;');}catch(e){expectedFailure=e.message.includes('m.org_id')||e.message.includes('org_id'); await db.exec('ROLLBACK');}
if(!expectedFailure)throw Error('Original schema discrepancy not reproduced');
results.push({check:'supplied_legacy_migration_membership_column_failure_reproduced',passed:true});
await db.exec('CREATE FUNCTION public.ingest_context_source_version_transactional() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$SELECT 1$$;');
await db.exec(fs.readFileSync(new URL('migrations/000_contain_unsafe_legacy_rpc.sql',root),'utf8'));
const permissions=await db.query("SELECT has_function_privilege('anon','public.ingest_context_source_version_transactional()','EXECUTE') AS allowed");
if(permissions.rows[0].allowed)throw Error('Legacy RPC remains public');
results.push({check:'legacy_rpc_public_execute_revoked',passed:true});
console.log(JSON.stringify({scope:'embedded PostgreSQL WASM; not network/runtime Supabase',checks:results},null,2));
await db.close();
