"""Serve dist/ locally with the headers from public/_headers (as Cloudflare Pages would). Usage: python tests/serve_dist.py [port]"""
import http.server, os, sys, functools
root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dist')
hdrs = {}
cur = None
for line in open(os.path.join(root, '_headers'), encoding='utf-8'):
    if line.startswith('#') or not line.strip(): continue
    if not line.startswith(' '): cur = line.strip(); hdrs[cur] = []; continue
    k, v = line.strip().split(':', 1); hdrs[cur].append((k.strip(), v.strip()))
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        for k, v in hdrs.get('/*', []): self.send_header(k, v)
        super().end_headers()
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8767
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(H, directory=root)).serve_forever()
