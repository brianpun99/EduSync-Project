"""Bounded real ingestion concurrency on the isolated server; never fills disk."""
import concurrent.futures
import json
import time
from pathlib import Path
import httpx
ROOT=Path(__file__).resolve().parents[2]
out=ROOT/'docs/testing/results/2026-09-30-concurrency'
out.mkdir(parents=True,exist_ok=True)
with httpx.Client(base_url='http://127.0.0.1:8101',timeout=60) as c:
    token=c.post('/api/auth/login',json={'email':'integration@example.com','password':'StudyTest2026!'}).json()['access_token']
    c.headers['Authorization']='Bearer '+token
    sid=c.post('/api/subjects',json={'name':'Concurrency probe'}).json()['id']
    content=(ROOT/'docs/testing/results/2026-09-30-live/SE_Alpha.pdf').read_bytes()
    content += b' '*(10485760-len(content))
    def upload():
        start=time.perf_counter();r=c.post(f'/api/subjects/{sid}/documents',files={'file':('near-limit.pdf',content,'application/pdf')});return {'status':r.status_code,'seconds':time.perf_counter()-start}
    def health(i):
        start=time.perf_counter();r=c.get('/api/health');return {'status':r.status_code,'seconds':time.perf_counter()-start}
    with concurrent.futures.ThreadPoolExecutor(max_workers=11) as pool:
        work=pool.submit(upload)
        checks=list(pool.map(health,range(10)))
        result=work.result()
    records=[{'plan_id':'PERF-03','description':'Ten concurrent health requests during a 10 MiB real PDF upload','status':'Pass' if result['status']==201 and all(x['status']==200 and x['seconds']<=2 for x in checks) else 'Fail','observations':[{'upload':result,'health':checks,'limitation':'HTTP API only; five simultaneous live quiz calls and browser responsiveness not included'}]}]
    (out/'results.json').write_text(json.dumps({'records':records},indent=2))
    print(json.dumps(records))
