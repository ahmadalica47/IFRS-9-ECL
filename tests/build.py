import json, os, sys
src = sys.argv[1]; out = sys.argv[2]
files = {}
for f in os.listdir(src):
    if f.endswith(('.ts','.tsx')): files['/src/'+f] = open(os.path.join(src,f),encoding='utf-8').read()
html = open(os.path.join(os.path.dirname(__file__),'template.html'),encoding='utf-8').read().replace('__FILES__', json.dumps(files))
open(out,'w',encoding='utf-8').write(html)
