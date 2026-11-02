/* Real Java-unpacked fixtures + simulated Android bridge under the packaged CSP. */
const {chromium}=require('playwright');
const {expect}=require('playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const fixtures=JSON.parse(fs.readFileSync(path.join(root,'releases/wechat-fixtures.json'),'utf8'));
async function rows(page,store){return page.evaluate(async store=>{const db=await new Promise(r=>{const q=indexedDB.open('ziyan-local-v1',2);q.onsuccess=()=>r(q.result);});const data=await new Promise(r=>{const q=db.transaction(store).objectStore(store).getAll();q.onsuccess=()=>r(q.result);});db.close();return data;},store);}
(async()=>{
 const {parseChat,chatFileIndexes}=await import('data:text/javascript;base64,'+fs.readFileSync(path.join(root,'dist/chat-import.js')).toString('base64'));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH});
 try{
  const context=await browser.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{
   window.inbox=[];window.exports=[];window.failWechat=false;
   window.ZiyanAndroid={version:()=> '0.9.0',copyText:()=>true,beginSave:(name,mime)=>{const token=crypto.randomUUID();exports.push({token,chunks:[]});return token;},writeSave:(token,data)=>{exports.find(e=>e.token===token).chunks.push(data);return true;},finishSave:token=>queueMicrotask(()=>ZiyanFiles.receive(token,true,'')),abortSave:()=>{}};
   window.ZiyanShareInbox={pending:()=>JSON.stringify(inbox),discard:token=>{inbox=inbox.filter(x=>x.token!==token);},read:(token,i,offset)=>atob(inbox.find(x=>x.token===token).files[i].base64).slice(offset,offset+192*1024)};
   const read=ZiyanShareInbox.read;ZiyanShareInbox.read=(...args)=>btoa(read(...args));
   for(const method of ['put','add']){const original=IDBObjectStore.prototype[method];IDBObjectStore.prototype[method]=function(...args){if(failWechat&&this.name==='media')throw new DOMException('fixture','QuotaExceededError');return original.apply(this,args);};}
  });
  const page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!/^(https:\/\/ziyan.local\/|blob:|data:)/.test(r.url()))external.push(r.url());});
  await page.route('https://ziyan.local/**',r=>r.fulfill({body:fs.readFileSync(path.join(root,'android/build/assets/web/index.html')),contentType:'text/html',headers:{'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob: data:; media-src blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'"}}));
  await page.goto('https://ziyan.local/');await expect(page.locator('.project')).toHaveCount(1);await page.locator('.project').click();await page.locator('#message-input').fill('保留的项目草稿');
  assert.equal(await page.locator('[data-action="share-diagnostics"]').count(),0);
  let expectedRecords=0,expectedMedia=0;
  for(let i=0;i<fixtures.length;i++){
   const fixture={...fixtures[i],token:'wechat-'+i,created:i};
   await page.evaluate(f=>{inbox.push(f);ZiyanShares.available();},fixture);
   await expect(page.locator('.share-preview h3')).toHaveText('接收微信聊天记录');await expect(page.locator('#chat-summary')).toContainText('共');const needs=await page.locator('#chat-fallback').isVisible();if(needs)await page.locator('#chat-fallback-confirm').check();await expect(page.locator('#share-save')).toBeEnabled();
   const parsed=await parseChat(fixture.text);await expect(page.locator('#share-text')).toHaveValue(parsed.messages[0].text);
   function tree(rows){return rows.flatMap(m=>[m,...tree(m.children||[])]);}const images=[...new Set(tree([parsed.messages[0]]).flatMap(m=>chatFileIndexes(m.text,fixture.files)))].map(i=>fixture.files[i]).filter(f=>f.mime.startsWith('image/'));
   await expect(page.locator('#share-wechat-preview img')).toHaveCount(images.length);
   if(images.length)await expect.poll(()=>page.locator('#share-wechat-preview img').evaluateAll(list=>list.every(e=>e.complete&&e.naturalWidth>0))).toBe(true);
   if(fixture.name==='image.zip'){
    await expect(page.locator('#share-wechat-preview script')).toHaveCount(0);await expect(page.locator('#share-wechat-preview')).toContainText('<script>bad()</script>');
    await expect(page.locator('#share-wechat-preview img').first()).toHaveAttribute('alt','first.png');await expect(page.locator('#share-wechat-preview img').last()).toHaveAttribute('alt','second.png');
    await page.screenshot({path:path.join(root,'screenshots/wechat-import.png')});
    await page.evaluate(()=>failWechat=true);await page.locator('#share-save').click();await expect(page.locator('#share-status')).toContainText('未保存任何分享记录');
    assert.equal((await rows(page,'messages')).length,expectedRecords);assert.equal((await rows(page,'media')).length,expectedMedia);
    await page.evaluate(()=>failWechat=false);
   }
   if(fixture.name==='single.zip')await page.locator('#share-text').fill(parsed.messages[0].text+'（已编辑）');
   await page.locator('#share-save').click();await expect(page.locator('.share-preview')).toHaveCount(0);
   expectedRecords+=parsed.messages.length;expectedMedia+=fixture.files.length;
   assert.equal((await rows(page,'messages')).length,expectedRecords);assert.equal((await rows(page,'media')).length,expectedMedia);
   await expect(page.locator('#message-input')).toHaveValue('保留的项目草稿');
  }
  // Cancel an actual parsed archive, preserving all prior records and the project draft.
  await page.evaluate(f=>{inbox.push({...f,token:'cancelled',created:100});ZiyanShares.available();},fixtures[3]);
  await expect(page.locator('#share-save')).toBeEnabled();await page.evaluate(()=>ziyanGoBack());await expect(page.locator('.share-preview')).toHaveCount(0);
  assert.equal((await rows(page,'messages')).length,expectedRecords);await expect(page.locator('#message-input')).toHaveValue('保留的项目草稿');
  assert.equal(await page.evaluate(()=>inbox.length),0);
  await page.evaluate(()=>ziyanGoBack());await page.locator('.mobile-nav [data-page="settings"]').click();await page.locator('[data-action="export"]').click();await expect(page.locator('#toast')).toHaveText('完整备份已保存');
  const backup=await page.evaluate(()=>JSON.parse(new TextDecoder().decode(Uint8Array.from(exports.at(-1).chunks.map(atob).join(''),c=>c.charCodeAt(0)))));
  assert.equal(backup.messages.length,expectedRecords);assert.equal(backup.media.length,expectedMedia);
  const originals=fixtures.flatMap(f=>f.files.map(x=>x.base64));assert.deepEqual(backup.media.map(x=>x.data.split(',')[1]).sort(),originals.sort());
  await page.locator('#backup-input').setInputFiles({name:'wechat-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.locator('#confirm-action').click();await expect(page.locator('#toast')).toHaveText('备份已恢复');
  assert.equal((await rows(page,'messages')).length,expectedRecords);assert.equal((await rows(page,'media')).length,expectedMedia);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS '+fixtures.length+' Java-unpacked synthetic/real archives: editable text, inline image order, escaped content, video attachment, atomic failure/retry, cancel/drafts, exact media backup round trip, no diagnostics/external requests');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
