const {chromium} = require('playwright');
const {expect} = require('playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const URL = 'http://127.0.0.1:4173/';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
async function records(page, store) {
  return page.evaluate(async store => {
    const db = await new Promise(resolve => {const r = indexedDB.open('ziyan-local-v1', 2); r.onsuccess = () => resolve(r.result);});
    const result = await new Promise(resolve => {const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result);});
    db.close(); return result;
  }, store);
}
async function backHome(page) {if (await page.locator('#app.in-chat').count()) await page.locator('[data-action="back"]').click();}
async function clearSearch(page) {
  await backHome(page);
  if (await page.locator('.search-filters').getAttribute('open') === null) await page.locator('.search-filters summary').click();
  await page.locator('[data-action="clear-search"]').click();
}
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {});
  try {
    const context = await browser.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true,timezoneId:'Asia/Shanghai',acceptDownloads:true,serviceWorkers:'block'});
    const page = await context.newPage(), errors = [], outside = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => {if (!r.url().startsWith(URL) && !/^(blob:|data:)/.test(r.url())) outside.push(r.url());});
    await page.goto(URL); await page.locator('.project').waitFor();
    await page.evaluate(async png => {
      const now = Date.now(), old = new Date(2024,0,2,12).getTime();
      const image = await (await fetch('data:image/png;base64,'+png)).blob();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
      canvas.getContext('2d').fillRect(0,0,32,32);
      const stream = canvas.captureStream(10), chunks = [], recorder = new MediaRecorder(stream);
      const video = await new Promise(resolve => {recorder.ondataavailable = e => chunks.push(e.data); recorder.onstop = () => resolve(new Blob(chunks,{type:'video/webm'})); recorder.start(); setTimeout(()=>recorder.stop(),220);});
      stream.getTracks().forEach(track => track.stop());
      const db = await new Promise(resolve => {const r=indexedDB.open('ziyan-local-v1',2);r.onsuccess=()=>resolve(r.result);});
      await new Promise((resolve,reject) => {
        const stores=['projects','messages','tasks','media','ink','drafts'],tx=db.transaction(stores,'readwrite'); stores.forEach(s=>tx.objectStore(s).clear());
        for (const [id,name] of [['source','来源项目'],['target','目标项目']]) tx.objectStore('projects').put({id,name,emoji:'📚',color:0,pinned:false,tasksOpen:true,created:old,updated:now});
        const text='前言'.repeat(100)+'跨项目 <script>alert(1)</script> 记录尾部';
        tx.objectStore('messages').put({id:'old-note',projectId:'source',type:'text',text,created:old});
        for(let i=0;i<75;i++) tx.objectStore('messages').put({id:'history-'+i,projectId:'source',type:'text',text:'历史记录 '+i,created:old+1000+i});
        for(const [id,type] of [['photo','image'],['movie','video'],['writing','handwriting']]) tx.objectStore('messages').put({id,projectId:'source',type,name:id+(type==='video'?'.webm':'.png'),...(type==='handwriting'?{pageCount:1}:{}),created:now});
        tx.objectStore('messages').put({id:'rich',projectId:'source',type:'richtext',text:'图文关键词',html:'<p><strong>图文关键词</strong></p><img data-media="inline-photo">',created:now});
        for(const id of ['photo','writing','inline-photo'])tx.objectStore('media').put({id,blob:image});
        tx.objectStore('media').put({id:'movie',blob:video});
        tx.objectStore('ink').put({id:'writing',projectId:'source',title:'可编辑笔迹',pages:[{paper:'grid',strokes:[{id:'stroke-1',color:'#ededed',width:4,points:[[10,10,.5],[80,80,.6]]}]}],pageIndex:0,draft:false,sourceId:null,updated:now});
        for(const [id,done] of [['open-task',false],['done-task',true]])tx.objectStore('tasks').put({id,projectId:'source',text:done?'已经完成的事项':'尚未完成的事项',done,created:now,dueDate:null,images:[]});
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
      });db.close();
    },png);
    await page.reload(); await expect(page.locator('.project')).toHaveCount(2);
    await page.locator('#project-search').fill('跨项目');
    await expect(page.locator('.result-snippet mark')).toHaveText('跨项目');
    assert.equal(await page.locator('.result-snippet script').count(),0);
    await page.locator('.search-filters summary').click();
    await page.locator('[data-search-filter="project"]').selectOption('source');
    await page.locator('[data-search-filter="type"]').selectOption('text');
    await page.locator('[data-search-filter="from"]').fill('2024-01-02');
    await page.locator('[data-search-filter="to"]').fill('2024-01-02');
    await expect(page.locator('[data-search-message]')).toHaveCount(1);
    fs.mkdirSync(path.join(__dirname,'../screenshots'),{recursive:true});
    await page.screenshot({path:path.join(__dirname,'../screenshots/enhanced-search.png')});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('[data-search-message="old-note"]').click();
    await expect(page.locator('[data-message="old-note"]')).toHaveClass(/highlight/);
    assert.ok(await page.locator('.message').count()>60);
    // Forward all five supported note types; cancellation and copies preserve originals.
    const initial = (await records(page,'messages')).length;
    async function forward(mid) {
      await page.locator(`[data-message="${mid}"]`).dispatchEvent('contextmenu',{clientX:200,clientY:300});
      await page.locator('#forward-message').click();
    }
    await forward('old-note');await page.screenshot({path:path.join(__dirname,'../screenshots/forward-note.png')});await page.locator('#dialog [data-close]').click();assert.equal((await records(page,'messages')).length,initial);
    for(const mid of ['old-note','rich','photo','movie','writing']) {
      await forward(mid);
      await expect(page.locator('[data-forward-project="source"]')).toHaveCount(0);
      await expect(page.locator('[data-forward-project="target"]')).toBeVisible();
      await page.locator('[data-forward-project="target"]').click();
      await expect(page.locator('#dialog')).not.toBeVisible();
      await expect(page.locator('#toast')).toContainText('已转发到');
    }
    let copies=(await records(page,'messages')).filter(m=>m.projectId==='target');assert.equal(copies.length,5);
    const original=(await records(page,'messages')).find(m=>m.id==='old-note');
    assert.ok(copies.every(m=>m.created>original.created&&m.id!==original.id));
    const rich=copies.find(m=>m.type==='richtext');assert.ok(!rich.html.includes('data-media="inline-photo"'));
    const inkCopy=(await records(page,'ink')).find(d=>d.projectId==='target');assert.equal(inkCopy.pages[0].strokes.length,1);
    const inkOriginal=(await records(page,'ink')).find(d=>d.id==='writing');assert.deepEqual(inkCopy.pages,inkOriginal.pages);
    console.log('PASS cross-project forwarding: text/rich/image/video/editable ink, independent IDs and attachments, cancel preserves originals');
    // The project drawer removes completed tasks immediately; global records remain.
    await expect(page.locator('.bar-task')).toHaveCount(1);
    await expect(page.locator('.bar-task [data-toggle="done-task"]')).toHaveCount(0);
    await page.locator('.taskbar-list [data-toggle="open-task"]').click();
    await expect(page.locator('.bar-task')).toHaveCount(0);
    await expect(page.locator('.taskbar-empty')).toContainText('暂无未完成');
    assert.equal((await records(page,'tasks')).filter(t=>t.done).length,2);
    await clearSearch(page);
    await page.locator('#project-search').fill('已经完成');
    await page.locator('[data-search-task="done-task"]').click();
    await expect(page.locator('.task-card.highlight[data-task-row="done-task"]')).toBeVisible();
    console.log('PASS drawer hides completed tasks on load/toggle; completed search result opens global task history');
    await page.locator('.mobile-nav [data-page="projects"]').click();
    await clearSearch(page);
    await page.locator('[data-search-filter="type"]').selectOption('video');
    await expect(page.locator('[data-search-message]')).toHaveCount(2);
    await page.locator('[data-search-filter="project"]').selectOption('target');
    await expect(page.locator('[data-search-message]')).toHaveCount(1);
    await page.locator('[data-search-filter="from"]').fill('2024-02-01');
    await page.locator('[data-search-filter="to"]').fill('2024-01-01');
    await expect(page.locator('#project-list')).toContainText('开始日期不能晚于结束日期');
    await clearSearch(page);await page.locator('[data-project="target"]').click();
    await page.locator('[data-action="details"]').click();await page.locator('#search-project').click();
    await page.locator('#inside-type').selectOption('richtext');await expect(page.locator('#inside-results .search-result')).toHaveCount(1);
    await page.locator('#inside-search').fill('图文');await expect(page.locator('#inside-results mark')).toHaveText('图文');
    await page.locator('#inside-results .search-result').click();
    await page.waitForFunction(()=>document.querySelector('.rich-bubble img')?.naturalWidth>0);
    await page.locator(`[data-ink="${inkCopy.id}"]`).first().click();
    await expect(page.locator('.ink-editor')).toBeVisible();await page.locator('#ink-title').fill('转发后单独编辑');await page.locator('[data-ink-action="save"]').click();
    await expect(page.locator('.ink-editor')).toHaveCount(0);
    assert.equal((await records(page,'ink')).find(d=>d.id==='writing').title,'可编辑笔迹');
    // Deleting the source project must not break any forwarded attachment.
    await clearSearch(page);await page.locator('[data-project="source"]').dispatchEvent('contextmenu',{clientX:200,clientY:300});
    await page.locator('#project-delete').click();await page.locator('#confirm-action').click();
    await expect(page.locator('.project')).toHaveCount(1);
    await page.locator('[data-project="target"]').click();
    await page.waitForFunction(()=>[...document.querySelectorAll('#messages img')].length===3&&[...document.querySelectorAll('#messages img')].every(img=>img.naturalWidth>0));
    await page.waitForFunction(()=>document.querySelector('#messages video')?.readyState>=1);
    assert.equal((await records(page,'messages')).length,5);
    console.log('PASS combined search filters, escaped snippets, old-history location, project search, forwarded media survive source deletion and ink edits');
    await backHome(page);await page.locator('.mobile-nav [data-page="settings"]').click();
    const pending=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const download=await pending;
    const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(backup.version,3);
    const second=await browser.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true,serviceWorkers:'block'}), restored=await second.newPage();
    await restored.goto(URL);await restored.locator('.project').waitFor();
    await restored.locator('#backup-input').setInputFiles({name:'forwarded.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    await restored.locator('#confirm-action').click();await expect(restored.locator('#toast')).toContainText('备份已恢复');
    await restored.locator('[data-project="target"]').click();
    await restored.waitForFunction(()=>[...document.querySelectorAll('#messages img')].length===3&&[...document.querySelectorAll('#messages img')].every(img=>img.naturalWidth>0));
    await restored.waitForFunction(()=>document.querySelector('#messages video')?.readyState>=1);
    assert.equal((await records(restored,'ink'))[0].title,'转发后单独编辑');
    assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
    console.log('PASS complete backup/restore retains all forwarded media and editable handwriting; no page errors or external requests');
    await second.close();await context.close();
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
