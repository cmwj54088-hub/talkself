const {chromium}=require('playwright');
const {expect}=require('playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
async function rows(page,store){return page.evaluate(async store=>{const db=await new Promise(r=>{const q=indexedDB.open('ziyan-local-v1',2);q.onsuccess=()=>r(q.result);});const data=await new Promise(r=>{const q=db.transaction(store).objectStore(store).getAll();q.onsuccess=()=>r(q.result);});db.close();return data;},store);}
(async()=>{
 const {parseChat}=await import('data:text/javascript;base64,'+fs.readFileSync(path.join(root,'dist/chat-import.js')).toString('base64'));
 assert.equal((await parseChat('·甲\n2026/10/31 20:40\n正文\n\n内部空行')).messages.length,1);
 assert.equal((await parseChat('普通原文\n\n第二段')).format,'raw');
 await assert.rejects(()=>parseChat('字'.repeat(2800000)),/8MB/);
 await assert.rejects(()=>parseChat('·'+'a'.repeat(2000001)),/200 万字/);
 await assert.rejects(()=>parseChat(Array.from({length:20001},()=> '·条目').join('\n\n')),/20000/);
 await assert.rejects(()=>parseChat(Array.from({length:300},()=> '·条目').join('\n\n'),'auto',()=>true),/取消/);
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH});
 try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(()=>{
  window.inbox=[];window.exports=[];window.failStore='';window.reminderCalls=[];
  window.ZiyanAndroid={version:()=> '0.11.0',copyText:()=>true,reminderPermission:()=>true,syncTaskReminders:data=>reminderCalls.push(JSON.parse(data)),beginSave:(name,mime)=>{const token=crypto.randomUUID();exports.push({name,token,chunks:[]});return token;},writeSave:(token,data)=>{exports.find(e=>e.token===token).chunks.push(data);return true;},finishSave:token=>queueMicrotask(()=>ZiyanFiles.receive(token,true,'')),abortSave:()=>{}};
  window.ZiyanShareInbox={pending:()=>JSON.stringify(inbox),discard:token=>{inbox=inbox.filter(x=>x.token!==token);},read:(token,i,offset)=>btoa(atob(inbox.find(x=>x.token===token).files[i].base64).slice(offset,offset+192*1024)),readText:(token,offset)=>{const bytes=new TextEncoder().encode(inbox.find(x=>x.token===token).fullText);return btoa(Array.from({length:Math.ceil(Math.min(192*1024,bytes.length-offset)/8192)},(_,i)=>String.fromCharCode(...bytes.slice(offset+i*8192,Math.min(offset+(i+1)*8192,offset+192*1024)))).join(''));}};
  for(const method of ['put','add']){const original=IDBObjectStore.prototype[method];IDBObjectStore.prototype[method]=function(...args){if(failStore===this.name)throw new DOMException('synthetic','QuotaExceededError');return original.apply(this,args);};}
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://ziyan.local/**',r=>r.fulfill({body:fs.readFileSync(path.join(root,'android/build/assets/web/index.html')),contentType:'text/html'}));
 await page.goto('https://ziyan.local/');await expect(page.locator('.project')).toHaveCount(1);
 const pid=(await rows(page,'projects'))[0].id;
 await page.evaluate(async ({pid,png})=>{
  const db=await new Promise(r=>{const q=indexedDB.open('ziyan-local-v1',2);q.onsuccess=()=>r(q.result);});
  await new Promise((r,j)=>{const tx=db.transaction(['projects','tasks','media'],'readwrite');for(const id of ['target-a','target-b'])tx.objectStore('projects').add({id,name:id,emoji:'🌱',created:1,updated:1});tx.objectStore('media').put({id:'old-image',blob:new Blob([Uint8Array.from(atob(png),c=>c.charCodeAt(0))],{type:'image/png'})});tx.objectStore('tasks').add({id:'old-task',projectId:pid,text:'历史待办',created:123456789,done:true,images:['old-image'],dueDate:'2027-03-02',reminderDate:'2027-03-01',reminderTime:'09:00',reminderEnabled:true});tx.oncomplete=r;tx.onerror=()=>j(tx.error);});db.close();
 },{pid,png});
 await page.reload();await page.locator(`[data-project="${pid}"]`).click();
 await expect(page.locator('.task-message')).toHaveCount(1);await expect(page.locator('.stream-task')).toHaveClass(/done/);
 await page.locator('.stream-task [data-toggle]').click();await expect(page.locator('.stream-task')).not.toHaveClass(/done/);
 await page.locator('.taskbar-toggle').click();await expect(page.locator('.bar-task')).toHaveCount(1);
 await page.locator('.bar-task [data-toggle]').click();await expect(page.locator('.bar-task')).toHaveCount(0);await expect(page.locator('.stream-task')).toHaveClass(/done/);
 assert.equal((await rows(page,'tasks'))[0].created,123456789);assert.equal((await rows(page,'messages')).length,0);
 await page.locator('.task-message').dispatchEvent('contextmenu',{clientX:180,clientY:300});await page.locator('#forward-task').click();
 await expect(page.locator('.forward-search')).toContainText('未完成待办');
 for(const id of ['target-a','target-b'])await page.locator(`[data-forward-project="${id}"]`).click();
 await page.evaluate(()=>failStore='media');await page.locator('#forward-confirm').click();await expect(page.locator('#toast')).toContainText('空间不足');assert.equal((await rows(page,'tasks')).length,1);
 await page.evaluate(()=>failStore='');await page.locator('#forward-confirm').click();await expect(page.locator('#dialog')).not.toBeVisible();
 const taskCopies=await rows(page,'tasks');assert.equal(taskCopies.length,3);
 for(const t of taskCopies.filter(t=>t.id!=='old-task')){assert.equal(t.done,false);assert.equal(t.reminderEnabled,false);assert.equal(t.dueDate,'2027-03-02');assert.notEqual(t.images[0],'old-image');}
 assert.equal(new Set(taskCopies.flatMap(t=>t.images)).size,3);
 // Toggle a target's copy; original and other target remain independent.
 await page.evaluate(()=>ziyanGoBack());await page.locator('[data-project="target-a"]').click();await page.locator('.stream-task [data-toggle]').click();
 const after=await rows(page,'tasks');assert.equal(after.find(t=>t.projectId==='target-a').done,true);assert.equal(after.find(t=>t.projectId==='target-b').done,false);assert.equal(after.find(t=>t.id==='old-task').done,true);
 await page.evaluate(()=>ziyanGoBack());await page.locator(`[data-project="${pid}"]`).click();
 console.log('PASS C04/C05 historical IDs/times, stream completion/drawer sync, multi-target task forwarding, independent IDs/state/media, atomic rollback');
 // Expanded composer uses the existing rich editor and shared draft in both modes.
 await page.locator('#message-input').fill('全屏草稿');await page.locator('[data-action="expand-composer"]').click();
 await expect(page.locator('.note-editor #rich-body')).toHaveText('全屏草稿');await page.screenshot({path:path.join(root,'screenshots/c03-composer-fullscreen.png')});await page.locator('#rich-body').fill('全屏返回后保留');
 await page.locator('#editor-image-input').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await expect(page.locator('#rich-body img')).toHaveCount(1);await page.locator('[data-editor="back"]').click();
 await expect(page.locator('#message-input')).toHaveValue('全屏返回后保留');assert.equal((await rows(page,'messages')).length,0);
 await page.locator('[data-action="task-mode"]').click();await page.locator('[data-action="expand-composer"]').click();await expect(page.locator('#task-body')).toHaveValue('全屏返回后保留');await expect(page.locator('#task-images img')).toHaveCount(1);
 await page.locator('#task-due').fill('2027-04-01');await page.locator('#task-body').fill('新待办一\n新待办二');await page.locator('[data-editor="back"]').click();
 await expect(page.locator('#message-input')).toHaveValue('新待办一\n新待办二');await page.locator('[data-action="task-mode"]').click();await page.locator('[data-action="expand-composer"]').click();await expect(page.locator('#rich-body img')).toHaveCount(1);await page.locator('[data-editor="back"]').click();await expect(page.locator('.note-editor')).toHaveCount(0);await page.locator('[data-action="task-mode"]').click();await page.locator('[data-action="expand-composer"]').click();await expect(page.locator('#task-due')).toHaveValue('2027-04-01');await page.locator('[data-editor="done"]').dblclick();await expect(page.locator('.note-editor')).toHaveCount(0);
 assert.equal((await rows(page,'tasks')).length,5);assert.equal((await rows(page,'tasks')).filter(t=>t.text.startsWith('新待办')).every(t=>t.dueDate==='2027-04-01'),true);assert.equal((await rows(page,'messages')).length,0);await expect(page.locator('.task-message')).toHaveCount(3);await expect(page.locator('#message-input')).toHaveValue('');await page.screenshot({path:path.join(root,'screenshots/c04-task-stream.png')});
 await page.locator('.task-message').first().dispatchEvent('contextmenu',{clientX:180,clientY:300});await page.locator('#edit-task').click();await expect(page.locator('.note-editor #task-body')).toBeVisible();await page.locator('[data-editor="back"]').click();await expect(page.locator('.note-editor')).toHaveCount(0);
 console.log('PASS C03 actual note editor reuse, note/task shared draft and image round trip, back without send, task batch save without duplicate');
 await page.locator('#message-input').fill('导入不改变草稿');
 async function share(f){await page.evaluate(f=>{inbox.push(f);ZiyanShares.available();},f);await expect(page.locator('.share-preview')).toBeVisible();await expect(page.locator('#chat-summary')).toContainText('共');if(await page.locator('#chat-fallback').isVisible())await page.locator('#chat-fallback-confirm').check();await expect(page.locator('#share-save')).toBeEnabled();}
 const files=[{name:'photo.png',mime:'image/png',size:Buffer.from(png,'base64').length,base64:png},{name:'clip.mp4',mime:'video/mp4',size:3,base64:'YWJj'}];
 const combined='·甲\n2026/10/31 20:40\n第一段\n\n消息内部空行\n[Photo] photo.png\n[Video] clip.mp4\n\n·甲\n2026/10/31 20:40\n第二次发送\n\n·乙\n2026/10/31 20:41\n尾条';
 await share({token:'combine',wechat:true,text:combined,files,created:1});await expect(page.locator('#chat-summary')).toContainText('共 3 条消息');await expect(page.locator('#share-wechat-preview img')).toHaveCount(1);await expect(page.locator('#share-wechat-preview video')).toHaveCount(1);
 await page.locator('#share-text').fill('修改后去掉引用');await page.locator('#share-save').click();await expect(page.locator('#share-status')).toContainText('附件未关联');assert.equal((await rows(page,'messages')).length,0);await page.locator('#share-text').fill('不存在\n[Photo] missing.png');await page.locator('#share-save').click();await expect(page.locator('#share-status')).toContainText('附件缺失');await page.locator('#share-text').fill('第一段\n\n消息内部空行\n[Photo] photo.png\n[Video] clip.mp4');await page.evaluate(()=>failStore='media');await page.locator('#share-save').click();await expect(page.locator('#share-status')).toContainText('未保存任何分享记录');assert.equal((await rows(page,'messages')).length,0);
 await page.evaluate(()=>failStore='');await page.locator('#share-save').click();await expect(page.locator('.share-preview')).toHaveCount(0);
 let imported=await rows(page,'messages');assert.equal(imported.length,3);const sorted=imported.sort((a,b)=>a.origin.order-b.origin.order);assert.deepEqual(sorted.map(m=>m.origin.sender),['甲','甲','乙']);assert.equal(sorted[0].attachments.length,1);assert(sorted[0].text.includes('消息内部空行'));assert.equal(sorted[0].origin.time,sorted[1].origin.time);
 await expect(page.locator('#message-input')).toHaveValue('导入不改变草稿');
 await share({token:'individual',wechat:true,text:'·逐条一\n正文换行\n\n仍为同条\n\n·逐条二',files:[],created:2});await expect(page.locator('#chat-summary')).toContainText('共 2 条消息');await page.locator('#share-save').click();await expect(page.locator('.share-preview')).toHaveCount(0);
 imported=await rows(page,'messages');assert.equal(imported.length,5);assert.equal(imported.filter(m=>m.origin.sender===null&&m.origin.time===null).length,2);
 // Actual chunked native text path with UTF-8 split at a chunk boundary and a >50K single message.
 const large='·长文\n2026/10/31 20:40\n'+'字'.repeat(70000)+'\n\n·长文\n2026/10/31 20:40\n'+'末'.repeat(70000);
 await share({token:'large',wechat:true,text:'',fullText:large,transcriptSize:Buffer.byteLength(large),files:[],created:3});await expect(page.locator('#chat-summary')).toContainText('共 2 条消息');await expect(page.locator('#share-text')).toHaveValue('字'.repeat(70000));await page.locator('#share-save').click();await expect(page.locator('.share-preview')).toHaveCount(0);
 imported=await rows(page,'messages');assert.equal(imported.length,7);assert.equal(imported.filter(m=>m.text.length===70000).length,2);
 // Paged preview does not create one DOM node per message; loading older stream remains bounded.
 const many=Array.from({length:160},(_,i)=>'·发送 '+i).join('\n\n');await share({token:'many',wechat:true,text:many,files:[],created:4});await expect(page.locator('#chat-summary')).toContainText('共 160 条消息');await expect(page.locator('#chat-pages button')).toHaveCount(20);await page.locator('#share-save').click();await expect(page.locator('.share-preview')).toHaveCount(0);await expect(page.locator('.message')).toHaveCount(60);
 await page.locator('[data-action="older"]').click();await expect(page.locator('.message')).toHaveCount(120);
 // Unknown grammar requires explicit raw confirmation; blank lines never create arbitrary messages.
 await page.evaluate(()=>{inbox.push({token:'raw',wechat:true,text:'无格式正文\n\n第二段',files:[],created:5});ZiyanShares.available();});await expect(page.locator('#chat-fallback')).toBeVisible();await expect(page.locator('#share-save')).toBeDisabled();await page.locator('#chat-fallback-confirm').check();await page.locator('#share-save').click();await expect(page.locator('.share-preview')).toHaveCount(0);
 console.log('PASS C01/C02 combine and individual, equal sender/time order, multiline/media association, unknown metadata, raw confirmation, 140K chunked UTF-8, 160-message paged preview/render, import rollback');
 // Read/export/edit/forward/backup preserve original metadata and attached video.
 await page.evaluate(()=>ziyanGoBack());await page.locator('.mobile-nav [data-page="settings"]').click();await page.locator('[data-action="export"]').click();await expect(page.locator('#toast')).toHaveText('完整备份已保存');
 const backup=await page.evaluate(()=>JSON.parse(new TextDecoder().decode(Uint8Array.from(exports.at(-1).chunks.map(atob).join(''),c=>c.charCodeAt(0)))));
 assert.equal(backup.tasks.length,5);assert.equal(backup.messages.length,168);
 await page.locator('#backup-input').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.locator('#confirm-action').click();await expect(page.locator('#toast')).toHaveText('备份已恢复');assert.equal((await rows(page,'tasks')).length,5);assert.equal((await rows(page,'messages')).length,168);
 await page.reload();await page.locator(`[data-project="${pid}"]`).click();await page.locator('[data-action="older"]').click();await page.locator('[data-action="older"]').click();
 const original=backup.messages.find(m=>m.attachments?.length);await page.locator(`#messages [data-message="${original.id}"]`).dispatchEvent('contextmenu',{clientX:180,clientY:300});await page.locator('#edit-message').click();await page.locator('#rich-body').press('End');await page.locator('[data-editor="done"]').click();const edited=(await rows(page,'messages')).find(m=>m.id===original.id);assert.deepEqual(edited.origin,original.origin);assert.deepEqual(edited.attachments,original.attachments);assert.equal(edited.created,original.created);
 await page.locator(`#messages [data-message="${original.id}"]`).dispatchEvent('contextmenu',{clientX:180,clientY:300});await page.locator('#forward-message').click();await page.locator('.forward-targets [data-forward-project="target-b"]').click();await page.locator('#forward-confirm').click();await expect(page.locator('#dialog')).not.toBeVisible();const copy=(await rows(page,'messages')).find(m=>m.projectId==='target-b');assert.deepEqual(copy.origin,original.origin);assert.notEqual(copy.attachments[0].id,original.attachments[0].id);
 await page.locator('[data-action="details"]').click();await page.locator('#export-project').click();await expect.poll(()=>page.evaluate(()=>exports.at(-1)?.name||'')).toContain('.zip');
 // Reload twice: derived task bubbles do not materialize duplicate records.
 await page.reload();await page.reload();assert.equal((await rows(page,'tasks')).length,5);assert.equal((await rows(page,'messages')).length,169);
 await page.locator(`[data-project="${pid}"]`).click();await page.locator('#message-input').fill('底部发送保留附件');await page.locator('[data-action="expand-composer"]').click();await page.locator('#editor-image-input').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await expect(page.locator('#rich-body img')).toHaveCount(1);await page.locator('[data-editor="back"]').click();await expect(page.locator('.note-editor')).toHaveCount(0);await page.locator('[data-action="expand-composer"]').click();await page.locator('#rich-body').evaluate(el=>{el.firstElementChild.firstChild.textContent='底部修改后发送';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('[data-editor="done"]').click();await expect(page.locator('.note-editor')).toHaveCount(0);await expect(page.locator('#message-input')).toHaveValue('');assert.equal((await rows(page,'messages')).length,170);const bottomSent=(await rows(page,'messages')).find(m=>m.text==='底部修改后发送');assert(bottomSent.html.includes('data-media='));
 assert.deepEqual(errors,[]);console.log('PASS v3 backup restore/reload, no duplicated tasks, imported metadata/video retained on edit/forward/Markdown; no page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
