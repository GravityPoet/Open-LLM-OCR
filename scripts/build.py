#!/usr/bin/env python3
"""Build reproducible plugin archives; never publish or read user settings."""
from pathlib import Path
import argparse, hashlib, io, json, zipfile
ROOT = Path(__file__).resolve().parents[1]

def archive(profile: str = "standard") -> bytes:
    info = json.loads((ROOT / 'info.json').read_bytes())
    if profile in ("azure", "mistral", "roboflowWorkflow", "openDocRouter"):
        info['identifier'] += '.' + profile
        info['name'] = 'Open-LLM-OCR · ' + {'azure':'微软 OCR','mistral':'Mistral OCR','roboflowWorkflow':'Roboflow OCR','openDocRouter':'OpenDocRouter OCR'}[profile]
        info['summary'] = {'azure':'Azure Document Intelligence Read','mistral':'Mistral OCR 4.1 与最新模型','roboflowWorkflow':'Roboflow 自定义模型与 Workflow OCR','openDocRouter':'OpenDocRouter OCR · ocria-1'}.get(profile, info['summary'])
        info.pop('appcast', None)
        info['options'] = [dict(o) for o in info['options'] if o['identifier'] in (('cloudBaseUrl', 'cloudApiKey', 'requestTimeoutSec') if profile == 'azure' else ('cloudBaseUrl', 'cloudApiKey', 'mistralModel', 'cloudModel', 'requestTimeoutSec') if profile == 'mistral' else ('roboflowApiKey','roboflowWorkflowId','requestTimeoutSec') if profile == 'roboflowWorkflow' else ('openDocRouterBaseUrl','openDocRouterApiKey','openDocRouterModel','openDocRouterMaxPages','requestTimeoutSec'))]
        for option in info['options']:
            if option['identifier'] == 'cloudBaseUrl':
                option.update(title='Azure Endpoint' if profile == 'azure' else 'Mistral Endpoint', defaultValue=option['defaultValue'] if profile == 'azure' else 'https://api.mistral.ai/v1', desc='当前服务的接口地址。')
                option['textConfig'] = {'type': 'visible', 'placeholderText': option['defaultValue']}
            if option['identifier'] == 'cloudApiKey':
                option.update(title='API Key', desc='填写当前服务的 API Key。')
                if profile == 'mistral': option['textConfig'] = {'type': 'secure', 'placeholderText': 'Mistral API Key'}
            if profile == 'mistral' and option['identifier'] == 'cloudModel':
                option.update(title='自定义 Mistral 模型', defaultValue='', desc='仅选择“自定义”时填写 Mistral 模型 ID。')
                option['textConfig'] = {'type': 'visible', 'placeholderText': 'Mistral 自定义模型 ID'}
            if profile == 'openDocRouter' and option['identifier'] == 'openDocRouterBaseUrl':
                option.update(title='OpenDocRouter Endpoint', desc='固定使用 /v1/parse。')
    buf = io.BytesIO()
    files = [ROOT/'main.js', ROOT/'info.json', ROOT/'ocr-sample.png', *sorted((ROOT/'lib').glob('*.js'))]
    with zipfile.ZipFile(buf, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in files:
            if p.is_symlink(): raise ValueError('Symlinks are not release inputs')
            data = (json.dumps(info, ensure_ascii=False, indent=2)+'\n').encode() if p.name == 'info.json' else p.read_bytes()
            entry = zipfile.ZipInfo(p.relative_to(ROOT).as_posix(), date_time=(2020,1,1,0,0,0))
            entry.compress_type=zipfile.ZIP_DEFLATED;entry.create_system=3;entry.external_attr=0o100644<<16
            z.writestr(entry,data)
    return buf.getvalue()

def main() -> None:
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
    for profile,name in (('standard','Open-LLM-OCR.bobplugin'),('azure','Open-LLM-OCR-Azure.bobplugin'),('mistral','Open-LLM-OCR-Mistral.bobplugin'),('roboflowWorkflow','Open-LLM-OCR-Roboflow-Workflow.bobplugin'),('openDocRouter','Open-LLM-OCR-OpenDocRouter.bobplugin')):
        p=ROOT/name;data=archive(profile)
        if args.check:
            if not p.is_file() or p.read_bytes()!=data: raise SystemExit('Archive does not match source: '+name)
        else:
            tmp=p.with_suffix('.bobplugin.tmp');tmp.write_bytes(data);tmp.replace(p)
        print(name+' sha256='+hashlib.sha256(data).hexdigest())
if __name__=='__main__':main()
