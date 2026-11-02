const SAFE_ID = /^[\w-]{1,150}$/;

export function cleanRich(html) {
  const template = document.createElement('template');
  if(String(html||'').length>16000000)throw new Error('图文内容超过 16MB 字符限制');
  template.innerHTML = String(html || '');
  const escape = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function walk(node) {
    if (node.nodeType === 3) return escape(node.textContent);
    if (node.nodeType !== 1) return '';
    let tag = node.tagName.toLowerCase();
    if (['script','style','iframe','object','svg','math','template'].includes(tag)) return '';
    if (tag === 'img') {
      const id = node.getAttribute('data-media');
      return SAFE_ID.test(id || '') ? `<img data-media="${id}" alt="${escape((node.getAttribute('alt') || '图片').slice(0, 200))}">` : '';
    }
    const inner = [...node.childNodes].map(walk).join('');
    if (tag === 'br') return '<br>';
    if (tag === 'b') tag = 'strong';
    if (tag === 'i') tag = 'em';
    if (['h1','h3','h4'].includes(tag)) tag = 'h2';
    if (tag === 'div') tag = 'p';
    return ['p','h2','strong','em','ul','ol','li','blockquote'].includes(tag) ? `<${tag}>${inner}</${tag}>` : inner;
  }
  return [...template.content.childNodes].map(walk).join('');
}
export function richMedia(html) {
  const template = document.createElement('template'); template.innerHTML = cleanRich(html);
  return [...new Set([...template.content.querySelectorAll('img[data-media]')].map(el => el.dataset.media))];
}
export function richText(html) {
  const template = document.createElement('template');
  template.innerHTML = cleanRich(html).replace(/<br>|<\/(?:p|h2|li|blockquote)>/g, '\n');
  return template.content.textContent.trim();
}

export function createNoteEditor(api) {
  const { $, esc, id, request, transaction, toast, failure, openSystemAlarm, onClose, onSave, onDraft } = api;
  let root, kind, projectId, source, key, composer=false, taskPreferences={}, images = [], selection, timer, dirty = false;
  let writes = Promise.resolve(), saving = false, uploading = false, opening = false;
  const urls = new Map();
  const plainHTML = text => '<p>' + esc(text || '').replace(/\n/g, '<br>') + '</p>';
  function snapshot() {
    return { id: key, projectId, kind, composer, sourceId: source?.id || null,
      html: kind === 'note' ? cleanRich($('#rich-body').innerHTML) : (composer?taskPreferences.html||'':''),
      text: kind === 'task' ? $('#task-body').value : richText($('#rich-body').innerHTML),
      reminderEnabled: kind === 'task' ? $('#task-reminder-enabled').checked : !!taskPreferences.reminderEnabled,
      reminderDate: kind === 'task' ? $('#task-reminder-date').value || null : taskPreferences.reminderDate||null,
      reminderTime: kind === 'task' ? $('#task-reminder').value || null : taskPreferences.reminderTime||null,
      dueDate: kind === 'task' ? $('#task-due').value || null : taskPreferences.dueDate||null,
      images: kind === 'task' ? [...images] : richMedia($('#rich-body').innerHTML), updated: Date.now() };
  }
  function changed() {
    if (!root) return;
    dirty = true; $('#editor-state').textContent = '正在保存草稿…';
    clearTimeout(timer); timer = setTimeout(() => flush().catch(failure), 160);
  }
  async function flush() {
    clearTimeout(timer);
    if (root && dirty) {
      const value = snapshot(); dirty = false;
      writes = writes.catch(() => {}).then(() => composer ? onDraft(value) : request('drafts', 'put', value)).catch(e => { dirty = true; throw e; });
    }
    await writes;
    if (root && !dirty) $('#editor-state').textContent = '草稿已保存在本机';
  }
  async function paintImages() {
    if (!root) return;
    for (const el of root.querySelectorAll('img[data-media]')) {
      const mid = el.dataset.media;
      if (!urls.has(mid)) { const media = await request('media','get',mid); if (!media) continue; urls.set(mid,URL.createObjectURL(media.blob)); }
      if (el.isConnected) el.src = urls.get(mid);
    }
  }
  function saveSelection() {
    const s = window.getSelection();
    if (s.rangeCount && $('#rich-body')?.contains(s.anchorNode)) selection = s.getRangeAt(0).cloneRange();
  }
  function restoreSelection() {
    $('#rich-body').focus();
    const s = window.getSelection();
    if (selection && $('#rich-body').contains(selection.commonAncestorContainer)) { s.removeAllRanges(); s.addRange(selection); }
  }
  function command(cmd, value) { restoreSelection(); document.execCommand(cmd,false,value); saveSelection(); changed(); }
  async function open(pid, mode, original, options={}) {
    if (root || opening) return;
    opening=true;
    try {
    composer=!!options.composer;kind = mode; projectId = pid; source = original || null;
    key = composer?`edit-compose-${pid}`:`edit-${kind}-${source?.id || projectId}`;
    const saved = await request('drafts','get',key);
    let data = saved || {html: source?.html || plainHTML(source?.text), text: source?.text || '', images: source?.images || [], dueDate: source?.dueDate || null, reminderTime: source?.reminderTime || null, reminderDate: source?.reminderDate || null, reminderEnabled: source?.reminderEnabled || false};
    if(composer){if(!saved||saved.text!==options.text)data={...data,text:options.text,html:plainHTML(options.text)+(data.images||[]).map(mid=>`<p><img data-media="${mid}" alt="图片"></p>`).join('')};if(kind==='note'&&saved?.kind==='task'&&richText(data.html)!==data.text)data.html=plainHTML(data.text)+(data.images||[]).map(mid=>`<p><img data-media="${mid}" alt="图片"></p>`).join('');}
    taskPreferences=composer?data:{};images = [...(data.images || [])]; selection = null; dirty = false; saving = false;
    root = document.createElement('section'); root.className = 'note-editor'; root.setAttribute('aria-label',kind === 'task' ? '全屏编辑待办' : '全屏编辑笔记');
    root.innerHTML = `<header class="editor-head"><button class="icon-btn" data-editor="back" aria-label="返回聊天">‹</button><h2>${composer?(kind==='task'?'发送待办':'发送笔记'):kind === 'task' ? '编辑待办' : source ? '编辑笔记' : '图文笔记'}</h2><button class="send" data-editor="done">${composer?(kind==='task'?'保存待办':'发送'):'完成'}</button></header>${kind === 'note' ? `<div class="rich-toolbar" role="toolbar" aria-label="文字排版"><span class="toolbar-group"><button data-format="formatBlock" data-value="p">正文</button><button data-format="formatBlock" data-value="h2">标题</button></span><span class="toolbar-group"><button data-format="bold"><strong>加粗</strong></button><button data-format="insertUnorderedList">列表</button><button data-format="insertOrderedList">编号</button></span><span class="toolbar-group"><button data-format="undo" aria-label="撤销编辑">↶</button><button data-format="redo" aria-label="重做编辑">↷</button></span></div><div id="rich-body" class="rich-body rich-content" contenteditable="true" role="textbox" aria-label="笔记正文" aria-multiline="true" data-placeholder="记录正文，可以插入图片…">${cleanRich(data.html)}</div>` : `<div class="task-edit-area"><label for="task-body">${composer?'每行一条待办；图片附在第一条':'待办内容'}</label><textarea id="task-body" maxlength="2000000" aria-label="待办正文">${esc(data.text)}</textarea><p class="created-time">创建于 ${source ? new Date(source.created).toLocaleString('zh-CN') : '保存时自动记录'}</p><label for="task-due">截止日期（可选）</label><div class="due-field"><input id="task-due" type="date" value="${esc(data.dueDate || '')}" aria-label="截止日期"><button data-editor="clear-due">不设置</button></div><p class="date-help">到期日按当天结束计算。</p><label for="task-reminder-date">提醒日期</label><input id="task-reminder-date" type="date" value="${esc(data.reminderDate || '')}" aria-label="提醒日期"><label for="task-reminder">提醒闹钟（可选，与截止日期独立）</label><div class="due-field"><input id="task-reminder" type="time" value="${esc(data.reminderTime || '')}" aria-label="提醒时间"><button data-editor="clear-reminder">清除时间</button></div><label><input id="task-reminder-enabled" type="checkbox" ${data.reminderEnabled?'checked':''}>应用内日期提醒</label><p class="date-help">权限与生效状态请到「设置 → 提醒授权与状态」查看。</p><button class="text-link alarm-open" data-editor="alarm">保存待办并打开系统闹钟</button><p class="date-help">启用应用内提醒需通知和精确闹钟授权，以系统通知发声，受静音、勿扰及通知渠道设置影响。完成、删除或清除会取消应用内预约。系统时钟入口独立管理，不能传入指定年月日。</p><div id="task-images"></div></div>`}<footer class="editor-footer"><button data-editor="image">＋ 插入图片</button><span id="editor-state">内容自动保存到草稿</span></footer><input id="editor-image-input" type="file" accept="image/*" multiple hidden>`;
    document.body.append(root); $('#app').inert = true;
    if (kind === 'task') drawTaskImages(); else paintImages().catch(failure);
    root.addEventListener('input',changed);
    root.addEventListener('change',e => { if (e.target.id === 'editor-image-input') addImages(e.target.files).catch(failure); else changed(); });
    root.addEventListener('pointerdown',e => { if (e.target.closest('[data-format],[data-editor="image"]')) { saveSelection(); e.preventDefault(); } });
    root.addEventListener('click',e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.format) { command(b.dataset.format,b.dataset.value); return; }
      if (b.dataset.removeImage) { images = images.filter(mid=>mid!==b.dataset.removeImage); drawTaskImages(); changed(); return; }
      if (b.dataset.editor === 'image') { if (kind==='note') saveSelection(); $('#editor-image-input').value=''; $('#editor-image-input').click(); }
      if (b.dataset.editor === 'clear-due') { $('#task-due').value=''; changed(); }
      if (b.dataset.editor === 'clear-reminder') { $('#task-reminder').value=''; $('#task-reminder-date').value=''; changed(); }

      if (b.dataset.editor === 'alarm') { const time=$('#task-reminder').value,text=$('#task-body').value.trim();if(!time)return toast('请选择提醒时间');finish(true).then(ok=>{if(ok)openSystemAlarm(time,text);}).catch(failure); }
      if (b.dataset.editor === 'done') finish(true).catch(failure);
      if (b.dataset.editor === 'back') finish(!!source).catch(failure);
    });
    if (kind === 'note') {
      $('#rich-body').addEventListener('keyup',saveSelection); $('#rich-body').addEventListener('pointerup',saveSelection);
      $('#rich-body').addEventListener('paste',e => {
        e.preventDefault(); restoreSelection();
        const html = e.clipboardData.getData('text/html');
        if (html) {
          const template = document.createElement('template'); template.innerHTML = cleanRich(html);
          // Imported clipboard images are not local attachments; use the explicit image picker.
          template.content.querySelectorAll('img').forEach(el=>el.remove());
          document.execCommand('insertHTML',false,template.innerHTML);
        } else document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));
        changed();
      });
    }
    if(composer){const body=$(kind==='task'?'#task-body':'#rich-body');body.focus();if(kind==='task')body.setSelectionRange(body.value.length,body.value.length);else{const range=document.createRange();range.selectNodeContents(body);range.collapse(false);const selected=window.getSelection();selected.removeAllRanges();selected.addRange(range);}}
      } finally { opening=false; }
  }
  function drawTaskImages() {
    $('#task-images').innerHTML = images.map(mid=>`<div class="task-image-item"><img data-media="${mid}" alt="待办图片"><button data-remove-image="${mid}" aria-label="移除图片">×</button></div>`).join('');
    paintImages().catch(failure);
  }
  async function addImages(files) {
    if(uploading) return;
    uploading=true;
    try {
    const list = [...files]; if (!list.length) return;
    if (list.some(f=>!f.type.startsWith('image/'))) throw new Error('请选择图片');
    if (list.some(f=>f.size>200*1024*1024)) throw new Error('单张图片上限为 200MB');
    const count = kind==='task' ? images.length : richMedia($('#rich-body').innerHTML).length;
    if (count+list.length>100) throw new Error('一篇笔记或待办最多附 100 张图片');
    const entries = list.map(f=>({id:id(),blob:f,name:f.name}));
    await transaction(['media'],tx=>entries.forEach(m=>tx.objectStore('media').put({id:m.id,blob:m.blob})));
    if (!root) return;
    if (kind==='task') { images.push(...entries.map(m=>m.id)); drawTaskImages(); }
    else { if(selection)selection.collapse(false);restoreSelection(); document.execCommand('insertHTML',false,entries.map(m=>`<p><img data-media="${m.id}" alt="${esc(m.name)}"></p><p><br></p>`).join('')); saveSelection(); await paintImages(); }
    changed(); await flush();
    } finally {uploading=false;}
  }
  async function finish(commit) {
    if (!root || saving) return;
    if(uploading)return toast('图片正在保存，请稍候');
    saving=true; $('[data-editor="done"]').disabled=true;
    try {
      const data=snapshot();
      if(commit&&kind==='task'&&data.reminderEnabled&&(!data.reminderDate||!data.reminderTime||new Date(data.reminderDate+'T'+data.reminderTime).getTime()<=Date.now()))throw new Error('请选择未来提醒日期和时间');
      if(commit&&kind==='task'&&data.reminderEnabled&&!window.ZiyanAndroid?.reminderPermission?.())throw new Error('请到设置 → 提醒授权与状态开启权限，或关闭应用内提醒');
      if(commit&&!data.text.trim()&&!data.images.length&&!source?.attachments?.length)throw new Error('请填写内容或插入图片');
      if (data.text.length>2000000) throw new Error('单条内容上限为 200 万字');
      await flush();
      if (commit && (data.text.trim() || data.images.length || source?.attachments?.length)) await onSave(kind,projectId,source,data);
      close(); onClose(); return true;
    } catch(e) { saving=false; if(root)$('[data-editor="done"]').disabled=false; throw e; }
  }
  function close() { clearTimeout(timer); root?.remove(); root=null; $('#app').inert=false; for(const url of urls.values())URL.revokeObjectURL(url); urls.clear(); }
  return {open,flush,save:()=>finish(true),back:()=>finish(!!source)};
}
