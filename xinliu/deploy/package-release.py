#!/usr/bin/env python3
"""Runtime allowlist; no credentials, local agent instructions or user media."""
import hashlib, io, json, subprocess, sys, tarfile
from pathlib import Path
root = Path(__file__).resolve().parents[1]
files = [p for p in (root / 'backend').glob('*.cjs') if '.private.' not in p.name and '.example.' not in p.name]
files += [root / name for name in ['backend/openapi.json', 'backend/storage/H2Store.java', 'backend/storage/h2.cjs', 'work/production-server.cjs', 'deploy/lightshadow-cloud.service']]
web = root / 'outputs/production-workbench'
files += list(web.glob('*.js')) + list(web.glob('*.css'))
files += [web / name for name in ['index.html', 'api.html', '服饰细节_本地粗剪_非AI生成.webm']]
names = subprocess.check_output(['git', 'ls-files', '-z', 'xinliu/outputs/production-workbench/media/'], cwd=root.parent).decode().split('\0')
files += [root.parent / name for name in names if name]
manifest = {}
private = root / 'backend/silvamux.private.cjs'
# Check the real current key never appears in any release member; do not print it.
import re
match = re.search(r'"apiKey"\s*:\s*"([^"]+)"', private.read_text()) if private.exists() else None
secret = match.group(1).encode() if match else None
for p in sorted(set(files)):
    assert p.is_file() and not p.is_symlink()
    name = p.relative_to(root).as_posix()
    assert '.private.' not in name and 'data' not in p.relative_to(root).parts and not p.name.lower().startswith('agents')
    assert not secret or secret not in p.read_bytes(), 'Secret in package'
    manifest[name] = hashlib.sha256(p.read_bytes()).hexdigest()
version = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()[:12]
output = Path(sys.argv[1])
with tarfile.open(output, 'w:gz') as archive:
    for name in manifest: archive.add(root / name, arcname=name, recursive=False)
    content = json.dumps({'version': version, 'sha256': manifest}, ensure_ascii=False, indent=2).encode()
    info = tarfile.TarInfo('release-manifest.json'); info.size = len(content)
    archive.addfile(info, io.BytesIO(content))
print(json.dumps({'version': version, 'files': len(manifest), 'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}))
