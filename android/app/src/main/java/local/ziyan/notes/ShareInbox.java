package local.ziyan.notes;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.widget.Toast;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ExecutorService;
import org.json.*;

/** Private, durable staging; source URI grants are needed only during accept(). */
public final class ShareInbox {
    private static final long MAX_FILE = 200L * 1024 * 1024;
    private final Activity activity;
    private final ExecutorService io;
    private final Runnable changed;
    private final File root;

    ShareInbox(Activity activity, ExecutorService io, Runnable changed) {
        this.activity = activity; this.io = io; this.changed = changed;
        root = new File(activity.getFilesDir(), "share-inbox");
        root.mkdirs();
        // A killed copy has no ready metadata and must never become a partial share.
        File[] dirs = root.listFiles();
        if (dirs != null) for (File dir : dirs)
            if (!new File(dir, "ready.json").isFile() && System.currentTimeMillis() - dir.lastModified() > 86400000L) remove(dir);
    }

    void accept(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)
                && !Intent.ACTION_VIEW.equals(action)) return;
        // Own the Intent snapshot before another delivery updates MainActivity's Intent.
        Intent incoming = new Intent(intent);
        io.execute(() -> stage(incoming));
    }

    private void stage(Intent intent) {
        File dir = new File(root, UUID.randomUUID().toString());
        try {
            if (!dir.mkdirs()) throw new IOException("无法建立分享暂存目录");
            CharSequence extra = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            String text = extra == null ? "" : extra.toString();
            LinkedHashSet<Uri> uris = new LinkedHashSet<>();
            if (Intent.ACTION_VIEW.equals(intent.getAction())) {
                if (intent.getData() != null) uris.add(intent.getData());
            } else if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
                ArrayList<Uri> streams = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (streams != null) uris.addAll(streams);
            } else {
                Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (uri != null) uris.add(uri);
            }
            ClipData clip = intent.getClipData();
            if (clip != null) for (int i = 0; i < clip.getItemCount(); i++) {
                ClipData.Item item = clip.getItemAt(i);
                if (item.getUri() != null) {
                    Uri uri = item.getUri();
                    if ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) {
                        if (text.isEmpty()) text = uri.toString();
                    } else uris.add(uri);
                }
                else if (text.isEmpty() && item.getText() != null) text = item.getText().toString();
            }
            if (text.length() > 50000) throw new IOException("分享文字超过 5 万字，请缩短后重试");
            JSONArray files = new JSONArray();
            for (Uri uri : uris) {
                if (uri == null || !"content".equals(uri.getScheme())) throw new IOException("只支持系统授权的本地附件");
                String name = "", mime = activity.getContentResolver().getType(uri);
                long declared = -1;
                try (Cursor c = activity.getContentResolver().query(uri,
                        new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
                    if (c != null && c.moveToFirst()) {
                        int ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME), si = c.getColumnIndex(OpenableColumns.SIZE);
                        if (ni >= 0 && !c.isNull(ni)) name = c.getString(ni);
                        if (si >= 0 && !c.isNull(si)) declared = c.getLong(si);
                    }
                } catch (Exception ignored) { /* Providers may omit optional metadata. */ }
                if (declared > MAX_FILE) throw new IOException("单个附件上限 200MB");
                if (mime == null || mime.equals("application/octet-stream") || mime.endsWith("/*")) {
                    int dot = name.lastIndexOf('.');
                    mime = dot < 0 ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot + 1).toLowerCase(Locale.ROOT));
                    if (mime == null) mime = intent.getType();
                }
                boolean plain = "text/plain".equals(mime);
                if (!plain && (mime == null || !mime.matches("(?:image|video)/[a-zA-Z0-9.+-]+")))
                    throw new IOException("此分享格式不支持，请选择文字、图片或视频");
                if (name == null || name.isEmpty()) name = plain ? "分享文字.txt" : "分享附件";
                name = name.replaceAll("[\\x00-\\x1f/\\\\]", "_");
                if (name.length() > 180) name = name.substring(0, 180);
                File target = new File(dir, files.length() + ".bin");
                long total = 0;
                try (InputStream input = activity.getContentResolver().openInputStream(uri);
                     OutputStream output = new FileOutputStream(target)) {
                    if (input == null) throw new IOException("无法读取来源附件，请重新分享");
                    byte[] buffer = new byte[65536]; int count;
                    while ((count = input.read(buffer)) != -1) {
                        total += count;
                        if (total > MAX_FILE) throw new IOException("单个附件上限 200MB");
                        if (plain && total > 200000) throw new IOException("分享文字超过 5 万字，请缩短后重试");
                        output.write(buffer, 0, count);
                    }
                }
                if (total == 0) throw new IOException("分享附件为空，请重新选择");
                if (plain) {
                    byte[] bytes = new byte[(int)total];
                    try (DataInputStream input = new DataInputStream(new FileInputStream(target))) { input.readFully(bytes); }
                    String value = StandardCharsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(bytes)).toString();
                    text = text.isEmpty() ? value : text + "\n" + value;
                    target.delete();
                    if (text.length() > 50000) throw new IOException("分享文字超过 5 万字，请缩短后重试");
                } else files.put(new JSONObject().put("name", name).put("mime", mime).put("size", total));
            }
            if (text.trim().isEmpty() && files.length() == 0) throw new IOException("没有可接收的文字、图片或视频");
            JSONObject metadata = new JSONObject().put("token", dir.getName()).put("text", text)
                .put("files", files).put("created", System.currentTimeMillis());
            try (FileOutputStream output = new FileOutputStream(new File(dir, "ready.tmp"))) {
                output.write(metadata.toString().getBytes(StandardCharsets.UTF_8)); output.getFD().sync();
            }
            if (!new File(dir, "ready.tmp").renameTo(new File(dir, "ready.json"))) throw new IOException("分享暂存失败");
            changed.run();
        } catch (Exception e) {
            remove(dir);
            String message = e instanceof IOException ? e.getMessage() : "无法读取分享内容，请从来源应用重新分享";
            activity.runOnUiThread(() -> Toast.makeText(activity, message, Toast.LENGTH_LONG).show());
        }
    }

    private File directory(String token) {
        if (token == null || !token.matches("[0-9a-f-]{36}")) throw new IllegalArgumentException();
        return new File(root, token);
    }
    private JSONObject metadata(File dir) throws Exception {
        File file = new File(dir, "ready.json");
        byte[] bytes = new byte[(int)file.length()];
        try (DataInputStream input = new DataInputStream(new FileInputStream(file))) { input.readFully(bytes); }
        return new JSONObject(new String(bytes, StandardCharsets.UTF_8));
    }
    @JavascriptInterface public synchronized String pending() {
        JSONArray result = new JSONArray();
        File[] dirs = root.listFiles();
        if (dirs != null) {
            Arrays.sort(dirs, Comparator.comparing(File::getName));
            for (File dir : dirs) if (new File(dir, "ready.json").isFile()) {
                try { result.put(metadata(dir)); } catch (Exception ignored) { }
            }
        }
        return result.toString();
    }
    @JavascriptInterface public synchronized String read(String token, int index, long offset) {
        try {
            File dir = directory(token);
            JSONObject item = metadata(dir).getJSONArray("files").getJSONObject(index);
            long size = item.getLong("size");
            if (offset < 0 || offset >= size) return "";
            byte[] bytes = new byte[(int)Math.min(192 * 1024, size - offset)];
            try (RandomAccessFile input = new RandomAccessFile(new File(dir, index + ".bin"), "r")) {
                input.seek(offset); input.readFully(bytes);
            }
            return Base64.encodeToString(bytes, Base64.NO_WRAP);
        } catch (Exception error) { return ""; }
    }
    @JavascriptInterface public synchronized void discard(String token) {
        try { remove(directory(token)); } catch (Exception ignored) { }
    }
    private static void remove(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) remove(child);
        file.delete();
    }
}
