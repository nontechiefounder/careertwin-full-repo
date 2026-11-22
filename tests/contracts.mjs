import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../integration_patch/source/apps/web/',import.meta.url);
const helper=fs.readFileSync(new URL('lib/engineConfig.js',root),'utf8');
const mod=await import('data:text/javascript;base64,'+Buffer.from(helper).toString('base64'));
const checks=[];
delete process.env.WORKBYLINE_ENGINE_MAPPINGS;
assert.equal(mod.resolveEngineContext('org_pilot_readily','run_readily_infra_01').ok,false);
checks.push('no_builtin_tenant_fallback');
const r=mod.validateEngineResponse({status:'RETRIEVAL_ONLY_COMPLETE',passages:[{span_id:'s',text:'Fact',employer_approval:'NOT_OBTAINED'}]},'retrieval_only');
assert.equal(r.data.passages[0].employer_approval,'NOT_OBTAINED');checks.push('unapproved_is_not_boolean_true');
for(const status of ['GROUNDED','AMBIGUOUS','DISAGREEMENT','UNVERIFIED_STATUS']){
 const r=mod.validateEngineResponse({status,answer:'Unsupported original',has_validation_errors:true,citations:[]});
 assert.equal(r.ok,true);assert.notEqual(r.data.answer,'Unsupported original');assert.equal(r.data.status,'INSUFFICIENT_EVIDENCE');
 checks.push('fail_closed_'+status);
}
assert.equal(mod.validateEngineResponse({status:'GROUNDED',answer:'x',has_validation_errors:'false',citations:[]}).ok,false);
checks.push('literal_boolean_contract');
const retired=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(new URL('lib/contextEvidenceWorker.js',root),'utf8')).toString('base64'));
await assert.rejects(retired.processOutboxEvent(),/LEGACY_WORKER_DISABLED/);
checks.push('fabricated_worker_is_disabled');
console.log(JSON.stringify({scope:'isolated JavaScript contract probes; not Next.js runtime',checks:checks.map(check=>({check,passed:true}))},null,2));
