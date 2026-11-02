// Only explicit export headers/indentation define messages. Unknown structures retain raw text.
export async function parseChat(text, mode='auto', cancelled=()=>false, depth=0, budget={count:0}) {
  if(depth>8)throw new Error('嵌套聊天最多 8 层');
  if(typeof text!=='string'||new TextEncoder().encode(text).length>8*1024*1024)throw new Error('聊天正文上限为 8MB UTF-8');
  const markers=[],re=/^·([^\n]*)(?:\n|$)/gm;let m,n=0;
  while((m=re.exec(text))){
    const newline=text.indexOf('\n',re.lastIndex),rawNext=text.slice(re.lastIndex,newline<0?text.length:newline),next=rawNext.trim();
    const timestamp=/^\d{4}[/-]\d{1,2}[/-]\d{1,2} \d{1,2}:\d{2}(?::\d{2})?$/.test(next);
    markers.push({at:m.index,label:m[1],time:timestamp?next:null,body:timestamp?re.lastIndex+rawNext.length+1:re.lastIndex});
    if(markers.length>200000)throw new Error('正文候选标记过多，请分批导出');
    if(++n%128===0){await new Promise(r=>setTimeout(r,0));if(cancelled())throw new Error('已取消');}
  }
  const combined=markers.length&&markers[0].at===0&&!!markers[0].time;
  const individual=markers.length&&markers[0].at===0&&markers.every(x=>!x.time&&(x.at===0||text.slice(Math.max(0,x.at-2),x.at)==='\n\n'));
  const detected=combined?'combine':individual?'individual':'raw',format=mode==='auto'?detected:mode;
  if(format==='combine'&&!combined)throw new Error('未识别到完整的发送者＋时间标题，请选择保留原文');
  if(format==='individual'&&!individual)throw new Error('未识别到逐条导出标记，请选择保留原文');
  const boundaries=format==='combine'?markers.filter(x=>x.time):markers;
  const messages=format==='raw'?[{sender:null,time:null,text}]:boundaries.map((x,i)=>({sender:format==='combine'?x.label.trim()||null:null,time:format==='combine'?x.time:null,text:text.slice(format==='combine'?x.body:x.at+1,boundaries[i+1]?.at??text.length).replace(/\n+$/,'')}));
  if((budget.count+=messages.length)>20000)throw new Error('一次聊天最多 20000 条消息（含卡片内层）');
  for(const message of messages){
    if(message.text.length>2000000)throw new Error('单条原消息超过 200 万字；不会自动切成多条消息');
    if(format==='raw')continue;
    const lines=message.text.split('\n'),card=lines.findIndex(l=>l.trim()==='[Chat History]');
    if(card<0)continue;let start=card+1;while(start<lines.length&&!lines[start].trim())start++;
    let end=start;while(end<lines.length&&(!lines[end].trim()||lines[end].startsWith('    ')))end++;
    const nested=lines.slice(start,end).map(l=>l.startsWith('    ')?l.slice(4):l).join('\n').trimEnd();
    // Indented sender AND timestamp headers are required; otherwise keep the entire original body.
    if(!/^·[^\n]+\n\d{4}[/-]\d{1,2}[/-]\d{1,2} \d{1,2}:\d{2}/.test(nested))continue;
    const parsed=await parseChat(nested,'combine',cancelled,depth+1,budget);
    message.children=parsed.messages;
    message.text=[...lines.slice(0,card),...lines.slice(end)].join('\n').trim()||'[聊天记录]';
  }
  const ambiguous=format==='individual'&&messages.length>1&&mode==='auto';
  return {format,detected,messages,ambiguous,needsConfirmation:format==='raw'||ambiguous};
}
export function chatFileIndexes(text,files){
  const names=new Map(files.map((f,i)=>[f.name,i])),indexes=[];
  const refs=/^\s*·?\[(?:Photo|Image|Video|File|图片|视频|文件)\]\s+(.+)$/gm;let m;
  while((m=refs.exec(text))){const i=names.get(m[1].trim());if(i===undefined)throw new Error('聊天引用的附件缺失');if(!indexes.includes(i))indexes.push(i);}
  return indexes;
}
