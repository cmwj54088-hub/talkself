"""Regression checks for the confirmed v0.5 interactions and complete backup format."""
from pathlib import Path
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
URL='http://127.0.0.1:4173/'
SCREEN=ROOT/'screenshots'
SCREEN.mkdir(exist_ok=True)
def records(page,store):
    return page.evaluate('''async store=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('ziyan-local-v1',2);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const data=await new Promise((r,j)=>{const q=db.transaction(store).objectStore(store).getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});db.close();return data}''',store)
def nav(page,tab):
    if page.locator('#app.in-chat').count():page.locator('[data-action="back"]').click()
    page.locator('.mobile-nav:visible [data-page="'+tab+'"]').click()
def send(page,text):
    page.locator('#message-input').fill(text);page.locator('#send-button').click()
def task_edit(page,text):
    page.locator('[data-task-row]').filter(has_text=text).locator('[data-task-menu]').click()
    page.locator('#edit-task').click();expect(page.locator('.note-editor')).to_be_visible()
def finish(page):
    page.locator('[data-editor="done"]').click();expect(page.locator('.note-editor')).to_have_count(0)
def context(page,selector):
    page.locator(selector).first.dispatch_event('contextmenu',{'clientX':220,'clientY':300})
    expect(page.locator('.context-menu')).to_be_visible()

with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    c=b.new_context(viewport={'width':412,'height':892},is_mobile=True,has_touch=True,timezone_id='Asia/Shanghai',accept_downloads=True)
    page=c.new_page();errors=[];outside=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:outside.append(r.url) if not r.url.startswith((URL,'blob:','data:')) else None)
    page.goto(URL);expect(page.locator('.project')).to_have_count(1);page.locator('.project').click()
    page.locator('#message-input').fill('第一件事\n第二件事')
    page.locator('[data-action="task-mode"]').click()
    expect(page.locator('#message-input')).to_have_value('第一件事\n第二件事')
    page.locator('[data-action="task-mode"]').click()
    expect(page.locator('#message-input')).to_have_value('第一件事\n第二件事')
    page.reload();page.locator('.project').click();expect(page.locator('#message-input')).to_have_value('第一件事\n第二件事')
    page.locator('[data-action="task-mode"]').click();page.locator('#send-button').click()
    expect(page.locator('#message-input')).to_have_value('')
    assert len(records(page,'tasks'))==2
    expect(page.locator('.message')).to_have_count(0)
    expect(page.locator('.taskbar-toggle')).to_have_attribute('aria-expanded','false')
    page.locator('.taskbar-toggle').click();expect(page.locator('.taskbar')).to_have_class('taskbar expanded')
    expect(page.locator('.taskbar-close')).to_be_visible()
    page.locator('[data-inline-task]').first.click()
    page.locator('.inline-task-edit textarea').fill('完成数学练习')
    page.locator('.inline-task-edit button').click()
    expect(page.locator('[data-inline-task]').first).to_have_text('完成数学练习')
    page.locator('.taskbar-close').click();expect(page.locator('.taskbar')).to_have_class('taskbar')
    print('PASS unified input survives mode switches/reload; multi-task save stays collapsed; direct text editing and bottom collapse')

    send(page,'这是一段需要修改的长笔记。')
    expect(page.locator('.message')).to_have_count(1)
    # Real long-press timing and anchored menu, rather than center-screen modal.
    page.locator('.bubble').dispatch_event('pointerdown',{'pointerType':'touch','pointerId':5,'clientX':250,'clientY':350})
    page.wait_for_timeout(600)
    page.locator('.bubble').dispatch_event('pointerup',{'pointerType':'touch','pointerId':5,'clientX':250,'clientY':350})
    expect(page.locator('.context-menu')).to_be_visible();expect(page.locator('#dialog')).not_to_be_visible()
    page.locator('#select-message').click();expect(page.locator('.selection-view')).to_be_visible()
    expect(page.locator('#selection-text')).to_have_value('这是一段需要修改的长笔记。')
    page.locator('#selection-back').click();page.wait_for_timeout(100)
    context(page,'.message');page.locator('#edit-message').click()
    expect(page.locator('.note-editor')).to_be_visible()
    page.locator('#rich-body').fill('牛顿第二定律\n已知质量与加速度，求合力。')
    page.locator('#rich-body').evaluate('''el=>{el.focus();const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r)}''')
    page.locator('[data-format="bold"]').click()
    # Insert a genuine local image, with no data URL or external URL persisted in HTML.
    image={'name':'示意图.svg','mimeType':'image/svg+xml','buffer':b'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="#242424"/><path d="M25 90H215M50 105V15M50 90L190 30" stroke="#ededed" fill="none" stroke-width="3"/></svg>'}
    page.locator('#editor-image-input').set_input_files(image)
    page.wait_for_function('document.querySelector("#rich-body img")?.naturalWidth>0')
    expect(page.locator('#editor-state')).to_have_text('草稿已保存在本机')
    finish(page)
    rich=records(page,'messages')[0]
    assert rich['type']=='richtext' and '<strong>' in rich['html'] and 'data-media=' in rich['html'] and 'blob:' not in rich['html']
    page.wait_for_function('document.querySelector(".rich-bubble img")?.naturalWidth>0')
    context(page,'.message');page.locator('#edit-message').click()
    expect(page.locator('#rich-body img')).to_have_count(1)
    page.screenshot(path=str(SCREEN/'v5-fullscreen-editor.png'))
    page.locator('[data-editor="back"]').click();expect(page.locator('.note-editor')).to_have_count(0)
    print('PASS message long-press menu; partial-selection mode; full-screen editing; bold and local inline image; re-edit')

    page.locator('.taskbar-toggle').click()
    task_edit(page,'完成数学练习')
    due=(datetime.now(ZoneInfo('Asia/Shanghai'))+timedelta(days=2)).date().isoformat()
    page.locator('#task-due').fill(due)
    page.locator('#editor-image-input').set_input_files(image)
    page.wait_for_function('document.querySelector("#task-images img")?.naturalWidth>0')
    finish(page)
    row=page.locator('[data-task-row]').filter(has_text='完成数学练习')
    expect(row.locator('.task-created')).to_contain_text('创建')
    expect(row.locator('.task-due')).to_contain_text(due)
    expect(row.locator('.task-photos img')).to_have_count(1)
    page.locator('[data-action="back"]').click()
    expect(page.locator('.project .pending-badge')).to_have_text('2')
    context(page,'.project');expect(page.locator('#project-pin')).to_be_visible()
    page.locator('.context-layer').click(position={'x':10,'y':10})
    nav(page,'tasks')
    expect(page.locator('.task-card').first).to_contain_text('完成数学练习')
    expect(page.locator('.task-card').first).to_have_class('task-card  urgent')
    assert page.locator('.task-card .task-text').first.evaluate('(el)=>getComputedStyle(el).color')=='rgb(250, 81, 81)'
    first_id=page.locator('.task-card').first.get_attribute('data-task-row')
    page.locator('.task-card').first.locator('[data-toggle]').click()
    expect(page.locator('.task-card').first).to_have_attribute('data-task-row',first_id)
    expect(page.locator('.task-card').first).to_have_class('task-card done')
    page.locator('.task-card').first.locator('[data-toggle]').click()
    expect(page.locator('.task-card').first).to_have_class('task-card urgent')
    expect(page.locator('#toast')).to_have_css('opacity','0',timeout=6000)
    page.screenshot(path=str(SCREEN/'v5-deadline-tasks.png'))
    print('PASS task image + creation time + optional deadline; red urgent ordering; project numbered badge; completion stays in place')

    # Real follow-finger page transformations and page targets.
    def swipe(dx):
        el=page.locator('.main:visible .page') if page.locator('.main:visible .page').count() else page.locator('.side-top')
        el.dispatch_event('pointerdown',{'pointerType':'touch','pointerId':9,'clientX':240,'clientY':300})
        el.dispatch_event('pointermove',{'pointerType':'touch','pointerId':9,'clientX':240+dx,'clientY':302})
        assert page.locator('#app > .main').evaluate('el=>el.style.transform')
        el.dispatch_event('pointerup',{'pointerType':'touch','pointerId':9,'clientX':240+dx,'clientY':302})
        page.wait_for_timeout(550)
    swipe(-160);expect(page.locator('.settings-page')).to_be_visible()
    swipe(160);expect(page.locator('.task-card')).to_have_count(2)
    print('PASS home-tab swipe targets, follow-finger transform and transition cleanup')

    # Latest-only first render; expanding old history preserves the anchored viewport.
    nav(page,'projects');pid=records(page,'projects')[0]['id']
    page.evaluate('''async pid=>{const db=await new Promise(r=>{const q=indexedDB.open('ziyan-local-v1',2);q.onsuccess=()=>r(q.result)});await new Promise(r=>{const tx=db.transaction('messages','readwrite');for(let i=0;i<130;i++)tx.objectStore('messages').put({id:'history-'+i,projectId:pid,type:'text',text:'历史记录 '+i,created:Date.now()-1000000+i});tx.oncomplete=r});db.close()}''',pid)
    page.reload();page.locator('.project').click()
    expect(page.locator('.message')).to_have_count(60)
    page.wait_for_function('(()=>{const e=document.querySelector("#messages");return e.scrollHeight-e.scrollTop-e.clientHeight<2})()')
    page.locator('#messages').evaluate('e=>e.scrollTop=0')
    page.locator('[data-action="older"]').click()
    expect(page.locator('.message')).to_have_count(120)
    assert page.locator('#messages').evaluate('e=>e.scrollTop')>100
    print('PASS initial render contains latest 60 records at bottom; older history loads upward without jumping')

    nav(page,'settings')
    with page.expect_download() as info:page.locator('[data-action="export"]').click()
    backup_path=ROOT/'tests'/'v5-test-backup.json';info.value.save_as(str(backup_path));data=json.loads(backup_path.read_text())
    assert data['version']==3 and len(data['tasks'][0]['images'])+len(data['tasks'][1]['images'])==1
    assert any(m['type']=='richtext' for m in data['messages'])
    other=b.new_context(viewport={'width':412,'height':892},is_mobile=True,has_touch=True,timezone_id='Asia/Shanghai')
    q=other.new_page();q.on('pageerror',lambda e:errors.append(str(e)));q.goto(URL)
    expect(q.locator('.project')).to_have_count(1)
    q.locator('#backup-input').set_input_files(str(backup_path));q.locator('#confirm-action').click();expect(q.locator('#toast')).to_contain_text('备份已恢复')
    imported=records(q,'tasks');assert any(t.get('dueDate')==due and t['images'] for t in imported)
    q.locator('.project').click();q.locator('#messages').evaluate('el=>el.scrollTop=0')
    # Rich note may be outside the first history window; search navigates it directly.
    q.locator('[data-action="details"]').click();q.locator('#search-project').click();q.locator('#inside-search').fill('牛顿')
    q.locator('.search-result').click();expect(q.locator('.rich-bubble img')).to_have_count(1)
    q.wait_for_function('document.querySelector(".rich-bubble img")?.naturalWidth>0')
    # Corrupt cross-record references reject the entire backup before writes.
    bad=json.loads(json.dumps(data));bad['tasks'][0]['images']=['nonexistent-image']
    q.locator('#backup-input').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(bad).encode()})
    expect(q.locator('#toast')).to_contain_text('备份格式不完整')
    assert len(records(q,'messages'))==len(data['messages'])
    print('PASS v3 backup to an independent browser retains rich images/deadlines; broken references rejected atomically')
    page.evaluate('navigator.serviceWorker.ready');page.wait_for_function('navigator.serviceWorker.controller!==null')
    c.set_offline(True);page.reload();expect(page.locator('.project')).to_have_count(1)
    page.locator('.project').click();context(page,'.message');page.locator('#edit-message').click();expect(page.locator('.note-editor')).to_be_visible()
    page.locator('[data-editor="back"]').click();expect(page.locator('.note-editor')).to_have_count(0)
    c.set_offline(False)
    page.set_viewport_size({'width':360,'height':740});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert not errors,errors
    assert not outside,outside
    backup_path.unlink();b.close()
    print('PASS offline editor and reload, 360px width; no browser errors or external requests')
