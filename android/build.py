"""Reproducible APK assembly using official Android SDK tools; no Gradle download needed.

Requires Java 17+, Android 35 platform/build-tools and Eclipse ECJ 3.38.
Override ZIYAN_ANDROID_TOOLCHAIN to select an existing local toolchain directory.
Set ANDROID_SDK_ROOT to reuse a standard Windows/Linux Android SDK installation.
Set ZIYAN_JAVA_COMPILER=javac to use the installed JDK compiler instead of ECJ.
Signing files are generated once, retained privately, and excluded from source ZIPs.
"""
import hashlib
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
default_tools = Path('/workspace/android-toolchain')
if not default_tools.is_dir():
    default_tools = PROJECT / '.toolchain'
TOOLCHAIN = Path(os.environ.get('ZIYAN_ANDROID_TOOLCHAIN', str(default_tools)))
sdk = os.environ.get('ANDROID_SDK_ROOT') or os.environ.get('ANDROID_HOME')
TOOLS = Path(sdk) / 'build-tools/35.0.0' if sdk else TOOLCHAIN / 'android-15'
PLATFORM = Path(sdk) / 'platforms/android-35/android.jar' if sdk else TOOLCHAIN / 'android-35/android.jar'
def sdk_tool(name):
    return TOOLS / (name + ('.exe' if os.name == 'nt' else ''))
BUILD = ROOT / 'build'
OUT = PROJECT / 'releases'
SIGNING = ROOT / 'signing'
COMPILER = os.environ.get('ZIYAN_JAVA_COMPILER', 'ecj')
if COMPILER not in ['ecj', 'javac']:
    raise SystemExit('ZIYAN_JAVA_COMPILER must be ecj or javac')

def run(*args):
    subprocess.run([str(arg) for arg in args], check=True, cwd=ROOT)

required = [PLATFORM, sdk_tool('aapt2'), sdk_tool('zipalign'), TOOLS / 'lib/d8.jar', TOOLS / 'lib/apksigner.jar']
if COMPILER == 'ecj':
    required.append(TOOLCHAIN / 'ecj.jar')
for path in required:
    if not path.is_file():
        raise SystemExit(f'Missing build tool: {path}')
if os.name != 'nt':
    for tool in ['aapt2', 'zipalign', 'aapt']:
        sdk_tool(tool).chmod(0o755)
if BUILD.exists():
    if BUILD.resolve() != (PROJECT / 'android/build').resolve() or BUILD.is_symlink():
        raise SystemExit('Refusing to clean an unexpected build directory')
    shutil.rmtree(BUILD)
(BUILD / 'classes').mkdir(parents=True)
(BUILD / 'dex').mkdir()
if os.name == 'nt':
    # Windows aapt2 cannot reliably open SDK arguments containing non-ASCII names.
    shutil.copy2(PLATFORM, BUILD / 'android.jar')
    PLATFORM = BUILD / 'android.jar'
assets = BUILD / 'assets' / 'web'
assets.mkdir(parents=True)
# Embed every UI resource in one local document. No URL fetch is needed to start.
import base64
icon_data = 'data:image/svg+xml;base64,' + base64.b64encode((PROJECT / 'dist/icon.svg').read_bytes()).decode()
html = (PROJECT / 'dist/index.html').read_text(encoding='utf-8').replace('<link rel="manifest" href="manifest.webmanifest">', '')
html = html.replace('href="icon.svg"', f'href="{icon_data}"')
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + (PROJECT / 'dist/style.css').read_text(encoding='utf-8') + '</style>')
script = (PROJECT / 'dist/app.js').read_text(encoding='utf-8').replace("import { createInkEditor } from './ink.js';", '')
script = script.replace("import { cleanRich, richMedia, richText, createNoteEditor } from './editor.js';", '')
script = script.replace("import { markdownBundle } from './markdown.js';", '')
script = (PROJECT / 'dist/markdown.js').read_text(encoding='utf-8').replace('export async function ', 'async function ') + '\n' + script
script = (PROJECT / 'dist/ink.js').read_text(encoding='utf-8').replace('export function createInkEditor', 'function createInkEditor') + '\n' + script
script = (PROJECT / 'dist/editor.js').read_text(encoding='utf-8').replace('export function ', 'function ') + '\n' + script
script = script.replace('src="icon.svg"', f'src="{icon_data}"')
html = html.replace('<script type="module" src="app.js"></script>', '<script>' + (ROOT / 'android.js').read_text(encoding='utf-8') + '</script><script type="module">' + script + '</script>')
csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob: data:; media-src blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'"
html = html.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="' + csp + '">')
(assets / 'index.html').write_text(html, encoding='utf-8')

res = ROOT / 'app/src/main/res'
manifest = ROOT / 'app/src/main/AndroidManifest.xml'
run(sdk_tool('aapt2'), 'compile', '--dir', res, '-o', BUILD / 'resources.zip')
run(sdk_tool('aapt2'), 'link', '-o', BUILD / 'resources.apk', '-I', PLATFORM,
    '--manifest', manifest, '-A', BUILD / 'assets', BUILD / 'resources.zip',
    '--min-sdk-version', '26', '--target-sdk-version', '35')
sources = sorted((ROOT / 'app/src/main/java').rglob('*.java'))
qa = os.environ.get('ZIYAN_ANDROID_QA') == '1'
if qa:
    copied = []
    for source in sources:
        target = BUILD / 'qa-src' / source.name
        target.parent.mkdir(exist_ok=True)
        text = source.read_text(encoding='utf-8').replace('setWebContentsDebuggingEnabled(false)', 'setWebContentsDebuggingEnabled(true)')
        target.write_text(text, encoding='utf-8')
        copied.append(target)
    sources = copied
if COMPILER == 'javac':
    run('javac', '-encoding', 'UTF-8', '--release', '8',
        '-classpath', PLATFORM, '-d', BUILD / 'classes', *sources)
else:
    run('java', '-jar', TOOLCHAIN / 'ecj.jar', '-encoding', 'UTF-8', '-source', '8', '-target', '8',
        '-classpath', PLATFORM, '-d', BUILD / 'classes', *sources)
classes = sorted((BUILD / 'classes').rglob('*.class'))
run('java', '-cp', TOOLS / 'lib/d8.jar', 'com.android.tools.r8.D8',
    '--release', '--min-api', '26', '--lib', PLATFORM, '--output', BUILD / 'dex', *classes)
shutil.copy2(BUILD / 'resources.apk', BUILD / 'unsigned.apk')
with zipfile.ZipFile(BUILD / 'unsigned.apk', 'a', zipfile.ZIP_DEFLATED) as archive:
    for dex in (BUILD / 'dex').glob('*.dex'):
        archive.write(dex, dex.name)
run(sdk_tool('zipalign'), '-f', '-p', '4', BUILD / 'unsigned.apk', BUILD / 'aligned.apk')

SIGNING.mkdir(mode=0o700, exist_ok=True)
password = SIGNING / 'password.txt'
key = SIGNING / 'ziyan-release.p12'
if not key.exists():
    if os.environ.get('ZIYAN_ALLOW_NEW_SIGNING') != '1':
        raise SystemExit('Restore android/signing from the private upgrade-signing ZIP before building. Set ZIYAN_ALLOW_NEW_SIGNING=1 only for an intentionally NEW application identity.')
    if password.exists():
        raise SystemExit('Signing key missing but password exists; restore original signing key before rebuilding.')
    password.write_text(secrets.token_urlsafe(36) + '\n')
    password.chmod(0o600)
    run('keytool', '-genkeypair', '-keystore', key, '-storetype', 'PKCS12',
        '-storepass:file', password, '-keypass:file', password, '-alias', 'ziyan',
        '-keyalg', 'RSA', '-keysize', '3072', '-sigalg', 'SHA256withRSA',
        '-validity', '10000', '-dname', 'CN=Ziyan Local', '-noprompt')
    key.chmod(0o600)
if not password.exists():
    raise SystemExit('Signing password missing; restore it to retain upgrade compatibility.')
OUT.mkdir(exist_ok=True)
import xml.etree.ElementTree as ET
version = ET.parse(manifest).getroot().get('{http://schemas.android.com/apk/res/android}versionName')
apk = OUT / ('ziyan-internal-qa.apk' if qa else f'自言-{version}.apk')
run('java', '-jar', TOOLS / 'lib/apksigner.jar', 'sign', '--ks', key,
    '--ks-key-alias', 'ziyan', '--ks-pass', f'file:{password}',
    '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true', '--v3-signing-enabled', 'true',
    '--v4-signing-enabled', 'false', '--out', apk, BUILD / 'aligned.apk')
run('java', '-jar', TOOLS / 'lib/apksigner.jar', 'verify', '--verbose', '--print-certs', apk)
run(sdk_tool('zipalign'), '-c', '-v', '4', apk)
digest = hashlib.sha256(apk.read_bytes()).hexdigest()
if not qa:
    (OUT / 'SHA256.txt').write_text(digest + '  ' + apk.name + '\n', encoding='utf-8')
print(f'APK: {apk}\nBytes: {apk.stat().st_size}\nSHA-256: {digest}')
