"""Create a self-contained local preview and a source bundle, without dependencies."""
from pathlib import Path
import base64
import zipfile

root = Path(__file__).resolve().parent
dist = root / 'dist'
icon = 'data:image/svg+xml;base64,' + base64.b64encode((dist / 'icon.svg').read_bytes()).decode()
script = (dist / 'app.js').read_text().replace("import { createInkEditor } from './ink.js';", '')
script = script.replace("import { cleanRich, richMedia, richText, createNoteEditor } from './editor.js';", '')
script = (dist / 'ink.js').read_text().replace('export function createInkEditor', 'function createInkEditor') + '\n' + script
script = (dist / 'editor.js').read_text().replace('export function ', 'function ') + '\n' + script
script = script.replace('src="icon.svg"', f'src="{icon}"')
script = script.replace("if(!window.ZiyanAndroid && 'serviceWorker' in navigator && window.isSecureContext && ['http:','https:'].includes(location.protocol))", "if(false)")
html = (dist / 'index.html').read_text()
html = html.replace('<link rel="manifest" href="manifest.webmanifest">', '')
html = html.replace('href="icon.svg"', f'href="{icon}"')
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + (dist / 'style.css').read_text() + '</style>')
html = html.replace('<script type="module" src="app.js"></script>', '<script type="module">' + script + '</script>')
(root / '自言-离线预览.html').write_text(html)
with zipfile.ZipFile(root / '自言-初版.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for directory in ['dist', 'tests', 'screenshots']:
        for path in (root / directory).glob('*'):
            if path.is_file() and path.name != 'test-backup.json':
                archive.write(path, path.relative_to(root))
    for name in ['README.md', 'build_preview.py', '自言-离线预览.html']:
        archive.write(root / name, name)
print('Created standalone preview and source ZIP.')
