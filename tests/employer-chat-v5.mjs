// Standalone synthetic HTTP adapter over the actual packaged route (not a Next.js server).
import assert from 'node:assert/strict';
import vm from 'node:vm';
import http from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
const web=new URL('../apps/web/',import.meta.url);
const id='11111111-1111-4111-a111-111111111111', org='22222222-2222-4222-a222-222222222222';
const role={id,org_id:org,role_title:'Engineer',company:'Example',status:'active',job_description:'Review the submitted sample.'};
const db={from(t){assert.equal(t,'hiring_runs');const q={select:()=>q,eq:()=>q,order:()=>({data:[role]}),maybeSingle:()=>({data:role})};return q;}};
const enabled={GEMINI_API_KEY:'synthetic',WORKBYLINE_GENERATION_GATE:'true',WORKBYLINE_AI_PROVIDER:'gemini',WORKBYLINE_AI_STRICT_PROVIDER:'true'};
let records=[], detail=null, output='', calls=0, allow=true, ctxDenied=false, fault=false, authFailure=false;
const processStub={env:{...enabled}};
const cx=vm.createContext({Response,Request,console,AbortSignal,process:processStub,
  fetch:async (url)=>{calls++;assert.equal(new URL(url).hostname,'generativelanguage.googleapis.com');
    if(fault)return Response.json({}, {status:503});
    return Response.json({candidates:[{content:{parts:[{text:output}]}}]});}});
const mocks={
  '@/lib/serverAuth':{requireUser:()=>authFailure?{errorResponse:Response.json({},{status:401})}:{user:{id:'u'},supabase:db},getVerifiedOrgMembership:()=>allow?{membership_role:'recruiter'}:null},
  '@/lib/contextClient':{contextScope:()=>ctxDenied?{errorResponse:true}:{workspace:'test'},contextFetch:async (_scope,path)=>({body:path==='/sources'?{sources:records}:detail})},
  'next/server':{NextResponse:Response}
};
const cache=new Map();
function load(key){
  if(cache.has(key))return cache.get(key);
  let mod;
  if(Object.hasOwn(mocks,key)){const values=mocks[key];mod=new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context:cx});}
  else {const file=key.replace(/^@\//,'')+'.js';mod=new vm.SourceTextModule(readFileSync(new URL(file,web),'utf8'),{context:cx,identifier:file});}
  cache.set(key,mod);return mod;
}
const route=load('app/api/employer/chat/route');await route.link(k=>load(k==='./scoreUtils'?'@/lib/scoreUtils':k));await route.evaluate();
const {validateGroundedAnswer:validate, INSUFFICIENT_EVIDENCE:refusal}=load('@/lib/chatGrounding').namespace;
const server=http.createServer(async(req,res)=>{try{let body='';for await(const chunk of req)body+=chunk;
  const r=await route.namespace.POST(new Request('http://localhost/api/employer/chat',{method:'POST',body}));res.writeHead(r.status,{'Content-Type':'application/json'});res.end(await r.text());}
  catch{res.writeHead(500);res.end('{}');}});
server.listen(0,'127.0.0.1');await once(server,'listening');
const post=async()=>{const resp=await fetch('http://127.0.0.1:'+server.address().port+'/api/employer/chat',{method:'POST',body:JSON.stringify({message:'Explain the submitted evidence',context:{org_id:org,active_run_id:id}})});return {status:resp.status,r:await resp.json()};};
const row=(text)=>({source_id:'d1',filename:'evidence.pdf',version_id:'v1',state:'completed',spans:[{span_id:'s1',text}]});
let count=0;
function success(name){count++;console.log('PASS',name);}
const base='Alice built Kubernetes services.';
const cases=[
 ['A',base,'Alice never built Kubernetes services. See evidence.pdf.',false],
 ['B',base,'Alice built Kubernetes services and secretly committed financial fraud. See evidence.pdf.',false],
 ['C','','I cannot answer everything. Alice stole confidential customer data.',false],
 ['positive',base,'Alice built Kubernetes services. See evidence.pdf.',true],
 ['refusal','','I cannot answer that request from authorized records.',true],
 ['ownership','Alice reviewed the Kubernetes services that Bob built.','Alice built Kubernetes services. See evidence.pdf.',false],
 ['deadline','Alice deployed Kubernetes services after approval.','Alice deployed Kubernetes services before approval. See evidence.pdf.',false],
 ['units','Alice reduced build time by 25%.','Alice reduced build time by $25. See evidence.pdf.',false],
 ['short-claim',base,'Alice built Kubernetes services. Unqualified. See evidence.pdf.',false],
 ['no-evidence','','Unqualified.',false],
 ['refusal-with-claim','','Insufficient evidence: the candidate falsified records.',false],
 ['exact-negative','Alice never built Kubernetes services.','Alice never built Kubernetes services. See evidence.pdf.',true],
 ['negative-to-positive','Alice never built Kubernetes services.','Alice built Kubernetes services. See evidence.pdf.',false],
 ['written-number','Alice has five years of Python experience.','Alice has five years of Python experience. See evidence.pdf.',true],
 ['currency','Alice managed a budget of $25 per project.','Alice managed a budget of €25 per project. See evidence.pdf.',false],
 ['refusal-tail','','I cannot answer because the candidate falsified records.',false],
 ['unrelated',base,'Bob managed an orchestra. See evidence.pdf.',false]
];
try {
  for(const [name,text,answer,want] of cases){
    output=answer;records=text?[row(text)]:[];
    const span={documentId:'d1',documentName:'evidence.pdf',spanId:'s1',versionId:'v1',text};
    const v=validate(answer,text?[span]:[]);
    assert.equal(v.ok,want,name);
    const before=calls;const {status,r}=await post();assert.equal(status,200);
    assert.equal(calls-before,text?1:0);
    if(want && text){assert.equal(r.reply,'Source excerpt from evidence.pdf:\n\n'+text);
      assert.equal(r.grounding_validated,true);assert.equal(r.sources.length,1);
      assert.deepEqual([r.sources[0].id,r.sources[0].span_id,r.sources[0].version,r.sources[0].supporting_span],['d1','s1','v1',text]);}
    else{assert.equal(r.reply,refusal);assert.deepEqual(r.sources,[]);assert.equal(r.grounding_validated,false);assert.equal(r.response_mode,'grounded_abstention');}
    success('helper and loopback: '+name);
  }
  records=[row(base)];output=base;
  for(const [name,overrides] of [
    ['gate off',{WORKBYLINE_GENERATION_GATE:'false'}],['gate missing',{WORKBYLINE_GENERATION_GATE:undefined}],
    ['OpenAI strict',{WORKBYLINE_AI_PROVIDER:'openai'}],['empty key',{GEMINI_API_KEY:''}],
    ['strict without selection',{WORKBYLINE_AI_PROVIDER:''}],['other preferred',{WORKBYLINE_AI_PROVIDER:'claude',WORKBYLINE_AI_STRICT_PROVIDER:'false'}]]){
    processStub.env={...enabled,...overrides};const before=calls;const {r,status}=await post();assert.equal(status,200);assert.equal(calls,before);assert.notEqual(r.grounding_validated,true);success('no provider request: '+name);
  }
  processStub.env={...enabled};
  for(const [name,settings] of [
    ['no named source',{filename:undefined}],['no version',{version_id:undefined}],
    ['pending',{state:'pending'}],['oversized',{spans:[{span_id:'s1',text:'x'.repeat(4001)}]}]]){
    records=[{...row(base),...settings}];const before=calls;const {r}=await post();assert.equal(calls,before);assert.equal(r.reply,refusal);assert.deepEqual(r.sources,[]);success(name);
  }
  records=[row(base)];ctxDenied=true;
  {const before=calls;const {r}=await post();assert.equal(calls,before);assert.equal(r.context_status,'denied');assert.equal(r.reply,refusal);success('denied context');}
  ctxDenied=false;allow=false;
  {const before=calls;assert.equal((await post()).status,403);assert.equal(calls,before);success('denied membership');}
  allow=true;authFailure=true;
  {const before=calls;assert.equal((await post()).status,401);assert.equal(calls,before);success('unauthenticated');}
  authFailure=false;fault=true;
  {const {r}=await post();assert.equal(r.reply,refusal);assert.deepEqual(r.sources,[]);success('provider unavailable');}
  fault=false;records=[row(base),{...row(base),source_id:'d2',spans:[{span_id:'s2',text:base}]}];
  {output=base+' See evidence.pdf.';const {r}=await post();assert.equal(r.reply,refusal);assert.deepEqual(r.sources,[]);success('ambiguous same filename');}
  {output=base+' [From Document: evidence.pdf | Span: s2]';const {r}=await post();assert.equal(r.sources[0].id,'d2');success('explicit span disambiguates');}
  {records=[row(base+' This was a supervised training exercise.')];output=base;const {r}=await post();assert.equal(r.reply,'Source excerpt from evidence.pdf:\n\n'+records[0].spans[0].text);success('preserve qualifying sentence');}
  const original=row(base);records=[{...original,spans:undefined}];output=base;
  for(const [label,change,accepted] of [['same revision',{},true],['different revision',{version_id:'v2'},false],['different source',{source_id:'d2'},false],['withdrawn detail',{state:'excluded'},false]]){
    detail={...original,...change};const before=calls;const {r}=await post();assert.equal(r.grounding_validated,accepted);assert.equal(calls-before,accepted?1:0);success('detail: '+label);
  }
  console.log('Cases passed:',count,'; external requests: 0 (provider transport replaced).');
} finally {server.closeAllConnections();server.close();}
