import { NextResponse } from 'next/server';
import { contextScope, contextFetch } from '@/lib/contextClient';
export async function POST(request) {
  try {
    const body=await request.json();
    if (!body || typeof body.question!=='string' || body.question.trim().length<3 || body.question.length>1000)
      return NextResponse.json({error:'INVALID_QUESTION'},{status:400});
    if (['org_id','workspace_id','role_id'].some(k=>k in body))
      return NextResponse.json({error:'CLIENT_SCOPE_OVERRIDE'},{status:400});
    const scope=await contextScope(request,body.hiring_run_id,'retrieve');
    if(scope.errorResponse)return scope.errorResponse;
    const res=await contextFetch(scope,'/related-evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:body.question.trim(),limit:5})});
    return NextResponse.json(res.body,{status:res.status});
  } catch(e){return NextResponse.json({error:e.code||'CONTEXT_UNAVAILABLE'},{status:e.status||503});}
}
