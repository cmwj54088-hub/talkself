"""Behavioral checks for independent tasks, handwriting, migration and portability."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'screenshots'
OUT.mkdir(exist_ok=True)
URL = 'http://127.0.0.1:4173/'

def stores(page):
    return page.evaluate('''async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('ziyan-local-v1',2);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const names=['projects','messages','tasks','drafts','ink','templates','media'];const out={};await Promise.all(names.map(name=>new Promise((r,j)=>{const q=db.transaction(name).objectStore(name).getAll();q.onsuccess=()=>{out[name]=q.result;r()};q.onerror=()=>j(q.error)})));db.close();return out}''')

def input_send(page,text):
    page.locator('#message-input').fill(text)
    page.locator('#send-button').click()

def goto_settings(page):
    if page.locator('#app.in-chat').count():page.locator('[data-action="back"]').click()
    page.locator('.mobile-nav:visible [data-page="settings"]').click()

def stroke(page,points):
    box=page.locator('#ink-canvas').bounding_box()
    x,y=points[0]
    page.mouse.move(box['x']+x,box['y']+y)
    page.mouse.down()
    for x,y in points[1:]:page.mouse.move(box['x']+x,box['y']+y,steps=3)
    page.mouse.up()

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':412,'height':892},is_mobile=True,has_touch=True,accept_downloads=True)
    page=ctx.new_page();errors=[];outside=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:outside.append(r.url) if not r.url.startswith((URL,'blob:','data:')) else None)
    page.goto(URL)
    expect(page.locator('.project')).to_have_count(1)
    page.locator('.project').click()
    input_send(page,'数学物理笔记 <script>window.bad=true</script>')
    expect(page.locator('.message')).to_have_count(1)
    assert page.evaluate('window.bad') is None
    page.locator('#message-input').fill('普通笔记草稿')
    page.locator('[data-action="task-mode"]').click()
    page.locator('#message-input').fill('完成微积分练习')
    page.locator('#message-input').press('Enter')
    page.locator('#message-input').press_sequentially('整理力学公式')
    expect(page.locator('#task-input-preview')).to_contain_text('2 项')
    page.locator('#send-button').click()
    expect(page.locator('.bar-task')).to_have_count(2)
    expect(page.locator('.message')).to_have_count(1)
    expect(page.locator('#message-input')).to_have_value('普通笔记草稿')
    expect(page.locator('.taskbar-toggle')).to_have_attribute('aria-expanded','true')
    page.locator('.bar-task .check').first.click()
    expect(page.locator('.bar-task.done')).to_have_count(1)
    page.locator('.bar-task [data-task-menu]').first.click()
    page.locator('#task-edit-text').fill('整理力学与电磁学公式')
    page.locator('#task-edit-form button[type="submit"]').click()
    expect(page.locator('#dialog')).not_to_be_visible()
    page.locator('.taskbar-toggle').click()
    expect(page.locator('.taskbar-list')).to_have_count(0)
    page.reload();page.locator('.project').click()
    expect(page.locator('#message-input')).to_have_value('普通笔记草稿')
    expect(page.locator('.taskbar-list')).to_have_count(0)
    page.locator('#message-input').fill('')
    print('PASS independent multi-entry tasks, no task messages, persistent drawer and drafts')

    # Project ordering and per-project drafts are independent.
    page.locator('[data-action="back"]').click()
    page.locator('[data-action="create"]').click();page.locator('#project-name').fill('电磁学');page.locator('#project-form button[type="submit"]').click()
    expect(page.locator('.chat-head h2')).to_have_text('电磁学')
    page.locator('#message-input').fill('电磁学的草稿')
    page.locator('[data-action="back"]').click()
    expect(page.locator('.project').first).to_contain_text('电磁学')
    page.locator('.project').filter(has_text='随手记').click()
    input_send(page,'项目更新后排到首页最上方')
    expect(page.locator('.message')).to_have_count(2)
    page.locator('[data-action="back"]').click()
    expect(page.locator('.project').first).to_contain_text('随手记')
    page.locator('.project').filter(has_text='电磁学').click()
    expect(page.locator('#message-input')).to_have_value('电磁学的草稿')
    page.locator('#message-input').fill('')

    # Timestamp gaps: exactly five minutes does NOT trigger a separator.
    pid=stores(page)['projects'][1]['id']
    pid=page.locator('.project.selected').get_attribute('data-project')
    page.evaluate('''async pid=>{const db=await new Promise(r=>{const q=indexedDB.open('ziyan-local-v1',2);q.onsuccess=()=>r(q.result)});await new Promise(r=>{const tx=db.transaction('messages','readwrite');const base=Date.now()-3600000;[0,300000,600001,660001].forEach((offset,i)=>tx.objectStore('messages').put({id:'time-'+i,projectId:pid,type:'text',text:'推导步骤 '+i,created:base+offset}));tx.oncomplete=r});db.close()}''',pid)
    page.reload();page.locator('.project').filter(has_text='电磁学').click()
    expect(page.locator('.date-separator')).to_have_count(2)
    expect(page.locator('.message-meta')).to_have_count(0)
    page.locator('[data-action="attachments"]').click();page.locator('[data-action="templates"]').click()
    page.locator('.template-use').filter(has_text='公式推导').click()
    expect(page.locator('#message-input')).to_contain_text('推导步骤：')
    assert '\n' in page.locator('#message-input').input_value()
    page.locator('#message-input').fill('')
    print('PASS project sorting, five-minute timestamps, template insertion')

    # Left/right navigation gestures exclude form controls and canvas.
    def swipe(dx):
        page.locator('#messages').dispatch_event('pointerdown',{'pointerType':'touch','pointerId':42,'clientX':200,'clientY':350})
        page.locator('#messages').dispatch_event('pointermove',{'pointerType':'touch','pointerId':42,'clientX':200+dx,'clientY':352})
        page.locator('#messages').dispatch_event('pointerup',{'pointerType':'touch','pointerId':42,'clientX':200+dx,'clientY':352})
    swipe(120);expect(page.locator('#app')).not_to_have_class('in-chat')
    page.wait_for_timeout(360)
    page.locator('.project').filter(has_text='电磁学').click()
    swipe(-120)
    expect(page.locator('.ink-editor')).to_be_visible()
    page.wait_for_timeout(360)
    page.locator('#ink-title').fill('牛顿第二定律 · 推导')
    canvas=page.locator('#ink-canvas');expect(canvas).to_be_visible()
    # Draw a simple formula-shaped group, then exercise history.
    stroke(page,[(110,100),(110,150)])
    stroke(page,[(110,100),(145,100)])
    stroke(page,[(110,125),(135,125)])
    stroke(page,[(165,120),(190,120)])
    stroke(page,[(165,133),(190,133)])
    page.locator('[data-ink-action="undo"]').click()
    page.locator('[data-ink-action="redo"]').click()
    # Lasso selection, move, scale, undo and redo.
    page.locator('[data-ink-action="lasso"]').click()
    stroke(page,[(95,85),(155,85),(155,165),(95,165),(95,85)])
    expect(page.locator('.ink-selection-tools')).to_be_visible()
    stroke(page,[(120,120),(130,130)])
    page.locator('[data-ink-action="deselect"]').click()
    page.locator('[data-ink-action="add-page"]').click()
    expect(page.locator('#ink-page-count')).to_have_text('2 / 2 页')
    page.locator('#ink-paper').select_option('lines')
    page.locator('[data-ink-action="pen"]').click()
    stroke(page,[(100,95),(115,125),(140,80)])
    # Autosaved handwriting survives closing and reopening the editor.
    page.locator('[data-ink-action="back"]').click()
    expect(page.locator('.ink-editor')).to_have_count(0)
    page.reload();page.locator('.project').filter(has_text='电磁学').click()
    page.locator('[data-action="attachments"]').click();page.locator('[data-action="handwrite"]').click()
    expect(page.locator('#ink-page-count')).to_have_text('2 / 2 页')
    expect(page.locator('#ink-title')).to_have_value('牛顿第二定律 · 推导')
    page.locator('[data-ink-action="prev"]').click()
    expect(page.locator('#ink-save-state')).to_have_text('草稿已保存到本机',timeout=6000)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(OUT/'android-handwriting-v3.png'))
    page.locator('[data-ink-action="save"]').click()
    expect(page.locator('.ink-editor')).to_have_count(0)
    expect(page.locator('[data-ink]')).to_have_count(2)
    expect(page.locator('.media-name')).to_contain_text('2 页')
    page.wait_for_function('document.querySelector("[data-media]").naturalWidth>0')
    inkdata=[d for d in stores(page)['ink'] if not d.get('draft')]
    assert len(inkdata)==1 and len(inkdata[0]['pages'])==2 and len(inkdata[0]['pages'][0]['strokes'])==5
    page.locator('[data-ink]').first.click()
    page.locator('[data-ink-action="next"]').click()
    page.locator('[data-ink-action="delete-page"]').click()
    expect(page.locator('#ink-page-count')).to_have_text('1 / 1 页')
    page.locator('[data-ink-action="undo"]').click()
    expect(page.locator('#ink-page-count')).to_have_text('2 / 2 页')
    page.locator('[data-ink-action="save"]').click()
    expect(page.locator('.ink-editor')).to_have_count(0)
    assert len([m for m in stores(page)['messages'] if m['type']=='handwriting'])==1
    print('PASS swipe navigation, multi-page handwriting, editable vectors, lasso, undo/redo, draft recovery, update without duplication')

    # Independent-browser backup round trip includes editable ink and drafts.
    page.locator('#message-input').fill('跨浏览器保留的草稿')
    goto_settings(page)
    with page.expect_download() as info:page.locator('[data-action="export"]').click()
    backup_path=ROOT/'tests'/'v3-backup.json';info.value.save_as(str(backup_path))
    backup=json.loads(backup_path.read_text())
    assert backup['version']==2 and len(backup['tasks'])==2 and len(backup['ink'])==1
    assert any(d['text']=='跨浏览器保留的草稿' for d in backup['drafts'])
    other=browser.new_context(viewport={'width':412,'height':892},is_mobile=True,has_touch=True)
    bpage=other.new_page();bpage.on('pageerror',lambda e:errors.append(str(e)))
    bpage.goto(URL);expect(bpage.locator('.project')).to_have_count(1)
    bpage.locator('#backup-input').set_input_files(str(backup_path))
    bpage.locator('#confirm-action').click();expect(bpage.locator('#toast')).to_contain_text('备份已恢复')
    expect(bpage.locator('.project')).to_have_count(2)
    bpage.locator('.project').filter(has_text='电磁学').click()
    expect(bpage.locator('#message-input')).to_have_value('跨浏览器保留的草稿')
    bpage.locator('[data-ink]').first.click()
    expect(bpage.locator('#ink-page-count')).to_have_text('2 / 2 页')
    bpage.locator('[data-ink-action="back"]').click()
    expect(bpage.locator('.ink-editor')).to_have_count(0)
    # Broken vector data is rejected before any replacement.
    bad=json.loads(json.dumps(backup));bad['ink'][0]['pages'][0]['strokes'][0]['points'][0][0]='bad'
    bpage.locator('#backup-input').set_input_files({'name':'broken.json','mimeType':'application/json','buffer':json.dumps(bad).encode()})
    expect(bpage.locator('#toast')).to_contain_text('备份格式不完整')
    assert len(stores(bpage)['messages'])==len(backup['messages'])
    # v1 backups migrate task messages and retain completion status.
    old={'app':'ziyan','version':1,'projects':[backup['projects'][0]],'messages':[{'id':'legacy-task','projectId':backup['projects'][0]['id'],'type':'task','text':'旧版待办','done':True,'created':1780000000000}],'media':[]}
    bpage.locator('#backup-input').set_input_files({'name':'v1.json','mimeType':'application/json','buffer':json.dumps(old).encode()})
    bpage.locator('#confirm-action').click();expect(bpage.locator('#toast')).to_contain_text('备份已恢复')
    assert stores(bpage)['messages']==[]
    assert stores(bpage)['tasks'][0]['done'] is True
    print('PASS full backup to another browser, editable handwriting restore, damaged ink rejected, legacy backup migration')

    # Cached app supports offline ink access and note creation after a full reload.
    page.locator('.mobile-nav:visible [data-page="projects"]').click()
    page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function('navigator.serviceWorker.controller!==null')
    ctx.set_offline(True);page.reload()
    page.locator('.project').filter(has_text='电磁学').click()
    page.locator('[data-ink]').first.click();expect(page.locator('.ink-editor')).to_be_visible()
    page.locator('[data-ink-action="back"]').click()
    input_send(page,'离线记录也能保存')
    expect(page.locator('.message').last).to_contain_text('离线记录也能保存')
    ctx.set_offline(False)
    page.locator('[data-action="back"]').click();page.locator('.project').filter(has_text='随手记').click()
    page.locator('.taskbar-toggle').click()
    expect(page.locator('#toast')).to_have_css('opacity','0',timeout=6000)
    page.screenshot(path=str(OUT/'android-chat-v3.png'))
    page.locator('[data-action="back"]').click();page.screenshot(path=str(OUT/'android-projects-v3.png'))
    page.set_viewport_size({'width':360,'height':740});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert not errors,errors
    assert not outside,outside
    backup_path.unlink();browser.close()
    print('PASS offline reload, cached ink editor, 360px layout; no outside requests or browser errors')
