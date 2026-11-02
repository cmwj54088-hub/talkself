/* Installed only in the APK. No remote resources, server or third-party bridge. */
(() => {
  if (!window.ZiyanAndroid) return;
  const pending = new Map();
  window.ZiyanFiles = {
    async save(blob, name, open=false) {
      const token = ZiyanAndroid.beginSave(name, blob.type || 'application/octet-stream');
      if (!token) throw new Error('已有导出正在进行，或临时空间不足');
      try {
        // Keep each native message small even for videos and large JSON backups.
        for (let offset = 0; offset < blob.size; offset += 192 * 1024) {
          const bytes = new Uint8Array(await blob.slice(offset, offset + 192 * 1024).arrayBuffer());
          let binary = '';
          for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          if (!ZiyanAndroid.writeSave(token, btoa(binary))) throw new Error('导出临时文件写入失败，请检查可用空间');
        }
        return await new Promise((resolve, reject) => {
          pending.set(token, { resolve, reject });
          if(open)ZiyanAndroid.finishOpen(token);else ZiyanAndroid.finishSave(token);
        });
      } catch (e) {
        pending.delete(token); ZiyanAndroid.abortSave(token); throw e;
      }
    },
    async open(blob,name){if(!ZiyanAndroid.finishOpen)throw new Error('当前安装版本不支持外部文件打开，请升级 APK');return this.save(blob,name,true);},
    receive(token, success, error) {
      const item = pending.get(token); if (!item) return;
      pending.delete(token);
      if (error) item.reject(new Error(error)); else item.resolve(!!success);
    }
  };
  if (window.ZiyanShareInbox) window.ZiyanShares = {
    onAvailable: null,
    available() { this.onAvailable?.(); },
    list() { return JSON.parse(ZiyanShareInbox.pending()).sort((a,b)=>a.created-b.created||a.token.localeCompare(b.token)); },
    discard(token) { ZiyanShareInbox.discard(token); },
    async text(token,size,cancelled) {
      if(!Number.isSafeInteger(size)||size<=0||size>8*1024*1024)throw new Error('聊天正文上限为 8MB');
      const decoder=new TextDecoder('utf-8',{fatal:true}),chunks=[];
      for(let offset=0;offset<size;){
        if(cancelled())throw new Error('分享已取消');
        const raw=atob(ZiyanShareInbox.readText(token,offset));
        if(raw.length!==Math.min(192*1024,size-offset))throw new Error('聊天正文读取失败，请重试');
        chunks.push(decoder.decode(Uint8Array.from(raw,c=>c.charCodeAt(0)),{stream:true}));offset+=raw.length;
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      chunks.push(decoder.decode());return chunks.join('');
    },
    async file(token, index, item, cancelled) {
      if (!/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/.test(item.mime) ||
          !Number.isSafeInteger(item.size) || item.size <= 0 || item.size > 200*1024*1024)
        throw new Error('分享附件格式不支持或超过 200MB');
      const chunks=[];
      for (let offset=0;offset<item.size;) {
        if (cancelled()) throw new Error('分享已取消');
        const raw=atob(ZiyanShareInbox.read(token,index,offset));
        if (!raw.length || raw.length!==Math.min(192*1024,item.size-offset)) throw new Error('分享附件读取失败，请重试');
        chunks.push(Uint8Array.from(raw,c=>c.charCodeAt(0))); offset+=raw.length;
        // Yield for progress and cancellation, including large videos.
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      return new File(chunks,item.name,{type:item.mime});
    }
  };
})();
