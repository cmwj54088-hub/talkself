export function createInkEditor(api) {
  const { $, icon, esc, id, request, toast, failure, onClose, onSave } = api;
  const W = 1000, H = 1400;
  let root, canvas, ctx, doc, index = 0, sourceId, draftId;
  let tool = 'pen', color = '#ededed', width = 4, fingerDraw = true;
  let view = { x: 0, y: 0, scale: 1 }, operation, gesture, pointers = new Map();
  let selected = new Set(), lasso = [], undoStack = [], redoStack = [], timer, resizeObserver;
  let writes = Promise.resolve(), dirty = false, closing = false;
  const current = () => doc.pages[index];
  const clone = value => structuredClone(value);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const point = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const scene = p => ({ x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale });
  const inPage = p => p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;
  function toolbarButton(action, text, i) { return `<button type="button" data-ink-action="${action}" aria-label="${text}">${i ? icon(i) : ''}<span>${text}</span></button>`; }
  async function open(projectId, messageId) {
    if (root) return;
    closing = false; sourceId = messageId || null;
    draftId = `draft-${projectId}-${messageId || 'new'}`;
    const [draft, saved] = await Promise.all([request('ink', 'get', draftId), messageId ? request('ink', 'get', messageId) : Promise.resolve(null)]);
    if (messageId && !saved && !draft) throw new Error('找不到原始笔迹');
    doc = clone(draft || saved || { id: id(), projectId, title: '手写笔记', pages: [{ paper: 'grid', strokes: [] }], pageIndex: 0 });
    if (!sourceId && draft) doc.id = id();
    index = Math.min(doc.pageIndex || 0, doc.pages.length - 1);
    dirty = false; operation = null; gesture = null; pointers.clear(); selected.clear(); undoStack = []; redoStack = [];
    root = document.createElement('section'); root.className = 'ink-editor'; root.setAttribute('aria-label', '手写笔记编辑器');
    root.innerHTML = `<header class="ink-head"><button class="icon-btn" data-ink-action="back" aria-label="返回聊天">${icon('back')}</button><input id="ink-title" aria-label="手写笔记标题" maxlength="100" value="${esc(doc.title)}"><button class="send" data-ink-action="save">完成</button></header><div class="ink-tools">${toolbarButton('pen', '笔', 'note')}${toolbarButton('eraser', '橡皮')}${toolbarButton('lasso', '套索')}${toolbarButton('pan', '移动')}${toolbarButton('undo', '撤销')}${toolbarButton('redo', '重做')}</div><div class="ink-options"><label>粗细 <input id="ink-width" type="range" min="1" max="16" step="1" value="${width}" aria-label="笔画粗细"></label><button id="ink-color" aria-label="切换白色或绿色笔迹">${color === '#ededed' ? '白笔' : '绿笔'}</button><select id="ink-paper" aria-label="纸张类型"><option value="grid">方格</option><option value="lines">横线</option><option value="blank">空白</option></select><button id="ink-finger">${fingerDraw ? '手指：书写' : '手指：移动'}</button></div><div class="ink-stage"><canvas id="ink-canvas" aria-label="手写画布"></canvas></div><div class="ink-selection-tools" hidden><span>拖动选区移动 · 拖动右下角缩放</span><button data-ink-action="delete-selection">删除选区</button><button data-ink-action="deselect">取消选区</button></div><footer class="ink-footer"><button data-ink-action="prev" aria-label="上一页">‹</button><span id="ink-page-count"></span><button data-ink-action="next" aria-label="下一页">›</button><button data-ink-action="add-page">＋ 加页</button><button data-ink-action="delete-page">删页</button><button data-ink-action="fit">适配</button></footer><div class="ink-status"><span id="ink-save-state">已载入 · 自动保存草稿</span><span id="ink-zoom"></span></div>`;
    document.body.append(root); $('#app').inert = true;
    canvas = $('#ink-canvas'); ctx = canvas.getContext('2d', { alpha: false });
    $('#ink-paper').value = current().paper;
    root.addEventListener('click', e => { const b = e.target.closest('[data-ink-action]'); if (b) action(b.dataset.inkAction).catch(failure); });
    $('#ink-title').oninput = () => { doc.title = $('#ink-title').value; changed(); };
    $('#ink-width').oninput = e => { width = Number(e.target.value); };
    $('#ink-color').onclick = () => { color = color === '#ededed' ? '#3cb474' : '#ededed'; $('#ink-color').textContent = color === '#ededed' ? '白笔' : '绿笔'; };
    $('#ink-paper').onchange = e => { pushUndo(); current().paper = e.target.value; changed(); draw(); };
    $('#ink-finger').onclick = () => { fingerDraw = !fingerDraw; $('#ink-finger').textContent = fingerDraw ? '手指：书写' : '手指：移动'; };
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerEnd);
    canvas.addEventListener('pointercancel', pointerEnd);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { e.preventDefault(); const p = point(e), old = scene(p); view.scale = Math.max(.08, Math.min(3, view.scale * (e.deltaY < 0 ? 1.12 : .89))); view.x = p.x - old.x * view.scale; view.y = p.y - old.y * view.scale; draw(); }, { passive: false });
    resizeObserver = new ResizeObserver(() => resize(false)); resizeObserver.observe($('.ink-stage'));
    tool = 'pen'; resize(true); updateControls();
  }
  function pushUndo() { undoStack.push({ pages: clone(doc.pages), index }); if (undoStack.length > 40) undoStack.shift(); redoStack = []; updateControls(); }
  function changed() {
    dirty = true;
    if ($('#ink-save-state')) $('#ink-save-state').textContent = '正在保存草稿…';
    clearTimeout(timer); timer = setTimeout(() => flush().catch(failure), 180);
    updateControls();
  }
  async function flush() {
    clearTimeout(timer);
    if (root && doc && dirty) {
      const record = clone({ ...doc, id: draftId, draft: true, sourceId, pageIndex: index, updated: Date.now() });
      dirty = false;
      writes = writes.catch(() => {}).then(() => request('ink', 'put', record)).catch(e => { dirty = true; if ($('#ink-save-state')) $('#ink-save-state').textContent = '草稿未保存，请重试'; throw e; });
    }
    await writes;
    if (root && !dirty && $('#ink-save-state')) $('#ink-save-state').textContent = '草稿已保存到本机';
  }
  function fit() {
    const r = canvas.getBoundingClientRect();
    view.scale = Math.min((r.width - 20) / W, (r.height - 20) / H);
    view.x = (r.width - W * view.scale) / 2; view.y = (r.height - H * view.scale) / 2; draw();
  }
  function resize(initial) {
    if (!canvas) return;
    const stage = $('.ink-stage'), dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.max(1, Math.round(stage.clientWidth * dpr)); canvas.height = Math.max(1, Math.round(stage.clientHeight * dpr));
    if (initial) fit(); else draw();
  }
  function paper(c, pg) {
    c.fillStyle = '#111111'; c.fillRect(0, 0, W, H);
    if (pg.paper === 'blank') return;
    c.strokeStyle = '#333333'; c.lineWidth = 1;
    c.beginPath();
    for (let y = 40; y < H; y += 40) { c.moveTo(0, y); c.lineTo(W, y); }
    if (pg.paper === 'grid') for (let x = 40; x < W; x += 40) { c.moveTo(x, 0); c.lineTo(x, H); }
    c.stroke();
  }
  function stroke(c, s) {
    c.strokeStyle = s.color; c.fillStyle = s.color; c.lineCap = 'round'; c.lineJoin = 'round';
    if (s.points.length === 1) { const p = s.points[0]; c.beginPath(); c.arc(p[0], p[1], s.width * (.4 + p[2] * 1.2) / 2, 0, Math.PI * 2); c.fill(); return; }
    for (let i = 1; i < s.points.length; i++) {
      const a = s.points[i - 1], b = s.points[i]; c.lineWidth = s.width * (.4 + (a[2] + b[2]) / 2 * 1.2);
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    }
  }
  function bounds() {
    const points = current().strokes.filter(s => selected.has(s.id)).flatMap(s => s.points);
    if (!points.length) return null;
    let x = Infinity, y = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of points) { x = Math.min(x, p[0]); y = Math.min(y, p[1]); x2 = Math.max(x2, p[0]); y2 = Math.max(y2, p[1]); }
    const pad = 8 / view.scale;
    return { x: x - pad, y: y - pad, w: Math.max(x2 - x + pad * 2, 24 / view.scale), h: Math.max(y2 - y + pad * 2, 24 / view.scale) };
  }
  function draw() {
    if (!canvas || !root) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3), r = canvas.getBoundingClientRect();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#242424'; ctx.fillRect(0, 0, r.width, r.height);
    ctx.save(); ctx.translate(view.x, view.y); ctx.scale(view.scale, view.scale);
    paper(ctx, current()); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    for (const s of current().strokes) stroke(ctx, s); ctx.restore();
    ctx.strokeStyle = '#888888'; ctx.lineWidth = 1 / view.scale; ctx.strokeRect(0, 0, W, H);
    ctx.strokeStyle = '#3cb474'; ctx.lineWidth = 1.5 / view.scale; ctx.setLineDash([5 / view.scale, 4 / view.scale]);
    if (lasso.length) { ctx.beginPath(); lasso.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); }
    const box = bounds();
    if (box) { ctx.strokeRect(box.x, box.y, box.w, box.h); ctx.setLineDash([]); ctx.fillStyle = '#3cb474'; const size = 12 / view.scale; ctx.fillRect(box.x + box.w - size / 2, box.y + box.h - size / 2, size, size); }
    ctx.restore();
    $('#ink-zoom').textContent = Math.round(view.scale * 100) + '% · 双指缩放';
    $('.ink-selection-tools').hidden = !selected.size;
  }
  function segmentDistance(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / len)) : 0;
    return Math.hypot(p.x - a[0] - t * dx, p.y - a[1] - t * dy);
  }
  function erase(p) {
    const radius = 13 / view.scale;
    current().strokes = current().strokes.filter(s => {
      if (s.points.length === 1) return Math.hypot(p.x - s.points[0][0], p.y - s.points[0][1]) > radius + s.width;
      for (let i = 1; i < s.points.length; i++) if (segmentDistance(p, s.points[i - 1], s.points[i]) < radius + s.width / 2) return false;
      return true;
    });
  }
  function insidePolygon(p, poly) {
    let yes = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p[1]) !== (b.y > p[1]) && p[0] < (b.x - a.x) * (p[1] - a.y) / (b.y - a.y) + a.x) yes = !yes;
    }
    return yes;
  }
  function beginGesture() {
    if (operation?.before) { doc.pages = operation.before.pages; index = operation.before.index; undoStack.pop(); }
    operation = null; lasso = [];
    const pts = [...pointers.values()], mid = midpoint(pts[0], pts[1]);
    gesture = { distance: Math.max(1, distance(pts[0], pts[1])), scale: view.scale, anchor: scene(mid) };
  }
  function pointerDown(e) {
    if (e.button > 0 || closing) return;
    // Ignore palm contacts while an active pen is writing.
    if (e.pointerType === 'touch' && [...pointers.values()].some(p => p.type === 'pen')) return;
    e.preventDefault(); const screen = { ...point(e), type: e.pointerType }; pointers.set(e.pointerId, screen); canvas.setPointerCapture(e.pointerId);
    if (pointers.size >= 2) { beginGesture(); return; }
    if (e.pointerType === 'pen') { fingerDraw = false; $('#ink-finger').textContent = '手指：移动'; }
    const p = scene(screen);
    if (tool === 'pan' || (e.pointerType === 'touch' && !fingerDraw)) { operation = { type: 'pan', x: screen.x, y: screen.y, view: { ...view } }; return; }
    if (!inPage(p)) return;
    if (tool === 'lasso') {
      const box = bounds(), margin = 22 / view.scale;
      if (box && Math.hypot(p.x - box.x - box.w, p.y - box.y - box.h) < margin) {
        const before = { pages: clone(doc.pages), index }; pushUndo(); operation = { type: 'scale', before, box, start: p, originals: clone(current().strokes) };
      } else if (box && p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h) {
        const before = { pages: clone(doc.pages), index }; pushUndo(); operation = { type: 'move', before, start: p, originals: clone(current().strokes) };
      } else { selected.clear(); lasso = [p]; operation = { type: 'lasso' }; }
    } else {
      const before = { pages: clone(doc.pages), index }; pushUndo(); selected.clear();
      if (tool === 'eraser') { operation = { type: 'erase', before }; erase(p); }
      else { const s = { id: id(), color, width, points: [[p.x, p.y, e.pointerType === 'pen' ? Math.max(.05, e.pressure) : .5]] }; current().strokes.push(s); operation = { type: 'pen', strokeId: s.id, before }; }
    }
    draw();
  }
  function pointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    e.preventDefault(); const screen = { ...point(e), type: e.pointerType }; pointers.set(e.pointerId, screen);
    if (gesture && pointers.size >= 2) {
      const pts = [...pointers.values()], mid = midpoint(pts[0], pts[1]);
      view.scale = Math.max(.08, Math.min(3, gesture.scale * distance(pts[0], pts[1]) / gesture.distance));
      view.x = mid.x - gesture.anchor.x * view.scale; view.y = mid.y - gesture.anchor.y * view.scale; draw(); return;
    }
    if (!operation) return; const p = scene(screen);
    if (operation.type === 'pan') { view.x = operation.view.x + screen.x - operation.x; view.y = operation.view.y + screen.y - operation.y; }
    else if (operation.type === 'pen') {
      const s = current().strokes.find(s => s.id === operation.strokeId);
      for (const event of e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e]) {
        const q = scene(point(event)); if (inPage(q)) s.points.push([q.x, q.y, event.pointerType === 'pen' ? Math.max(.05, event.pressure) : .5]);
      }
    } else if (operation.type === 'erase') erase(p);
    else if (operation.type === 'lasso') lasso.push(p);
    else if (operation.type === 'move' || operation.type === 'scale') {
      const o = operation, sx = o.type === 'scale' ? Math.max(.1, Math.min(10, (p.x - o.box.x) / o.box.w)) : 1, sy = o.type === 'scale' ? Math.max(.1, Math.min(10, (p.y - o.box.y) / o.box.h)) : 1;
      current().strokes = o.originals.map(s => selected.has(s.id) ? { ...s, width: o.type === 'scale' ? Math.min(30, Math.max(.5, s.width * Math.sqrt(sx * sy))) : s.width, points: s.points.map(pt => [o.type === 'move' ? pt[0] + p.x - o.start.x : o.box.x + (pt[0] - o.box.x) * sx, o.type === 'move' ? pt[1] + p.y - o.start.y : o.box.y + (pt[1] - o.box.y) * sy, pt[2]]) } : s);
    }
    draw();
  }
  function pointerEnd(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (gesture) { if (pointers.size < 2) gesture = null; operation = null; return; }
    if (operation?.type === 'lasso') { selected = new Set(current().strokes.filter(s => s.points.some(p => insidePolygon(p, lasso))).map(s => s.id)); lasso = []; }
    else if (operation && operation.type !== 'pan') changed();
    operation = null; draw(); updateControls();
  }
  function updateControls() {
    if (!root) return;
    root.querySelectorAll('[data-ink-action]').forEach(b => {
      b.classList.toggle('active', ['pen', 'eraser', 'lasso', 'pan'].includes(b.dataset.inkAction) && b.dataset.inkAction === tool);
      if (b.dataset.inkAction === 'undo') b.disabled = !undoStack.length;
      if (b.dataset.inkAction === 'redo') b.disabled = !redoStack.length;
      if (b.dataset.inkAction === 'prev') b.disabled = index === 0;
      if (b.dataset.inkAction === 'next') b.disabled = index === doc.pages.length - 1;
      if (b.dataset.inkAction === 'delete-page') b.disabled = doc.pages.length === 1;
      if (b.dataset.inkAction === 'add-page') b.disabled = doc.pages.length >= 200;
    });
    $('#ink-page-count').textContent = `${index + 1} / ${doc.pages.length} 页`;
    $('#ink-paper').value = current().paper;
  }
  function png(pg) {
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const c = out.getContext('2d'); paper(c, pg); pg.strokes.forEach(s => stroke(c, s));
    return new Promise((resolve, reject) => out.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法生成手写预览图')), 'image/png'));
  }
  function remove() { resizeObserver?.disconnect(); root?.remove(); $('#app').inert = false; root = null; canvas = null; pointers.clear(); }
  async function action(name) {
    if (closing) return;
    if (['pen', 'eraser', 'lasso', 'pan'].includes(name)) { tool = name; selected.clear(); lasso = []; updateControls(); draw(); return; }
    switch (name) {
      case 'back': closing = true; try { await flush(); remove(); onClose(); } catch (e) { closing = false; throw e; } return;
      case 'save': {
        closing = true; $('[data-ink-action="save"]').disabled = true;
        try {
          await flush();
          const finalId = sourceId || id(), saved = clone({ ...doc, id: finalId, title: doc.title.trim() || '手写笔记', pageIndex: index, draftId });
          const blob = await png(doc.pages[0]); await onSave(saved, blob); remove();
        } catch (e) { closing = false; $('[data-ink-action="save"]').disabled = false; throw e; }
        return;
      }
      case 'undo': case 'redo': {
        const from = name === 'undo' ? undoStack : redoStack, to = name === 'undo' ? redoStack : undoStack;
        if (!from.length) return; to.push({ pages: clone(doc.pages), index }); const state = from.pop(); doc.pages = state.pages; index = state.index; selected.clear(); changed(); break;
      }
      case 'prev': case 'next': index = Math.max(0, Math.min(doc.pages.length - 1, index + (name === 'next' ? 1 : -1))); selected.clear(); changed(); fit(); break;
      case 'add-page': if (doc.pages.length >= 200) return; pushUndo(); doc.pages.push({ paper: current().paper, strokes: [] }); index = doc.pages.length - 1; selected.clear(); changed(); fit(); break;
      case 'delete-page': if (doc.pages.length < 2) return; pushUndo(); doc.pages.splice(index, 1); index = Math.min(index, doc.pages.length - 1); selected.clear(); changed(); break;
      case 'delete-selection': if (!selected.size) return; pushUndo(); current().strokes = current().strokes.filter(s => !selected.has(s.id)); selected.clear(); changed(); break;
      case 'deselect': selected.clear(); break;
      case 'fit': fit(); break;
    }
    updateControls(); draw();
  }
  return { open, flush };
}
