"""Development-only download of pinned official tools; never included in APK runtime."""
import hashlib
import json
import os
from pathlib import Path
import urllib.request
import zipfile

HERE = Path(__file__).resolve().parent
default = Path('/workspace/android-toolchain')
if not default.is_dir():
    default = HERE.parent / '.toolchain'
destination = Path(os.environ.get('ZIYAN_ANDROID_TOOLCHAIN', str(default)))
destination.mkdir(parents=True, exist_ok=True)

def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()

for item in json.loads((HERE / 'toolchain-lock.json').read_text()):
    path = destination / item['name']
    if not path.exists() or digest(path) != item['sha256']:
        print('Downloading development tool:', item['name'], flush=True)
        temporary = path.with_suffix(path.suffix + '.part')
        urllib.request.urlretrieve(item['url'], temporary)
        if digest(temporary) != item['sha256']:
            temporary.unlink(missing_ok=True)
            raise SystemExit('Tool checksum mismatch: ' + item['name'])
        temporary.replace(path)
    if item['archive']:
        with zipfile.ZipFile(path) as archive:
            for entry in archive.infolist():
                output = (destination / entry.filename).resolve()
                if not output.is_relative_to(destination.resolve()):
                    raise SystemExit('Unsafe archive path')
            archive.extractall(destination)
            for entry in archive.infolist():
                mode = (entry.external_attr >> 16) & 0o777
                output = destination / entry.filename
                if mode and output.is_file():
                    output.chmod(mode)
    print('Verified:', item['name'], flush=True)
print('Toolchain ready:', destination)
