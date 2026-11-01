"""Interaction regression with Chromium's real touch input, isolated fictional data.
Viewport resizing models keyboard geometry; it is not an Android IME/device test.
"""
from pathlib import Path
import os, json, time
from playwright.sync_api import sync_playwright, expect
R=Path(__file__).resolve().parents[1]
OUT=R/'evidence'/'interaction-polish'; OUT.mkdir(parents=True,exist_ok=True)
URL='http://127.0.0.1:4173/'
def rows(page,store):
 return page.evaluate('''async s=>{const db=await new Promise(r=>{const q=indexedDB.open('ziyan-local-v1',2);q.onsuccess=()=>r(q.result)});const a=await new Promise(r=>{const q=db.transaction(s).objectStore(s).getAll();q.onsuccess=()=>r(q.result)});db.close();return a}''',store)
def touch(cdp,x,y,hold=0):
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
 if hold: time.sleep(hold)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
def coords(locator):
 b=locator.bounding_box();return (b['x']+min(b['width']/2,65),b['y']+min(b['height']/2,25))
def menu(page,mid):
 page.locator('[data-message="'+mid+'"] [data-menu]').click();page.locator('#forward-message').click()
def choose(page,pid):page.locator('.forward-targets [data-forward-project="'+pid+'"]').click()
def bottom(page):return page.locator('#messages').evaluate('e=>e.scrollHeight-e.scrollTop-e.clientHeight')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ['CHROME_PATH'])
 c=b.new_context(viewport={'width':360,'height':800},is_mobile=True,has_touch=True,service_workers='block',accept_downloads=True)
 page=c.new_page();errors=[];remote=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:remote.append(r.url) if not r.url.startswith((URL,'blob:','data:')) else None)
 page.goto(URL);page.locator('.project').wait_for()
 page.evaluate('''async()=>{const db=await new Promise(r=>{const q=indexedDB.open('ziyan-local-v1',2);q.onsuccess=()=>r(q.result)});const png=await(await fetch('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')).blob();await new Promise(r=>{const tx=db.transaction(['projects','messages','tasks','media','ink','drafts'],'readwrite');for(const s of ['projects','messages','tasks','media','ink','drafts'])tx.objectStore(s).clear();for(const [id,name] of [['source','创作练习'],['target','阅读计划'],['other','周末安排']])tx.objectStore('projects').put({id,name,emoji:'📚',color:0,pinned:false,tasksOpen:false,created:1000,updated:1000});for(let i=0;i<30;i++)tx.objectStore('messages').put({id:'note-'+i,projectId:'source',type:'text',text:('虚构练习段落 '+i+'。').repeat(i===15?300:8),created:2000+i});for(const [id,type] of [['photo','image'],['movie','video'],['writing','handwriting']])tx.objectStore('messages').put({id,projectId:'source',type,name:id,pageCount:1,created:3000});tx.objectStore('messages').put({id:'rich',projectId:'source',type:'richtext',text:'图文练习',html:'<p>图文练习</p><img data-media="inline">',created:3001});for(const id of ['photo','writing','inline'])tx.objectStore('media').put({id,blob:png});tx.objectStore('media').put({id:'movie',blob:new Blob(['fictional-video-fixture'],{type:'video/mp4'})});tx.objectStore('ink').put({id:'writing',projectId:'source',title:'线条练习',pages:[{paper:'grid',strokes:[{id:'stroke',color:'#ededed',width:4,points:[[10,10,.5],[80,80,.5]]}]}],pageIndex:0,draft:false,sourceId:null,updated:3000});for(let i=0;i<8;i++)tx.objectStore('tasks').put({id:'task-'+i,projectId:'source',text:'虚构待办 '+i,done:false,created:1000+i,dueDate:null,images:[]});tx.oncomplete=r});db.close()}''')
 page.reload();page.locator('[data-project="source"]').click();page.wait_for_timeout(350)
 expect(page.locator('#send-button')).to_be_visible();expect(page.locator('#send-button')).to_be_disabled()
 # Sample the full drawer animation while pinned to bottom.
 for _ in range(2):
  page.locator('.taskbar-toggle').click()
  for i in range(8):
   page.wait_for_timeout(35)
   gap=page.locator('#messages').evaluate('e=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(e.scrollHeight-e.scrollTop-e.clientHeight))))')
   assert gap<3,gap
  page.locator('.taskbar-close').click()
  for i in range(8):
   page.wait_for_timeout(35)
   gap=page.locator('#messages').evaluate('e=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(e.scrollHeight-e.scrollTop-e.clientHeight))))')
   assert gap<3,gap
 # Keep the same line within a long message at a stable screen coordinate.
 page.locator('#messages').evaluate('e=>{const m=e.querySelector("[data-message=note-15]");e.scrollTop=m.offsetTop-e.offsetTop+300}')
 page.wait_for_timeout(100)
 line=page.locator('[data-message="note-15"]').evaluate('e=>e.getBoundingClientRect().top')
 page.screenshot(path=str(OUT/'drawer-before.png'))
 page.locator('.taskbar-toggle').click()
 for _ in range(10):
  after=page.locator('[data-message="note-15"]').evaluate('e=>new Promise(r=>requestAnimationFrame(()=>r(e.getBoundingClientRect().top)))')
  assert abs(after-line)<3,(line,after)
  page.wait_for_timeout(35)
 page.screenshot(path=str(OUT/'drawer-expanded.png'))
 anchor=page.evaluate('''()=>{const l=document.querySelector('#messages'),y=l.getBoundingClientRect().top+32;const e=[...l.querySelectorAll('[data-message]')].find(e=>e.getBoundingClientRect().bottom>y);return {id:e.dataset.message,inset:y-e.getBoundingClientRect().top,y}}''')
 page.locator('.taskbar-close').click();page.wait_for_timeout(300)
 actual=page.locator('[data-message="'+anchor['id']+'"]').evaluate('(e,inset)=>e.getBoundingClientRect().top+inset',anchor['inset'])
 assert abs(actual-anchor['y'])<3,(actual,anchor)
 # Opening must not push any historical text down, including short viewports.
 for width,height in [(320,360),(360,800),(412,892)]:
  page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(200)
  for mid,inside in [('note-15',300),('note-10',25)]:
   page.locator('#messages').evaluate('(e,a)=>{const m=e.querySelector(`[data-message="${a.mid}"]`);e.scrollTop=m.offsetTop-e.offsetTop+a.inside}',{'mid':mid,'inside':inside})
   page.wait_for_timeout(100);baseline=page.locator('[data-message="'+mid+'"]').evaluate('e=>e.getBoundingClientRect().top')
   page.locator('.taskbar-toggle').click()
   for _ in range(10):
    pos=page.locator('[data-message="'+mid+'"]').evaluate('e=>new Promise(r=>requestAnimationFrame(()=>r(e.getBoundingClientRect().top)))')
    assert abs(pos-baseline)<3,(width,height,mid,baseline,pos)
    page.wait_for_timeout(35)
   page.locator('.taskbar-close').click();page.wait_for_timeout(320)
   pos=page.locator('[data-message="'+mid+'"]').evaluate('e=>e.getBoundingClientRect().top');assert abs(pos-baseline)<3,(baseline,pos)
 page.set_viewport_size({'width':360,'height':800});page.wait_for_timeout(200)
 page.locator('#messages').evaluate('e=>{const m=e.querySelector("[data-message=note-15]");e.scrollTop=m.offsetTop-e.offsetTop+300}')
 page.wait_for_timeout(100)
 page.screenshot(path=str(OUT/'drawer-collapsed.png'))
 # A genuinely late local image above the reading line must not move the line.
 beforeImage=page.locator('[data-message="note-15"]').evaluate('e=>e.getBoundingClientRect().top')
 page.evaluate('''()=>{const img=document.createElement('img');img.style.cssText='display:block;width:240px';document.querySelector('[data-message="note-14"] .bubble').append(img);setTimeout(()=>{img.src=URL.createObjectURL(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="#242424"/></svg>'],{type:'image/svg+xml'}));},80)}''')
 page.wait_for_timeout(250);afterImage=page.locator('[data-message="note-15"]').evaluate('e=>e.getBoundingClientRect().top');assert abs(beforeImage-afterImage)<3,(beforeImage,afterImage)
 print('PASS drawer animation bottom tracking, long-message anchor and late local image stability')
 # Browser-level touch, not DOM-dispatched pointer events.
 page.locator('[data-message="note-29"]').scroll_into_view_if_needed();page.wait_for_timeout(100)
 cdp=c.new_cdp_session(page);x,y=coords(page.locator('[data-message="note-29"] .bubble'))
 touch(cdp,x,y,.65);expect(page.locator('.context-menu')).to_be_visible()
 assert page.evaluate('getSelection().toString()')==''
 x2,y2=coords(page.locator('#copy-message'));touch(cdp,x2,y2,.65)
 assert page.evaluate('getSelection().toString()')==''
 # Close menu if the long touch did not activate its button.
 page.evaluate('document.querySelector(".context-menu")&&window.ziyanGoBack()')
 page.locator('[data-message="note-29"] [data-menu]').click();page.locator('#select-message').click()
 expect(page.locator('#selection-text')).to_be_visible();assert page.locator('#selection-text').evaluate('e=>getComputedStyle(e).userSelect')=='text'
 page.locator('#selection-back').click();page.wait_for_timeout(150)
 x,y=coords(page.locator('[data-message="note-29"] .bubble'));touch(cdp,x,y);page.wait_for_timeout(90);touch(cdp,x,y)
 expect(page.locator('.note-editor')).to_be_visible();original=next(m for m in rows(page,'messages') if m['id']=='note-29')
 page.locator('#rich-body').fill('双触编辑后的虚构内容');page.locator('[data-editor="done"]').click();expect(page.locator('.note-editor')).to_have_count(0)
 changed=next(m for m in rows(page,'messages') if m['id']=='note-29');assert changed['created']==original['created']
 page.locator('[data-message="note-29"] .bubble').dblclick();expect(page.locator('.note-editor')).to_be_visible()
 page.screenshot(path=str(OUT/'editor.png'));page.locator('[data-editor="back"]').click()
 # A real vertical touch drag must scroll without a menu/editor/navigation.
 page.locator('#messages').evaluate('e=>e.scrollTop=e.scrollHeight');page.wait_for_timeout(80)
 box=page.locator('#messages').bounding_box();x=180;y=box['y']+100
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
 for i in range(1,9):cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+1,'y':y+i*15}]});page.wait_for_timeout(25)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(650)
 assert bottom(page)>40;expect(page.locator('.context-menu,.note-editor')).to_have_count(0);expect(page.locator('#app')).to_have_class('in-chat')
 print('PASS Chromium touch long press, selection suppression, double tap, desktop double click, vertical scroll')
 # Main action and mode control stay usable in a keyboard-sized viewport.
 for width,height in [(360,400),(320,360)]:
  page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(180)
  if 'expanded' not in page.locator('.taskbar').get_attribute('class').split():page.locator('.taskbar-toggle').click()
  page.locator('#message-input').fill('短视口共享草稿');page.locator('[data-action="task-mode"]').click()
  expect(page.locator('#message-input')).to_have_value('短视口共享草稿');expect(page.locator('#send-button')).to_have_text('保存待办')
  page.screenshot(path=str(OUT/f'composer-{width}-{height}.png'))
  for sel in ['#send-button','[data-action="task-mode"]','#message-input']:
   r=page.locator(sel).bounding_box();assert 0<=r['y'] and r['y']+r['height']<=height+1,(sel,r,height)
  page.locator('[data-action="task-mode"]').click();expect(page.locator('#message-input')).to_have_value('短视口共享草稿')
 page.locator('[data-action="task-mode"]').click()
 page.evaluate('''()=>{window.taskAdd=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(v){if(this.name==='tasks')throw new DOMException('测试失败','QuotaExceededError');return taskAdd.call(this,v)}}''')
 page.locator('#send-button').click();expect(page.locator('#toast')).to_contain_text('空间不足');expect(page.locator('#message-input')).to_have_value('短视口共享草稿');expect(page.locator('#send-button')).to_have_text('保存待办');expect(page.locator('#send-button')).to_be_enabled()
 page.evaluate('()=>{IDBObjectStore.prototype.add=taskAdd;}')
 page.locator('#send-button').click();expect(page.locator('#send-button')).to_have_text('发送');expect(page.locator('#send-button')).to_be_disabled()
 page.reload();page.locator('[data-project="source"]').click();expect(page.locator('#message-input')).to_have_value('');expect(page.locator('#send-button')).to_have_text('发送')
 page.set_viewport_size({'width':360,'height':800})
 # Full-screen multi-forward cancellation, query, selection and atomic rollback.
 menu(page,'note-29');assert page.locator('#dialog').bounding_box()['height']==800
 page.locator('#forward-search').fill('阅读');expect(page.locator('.forward-targets button')).to_have_count(1);choose(page,'target');page.locator('#forward-search').fill('');choose(page,'other')
 expect(page.locator('#forward-confirm')).to_have_text('转发 (2)');page.screenshot(path=str(OUT/'forward-picker.png'))
 count=len(rows(page,'messages'));page.locator('#dialog [data-close]').click();assert len(rows(page,'messages'))==count
 for mid in ['note-29','rich','photo','movie','writing']:
  menu(page,mid);choose(page,'target');choose(page,'other')
  if mid!='note-29':expect(page.locator('#forward-recent')).to_be_visible()
  if mid=='note-29':
   page.evaluate('''()=>{window.realAdd=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(v){if(this.name==='messages'&&v.projectId==='other')throw new DOMException('测试事务失败','QuotaExceededError');return realAdd.call(this,v)}}''')
   page.locator('#forward-confirm').click();expect(page.locator('#toast')).to_contain_text('空间不足');expect(page.locator('#forward-confirm')).to_be_enabled();assert len(rows(page,'messages'))==count
   page.evaluate('()=>{IDBObjectStore.prototype.add=realAdd;}')
  page.locator('#forward-confirm').click();expect(page.locator('#dialog')).not_to_be_visible()
 for pid in ['target','other']:
  copies=[m for m in rows(page,'messages') if m['projectId']==pid];assert len(copies)==5
  assert {m['type'] for m in copies}=={'richtext','image','video','handwriting'}
  ink=next(d for d in rows(page,'ink') if d['projectId']==pid);assert ink['pages'][0]['strokes']
 refs=[m['html'] for m in rows(page,'messages') if 'data-media=' in m.get('html','') and m['projectId']!='source'];assert len(set(refs))==2
 print('PASS all five note types to two targets; independent rich media/ink; cancellation and injected transaction failure roll back')
 # Task reminder from drawer, menu, full editor and creation details; separate deadline.
 page.evaluate('window.alarmCalls=[];window.ZiyanAndroid={version:()=>"test",setTaskAlarm:(...args)=>alarmCalls.push(args)}')
 if 'expanded' not in page.locator('.taskbar').get_attribute('class').split():page.locator('.taskbar-toggle').click()
 page.locator('.bar-task[data-task-row="task-0"] [data-task-menu]').click();page.locator('#task-reminder').click();page.locator('#reminder-time').fill('08:25');page.locator('#reminder-open').click();expect(page.locator('#dialog')).not_to_be_visible()
 task=next(t for t in rows(page,'tasks') if t['id']=='task-0');assert task['reminderTime']=='08:25' and task['dueDate'] is None
 assert page.evaluate('alarmCalls[0]')==[8,25,'虚构待办 0']
 page.locator('.bar-task[data-task-row="task-0"] [data-task-menu]').click();page.locator('#task-reminder').click();expect(page.locator('#reminder-time')).to_have_value('08:25');page.locator('#dialog [data-close]').click()
 page.locator('.bar-task[data-task-row="task-0"] [data-task-menu]').click();page.locator('#edit-task').click();page.locator('#task-due').fill('2026-12-05');page.locator('#task-reminder').fill('10:40');page.locator('[data-editor="done"]').click();expect(page.locator('.note-editor')).to_have_count(0)
 task=next(t for t in rows(page,'tasks') if t['id']=='task-0');assert task['reminderTime']=='10:40' and task['dueDate']=='2026-12-05';assert page.evaluate('alarmCalls.length')==1
 page.locator('[data-action="task-mode"]').click();page.locator('#message-input').fill('新建带闹钟的虚构待办');page.locator('[data-action="task-details"]').click();page.locator('#task-reminder').fill('11:45')
 page.set_viewport_size({'width':320,'height':360});page.locator('#task-reminder').scroll_into_view_if_needed();page.screenshot(path=str(OUT/'task-reminder.png'))
 page.locator('[data-editor="alarm"]').click();expect(page.locator('.note-editor')).to_have_count(0);assert page.evaluate('alarmCalls.at(-1)')==[11,45,'新建带闹钟的虚构待办'];expect(page.locator('#send-button')).to_have_text('发送')
 page.set_viewport_size({'width':360,'height':800})
 # Template CRUD uses the full-screen visual layout and keeps plain template content.
 page.evaluate('delete window.ZiyanAndroid');page.locator('[data-action="attachments"]').click();page.locator('[data-action="templates"]').click();page.locator('#new-template').click();expect(page.locator('.template-editor')).to_be_visible()
 page.locator('#template-name').fill('复用的练习模板');page.locator('#template-text').fill('主题：\n\n练习内容：')
 page.set_viewport_size({'width':320,'height':360});page.screenshot(path=str(OUT/'template-editor.png'))
 r=page.locator('.template-editor button[type=submit]').bounding_box();assert r['y']+r['height']<=360
 page.locator('.template-editor button[type=submit]').click();expect(page.locator('.template-editor')).to_have_count(0)
 template=next(t for t in rows(page,'templates') if t['name']=='复用的练习模板');page.locator('[data-template-edit="'+template['id']+'"]').click();expect(page.locator('#template-text')).to_have_value('主题：\n\n练习内容：');page.locator('#template-name').fill('练习模板修订');page.locator('.template-editor button[type=submit]').click()
 page.locator('[data-template-use="'+template['id']+'"]').click();expect(page.locator('#message-input')).to_have_value('主题：\n\n练习内容：')
 page.set_viewport_size({'width':360,'height':800})
 print('PASS full-screen template create/edit/use and 320px short-viewport completion control')
 # Export/restore backup and remove source to prove copies survive independently.
 page.evaluate('delete window.ZiyanAndroid');page.locator('[data-action="back"]').click();page.locator('.mobile-nav [data-page="settings"]').click()
 with page.expect_download() as info:page.locator('[data-action="export"]').click()
 file=OUT/'fictional-backup.json';info.value.save_as(file);backup=json.loads(file.read_text('utf-8'));assert backup['version']==3
 assert next(t for t in backup['tasks'] if t['id']=='task-0')['reminderTime']=='10:40'
 bad=json.loads(json.dumps(backup));bad['tasks'][0]['reminderTime']='25:90'
 page.locator('#backup-input').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(bad).encode()});expect(page.locator('#toast')).to_contain_text('备份格式不完整')
 backup['projects']=[p for p in backup['projects'] if p['id']!='source'];backup['messages']=[m for m in backup['messages'] if m['projectId']!='source'];backup['tasks']=[];backup['ink']=[i for i in backup['ink'] if i['projectId']!='source'];backup['drafts']=[]
 # Remove original media while keeping all independently referenced copies.
 backup['media']=[m for m in backup['media'] if m['id'] not in ['photo','movie','writing','inline']]
 page.locator('#backup-input').set_input_files({'name':'copies.json','mimeType':'application/json','buffer':json.dumps(backup).encode()});page.locator('#confirm-action').click();expect(page.locator('#dialog')).not_to_be_visible()
 assert len(rows(page,'messages'))==10;page.locator('[data-project="target"]').click();page.wait_for_function('document.querySelector(".rich-bubble img").naturalWidth>0')
 print('PASS reminders remain separate from deadlines, all entry points, no automatic alarm claim; v3 backup round-trip and source-independent copies')
 assert not errors,errors;assert not remote,remote
 b.close()
