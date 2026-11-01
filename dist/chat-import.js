// WeChat's explicit export markers are boundaries; blank lines alone never are.
export async function parseChat(text, mode='auto', cancelled=()=>false) {
  if(typeof text!=='string'||new TextEncoder().encode(text).length>8*1024*1024)throw new Error('聊天正文上限为 8MB UTF-8');
  const markers=[],re=/^·([^\n]*)(?:\n|$)/gm;let m,n=0;
  while((m=re.exec(text))){
    const next=text.slice(re.lastIndex,text.indexOf('\n',re.lastIndex)<0?text.length:text.indexOf('\n',re.lastIndex)).trim();
    const timestamp=/^\d{4}[/-]\d{1,2}[/-]\d{1,2} \d{1,2}:\d{2}(?::\d{2})?$/.test(next);
    markers.push({at:m.index,end:re.lastIndex,label:m[1],time:timestamp?next:null,body:timestamp?re.lastIndex+next.length+1:re.lastIndex});
    if(markers.length>20000)throw new Error('一次聊天最多 20000 条消息');
    if(++n%128===0){await new Promise(r=>setTimeout(r,0));if(cancelled())throw new Error('已取消');}
  }
  const combined=markers.length&&markers[0].at===0&&markers.every(x=>x.time);
  const individual=markers.length&&markers[0].at===0&&markers.every(x=>!x.time&&(x.at===0||text.slice(Math.max(0,x.at-2),x.at)==='\n\n'));
  const detected=combined?'combine':individual?'individual':'raw';
  const format=mode==='auto'?detected:mode;
  if(format==='combine'&&!combined)throw new Error('未识别到完整的发送者＋时间标题，请选择保留原文');
  if(format==='individual'&&!individual)throw new Error('未识别到逐条导出标记，请选择保留原文');
  const messages=format==='raw'?[{sender:null,time:null,text}]:markers.map((x,i)=>({sender:format==='combine'?x.label.trim()||null:null,time:format==='combine'?x.time:null,text:format==='combine'?text.slice(x.body,markers[i+1]?.at??text.length).replace(/\n+$/,''):text.slice(x.at+1,markers[i+1]?.at??text.length).replace(/\n+$/,'')}));
  if(messages.some(x=>x.text.length>2000000))throw new Error('单条原消息超过 200 万字；不会自动切成多条消息');
  return {format,detected,messages,needsConfirmation:format==='raw'};
}
export function chatFileIndexes(text, files){
  const names=new Map(files.map((f,i)=>[f.name,i])),indexes=[];
  const refs=/^\s*·?\[(?:Photo|Image|Video|File|图片|视频|文件)\] (.+)$/gm;let m;
  while((m=refs.exec(text))){const i=names.get(m[1].trim());if(i===undefined)throw new Error('聊天引用的附件缺失');if(!indexes.includes(i))indexes.push(i);}
  return indexes;
}
