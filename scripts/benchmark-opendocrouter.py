#!/usr/bin/env python3
"""Benchmark every OpenDocRouter model once on one synthetic image.

Read the API key from stdin as JSON: {"api_key":"..."}. Never prints or stores it.
The benchmark uses sync + cache=false + layout=false and writes only sanitized timing/result metadata.
"""
from __future__ import annotations
import base64, json, sys, time, urllib.error, urllib.request
from pathlib import Path
BASE='https://www.opendocrouter.ai'

def request(url, key, body=None, timeout=300):
    req=urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method='POST' if body is not None else 'GET', headers={'Authorization':'Bearer '+key, **({'Content-Type':'application/json'} if body is not None else {})})
    with urllib.request.urlopen(req, timeout=timeout) as response: return response.status, json.load(response)

def main():
    cfg=json.load(sys.stdin); key=cfg.get('api_key'); assert isinstance(key,str) and key
    status, catalog=request(BASE+'/v1/models',key)
    models=catalog.get('data',catalog.get('models',[])); ids=[x if isinstance(x,str) else x.get('id') for x in models]; ids=[x for x in ids if x]
    image=base64.b64encode(Path('ocr-sample.png').read_bytes()).decode();results=[]
    for index,model in enumerate(ids,1):
        body={'model':model,'document':{'data':image,'mime_type':'image/png'},'mode':'sync','cache':False,'layout':False};started=time.monotonic();row={'index':index,'model':model}
        try:
            code,data=request(BASE+'/v1/parse',key,body);row.update(http=code,elapsed_ms=round((time.monotonic()-started)*1000),status=data.get('status'),pages=len(data.get('pages',[])),charge_usd=data.get('charge_usd'),has_markdown=any(bool(p.get('markdown')) for p in data.get('pages',[]) if isinstance(p,dict)))
        except urllib.error.HTTPError as error:row.update(http=error.code,elapsed_ms=round((time.monotonic()-started)*1000),error='http')
        except Exception as error:row.update(elapsed_ms=round((time.monotonic()-started)*1000),error=type(error).__name__)
        results.append(row);print(json.dumps(row,ensure_ascii=False),flush=True)
    summary={'models_count':len(ids),'results':results,'request':{'mode':'sync','cache':False,'layout':False},'key_stored':False};Path('work/odr-model-benchmark.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':main()
