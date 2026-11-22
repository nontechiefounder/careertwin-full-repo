import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const root=new URL('../integration_patch/source/apps/web/',import.meta.url);
const targets=['lib/contextClient.js','lib/contextEvidenceWorker.js','lib/engineConfig.js',
 'app/api/employer/context-sources/upload/route.js','app/api/employer/context-sources/route.js',
 'app/api/employer/context-sources/[sourceId]/evidence/route.js','app/api/employer/context-sources/search/route.js',
 'app/api/employer/research-qa/route.js','components/context/ContextEvidencePanel.jsx'];
for(const target of targets) await build({stdin:{contents:fs.readFileSync(new URL(target,root),'utf8'),sourcefile:target,loader:target.endsWith('.jsx')?'jsx':'js'},bundle:true,platform:'node',external:['*'],write:false,logLevel:'error'});
console.log(JSON.stringify({scope:'syntax/bundling of changed overlay files only; NOT a full Next.js build or DOM test',checked:targets.length,passed:true},null,2));
