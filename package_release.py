"""Package APK, editable source and a private compatible-upgrade signing backup."""
from pathlib import Path
import hashlib
import io
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent
manifest = ROOT / 'android/app/src/main/AndroidManifest.xml'
version = ET.parse(manifest).getroot().get('{http://schemas.android.com/apk/res/android}versionName')
apk = ROOT / 'releases' / f'自言-{version}.apk'
assert apk.is_file(), 'Build the signed release APK first.'
signing = ROOT / 'android/signing'
assert (signing / 'ziyan-release.p12').is_file() and (signing / 'password.txt').is_file(), 'Original upgrade signing files are required.'

def sha(data):
    return hashlib.sha256(data).hexdigest()

private = io.BytesIO()
with zipfile.ZipFile(private, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in ['ziyan-release.p12', 'password.txt']:
        archive.write(signing / name, 'android/signing/' + name)
    archive.writestr('RESTORE.txt', 'Extract this ZIP into source/ before building compatible updates. Do not publish or commit these private signing files. Never print the password.\n')

entries = {f'apk/ziyan-{version}.apk': apk.read_bytes(),
           'private/upgrade-signing.zip': private.getvalue()}
for directory in ['dist', 'android/app/src', 'tests']:
    for path in sorted((ROOT / directory).rglob('*')):
        if not path.is_file() or '__pycache__' in path.parts or path.suffix == '.pyc' or path.name.endswith('-backup.json'):
            continue
        entries['source/' + path.relative_to(ROOT).as_posix()] = path.read_bytes()
for name in ['README.md','REQUIREMENTS.md','AGENTS.md','.gitignore','dev-requirements.txt',
             'build_preview.py','package_release.py','android/README.md','android/build.py',
             'android/setup_toolchain.py','android/toolchain-lock.json','android/android.js','android/.gitignore']:
    entries['source/' + name] = (ROOT / name).read_bytes()
for name in ['v5-fullscreen-editor.png','v5-deadline-tasks.png','enhanced-search.png','forward-note.png','home-swipe-fixed-nav.png','share-preview.png']:
    path = ROOT / 'screenshots' / name
    if path.exists():
        entries['verification/' + name] = path.read_bytes()
for name in [f'verification-{version}.json', f'manifest-{version}.txt']:
    path = ROOT / 'releases' / name
    if path.exists():
        entries['verification/' + name] = path.read_bytes()
log = ROOT / 'releases' / f'build-{version}.txt'
if log.exists():
    entries['verification/build.txt'] = log.read_bytes()

entries['README_先读.txt'] = f'''自言 {version} 交付包

1. 安卓安装：解压 apk/ziyan-{version}.apk，点击安装。更新前建议导出备份；覆盖安装，不要先卸载旧版。
2. 完整源码：source/。让下一个 AI 先阅读 AGENTS.md、README.md 和 REQUIREMENTS.md。
3. 兼容升级签名：private/upgrade-signing.zip，解压到 source/ 中即可恢复 android/signing/。
   此备份含密钥和密码文件，只供你和可信维护者使用，不要公开分享或提交 Git。
4. 构建：在 source/ 执行 python3 android/setup_toolchain.py（开发工具缺失时），再执行 python3 android/build.py。
   支持 Linux 或 Windows、JDK 17+、Python 3.10+；Windows 可设置 ANDROID_SDK_ROOT 和 ZIYAN_JAVA_COMPILER=javac 复用本机工具，详见源码 README。
5. 应用完全离线，不申请联网权限；开发工具初始化下载不属于应用运行依赖。
6. 检查结果见 verification/checks.md。实体安卓的相机、系统文件选择器、手写笔及厂商差异仍需真机确认；未验证的项目不可标为通过。
'''.encode()
checks = ROOT / 'releases' / f'checks-{version}.md'
entries['verification/checks.md'] = checks.read_bytes() if checks.exists() else b'No verification report supplied for this release. Do not claim checks passed.\n'
entries['SHA256SUMS.txt'] = ''.join(sha(data) + '  ' + name + '\n' for name, data in sorted(entries.items())).encode()
output = ROOT / 'releases' / f'ziyan-{version}-apk-source.zip'
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, data in entries.items():
        archive.writestr(name, data)

# Check actual extracted bytes and private-signature completeness, without displaying secrets.
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert archive.read(f'apk/ziyan-{version}.apk') == apk.read_bytes()
    assert archive.read('source/dist/app.js') == (ROOT / 'dist/app.js').read_bytes()
    assert archive.read('source/dist/editor.js') == (ROOT / 'dist/editor.js').read_bytes()
    with zipfile.ZipFile(io.BytesIO(archive.read('private/upgrade-signing.zip'))) as keys:
        for name in ['ziyan-release.p12','password.txt']:
            assert keys.read('android/signing/' + name) == (signing / name).read_bytes()
    assert not any(name.startswith('source/android/signing/') for name in archive.namelist())
print('Delivery ZIP:', output)
print('Files:', len(entries), 'ZIP bytes:', output.stat().st_size, 'APK bytes:', apk.stat().st_size)
print('SHA-256:', sha(output.read_bytes()))
