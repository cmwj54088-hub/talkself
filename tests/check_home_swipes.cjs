// Use real touch input: dispatchEvent(pointermove) cannot detect browser pan cancellation.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {});
  try {
    for (const width of [412, 360]) {
      const context = await browser.newContext({viewport: {width, height: 892}, isMobile: true, hasTouch: true, serviceWorkers: 'block'});
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:4173/');
      await page.locator('.project').waitFor();
      await page.evaluate(async () => {
        const db = await new Promise(resolve => {const r = indexedDB.open('ziyan-local-v1', 2); r.onsuccess = () => resolve(r.result);});
        const project = await new Promise(resolve => {const r = db.transaction('projects').objectStore('projects').getAll(); r.onsuccess = () => resolve(r.result[0]);});
        await new Promise((resolve, reject) => {
          const tx = db.transaction('tasks', 'readwrite');
          for (let i = 0; i < 18; i++) tx.objectStore('tasks').put({id: 'swipe-test-' + i, projectId: project.id, text: '滑动测试待办 ' + i, done: false, created: Date.now() + i});
          tx.oncomplete = resolve; tx.onerror = reject;
        });
        db.close();
      });
      await page.reload();
      await page.locator('.project').waitFor();
      const cdp = await context.newCDPSession(page);
      let captured = false;
      async function swipe(selector, dx, dy = 0, reverse = false) {
        // Read all geometry in one JS task so navigation cannot detach a queried
        // element between locating it and reading its bounding box.
        const navGeometry = () => page.locator('#app').evaluate(app => {
          const nav = app.querySelector('.mobile-nav'); if (!nav || !nav.getClientRects().length) return null;
          const r = nav.getBoundingClientRect();
          return {bar:{x:r.x,y:r.y,width:r.width,height:r.height},buttons:[...nav.querySelectorAll('button')].map(el=>{const b=el.getBoundingClientRect();return [b.x,b.y,b.width,b.height];})};
        });
        const navState = await navGeometry(), navBox = navState.bar;
        async function checkFixedNav() {
          assert.deepEqual(await navGeometry(), navState, 'bottom bar and buttons must stay fixed');
        }
        const box = await page.locator(selector).first().boundingBox();
        const x = reverse ? width / 2 - 15 : dx < 0 ? Math.min(box.x + box.width - 18, width - 35) : Math.max(box.x + 18, 35);
        const y = Math.min(box.y + box.height / 2, 500);
        const touch = (type, px, py) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{x: px, y: py, id: 1}]});
        await touch('touchStart', x, y);
        // Leave the long-press slop before slow geometry assertions extend the gesture.
        const initial = dy === 0 ? Math.sign(dx) * Math.min(21, Math.abs(dx)) : 0;
        if (initial) await touch('touchMove', x + initial, y);
        for (let i = 1; i <= 12; i++) {await touch('touchMove', x + initial + (dx - initial) * i / 12, y + dy * i / 12); await page.waitForTimeout(18); await checkFixedNav();}
        if (reverse) {
          for (let i = 1; i <= 12; i++) {await touch('touchMove', x + dx + (130 - dx) * i / 12, y); await page.waitForTimeout(18); await checkFixedNav();}
        }
        if (!dy) {
          assert.ok(await page.locator('#app > .sidebar:visible, #app > .main:visible').evaluate(el => !!el.style.transform), 'content must follow the finger');
          assert.equal(await page.locator('#app').evaluate(el => el.style.transform), '', 'app containing bottom bar must not move');
          assert.equal(await page.locator('.swipe-preview .mobile-nav').count(), 0, 'preview must not duplicate bottom bar');
          const previewBox = await page.locator('.swipe-preview').count() ? await page.locator('.swipe-preview').boundingBox() : null;
          if (previewBox) assert.ok(Math.abs(previewBox.y + previewBox.height - navBox.y) < 1, 'preview must end above bottom bar');
          if (!captured && width === 412) {
            require('node:fs').mkdirSync(require('node:path').join(__dirname, '../screenshots'), {recursive: true});
            await page.screenshot({path: require('node:path').join(__dirname, '../screenshots/home-swipe-fixed-nav.png')});
            captured = true;
          }
        }
        await touch('touchEnd');
        await page.waitForTimeout(70);
        await checkFixedNav();
        await page.waitForTimeout(420);
        await checkFixedNav();
        assert.equal(await page.locator('.swipe-preview').count(), 0);
        assert.equal(await page.locator('#app > .sidebar:visible, #app > .main:visible').evaluate(el => el.style.transform), '');
      }
      const tab = () => page.locator('.mobile-nav:visible .active').getAttribute('data-page');
      await swipe('.project', -170); assert.equal(await tab(), 'tasks');
      await swipe('.task-card .task-text', -170); assert.equal(await tab(), 'settings');
      assert.equal(await page.locator('.inline-task-edit').count(), 0);
      await swipe('[data-action="export"]', 170); assert.equal(await tab(), 'tasks');
      await swipe('.task-card .task-text', 170); assert.equal(await tab(), 'projects');
      assert.equal(await page.locator('#app.in-chat').count(), 0);
      await swipe('.project', -35); assert.equal(await tab(), 'projects');
      await swipe('.project', 130); assert.equal(await tab(), 'projects');
      await swipe('.project', -170);
      await swipe('.task-card .task-text', -100, 0, true); assert.equal(await tab(), 'projects');
      await swipe('.project', -170);
      await swipe('.task-card', 0, -220); assert.equal(await tab(), 'tasks');
      assert.ok(await page.locator('.page').evaluate(el => el.scrollTop > 0), 'vertical touch must scroll');
      await page.locator('.page').evaluate(el => el.scrollTop = 0);
      await page.locator('.task-text').first().tap();
      await page.locator('.inline-task-edit textarea').waitFor();
      await swipe('.inline-task-edit textarea', -170, 1); assert.equal(await tab(), 'tasks');
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px: fixed bottom bar and buttons during drag/animation, content-only preview, both directions, rebound, reversal, vertical scroll, input exclusion, no accidental clicks`);
      await context.close();
    }
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
