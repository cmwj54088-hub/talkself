package local.ziyan.notes;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** All UI assets are intercepted from the APK. No socket or HTTP server is used. */
@SuppressWarnings("deprecation")
public final class MainActivity extends Activity {
    private static final String HOST = "ziyan.local";
    private static final String ORIGIN = "https://" + HOST + "/";
    private static final int PICK_FILE = 1101, CAPTURE = 1102, SAVE_FILE = 1103;
    private static final Set<String> ASSETS = new HashSet<>(Arrays.asList(
        "index.html"));
    private WebView web;
    private ShareInbox shareInbox;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final NativeFiles nativeFiles = new NativeFiles();
    private String activeExport;
    private android.hardware.SensorManager gardenSensors;
    private boolean gardenRequested=false, activityVisible=false;
    private long lastMotion=0;
    private final android.hardware.SensorEventListener gardenListener=new android.hardware.SensorEventListener(){
        public void onAccuracyChanged(android.hardware.Sensor sensor,int accuracy){}
        public void onSensorChanged(android.hardware.SensorEvent e){
            long now=android.os.SystemClock.elapsedRealtime();if(!gardenRequested||!activityVisible||now-lastMotion<40)return;lastMotion=now;
            float x=e.values[0],y=e.values[1];int rotation=getWindowManager().getDefaultDisplay().getRotation();
            if(rotation==1){float old=x;x=-y;y=old;}else if(rotation==2){x=-x;y=-y;}else if(rotation==3){float old=x;x=y;y=-old;}
            if(web!=null)web.evaluateJavascript("window.ziyanGardenMotion && window.ziyanGardenMotion("+x+","+y+")",null);
        }
    };
    private void updateMotion(){if(gardenSensors==null)gardenSensors=(android.hardware.SensorManager)getSystemService(SENSOR_SERVICE);gardenSensors.unregisterListener(gardenListener);if(gardenRequested&&activityVisible){android.hardware.Sensor sensor=gardenSensors.getDefaultSensor(android.hardware.Sensor.TYPE_ACCELEROMETER);if(sensor!=null)gardenSensors.registerListener(gardenListener,sensor,android.hardware.SensorManager.SENSOR_DELAY_GAME);}}
    private long lastBack;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(17, 17, 17));
        getWindow().setNavigationBarColor(Color.rgb(17, 17, 17));
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(17, 17, 17));
        web = new WebView(this); web.setBackgroundColor(Color.rgb(17, 17, 17));
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return WindowInsets.CONSUMED;
            });
            root.requestApplyInsets();
        }
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        WebView.setWebContentsDebuggingEnabled(false);
        web.addJavascriptInterface(nativeFiles, "ZiyanAndroid");
        shareInbox = new ShareInbox(this, io, () -> runOnUiThread(() -> {
            if (web != null && !isDestroyed()) web.evaluateJavascript("window.ZiyanShares && window.ZiyanShares.available()", null);
        }));
        web.addJavascriptInterface(shareInbox, "ZiyanShareInbox");
        web.setWebViewClient(new LocalAssets());
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                String[] accepts = params.getAcceptTypes();
                String type = accepts.length == 1 && !accepts[0].isEmpty() ? accepts[0] : "*/*";
                try {
                    if (params.isCaptureEnabled() && type.startsWith("image/")) {
                        File dir = new File(getCacheDir(), "camera");
                        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("无法建立拍照目录");
                        String name = "capture_" + UUID.randomUUID() + ".jpg";
                        cameraUri = Uri.parse("content://local.ziyan.notes.camera/" + name);
                        Intent capture = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                        capture.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                        capture.setClipData(ClipData.newRawUri("拍照", cameraUri));
                        capture.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                        startActivityForResult(capture, CAPTURE);
                    } else {
                        Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                        pick.addCategory(Intent.CATEGORY_OPENABLE);
                        // JSON backups may be mislabeled by document providers; allow selection and validate content in-app.
                        if (type.contains("json") || type.startsWith(".")) type = "*/*";
                        pick.setType(type);
                        if (accepts.length > 1 && !type.equals("*/*")) pick.putExtra(Intent.EXTRA_MIME_TYPES, accepts);
                        pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                        pick.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivityForResult(pick, PICK_FILE);
                    }
                } catch (ActivityNotFoundException e) { cancelChooser("没有可用的相机或文件选择器"); }
                catch (Exception e) { cancelChooser("无法打开文件选择器，请重试"); }
                return true;
            }
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreenView != null) { callback.onCustomViewHidden(); return; }
                fullscreenView = view; fullscreenCallback = callback;
                addContentView(view, new WindowManager.LayoutParams(-1, -1)); web.setVisibility(View.GONE);
            }
            @Override public void onHideCustomView() { leaveFullscreen(); }
        });
        File oldDiagnostics = new File(getFilesDir(), "share-diagnostics");
        File[] oldLogs = oldDiagnostics.listFiles();
        if (oldLogs != null) for (File log : oldLogs) if (log.isFile()) log.delete();
        oldDiagnostics.delete();
        cleanTemporaryFiles(new File(getCacheDir(), "exports"));
        cleanTemporaryFiles(new File(getCacheDir(), "camera"));
        try (InputStream input = getAssets().open("web/index.html")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[16384]; int size;
            while ((size = input.read(buffer)) != -1) bytes.write(buffer, 0, size);
            // Explicit HTTPS base gives IndexedDB a stable app origin, without making a URL request.
            web.loadDataWithBaseURL(ORIGIN, bytes.toString("UTF-8"), "text/html", "UTF-8", null);
        } catch (IOException error) { showToast("内置界面读取失败，请重新安装"); }
        if (state == null) shareInbox.accept(getIntent());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent);
        if (shareInbox != null) shareInbox.accept(intent);
    }

    private void cleanTemporaryFiles(File directory) {
        File[] files = directory.listFiles(); if (files == null) return;
        for (File file : files) if (System.currentTimeMillis() - file.lastModified() > 86400000L) file.delete();
    }
    private void cancelChooser(String message) {
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        cameraUri = null; showToast(message);
    }
    private void leaveFullscreen() {
        if (fullscreenView == null) return;
        ((android.view.ViewGroup)fullscreenView.getParent()).removeView(fullscreenView);
        fullscreenView = null; web.setVisibility(View.VISIBLE);
        if (fullscreenCallback != null) fullscreenCallback.onCustomViewHidden(); fullscreenCallback = null;
    }
    private void showToast(String message) { runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show()); }
    private static boolean local(Uri uri) { return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPort() == -1; }
    private final class LocalAssets extends WebViewClient {
        @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            ((android.view.ViewGroup)view.getParent()).removeView(view);
            view.destroy(); web = null;
            if (!isFinishing()) new AlertDialog.Builder(MainActivity.this)
                .setTitle("页面进程已退出")
                .setMessage("重新打开不会删除已保存的笔记。如反复发生，请更新 Android System WebView 系统组件。")
                .setPositiveButton("重新打开", (dialog, which) -> recreate())
                .setNegativeButton("退出", (dialog, which) -> finish())
                .setCancelable(false).show();
            return true;
        }
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) { return !local(req.getUrl()); }
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri uri = req.getUrl();
            if (!local(uri) || !"GET".equals(req.getMethod())) return denied();
            String path = uri.getPath(); if (path == null || "/".equals(path)) path = "/index.html";
            String name = path.startsWith("/") ? path.substring(1) : path;
            if (!ASSETS.contains(name)) return denied();
            String mime = name.endsWith(".js") ? "application/javascript" : name.endsWith(".css") ? "text/css"
                    : name.endsWith(".svg") ? "image/svg+xml" : "text/html";
            try {
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store"); headers.put("X-Content-Type-Options", "nosniff");
                headers.put("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob: data:; media-src blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'");
                return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, getAssets().open("web/" + name));
            } catch (IOException e) { return denied(); }
        }
        private WebResourceResponse denied() {
            return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", new HashMap<>(),
                new ByteArrayInputStream("Offline app: request blocked".getBytes(StandardCharsets.UTF_8)));
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE || request == CAPTURE) {
            ValueCallback<Uri[]> callback = fileCallback; fileCallback = null;
            if (callback == null) return;
            if (result != RESULT_OK) { cameraUri = null; callback.onReceiveValue(null); return; }
            if (request == CAPTURE) { callback.onReceiveValue(cameraUri == null ? null : new Uri[]{cameraUri}); cameraUri = null; return; }
            if (data == null) { callback.onReceiveValue(null); return; }
            if (data.getClipData() != null) {
                ClipData clip = data.getClipData(); Uri[] uris = new Uri[clip.getItemCount()];
                for (int i = 0; i < uris.length; i++) uris[i] = clip.getItemAt(i).getUri();
                callback.onReceiveValue(uris);
            } else callback.onReceiveValue(data.getData() == null ? null : new Uri[]{data.getData()});
        } else if (request == SAVE_FILE) {
            String token = activeExport; activeExport = null;
            if (token == null) return;
            if (result != RESULT_OK || data == null || data.getData() == null) { nativeFiles.complete(token, false, ""); return; }
            Uri destination = data.getData();
            io.execute(() -> {
                SaveJob job = nativeFiles.get(token);
                if (job == null) return;
                try (InputStream input = new FileInputStream(job.file);
                     OutputStream output = getContentResolver().openOutputStream(destination, "wt")) {
                    if (output == null) throw new IOException("无法写入所选文件");
                    byte[] bytes = new byte[65536]; int count;
                    while ((count = input.read(bytes)) != -1) output.write(bytes, 0, count);
                    output.flush(); nativeFiles.complete(token, true, "");
                } catch (Exception e) { nativeFiles.complete(token, false, "保存失败，请重新选择保存位置"); }
            });
        }
    }
    @Override public void onBackPressed() {
        if (fullscreenView != null) { leaveFullscreen(); return; }
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript("Boolean(window.ziyanGoBack && window.ziyanGoBack())", result -> {
            if ("true".equals(result) || isFinishing()) return;
            long now = System.currentTimeMillis();
            if (now - lastBack < 1800) finish(); else { lastBack = now; showToast("再按一次返回键退出"); }
        });
    }
    @Override protected void onPause() {
        activityVisible=false;updateMotion();
        if (web != null) { web.evaluateJavascript("window.ziyanPersistNow && window.ziyanPersistNow()", null); web.onPause(); }
        super.onPause();
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request,permissions,results);
        if(request==1201 && web!=null)web.evaluateJavascript("window.ziyanReminderRefresh && window.ziyanReminderRefresh()",null);
    }
    @Override protected void onResume() { super.onResume();activityVisible=true;updateMotion(); if (web != null) { web.onResume(); web.evaluateJavascript("window.ziyanReminderRefresh && window.ziyanReminderRefresh()",null); } TaskReminders.restore(this); }
    @Override protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (web != null) { web.removeJavascriptInterface("ZiyanAndroid"); web.destroy(); }
        nativeFiles.closeAll(); io.shutdown(); super.onDestroy();
    }
    private static final class SaveJob {
        final File file; final String name, mime; OutputStream stream; long bytes; boolean ready;
        SaveJob(File file, String name, String mime) throws IOException {
            this.file = file; this.name = name; this.mime = mime; stream = new FileOutputStream(file);
        }
    }
    public final class NativeFiles {
        @JavascriptInterface public void setGardenMotion(boolean enabled){runOnUiThread(()->{gardenRequested=enabled;updateMotion();});}
        @JavascriptInterface public String reminderStatus(){return TaskReminders.status(MainActivity.this).toString();}
        @JavascriptInterface public void openNotificationSettings(){runOnUiThread(()->{try{startActivity(new Intent("android.settings.APP_NOTIFICATION_SETTINGS").putExtra("android.provider.extra.APP_PACKAGE",getPackageName()));}catch(ActivityNotFoundException e){}});}
        @JavascriptInterface public void syncTaskReminders(String json) { if(json!=null&&json.length()<3000000) TaskReminders.replace(MainActivity.this,json); }
        @JavascriptInterface public boolean reminderPermission() { return TaskReminders.permitted(MainActivity.this); }
        @JavascriptInterface public void enableTaskReminders() { runOnUiThread(() -> {
            if(Build.VERSION.SDK_INT>=33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=0) {if(getPreferences(0).getBoolean("notificationAsked",false)&&!shouldShowRequestPermissionRationale("android.permission.POST_NOTIFICATIONS")){nativeFiles.openNotificationSettings();return;}getPreferences(0).edit().putBoolean("notificationAsked",true).apply();requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},1201);return;}
            if(Build.VERSION.SDK_INT>=31 && !((android.app.AlarmManager)getSystemService(ALARM_SERVICE)).canScheduleExactAlarms()) {try{startActivity(new Intent("android.settings.REQUEST_SCHEDULE_EXACT_ALARM",Uri.parse("package:"+getPackageName())));}catch(ActivityNotFoundException e){} return;}
            if(!TaskReminders.status(MainActivity.this).optBoolean("notifications")||!TaskReminders.status(MainActivity.this).optBoolean("channel")){nativeFiles.openNotificationSettings();return;}
            TaskReminders.restore(MainActivity.this);
            if(web!=null)web.evaluateJavascript("window.ziyanReminderRefresh && window.ziyanReminderRefresh()",null);
        }); }
        @JavascriptInterface public void openExternalLink(String value) {
            if (value == null || value.length() > 8192) return;
            android.net.Uri uri = android.net.Uri.parse(value);
            if (!("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())) || uri.getHost() == null) return;
            runOnUiThread(() -> {
                boolean opened = false;
                try {
                    Intent browser = new Intent(Intent.ACTION_VIEW, uri);
                    browser.addCategory(Intent.CATEGORY_BROWSABLE);
                    browser.setSelector(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_APP_BROWSER));
                    if (browser.resolveActivity(getPackageManager()) == null) throw new ActivityNotFoundException();
                    startActivity(Intent.createChooser(browser, "选择浏览器"));
                    opened = true;
                } catch (android.content.ActivityNotFoundException | SecurityException error) {
                    // Leave the WebView, draft and reading position intact.
                }
                if (web != null) web.evaluateJavascript("window.ziyanExternalResult && window.ziyanExternalResult(" + opened + ")", null);
            });
        }
        @JavascriptInterface public void setTaskAlarm(int hour, int minute, String label) {
            if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || label == null || label.length() > 200) return;
            runOnUiThread(() -> {
                boolean opened = false;
                try {
                    Intent alarm = new Intent(android.provider.AlarmClock.ACTION_SET_ALARM)
                        .putExtra(android.provider.AlarmClock.EXTRA_HOUR, hour)
                        .putExtra(android.provider.AlarmClock.EXTRA_MINUTES, minute)
                        .putExtra(android.provider.AlarmClock.EXTRA_MESSAGE, label)
                        .putExtra(android.provider.AlarmClock.EXTRA_SKIP_UI, false);
                    startActivity(alarm);
                    opened = true;
                } catch (android.content.ActivityNotFoundException | SecurityException error) {
                    // Keep the saved task and reminder preference; never claim an alarm was enabled.
                }
                if (web != null) web.evaluateJavascript("window.ziyanAlarmResult && window.ziyanAlarmResult(" + opened + ")", null);
            });
        }
        private final Map<String, SaveJob> jobs = new HashMap<>();
        @JavascriptInterface public String version() { try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception error) { return "unknown"; } }
        @JavascriptInterface public boolean copyText(String text) {
            if (text == null || text.length() > 200000) return false;
            runOnUiThread(() -> ((ClipboardManager)getSystemService(CLIPBOARD_SERVICE))
                .setPrimaryClip(ClipData.newPlainText("笔记", text))); return true;
        }
        @JavascriptInterface public synchronized String beginSave(String name, String mime) {
            if (!jobs.isEmpty() || name == null || mime == null) return "";
            try {
                File dir = new File(getCacheDir(), "exports");
                if (!dir.isDirectory() && !dir.mkdirs()) return "";
                String token = UUID.randomUUID().toString();
                String safeName = name.replaceAll("[\\x00-\\x1f/\\\\]", "_");
                if (safeName.length() > 180) safeName = safeName.substring(0, 180);
                if (safeName.isEmpty()) safeName = "自言备份.json";
                String safeMime = mime.matches("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+") ? mime : "application/octet-stream";
                jobs.put(token, new SaveJob(new File(dir, token + ".tmp"), safeName, safeMime)); return token;
            } catch (IOException e) { return ""; }
        }
        @JavascriptInterface public synchronized boolean writeSave(String token, String encoded) {
            SaveJob job = jobs.get(token);
            if (job == null || job.ready || encoded == null || encoded.length() > 300000) return false;
            try {
                byte[] bytes = Base64.decode(encoded, Base64.NO_WRAP);
                if (job.bytes + bytes.length > 800L * 1024 * 1024) return false;
                job.stream.write(bytes); job.bytes += bytes.length; return true;
            } catch (Exception e) { return false; }
        }
        @JavascriptInterface public synchronized void finishSave(String token) {
            SaveJob job = jobs.get(token);
            if (job == null || job.ready) return;
            try { job.stream.close(); job.ready = true; }
            catch (IOException e) { complete(token, false, "无法准备导出文件"); return; }
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed()) { complete(token, false, "应用已关闭"); return; }
                try {
                    activeExport = token;
                    Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    save.addCategory(Intent.CATEGORY_OPENABLE); save.setType(job.mime);
                    save.putExtra(Intent.EXTRA_TITLE, job.name);
                    startActivityForResult(save, SAVE_FILE);
                } catch (ActivityNotFoundException e) { activeExport = null; complete(token, false, "系统没有可用的文件保存界面"); }
            });
        }
        @JavascriptInterface public synchronized void finishOpen(String token) {
            SaveJob job=jobs.get(token);if(job==null||job.ready)return;
            File root=new File(getCacheDir(),"open-files"),dir=new File(root,token);
            try {
                job.stream.close();job.ready=true;
                if(job.bytes<=0||job.bytes>200L*1024*1024)throw new IOException("打开文件上限 200MB");
                root.mkdirs();long cached=0;File[] folders=root.listFiles();
                if(folders!=null)for(File old:folders){
                    if(System.currentTimeMillis()-old.lastModified()>7L*24*60*60*1000){for(File f:old.listFiles()==null?new File[0]:old.listFiles())f.delete();old.delete();}
                    else {File payload=new File(old,"payload");cached+=payload.length();}
                }
                if(cached+job.bytes>512L*1024*1024)throw new IOException("临时打开文件占用已达 512MB，请稍后再试或另存文件");
                if(!dir.mkdir()||!job.file.renameTo(new File(dir,"payload")))throw new IOException("无法准备附件");
                JSONObject meta=new JSONObject().put("name",job.name).put("mime",job.mime);
                try(FileOutputStream output=new FileOutputStream(new File(dir,"meta.json"))){output.write(meta.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}
            } catch(Exception error){File[] partial=dir.listFiles();if(partial!=null)for(File f:partial)f.delete();dir.delete();complete(token,false,error.getMessage()==null?"无法准备附件":error.getMessage());return;}
            runOnUiThread(()->{
                try {
                    Uri uri=new Uri.Builder().scheme("content").authority("local.ziyan.notes.attachments").appendPath(token).appendPath(job.name).build();
                    Intent view=new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/octet-stream".equals(job.mime)?"*/*":job.mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    view.setClipData(ClipData.newRawUri(job.name,uri));
                    boolean available=false;
                    for(android.content.pm.ResolveInfo info:getPackageManager().queryIntentActivities(view,android.content.pm.PackageManager.MATCH_DEFAULT_ONLY))
                        if(info.activityInfo!=null&&!getPackageName().equals(info.activityInfo.packageName)){available=true;break;}
                    if(!available)throw new ActivityNotFoundException();
                    Intent chooser=Intent.createChooser(view,"选择应用打开文件").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    chooser.putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS,new android.content.ComponentName[]{new android.content.ComponentName(MainActivity.this,MainActivity.class)});
                    startActivity(chooser);complete(token,true,"");
                }catch(ActivityNotFoundException|SecurityException error){for(File f:dir.listFiles()==null?new File[0]:dir.listFiles())f.delete();dir.delete();complete(token,false,"没有可打开此文件的应用，请安装相应应用或另存文件");}
            });
        }
        @JavascriptInterface public synchronized void abortSave(String token) {
            SaveJob job = jobs.remove(token);
            if (job == null) return;
            try { job.stream.close(); } catch (IOException ignored) { }
            job.file.delete();
        }
        synchronized SaveJob get(String token) { return jobs.get(token); }
        synchronized void complete(String token, boolean success, String error) {
            abortSave(token);
            runOnUiThread(() -> {
                if (web == null || isDestroyed()) return;
                String js = "window.ZiyanFiles && window.ZiyanFiles.receive(" + JSONObject.quote(token)
                    + "," + success + "," + JSONObject.quote(error) + ")";
                web.evaluateJavascript(js, null);
            });
        }
        synchronized void closeAll() {
            for (String token : jobs.keySet().toArray(new String[0])) abortSave(token);
        }
    }
}
