import {NextResponse} from 'next/server';
import {contextScope, contextFetch} from '@/lib/contextClient';
export async function POST(request) {
  if (process.env.ENABLE_RESEARCH_QA !== 'true' && process.env.NEXT_PUBLIC_ENABLE_RESEARCH_QA !== 'true') return NextResponse.json({error:'RESEARCH_QA_DISABLED',code:'RESEARCH_QA_DISABLED'},{status:403});
  try {
    const b=await request.json();
    if (!b || typeof b!=='object' || Array.isArray(b) || typeof b.question!=='string' || b.question.trim().length<3 || b.question.length>1000) return NextResponse.json({error:'INVALID_REQUEST'},{status:400});
    if (['org_id','workspace_id','role_id'].some(k=>b[k]!=null)) return NextResponse.json({error:'CLIENT_SCOPE_OVERRIDE'},{status:400});
    const mode=b.mode||'retrieval_only', limit=b.limit??5;
    if (!Number.isInteger(limit)||limit<1||limit>20) return NextResponse.json({error:'INVALID_LIMIT'},{status:400});
    if(mode!=='retrieval_only') return NextResponse.json({error:'GENERATION_NOT_IMPLEMENTED',code:'GENERATION_NOT_IMPLEMENTED'},{status:503});
    const scope=await contextScope(request,b.hiring_run_id,'retrieve');
    if(scope.errorResponse)return scope.errorResponse;
    const result=await contextFetch(scope,'/research-qa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:b.question.trim(),mode,limit})});
    return NextResponse.json(result.body,{status:result.status});
  } catch(error) {return NextResponse.json({error:error.code||'CONTEXT_UNAVAILABLE'},{status:error.status||503});}
}
