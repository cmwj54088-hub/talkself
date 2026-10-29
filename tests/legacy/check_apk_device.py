"""Install the release APK on the dedicated local emulator and check offline persistence."""
import os,subprocess,time,xml.etree.ElementTree as ET
from pathlib import Path
R=Path(__file__).resolve().parents[2]
ADB='/workspace/android-toolchain/platform-tools/adb'
ENV={**os.environ,'ADB_VENDOR_KEYS':'/workspace/android-toolchain/user/adbkey'}
def adb(*args,timeout=45):
 p=subprocess.run([ADB,'-s','emulator-5554',*args],env=ENV,capture_output=True,timeout=timeout)
 if p.returncode:raise RuntimeError(p.stderr.decode(errors='replace')+p.stdout.decode(errors='replace'))
 return p.stdout
print('Waiting for Android boot completion...',flush=True)
start=time.monotonic()
while time.monotonic()-start<240:
 try:
  if adb('shell','getprop','sys.boot_completed',timeout=10).strip()==b'1':break
 except (RuntimeError,subprocess.TimeoutExpired):pass
 time.sleep(4)
else:raise RuntimeError('Software emulator did not finish booting within test window')
print('Android booted; installing signed release...',flush=True)
adb('shell','input','keyevent','82')
for key in ['window_animation_scale','transition_animation_scale','animator_duration_scale']:adb('shell','settings','put','global',key,'0')
adb('install','-r','--no-streaming',str(R/'releases/自言-0.4.0.apk'),timeout=90)
adb('shell','cmd','connectivity','airplane-mode','enable')
def launch():
 adb('shell','am','force-stop','local.ziyan.notes')
 adb('shell','am','start','-W','-n','local.ziyan.notes/.MainActivity',timeout=90)
def screen():
 for attempt in range(4):
  output=adb('shell','uiautomator','dump','--compressed','/data/local/tmp/ziyan-window.xml',timeout=70)
  try:return ET.fromstring(adb('shell','cat','/data/local/tmp/ziyan-window.xml').decode())
  except (RuntimeError,ET.ParseError):
   if attempt==3:raise RuntimeError('UI inspection unavailable: '+output.decode(errors='replace'))
   time.sleep(2)

def texts(tree):return '\n'.join(n.get('text','')+' '+n.get('content-desc','') for n in tree.iter('node'))
def wait_text(text,seconds=80):
 end=time.monotonic()+seconds
 while time.monotonic()<end:
  t=screen()
  if "System UI isn't responding" in texts(t):
   tap_label('Close app',t);time.sleep(2);continue
  if text in texts(t):return t
  time.sleep(2)
 raise AssertionError('Not visible: '+text+'\n'+texts(t))
def tap_label(text,tree=None):
 t=tree if tree is not None else screen()
 nodes=[n for n in t.iter('node') if text in n.get('text','') or text in n.get('content-desc','')]
 if not nodes:raise AssertionError('Missing: '+text+'\n'+texts(t))
 import re
 # Match the most specific accessible node rather than a parent containing all text.
 n=min(nodes,key=lambda n:len(n.get('text','')+n.get('content-desc','')))
 x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds','')))
 adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
def capture(name):
 (R/'screenshots'/name).write_bytes(adb('exec-out','screencap','-p',timeout=60))
launch();tree=wait_text('随手记');assert '暂时无法打开' not in texts(tree)
capture('apk-home.png');tap_label('随手记',tree)
tree=wait_text('笔记内容');tap_label('笔记内容',tree)
adb('shell','input','text','offline_note_042');tap_label('发送')
wait_text('offline_note_042');print('PASS first offline launch, native IndexedDB open, note send',flush=True)
adb('shell','input','keyevent','4');capture('apk-chat.png')
launch();tap_label('随手记',wait_text('随手记'));wait_text('offline_note_042')
tap_label('笔记内容');adb('shell','input','text','offline_draft_042')
wait_text('offline_draft_042');time.sleep(1)
launch();tap_label('随手记',wait_text('随手记'));wait_text('offline_draft_042')
print('PASS note and draft retained after force-stop/relaunch in airplane mode',flush=True)
# Open the actual system file-save UI and cancel; callback must restore normal app state.
tap_label('返回项目列表');tap_label('设置');tap_label('导出完整备份')
time.sleep(2);tree=screen();capture('apk-export-picker.png')
assert 'Save' in texts(tree) or 'SAVE' in texts(tree) or '保存' in texts(tree),texts(tree)
adb('shell','input','keyevent','4');wait_text('已取消导出')
print('PASS Android system document-save picker + cancellation callback',flush=True)
logs=adb('logcat','-d','-t','2000').decode(errors='replace')
assert 'FATAL EXCEPTION' not in logs or 'Process: local.ziyan.notes' not in logs
(R/'releases/device-check.txt').write_text('Android 15 AOSP emulator, signed release APK, airplane mode: initial load and IndexedDB, note creation, note/draft force-stop recovery, native export picker + cancellation passed. Physical camera/stylus still device-specific.\n')
print('PASS release APK device checks',flush=True)
