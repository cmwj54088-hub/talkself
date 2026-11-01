/* Packaged WebView/bridge simulation. This does not replace Android device tests. */
const {chromium}=require('playwright');
const {expect}=require('playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const initial={token:'00000000-0000-0000-0000-000000000001',created:1,text:'冷启动分享 https://example.com/?a=1&b=2',files:[]};
async function rows(page,store){return page.evaluate(async s=>{
 const db=await new Promise(resolve=>{const q=indexedDB.open('ziyan-local-v1',2);q.onsuccess=()=>resolve(q.result);});
 const all=await new Promise(resolve=>{const q=db.transaction(s).objectStore(s).getAll();q.onsuccess=()=>resolve(q.result);});db.close();return all;
},store);}
async function deliver(page,item){await page.evaluate(item=>{shareQueue.push(item);ZiyanShares.available();},item);await expect(page.locator('.share-preview')).toBeVisible();}
(async()=>{
 const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
 try{
  const context=await browser.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true,acceptDownloads:true});
  await context.addInitScript(({initial,png})=>{
   window.shareQueue=[initial];window.shareRemoved=[];window.shareReadFail=false;window.failShareWrite=false;window.testExports=[];
   const bytes=new Uint8Array(600000);for(let i=0;i<bytes.length;i++)bytes[i]=i%256;
   window.shareBytes=bytes;window.sharePng=png;
   window.ZiyanAndroid={version:()=> '0.7.0',copyText:()=>true,beginSave:(name,mime)=>{const token=crypto.randomUUID();testExports.push({token,name,mime,chunks:[]});return token;},writeSave:(token,data)=>{testExports.find(e=>e.token===token).chunks.push(data);return true;},finishSave:token=>queueMicrotask(()=>ZiyanFiles.receive(token,true,'')),abortSave:()=>{}};
   window.ZiyanShareInbox={pending:()=>JSON.stringify(shareQueue),discard:token=>{shareRemoved.push(token);shareQueue=shareQueue.filter(s=>s.token!==token);},read:(token,index,offset)=>{
    if(shareReadFail)return '';
    const item=shareQueue.find(s=>s.token===token).files[index];
    const raw=item.mime.startsWith('image/')?Uint8Array.from(atob(sharePng),c=>c.charCodeAt(0)):item.mime==='video/webm'?window.shareMovie:bytes;
    return btoa(Array.from(raw.slice(offset,offset+192*1024),c=>String.fromCharCode(c)).join(''));
   }};
   for(const method of ['put','add']){const original=IDBObjectStore.prototype[method];IDBObjectStore.prototype[method]=function(...args){if(failShareWrite&&this.name==='media')throw new DOMException('test quota','QuotaExceededError');return original.apply(this,args);};}
  },{initial,png});
  const page=await context.newPage(),errors=[],outside=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith('https://ziyan.local/')&&!/^(blob:|data:)/.test(r.url()))outside.push(r.url());});
  await page.route('https://ziyan.local/**',async route=>{
   assert.equal(new URL(route.request().url()).pathname,'/');
   await route.fulfill({body:fs.readFileSync(path.join(root,'android/build/assets/web/index.html')),contentType:'text/html',headers:{'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob: data:; media-src blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'"}});
  });
  await page.goto('https://ziyan.local/');await expect(page.locator('#share-save')).toBeEnabled();
  await expect(page.locator('#share-text')).toHaveValue(initial.text);
  await page.locator('#share-text').fill('编辑后的链接 https://example.com/?a=1&b=2');
  await page.locator('#share-save').click();await expect(page.locator('.share-preview')).toHaveCount(0);
  assert.equal((await rows(page,'messages'))[0].text,'编辑后的链接 https://example.com/?a=1&b=2');
  // An interrupted cleanup must not replay a committed incoming batch.
  await page.evaluate(initial=>{shareQueue.push(initial);ZiyanShares.available();},initial);
  await expect.poll(()=>page.evaluate(()=>shareQueue.length)).toBe(0);
  assert.equal((await rows(page,'messages')).length,1);
  console.log('PASS cold startup, editable links, confirmation, committed-share replay protection');

  await page.locator('.project').click();await page.locator('#message-input').fill('原项目的未发送草稿');
  const first=(await rows(page,'projects'))[0],target={...first,id:'share-target',name:'分享目标'};
  await page.evaluate(async p=>{const db=await new Promise(r=>{const q=indexedDB.open('ziyan-local-v1',2);q.onsuccess=()=>r(q.result);});await new Promise(r=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(p);tx.oncomplete=r;});db.close();},target);
  // Refresh the local project list through existing UI while retaining the composer.
  await page.locator('[data-action="details"]').click();await page.locator('#pin-project').click();await expect(page.locator('.project')).toHaveCount(2);
  const fixtures=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=240;canvas.height=80;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#111111';ctx.fillRect(0,0,240,80);ctx.fillStyle='#3cb474';ctx.fillRect(18,18,44,44);ctx.fillStyle='#ededed';ctx.font='18px sans-serif';ctx.fillText('Shared locally',76,47);
   sharePng=canvas.toDataURL('image/png').split(',')[1];
   const stream=canvas.captureStream(10),recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),chunks=[];
   const movie=await new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=()=>resolve(new Blob(chunks,{type:'video/webm'}));recorder.start();setTimeout(()=>recorder.stop(),220);});
   stream.getTracks().forEach(t=>t.stop());window.shareMovie=new Uint8Array(await movie.arrayBuffer());return {image:atob(sharePng).length,movie:movie.size};
  });
  // Check full-size native chunk boundaries separately from actual playable preview media.
  assert(await page.evaluate(async()=>{const item={token:'chunk-test',text:'',files:[{name:'chunks.mp4',mime:'video/mp4',size:600000}]};shareQueue.push(item);const file=await ZiyanShares.file(item.token,0,item.files[0],()=>false);shareQueue=shareQueue.filter(s=>s!==item);const got=new Uint8Array(await file.arrayBuffer());return got.length===600000&&[0,196607,196608,599999].every(i=>got[i]===i%256);}));
  const files=[{name:'<第一张>.png',mime:'image/png',size:fixtures.image},{name:'第二张.png',mime:'image/png',size:fixtures.image},{name:'分享视频.webm',mime:'video/webm',size:fixtures.movie}];
  const mixed={token:'00000000-0000-0000-0000-000000000002',created:2,text:'附件说明',files};
  await deliver(page,mixed);await expect(page.locator('#share-save')).toBeEnabled();
  await expect(page.locator('#share-files img')).toHaveCount(2);await expect(page.locator('#share-files video')).toHaveCount(1);
  await expect.poll(()=>page.locator('#share-files img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth===240))).toBe(true);
  await page.waitForFunction(()=>document.querySelector('#share-files video')?.readyState>=1);
  await page.locator('#share-project').selectOption(target.id);
  await page.screenshot({path:path.join(root,'screenshots/share-preview.png')});
  assert(await page.locator('.share-preview').evaluate(e=>e.scrollWidth<=e.clientWidth));
  await page.evaluate(()=>failShareWrite=true);await page.locator('#share-save').click();
  await expect(page.locator('#share-status')).toContainText('未保存任何分享记录');
  assert.equal((await rows(page,'messages')).length,1);assert.equal((await rows(page,'media')).length,0);
  await expect(page.locator('#share-text')).toHaveValue('附件说明');
  await page.evaluate(()=>failShareWrite=false);await page.locator('#share-save').click();
  await expect(page.locator('.share-preview')).toHaveCount(0);
  await expect(page.locator('#message-input')).toHaveValue('原项目的未发送草稿');
  const saved=await rows(page,'messages');assert.equal(saved.filter(m=>m.projectId===target.id).length,4);
  assert.equal((await rows(page,'media')).length,3);
  assert(await page.evaluate(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('ziyan-local-v1',2);q.onsuccess=()=>r(q.result);});const all=await new Promise(r=>{const q=db.transaction('media').objectStore('media').getAll();q.onsuccess=()=>r(q.result);});db.close();const bytes=new Uint8Array(await all.find(m=>m.blob.type==='video/webm').blob.arrayBuffer());return bytes.length===shareMovie.length&&bytes.every((v,i)=>v===shareMovie[i]);}));
  console.log('PASS multi-image/video preview, chunk boundaries, project selection, quota abort, atomic retry, composer preservation');

  // Sharing above an existing editor/dialog cannot close or overwrite them.
  await page.locator('[data-action="attachments"]').click();await page.locator('[data-action="rich-note"]').click();
  await page.locator('.rich-body').fill('完整编辑器中的草稿');
  await deliver(page,{...initial,token:'00000000-0000-0000-0000-000000000003',text:'取消的文字'});
  await page.evaluate(()=>window.ziyanGoBack());await expect(page.locator('.share-preview')).toHaveCount(0);
  await expect(page.locator('.rich-body')).toHaveText('完整编辑器中的草稿');
  assert.equal((await rows(page,'messages')).length,5);
  await page.locator('[data-editor="back"]').click();
  await page.locator('[data-action="details"]').click();await expect(page.locator('#dialog')).toBeVisible();
  await deliver(page,{...initial,token:'00000000-0000-0000-0000-000000000004'});
  await page.locator('#share-cancel').click();await expect(page.locator('#dialog')).toBeVisible();await page.locator('[data-close]').click();

  await page.evaluate(()=>shareReadFail=true);
  await deliver(page,{...mixed,token:'00000000-0000-0000-0000-000000000005',files:[files[0]]});
  await expect(page.locator('#share-retry')).toBeVisible();await expect(page.locator('#share-save')).toBeDisabled();
  await page.locator('#share-text').fill('重试前编辑');await page.evaluate(()=>shareReadFail=false);await page.locator('#share-retry').click();
  await expect(page.locator('#share-save')).toBeEnabled();await expect(page.locator('#share-text')).toHaveValue('重试前编辑');
  await deliver(page,{...initial,token:'00000000-0000-0000-0000-000000000006',text:'下一份分享'});
  await page.locator('#share-cancel').click();await expect(page.locator('#share-text')).toHaveValue('下一份分享');
  await page.locator('#share-cancel').click();await expect(page.locator('.share-preview')).toHaveCount(0);
  await deliver(page,{...mixed,token:'00000000-0000-0000-0000-000000000007',files:[{...files[0],size:200*1024*1024+1}]});
  await expect(page.locator('#share-status')).toContainText('超过 200MB');await expect(page.locator('#share-save')).toBeDisabled();await page.locator('#share-cancel').click();
  console.log('PASS existing editor/dialog preservation, Back cancellation, read failure/retry, queued shares, size rejection');

  // Native staging has been deleted; backup must still include all actual attachment bytes.
  assert.equal(await page.evaluate(()=>shareQueue.length),0);
  await page.evaluate(()=>ziyanGoBack());await page.locator('.mobile-nav [data-page="settings"]').click();
  await page.locator('[data-action="export"]').click();await expect(page.locator('#toast')).toHaveText('完整备份已保存');
  const backup=await page.evaluate(()=>JSON.parse(new TextDecoder().decode(Uint8Array.from(testExports.at(-1).chunks.map(atob).join(''),c=>c.charCodeAt(0)))));
  assert.equal(backup.version,3);assert.equal(backup.media.length,3);assert.equal(backup.messages.length,5);
  const video=backup.messages.find(m=>m.type==='video'),encoded=backup.media.find(m=>m.id===video.id).data.split(',')[1];
  assert.equal(Buffer.from(encoded,'base64').length,fixtures.movie);
  await page.locator('#backup-input').setInputFiles({name:'share-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await page.locator('#confirm-action').click();await expect(page.locator('#toast')).toHaveText('备份已恢复');
  assert.equal((await rows(page,'messages')).length,5);assert.equal((await rows(page,'media')).length,3);
  assert.equal(outside.length,0);assert.deepEqual(errors,[]);
  console.log('PASS full JSON backup round trip after source cleanup, preserved attachment bytes, no external requests');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
