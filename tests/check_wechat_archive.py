"""Runs the production Java ZIP reader on generated fixtures.
Use --include-local-evidence to explicitly opt into private local evidence.
Writes local bridge fixtures under ignored releases/; private evidence is never packaged.
"""
from pathlib import Path
import base64, json, struct, subprocess, sys, tempfile, zipfile, uuid, shutil
from contextlib import contextmanager

@contextmanager
def fixture_directory(root):
 folder=root/("wechat-qa-"+uuid.uuid4().hex);folder.mkdir()
 try:yield str(folder)
 finally:
  if folder.resolve().is_relative_to(root.resolve()):shutil.rmtree(folder)

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'releases';OUT.mkdir(exist_ok=True)
harness=r'''package local.ziyan.notes;
import java.io.*;import java.nio.charset.StandardCharsets;import java.nio.file.Files;import java.util.Base64;
public class ArchiveTest {
 static String encode(String value){return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));}
 public static void main(String[] args)throws Exception{
  File dir=new File(args[1]);dir.mkdirs();
  WechatArchive.Result result=WechatArchive.unpack(new File(args[0]),dir,0);
  System.out.println("TEXT "+encode(result.text));
  for(WechatArchive.Part part:result.parts){File f=new File(dir,part.index+".bin");if(f.length()!=part.size)throw new AssertionError();System.out.println("FILE "+part.index+" "+part.mime+" "+encode(part.name)+" "+part.size);}
 }
}'''
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
with fixture_directory(OUT) as temporary:
 folder=Path(temporary);assert folder.resolve().is_relative_to(OUT.resolve())
 source=folder/'ArchiveTest.java';source.write_text(harness,encoding='utf-8')
 subprocess.run(['javac','-encoding','UTF-8','--release','8','-d',str(folder),str(ROOT/'android/app/src/main/java/local/ziyan/notes/WechatArchive.java'),str(source)],check=True)
 def archive(name,items):
  path=folder/(name+'.zip')
  with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
   for key,value in items:z.writestr(key,value)
  return path
 def run(path,ok=True):
  target=folder/(path.stem+'-files')
  p=subprocess.run(['java','-cp',str(folder),'local.ziyan.notes.ArchiveTest',str(path),str(target)],capture_output=True,encoding='utf-8',errors='replace')
  if not ok:
   assert p.returncode!=0,f'Unexpected accepted ZIP: {path.name}'
   assert not list(target.glob('*.bin')),f'Failed ZIP left partial files: {path.name}'
   return
  assert p.returncode==0,p.stderr
  lines=p.stdout.splitlines();text=base64.b64decode(lines[0][5:]).decode('utf-8');files=[]
  for line in lines[1:]:
   _,index,mime,encoded,size=line.split(' ');data=(target/(index+'.bin')).read_bytes()
   assert len(data)==int(size)
   files.append({'name':base64.b64decode(encoded).decode('utf-8'),'mime':mime,'size':len(data),'base64':base64.b64encode(data).decode()})
  return {'name':path.name,'text':text,'files':files,'wechat':True}
 valid=[archive('single',[('Chat history.txt','·第一条')]),archive('merged',[('Chat history.txt','·测试者\n2026/10/31 20:40\n第一条\n\n·测试者\n2026/10/31 20:41\n第二条')]),archive('individual',[('Chat history.txt','·第一条\n\n·第二条')]),archive('image',[('Chat history.txt','·测试者\n2026/10/31 20:40\n[Photo] first.png\n\n<script>bad()</script> & 文本\n\n[Photo] second.png'),('media/first.png',png),('media/second.png',png)]),archive('video',[('Chat history.txt','·测试者\n2026/10/31 20:40\n[Video] movie.mp4'),('media/movie.mp4',b'video-byte-fixture')])]
 valid.append(archive('long',[('Chat history.txt','·合成发送者\n2026/10/31 20:40\n'+'字'*60000+'\n\n·合成发送者\n2026/10/31 20:40\n'+'文'*60000)]))
 fixtures=[run(path) for path in valid]
 assert '2026/10/31' in fixtures[1]['text'] and '2026/10/31' not in fixtures[2]['text']
 assert len(fixtures[3]['files'])==2 and base64.b64decode(fixtures[3]['files'][0]['base64'])==png
 for name,items in [
  ('traversal',[('Chat history.txt','text'),('../bad.png',png)]),
  ('duplicate-name',[('Chat history.txt','text'),('a/x.png',png),('b/x.png',png)]),
  ('missing-text',[('media/x.png',png)]),
  ('missing-image',[('Chat history.txt','[Photo] missing.png')]),
  ('unsupported',[('Chat history.txt','text'),('a.png',png),('file.pdf',b'%PDF')]),
  ('oversize-text',[('Chat history.txt','字'*(8*1024*1024//3+1))]),
  ('invalid-utf8',[('Chat history.txt',b'\xff\xff')]),
  ('entry-limit',[('Chat history.txt','text')]+[(f'media/{i}.png',png) for i in range(256)]),
 ]:run(archive(name,items),False)
 # Tamper central-directory fields without allocating huge files.
 for name,offset,fmt,value in [('oversize-file',24,'<I',200*1024*1024+1),('encrypted',8,'<H',1),('bad-crc',16,'<I',123)]:
  original=archive(name,[('Chat history.txt','text')]);raw=bytearray(original.read_bytes());at=raw.index(b'PK\x01\x02');struct.pack_into(fmt,raw,at+offset,value);original.write_bytes(raw);run(original,False)
 broken=folder/'broken.zip';broken.write_bytes(b'PK\x03\x04broken');run(broken,False)
 print('PASS production JVM ZIP reader: text/image/video; UTF-8, size/count, duplicate/path, missing attachment, unknown file, encryption, corruption; failure cleans partial files')
 if '--include-local-evidence' in sys.argv:
  for path in sorted((ROOT/'evidence').glob('Chat history_*.zip')):
   fixtures.append(run(path));print('PASS real local WeChat export:',path.name)
 (OUT/'wechat-fixtures.json').write_text(json.dumps(fixtures,ensure_ascii=False),encoding='utf-8')
 print('Bridge fixtures generated locally (not included in source package)')
