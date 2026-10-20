#!/usr/bin/env python3
"""Deterministic, self-contained GenCreator source package. No external calls."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import stat
import zipfile

def build(root, output, private=False):
    root, output = Path(root).resolve(), Path(output).resolve()
    if output.is_relative_to(root) or output.exists():
        raise ValueError('Output must be new and outside the package')
    manifest = json.loads((root/'plugin.json').read_text())
    if manifest.get('name') != 'gencreator-native':
        raise ValueError('Wrong identity')
    paths=[]; seen=set()
    for path in sorted(root.rglob('*')):
        rel=path.relative_to(root)
        if any(x in {'.git','__pycache__','node_modules','.pytest_cache'} for x in rel.parts): continue
        if path.is_symlink(): raise ValueError('Symlink forbidden')
        if not path.is_file(): continue
        if path.suffix == '.pyc': continue
        if re.match(r'^(\.env(?:\.|$)|credentials|secrets|auth\.json$)', path.name, re.I): raise ValueError('Secret-shaped filename')
        if 'private-guidance' in path.name and not private: raise ValueError('Private projection in public source')
        name=rel.as_posix(); key=name.casefold()
        if key in seen or any(p in {'..','.'} for p in rel.parts): raise ValueError('Unsafe path')
        seen.add(key); paths.append((name,path.read_bytes()))
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for name,data in paths:
            info=zipfile.ZipInfo(manifest['name']+'/'+name,(1980,1,1,0,0,0));info.create_system=3;info.external_attr=(stat.S_IFREG|0o644)<<16;info.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(info,data,compresslevel=9)
    return {'archive':str(output),'files':len(paths),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'private':private}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('output');p.add_argument('--private',action='store_true');a=p.parse_args()
    print(json.dumps(build(a.root,a.output,a.private),indent=2))
