from pathlib import Path
import os
import json
import xml.etree.ElementTree as ET
from playwright.sync_api import sync_playwright,expect
r=Path(__file__).resolve().parents[1]
assets=r/'android/build/assets/web'
version=ET.parse(r/'android/app/src/main/AndroidManifest.xml').getroot().get('{http://schemas.android.com/apk/res/android}versionName')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROME_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
 c=b.new_context(viewport={'width':412,'height':892},is_mobile=True,has_touch=True)
 c.add_init_script('''window.testAlarms=[];window.testExports=[];window.testClipboard='';window.testCancel=false;window.testFail=false;window.testAborted=0;window.ZiyanAndroid={version:()=> '0.5.0',setTaskAlarm:(...args)=>testAlarms.push(args),copyText:t=>{window.testClipboard=t;return true},beginSave:(name,mime)=>{const token=crypto.randomUUID();testExports.push({token,name,mime,chunks:[]});return token},writeSave:(token,data)=>{if(testFail)return false;testExports.find(e=>e.token===token).chunks.push(data);return true},finishSave:token=>queueMicrotask(()=>window.ZiyanFiles.receive(token,!testCancel,'')),abortSave:()=>{testAborted++}}'''.replace('0.5.0',version))
 page=c.new_page();errors=[];outside=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def resource(route):
  from urllib.parse import urlparse
  path=urlparse(route.request.url).path.lstrip('/') or 'index.html'
  f=assets/path
  assert f.parent==assets and f.is_file(),path
  mime='application/javascript' if f.suffix=='.js' else 'text/css' if f.suffix=='.css' else 'image/svg+xml' if f.suffix=='.svg' else 'text/html'
  route.fulfill(body=f.read_bytes(),content_type=mime,headers={'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob: data:; media-src blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'"})
 page.route('https://ziyan.local/**',resource)
 page.goto('https://ziyan.local/');expect(page.locator('.project')).to_have_count(1)
 page.locator('.project').click();page.locator('#message-input').fill('Native backup test');page.locator('#send-button').click();expect(page.locator('.message')).to_have_count(1)
 page.locator('[data-menu]').click();page.locator('#copy-message').click();expect(page.locator('#dialog')).not_to_be_visible();assert page.evaluate('testClipboard')=='Native backup test'
 page.locator('[data-action="task-mode"]').click();page.locator('#message-input').fill('离线提醒测试');page.locator('#send-button').click()
 page.locator('.taskbar-toggle').click();page.locator('.bar-task [data-task-menu]').click();page.locator('#task-reminder').click();page.locator('#reminder-time').fill('07:35');page.locator('#reminder-open').click();expect(page.locator('#dialog')).not_to_be_visible();assert page.evaluate('testAlarms')==[[7,35,'离线提醒测试']]
 page.evaluate('window.ziyanGoBack()');page.locator('.mobile-nav:visible [data-page="settings"]').click();expect(page.locator('.page')).to_contain_text('APK '+version);expect(page.locator('[data-action="persist"]')).to_have_count(0)
 page.locator('[data-action="export"]').click();expect(page.locator('#toast')).to_have_text('完整备份已保存')
 data=page.evaluate('JSON.parse(testExports[0].chunks.map(c=>atob(c)).join(""))')
 assert data['version']==3 and data['messages'][0]['text']=='Native backup test'
 assert page.evaluate('''async()=>{const bytes=new Uint8Array(600000);for(let i=0;i<bytes.length;i++)bytes[i]=i%256;const ok=await ZiyanFiles.save(new Blob([bytes]),'large.bin');const got=testExports.at(-1).chunks.map(atob).join('');return ok&&got.length===bytes.length&&[0,196607,196608,599999].every(i=>got.charCodeAt(i)===bytes[i])}''')
 assert page.evaluate('''async()=>{testCancel=true;const result=await ZiyanFiles.save(new Blob(['test']),'cancel.json');testCancel=false;return result===false}''')
 assert page.evaluate('''async()=>{testFail=true;try{await ZiyanFiles.save(new Blob(['test']),'fail.json');return false}catch(e){return testAborted===1}finally{testFail=false}}''')
 assert page.evaluate('window.ziyanGoBack()') is True
 assert page.evaluate('window.ziyanGoBack()') is False
 assert not errors,errors
 b.close();print('PASS packaged native assets under CSP; save/clipboard bridge; complete JSON backup; multi-chunk binary export; cancellation/failure; Android back navigation; no external asset dependency.')
