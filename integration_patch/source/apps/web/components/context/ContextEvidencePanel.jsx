"use client";
import {useEffect, useState} from 'react';
import api from '@/lib/api';

export default function ContextEvidencePanel({hiringRunId}) {
  const [sources,setSources]=useState([]), [selected,setSelected]=useState(null);
  const [file,setFile]=useState(null), [sourceKey,setSourceKey]=useState('');
  const [error,setError]=useState(''), [busy,setBusy]=useState(false);
  const [question,setQuestion]=useState(''), [result,setResult]=useState(null);
  async function refresh() {
    try {
      const res=await api.get(`/employer/context-sources?hiring_run_id=${encodeURIComponent(hiringRunId)}`);
      setSources(res.data.sources||[]); setError('');
    } catch(e) {setError(e.response?.data?.error||'Could not load document status.');}
  }
  useEffect(()=>{setSources([]);setSelected(null);setResult(null);setSourceKey('');refresh();},[hiringRunId]);
  useEffect(()=>{if(!sources.some(s=>s.state==='pending'))return; const timer=setTimeout(refresh,2000);return()=>clearTimeout(timer);},[sources,hiringRunId]);
  const active=sources.find(s=>s.source_id===selected);
  async function upload(e) {
    e.preventDefault();if(!file)return;setBusy(true);setError('');
    try {
      const form=new FormData();form.set('file',file);form.set('hiring_run_id',hiringRunId);form.set('source_key',sourceKey||file.name);
      const response=await api.post('/employer/context-sources/upload',form,{headers:{'Content-Type':undefined}});
      setSelected(response.data.source_id);await refresh();
    } catch(e){setError(e.response?.data?.error||'Upload failed.');}finally{setBusy(false);}
  }
  async function search(e) {
    e.preventDefault();setBusy(true);setError('');
    try {const r=await api.post('/employer/context-sources/search',{hiring_run_id:hiringRunId,question});setResult(r.data);}
    catch(e){setError(e.response?.data?.error||'Search failed.');}finally{setBusy(false);}
  }
  return <section aria-label="Context evidence" data-testid="context-evidence-panel" className="rounded-xl border border-white/20 p-5 space-y-4">
    <h2>Document evidence</h2>
    <p>Source material requires human review. This view does not verify competence or approve hiring criteria.</p>
    {error&&<p role="alert">{error}</p>}
    <form onSubmit={upload} className="space-y-2">
      <label>Choose a document <input aria-label="Choose document" type="file" accept=".pdf,.docx,.txt,.md,.csv" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
      <label>Source key <input value={sourceKey} onChange={e=>setSourceKey(e.target.value)} placeholder="Keep this key to upload a revised version"/></label>
      <button disabled={busy||!file}>Upload and queue processing</button>
    </form>
    <button onClick={refresh} disabled={busy}>Refresh status</button>
    <ul>{sources.map(s=><li key={s.source_id}><button onClick={()=>{setSelected(s.source_id);setSourceKey(s.source_key);}}>{s.source_id} — version {s.version}: {s.state}</button></li>)}</ul>
    {active&&<article><h3>Version {active.version}: {active.state}</h3>
      <p>Original SHA-256: {active.original_sha256}</p><p>Parser: {active.parser||'Not processed'}</p>
      <p>Pages with native text: {active.pages_with_text??'Unknown'} / {active.pages_total??'Unknown'}. This is not a semantic accuracy score.</p>
      <ul>{active.exceptions.map(x=><li key={x}>{x}</li>)}</ul>
      {active.spans.map(s=><blockquote key={s.span_id}><p>{s.text}</p><footer>Page {s.page??'unknown'}, offsets [{s.start}, {s.end}), Unicode code points.</footer></blockquote>)}
    </article>}
    <form onSubmit={search}><label>Find evidence <input aria-label="Find evidence" value={question} onChange={e=>setQuestion(e.target.value)}/></label><button disabled={busy||question.trim().length<3}>Search passages</button></form>
    {result&&<article><p>{result.disclaimer}</p><p>Coverage: {JSON.stringify(result.coverage)}</p>{result.passages.map(p=><blockquote key={p.span_id}>{p.text}<footer>Source {p.source_id}, version {p.version_id}, page {p.page??'unknown'}</footer></blockquote>)}</article>}
  </section>;
}
