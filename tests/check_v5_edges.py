"""Deadline boundaries, legacy drafts, untrusted imports and ink regression."""
from pathlib import Path
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
import time,json
from playwright.sync_api import sync_playwright,expect
R=Path(__file__).resolve().parents[1]
URL='http://127.0.0.1:4173/'
def rows(page,store):
 return page.evaluate('''async s=>{const db=await new Promise(r=>{const q=indexedDB.open('ziyan-local-v1',2);q.onsuccess=()=>r(q.result)});const a=await new Promise(r=>{const q=db.transaction(s).objectStore(s).getAll();q.onsuccess=()=>r(q.result)});db.close();return a}''',store)
def restore(page,data):
 page.locator('#backup-input').set_input_files({'name':'fixture.json','mimeType':'application/json','buffer':json.dumps(data).encode()})
 page.locator('#confirm-action').click();expect(page.locator('#dialog')).not_to_be_visible();expect(page.locator('#toast')).to_contain_text('备份已恢复')
def nav(page,tab):
 if page.locator('#app.in-chat').count():page.locator('[data-action="back"]').click()
 page.locator('.mobile-nav:visible [data-page="'+tab+'"]').click()
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 c=b.new_context(viewport={'width':412,'height':892},is_mobile=True,has_touch=True,timezone_id='Asia/Shanghai',accept_downloads=True)
 page=c.new_page();errors=[];remote=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:remote.append(r.url) if not r.url.startswith((URL,'blob:','data:')) else None)
 page.goto(URL);expect(page.locator('.project')).to_have_count(1)
 now=int(time.time()*1000);project={'id':'legacy-project','name':'兼容性项目','emoji':'📚','color':0,'created':now,'updated':now,'pinned':False,'tasksOpen':False}
 old={'app':'ziyan','version':1,'projects':[project],'messages':[{'id':'old-task','projectId':project['id'],'type':'task','text':'旧待办','done':True,'created':now}],'media':[]}
 restore(page,old);assert rows(page,'messages')==[] and rows(page,'tasks')[0]['done']
 old2={'app':'ziyan','version':2,'projects':[project],'messages':[],'tasks':[],'media':[],'ink':[],'templates':[],'drafts':[{'id':project['id'],'text':'普通草稿','taskText':'待办草稿','taskMode':True}]}
 restore(page,old2);page.locator('.project').click();expect(page.locator('#message-input')).to_have_value('普通草稿\n待办草稿')
 page.locator('[data-action="task-mode"]').click();expect(page.locator('#message-input')).to_have_value('普通草稿\n待办草稿')
 print('PASS v1 task migration; v2 separate drafts merge without loss and remain shared')
 today=datetime.now(ZoneInfo('Asia/Shanghai')).date()
 fixture={**old2,'version':3,'drafts':[]}
 fixture['tasks']=[{'id':'edge-'+str(i),'projectId':project['id'],'text':label,'done':False,'created':now+i,'images':[],'dueDate':(today+timedelta(days=days)).isoformat() if days is not None else None} for i,(label,days) in enumerate([('逾期待办',-1),('正好三天',3),('四天以后',4)]+[('无截止 '+str(i),None) for i in range(18)])]
 restore(page,fixture);nav(page,'tasks')
 expect(page.locator('.task-card.urgent')).to_have_count(2)
 expect(page.locator('.task-card').nth(0)).to_contain_text('逾期待办')
 expect(page.locator('.task-card').nth(1)).to_contain_text('正好三天')
 expect(page.locator('.task-card').nth(2)).to_contain_text('四天以后')
 page.locator('.page').evaluate('e=>e.scrollTop=500')
 index=page.locator('.task-card').evaluate_all('els=>els.findIndex(e=>{const r=e.getBoundingClientRect();return r.top>150&&r.bottom<innerHeight-100})')
 assert index>=0
 before=page.locator('.page').evaluate('e=>e.scrollTop');tid=page.locator('.task-card').nth(index).get_attribute('data-task-row')
 page.locator('.task-card').nth(index).locator('[data-toggle]').click()
 expect(page.locator('[data-task-row="'+tid+'"]')).to_have_class('task-card done')
 assert abs(page.locator('.page').evaluate('e=>e.scrollTop')-before)<2
 expect(page.locator('.task-card').nth(index)).to_have_attribute('data-task-row',tid)
 # Clear an existing deadline and retain the creation timestamp.
 page.locator('.page').evaluate('e=>e.scrollTop=0')
 page.locator('[data-task-row="edge-0"] [data-task-menu]').click();page.locator('#edit-task').click()
 page.locator('[data-editor="clear-due"]').click();page.locator('[data-editor="done"]').click();expect(page.locator('.note-editor')).to_have_count(0)
 t=next(t for t in rows(page,'tasks') if t['id']=='edge-0');assert t['dueDate'] is None and t['created']==now
 bad=json.loads(json.dumps(fixture));bad['tasks'][0]['dueDate']='2026-02-30'
 page.locator('#backup-input').set_input_files({'name':'bad-date.json','mimeType':'application/json','buffer':json.dumps(bad).encode()})
 expect(page.locator('#toast')).to_contain_text('备份格式不完整');assert next(t for t in rows(page,'tasks') if t['id']=='edge-0')['dueDate'] is None
 print('PASS overdue/three-day/four-day ordering; no scroll or row movement on completion; optional deadline removal; invalid date rejected')
 malicious={**old2,'version':3,'drafts':[],'messages':[{'id':'safe-note','projectId':project['id'],'type':'richtext','html':'<h2>正文</h2><script>window.attacked=1</script><img src="https://invalid.example/track"><p onclick="window.attacked=1">内容</p>','text':'正文内容','created':now}]}
 restore(page,malicious);page.locator('.project').click();expect(page.locator('.rich-bubble')).to_contain_text('正文')
 assert page.evaluate('window.attacked') is None
 saved=rows(page,'messages')[0]['html'];assert '<script' not in saved and 'onclick' not in saved and 'https://' not in saved
 # The untouched vector-ink module still works after integrating the new editor.
 page.locator('[data-action="attachments"]').click();page.locator('[data-action="handwrite"]').click();expect(page.locator('.ink-editor')).to_be_visible()
 rect=page.locator('#ink-canvas').bounding_box()
 page.mouse.move(rect['x']+100,rect['y']+130);page.mouse.down();page.mouse.move(rect['x']+150,rect['y']+180,steps=8);page.mouse.up()
 page.locator('[data-ink-action="save"]').click();expect(page.locator('.ink-editor')).to_have_count(0)
 assert len(rows(page,'ink'))==1
 nav(page,'settings')
 with page.expect_download() as info:page.locator('[data-action="export"]').click()
 path=R/'tests'/'v5-edges-backup.json';info.value.save_as(str(path));data=json.loads(path.read_text());assert data['version']==3 and len(data['ink'])==1
 restore(page,data);assert len(rows(page,'ink'))==1 and any(m['type']=='handwriting' for m in rows(page,'messages'))
 assert not errors,errors
 assert not remote,remote
 path.unlink();b.close()
 print('PASS imported rich-text sanitization without external requests; vector handwriting save and v3 backup restoration')
