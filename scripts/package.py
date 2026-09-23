"""Package only the readable runtime files; no dependencies or build scripts."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parent.parent
extension = root / 'extension'
manifest = json.loads((extension / 'manifest.json').read_text())
assert manifest['manifest_version'] == 3
assert set(manifest['permissions']) == {'storage', 'activeTab'}
assert not any(k in manifest for k in ['update_url', 'externally_connectable', 'web_accessible_resources', 'host_permissions'])
files = sorted(extension.iterdir())
assert all(p.is_file() for p in files)
assert set(p.name for p in files) == {'README.md','manifest.json','background.js','content.js','promotions.js','popup.html','popup.js','popup.css'}
for name in manifest['content_scripts'][0]['js'] + [manifest['background']['service_worker'], manifest['action']['default_popup']]:
    assert (extension / name).is_file()
out = root / 'dist'
out.mkdir(exist_ok=True)
hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
(out / 'extension-sha256.json').write_text(json.dumps(hashes, indent=2) + '\n')
archive = out / f"necessary-only-v{manifest['version']}-chrome.zip"
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in files:
        info = zipfile.ZipInfo('necessary-only/' + p.name, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        z.writestr(info, p.read_bytes())
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for name, digest in hashes.items():
        assert hashlib.sha256(z.read('necessary-only/' + name)).hexdigest() == digest
print(json.dumps({'archive':str(archive), 'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(), 'files':len(files)}))
