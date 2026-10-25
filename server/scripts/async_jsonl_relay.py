#!/usr/bin/env python3
"""Loopback relay for signed Baidu result URLs; bounded replies and redirects."""
from __future__ import annotations
import argparse
import ipaddress
import json
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener

ALLOWED_HOST_SUFFIXES = ('bcebos.com', 'baidubce.com', 'aistudio-app.com')
MAX_BYTES = 16 * 1024 * 1024

def validate_target(url: str) -> str:
    if len(url) > 8192 or any(ord(c) < 33 for c in url):
        raise ValueError('invalid result URL')
    target = urlsplit(url)
    host = (target.hostname or '').lower()
    if target.scheme != 'https' or target.username or target.password or target.fragment or target.port not in (None, 443):
        raise ValueError('HTTPS result URL required')
    if not any(host == suffix or host.endswith('.' + suffix) for suffix in ALLOWED_HOST_SUFFIXES):
        raise ValueError('result host not allowed')
    addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('result host resolves to a private address')
    return url

class SafeRedirect(HTTPRedirectHandler):
    max_redirections = 3
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_target(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def fetch_result(url: str, timeout: int) -> str:
    validate_target(url)
    request = Request(url, headers={'User-Agent': 'JK-LLM-OCR-Relay/0.3', 'Accept': 'application/json,text/plain'})
    with build_opener(SafeRedirect()).open(request, timeout=timeout) as response:
        raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError('result exceeds 16 MB')
        return raw.decode('utf-8')

class RelayHandler(BaseHTTPRequestHandler):
    server_version = 'JKLLMOCRRelay/0.3'
    def do_GET(self) -> None:
        parsed = urlsplit(self.path)
        if parsed.path == '/healthz':
            self._send(200, {'status':'ok'})
            return
        if parsed.path != '/fetch-jsonl':
            self._send(404, {'error':'not found'})
            return
        if self.headers.get('Origin'):
            self._send(403, {'error':'browser-origin requests are not supported'})
            return
        fields = parse_qs(parsed.query)
        target = fields.get('url',[''])[0]
        try:
            text = fetch_result(target, getattr(self.server,'fetch_timeout',45))
            self._send(200, {'ok':True,'text':text} if fields.get('format')==['json'] else text)
        except HTTPError as error:
            self._send(error.code, {'error':'upstream HTTP error','status':error.code})
        except (ValueError, UnicodeError):
            self._send(400, {'error':'invalid result URL or response'})
        except (URLError, TimeoutError, socket.timeout, OSError):
            self._send(502, {'error':'relay fetch failed'})
    def log_message(self, fmt: str, *args: object) -> None:
        # Signed URL query strings are credentials. Never log request targets.
        super().log_message('%s', urlsplit(self.path).path)
    def _send(self, status: int, payload: object) -> None:
        body = payload.encode('utf-8') if isinstance(payload,str) else json.dumps(payload,ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type','text/plain; charset=utf-8' if isinstance(payload,str) else 'application/json')
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.end_headers()
        self.wfile.write(body)

def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host',default='127.0.0.1');parser.add_argument('--port',type=int,default=50123);parser.add_argument('--timeout',type=int,default=45)
    args=parser.parse_args()
    if args.host not in ('127.0.0.1','localhost'):
        parser.error('relay must listen on loopback')
    server=ThreadingHTTPServer((args.host,args.port),RelayHandler)
    server.fetch_timeout=max(5,min(args.timeout,60))
    print(f'[relay] listening on http://{args.host}:{args.port}',flush=True)
    server.serve_forever()
if __name__=='__main__':main()
