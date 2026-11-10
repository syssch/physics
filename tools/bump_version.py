"""Give every script/stylesheet URL a version tag (?v=...), so browsers fetch the new files after an update
instead of using copies they saved earlier. Run after changing any file in js/ or css/:
    python3 tools/bump_version.py
"""
import datetime, glob, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
v = datetime.datetime.now().strftime("%Y%m%d%H%M")
for f in glob.glob(os.path.join(ROOT, "js", "*.js")):
    s = open(f, encoding="utf-8").read()
    n = re.sub(r'((?:from|import)\s*\(?\s*")(\./[\w.-]+\.js)(\?v=\w+)?(")', rf'\g<1>\g<2>?v={v}\g<4>', s)
    if n != s: open(f, "w", encoding="utf-8").write(n)
p = os.path.join(ROOT, "index.html")
s = open(p, encoding="utf-8").read()
n = re.sub(r'((?:src|href)=")((?:js|css)/[\w.-]+\.(?:js|css))(\?v=\w+)?(")', rf'\g<1>\g<2>?v={v}\g<4>', s)
open(p, "w", encoding="utf-8").write(n)
print("version", v)
