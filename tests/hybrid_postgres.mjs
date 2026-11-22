import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const db=new PGlite({extensions:{vector}});
const queries=JSON.parse(fs.readFileSync(new URL('tests/hybrid_queries.json',root),'utf8'));
let count=0;
const pass=(name)=>{count++;console.log('PASS',name);};
await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;BEGIN;'+fs.readFileSync(new URL('migrations/001_evidence_service.sql',root),'utf8')+fs.readFileSync(new URL('migrations/004_hybrid_retrieval.sql',root),'utf8')+'COMMIT;');
pass('schema, FTS index and actual pgvector extension in PostgreSQL WASM');
const embedding='['+Array(384).fill(1).join(',')+']';
async function source(id,org,run){await db.query('INSERT INTO wbctx_sources(id,org,run,workspace,role,source_key,deleted) VALUES ($1,$2,$3,$4,$5,$1,false)',[id,org,run,'w','role']);}
async function version(id,source,number,state,observed){await db.query('INSERT INTO wbctx_versions(id,source,number,sha256,bytes,filename,path,observed_at,state) VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8)',[id,source,number,'hash','spec.txt','private',observed,state]);}
async function span(id,version,text){await db.query('INSERT INTO wbctx_spans(id,version,start,"end",page,text) VALUES ($1,$2,0,$3,NULL,$4)',[id,version,text.length,text]);await db.query('INSERT INTO wbctx_span_embeddings(span_id,model_id,embedding) VALUES ($1,$2,$3::vector)',[id,'synthetic-test-vectors',embedding]);}
await source('a','org-a','run-a');await source('b','org-b','run-b');
await version('v1','a',1,'completed',1);await span('a1','v1','Kubernetes cluster deployment');
await version('vb','b',1,'completed',1);await span('b1','vb','Kubernetes private cluster');
const params={org:'org-a',run:'run-a',workspace:'w',role:'role',query:'Kubernetes',as_of:null,model:'synthetic-test-vectors',vector:embedding};
async function search(type,overrides={}){
 const values=[];const indexes=new Map();const p={...params,...overrides};
 const sql=queries[type].replace(/:([a-z_]+)/g,(_,key)=>{if(!indexes.has(key)){indexes.set(key,values.length+1);values.push(p[key]);}return '$'+indexes.get(key);});
 return (await db.query(sql,values)).rows;
}
for(const type of ['lexical','dense']){
 const rows=await search(type);assert.deepEqual(rows.map(r=>r.span_id),['a1']);pass(type+' filters foreign tenant before ranking');
}
await version('v2','a',2,'pending',2);
for(const type of ['lexical','dense']){assert.equal((await search(type)).length,0);pass(type+' pending newest revision suppresses stale spans');}
for(const type of ['lexical','dense']){assert.deepEqual((await search(type,{as_of:1.5})).map(r=>r.span_id),['a1']);pass(type+' historical observed-at scope');}
await db.query("UPDATE wbctx_sources SET deleted=true WHERE id='a'");
for(const type of ['lexical','dense']){assert.equal((await search(type,{as_of:1.5})).length,0);pass(type+' tombstone excludes historical results');}
await db.exec('SET ROLE authenticated');
let denied=false;try{await db.query('SELECT * FROM wbctx_span_embeddings');}catch(e){denied=e.message.includes('permission denied');}assert.ok(denied);await db.exec('RESET ROLE');pass('authenticated cannot read embeddings');
console.log(JSON.stringify({checks:count,scope:'PostgreSQL WASM; synthetic vectors for correctness only, not semantic quality or native server performance'}));
await db.close();
