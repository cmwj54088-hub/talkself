import os,io,zipfile,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ['CHROME_PATH'])
 c=b.new_context(viewport={'width':412,'height':892},is_mobile=True,has_touch=True,accept_downloads=True)
 page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:4173');page.locator('.project').click()
 page.locator('#message-input').fill('展开草稿 https://example.com/a');page.locator('[data-action="expand-composer"]').click();expect(page.locator('.composer-expanded')).to_be_visible()
 page.locator('[data-action="task-mode"]').click();expect(page.locator('#message-input')).to_have_value('展开草稿 https://example.com/a');page.evaluate('window.ziyanGoBack()');expect(page.locator('.composer-expanded')).to_have_count(0)
 page.locator('[data-action="task-mode"]').click();page.locator('#send-button').click();expect(page.locator('.link-card')).to_have_count(1)
 page.locator('[data-action="task-mode"]').click();page.locator('#message-input').fill('任务一\n任务二');page.locator('#send-button').click();page.evaluate('window.ziyanGoBack()');page.locator('.mobile-nav [data-page="tasks"]').click();expect(page.locator('.task-summary strong')).to_have_text('0 / 2');page.locator('[data-toggle]').first.click();expect(page.locator('.task-summary strong')).to_have_text('1 / 2');expect(page.locator('.garden span')).to_have_count(12)
 page.locator('[data-filter="done"]').click();expect(page.locator('.task-summary strong')).to_have_text('1 / 2');page.locator('#task-project-filter').select_option(index=1);expect(page.locator('.task-card')).to_have_count(1)
 result=page.evaluate("""async()=>{const {markdownBundle}=await import('./markdown.js');const r=await markdownBundle('../导出',[{id:'image',type:'image',name:'图片',created:1},{id:'task',type:'task',text:'事项',done:true,created:2}],async()=>new Blob([new Uint8Array([1,2,3])],{type:'image/png'}));return {name:r.name,bytes:Array.from(new Uint8Array(await r.blob.arrayBuffer()))}}""")
 z=zipfile.ZipFile(io.BytesIO(bytes(result['bytes'])));assert z.testzip() is None;assert 'attachments/1.png' in z.namelist();md=z.read([n for n in z.namelist() if n.endswith('.md')][0]).decode();assert '(attachments/1.png)' in md and '[x]' in md
 assert page.evaluate("""async()=>{const {markdownBundle}=await import('./markdown.js');try{await markdownBundle('x',[{id:'x',type:'image',created:1}],async()=>null);return false}catch{return true}}""")
 assert not errors,errors
 page.screenshot(path='screenshots/offline-garden.png')
 print('PASS full-screen shared draft/mode/back; offline links; project/status filter; completion garden; ZIP CRC/relative attachments/missing attachment rejection')
 b.close()
