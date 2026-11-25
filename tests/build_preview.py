"""Builds preview.html: a single file that runs the calculator in any browser without Instinct.
Usage: python tests/build_preview.py   (run from the 'IFRS 9 Code' folder)"""
import json, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, 'src')
files = {f: open(os.path.join(src, f), encoding='utf-8').read() for f in os.listdir(src) if f.endswith(('.ts', '.tsx'))}
css = open(os.path.join(src, 'style.css'), encoding='utf-8').read()
tpl = open(os.path.join(root, 'tests', 'preview_template.html'), encoding='utf-8').read()
html = tpl.replace('/*__CSS__*/', css).replace('__FILES__', json.dumps(files).replace('</', '<\\/'))
open(os.path.join(root, 'preview.html'), 'w', encoding='utf-8').write(html)
print('Wrote', os.path.join(root, 'preview.html'))
