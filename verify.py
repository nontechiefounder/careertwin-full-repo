"""Reproduce local gates without treating blocked deployment checks as passes."""
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parent


def main():
    commands=[('python_suite',[sys.executable,'-m','pytest','tests','-q','--tb=short','--junitxml=evidence/pytest.xml']),
              ('js_contracts',['node','tests/contracts.mjs']),
              ('embedded_postgres',['node','tests/postgres_schema.mjs']),
              ('overlay_syntax',['node','tests/check_overlay.mjs']),
              ('local_http_benchmark',[sys.executable,'tests/run_benchmark.py'])]
    results=[]
    for name,command in commands:
        start=time.monotonic()
        run=subprocess.run(command,cwd=ROOT,capture_output=True,text=True)
        (ROOT/'evidence'/f'{name}.log').write_text(run.stdout+run.stderr)
        results.append({'name':name,'command':command,'exit_code':run.returncode,'seconds':round(time.monotonic()-start,3),'status':'PASS' if run.returncode==0 else 'FAIL'})
        print(name,results[-1]['status'],flush=True)
    status={'local_gates':results,'blocked':['complete V2 baseline reconstruction and full Next.js build','real-browser application acceptance','native PostgreSQL worker concurrency and hosted Supabase RLS/auth','paired application/database rollback'],
            'deferred':['Gemini generation','Temporal','LangGraph','pgvector','Graphiti','connectors','OpenFGA','hard deletion','OCR'],
            'overall':'LOCAL_FOUNDATION_ONLY; NOT ENTERPRISE OR LAUNCH ACCEPTANCE'}
    (ROOT/'evidence/verification_results.json').write_text(json.dumps(status,indent=2)+'\n')
    return int(any(r['exit_code'] for r in results))


if __name__=='__main__':
    raise SystemExit(main())
