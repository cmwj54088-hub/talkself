from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
URL='http://127.0.0.1:4173/'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 c=b.new_context(viewport={'width':412,'height':892},is_mobile=True,has_touch=True)
 page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route(URL,lambda r:r.fulfill(body='<html><body>migration fixture</body></html>',content_type='text/html'))
 page.goto(URL)
 page.evaluate('''async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('ziyan-local-v1',1);q.onupgradeneeded=()=>['projects','messages','media','meta'].forEach(s=>q.result.createObjectStore(s,{keyPath:'id'}));q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});await new Promise((r,j)=>{const tx=db.transaction(['projects','messages','meta'],'readwrite');const now=Date.now();tx.objectStore('projects').put({id:'old-project',name:'数学与物理',emoji:'📚',color:0,pinned:false,created:now,updated:now});tx.objectStore('messages').put({id:'old-task',projectId:'old-project',type:'task',text:'完成微积分练习',done:false,created:now});tx.objectStore('messages').put({id:'old-note',projectId:'old-project',type:'text',text:'先整理已知条件，再推导公式。',created:now});tx.objectStore('meta').put({id:'initialized',value:true});tx.oncomplete=r;tx.onerror=()=>j(tx.error)});db.close()}''')
 page.unroute(URL);page.reload();expect(page.locator('.project')).to_have_count(1);page.locator('.project').click()
 expect(page.locator('.bar-task')).to_have_count(1);expect(page.locator('.message')).to_have_count(1)
 page.locator('[data-action="task-mode"]').click();page.locator('#message-input').fill('整理电磁学公式\n复习牛顿第二定律');page.locator('#send-button').click();expect(page.locator('.bar-task')).to_have_count(3)
 expect(page.locator('#toast')).to_have_css('opacity','0',timeout=6000)
 page.screenshot(path=str(ROOT/'screenshots/android-chat-v3.png'))
 page.locator('[data-action="attachments"]').click();page.locator('[data-action="handwrite"]').click();expect(page.locator('.ink-editor')).to_be_visible()
 canvas=page.locator('#ink-canvas')
 def draw(points):
  r=canvas.bounding_box();page.mouse.move(r['x']+points[0][0],r['y']+points[0][1]);page.mouse.down()
  for x,y in points[1:]:page.mouse.move(r['x']+x,r['y']+y,steps=4)
  page.mouse.up()
 draw([(100,130),(120,100),(140,130)])
 page.locator('[data-ink-action="eraser"]').click();draw([(120,100),(120,101)])
 page.locator('[data-ink-action="undo"]').click()
 page.locator('[data-ink-action="lasso"]').click();draw([(85,85),(155,85),(155,145),(85,145),(85,85)])
 expect(page.locator('.ink-selection-tools')).to_be_visible();draw([(148,138),(195,180)])
 page.locator('[data-ink-action="deselect"]').click();page.locator('[data-ink-action="pen"]').click()
 zoom=page.locator('#ink-zoom').inner_text();r=canvas.bounding_box();cdp=c.new_cdp_session(page)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':150,'y':r['y']+220,'id':1},{'x':250,'y':r['y']+220,'id':2}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':110,'y':r['y']+220,'id':1},{'x':290,'y':r['y']+220,'id':2}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
 assert page.locator('#ink-zoom').inner_text()!=zoom
 page.locator('[data-ink-action="fit"]').click();page.locator('[data-ink-action="back"]').click();expect(page.locator('.ink-editor')).to_have_count(0)
 doc=page.evaluate('''async()=>{const db=await new Promise(r=>{const q=indexedDB.open('ziyan-local-v1',2);q.onsuccess=()=>r(q.result)});const docs=await new Promise(r=>{const q=db.transaction('ink').objectStore('ink').getAll();q.onsuccess=()=>r(q.result)});db.close();return docs[0]}''')
 assert len(doc['pages'][0]['strokes'])==1,'Pinch must not leave accidental strokes; erase undo restores stroke'
 points=doc['pages'][0]['strokes'][0]['points'];assert max(p[0] for p in points)-min(p[0] for p in points)>150,'Lasso resize must change vector geometry'
 assert not errors,errors
 # Check the exact generated single-file build in a separate browser context.
 other=b.new_context(viewport={'width':360,'height':740},service_workers='block');q=other.new_page();q.on('pageerror',lambda e:errors.append(str(e)))
 q.route(URL+'standalone.html',lambda r:r.fulfill(body=(ROOT/'自言-离线预览.html').read_text(),content_type='text/html'))
 q.goto(URL+'standalone.html');expect(q.locator('.project')).to_have_count(1);q.locator('.project').click();q.locator('[data-action="attachments"]').click();q.locator('[data-action="handwrite"]').click();expect(q.locator('.ink-editor')).to_be_visible()
 assert q.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 b.close();print('PASS actual v1 database upgrade; eraser/undo; lasso resize changes vectors; real two-finger pinch leaves no strokes; generated standalone HTML at 360px.')
