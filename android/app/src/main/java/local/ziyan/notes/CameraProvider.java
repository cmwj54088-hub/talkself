package local.ziyan.notes;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/** Grants the selected camera app access only to one generated temporary JPEG. */
public final class CameraProvider extends ContentProvider {
    private File resolve(Uri uri) throws FileNotFoundException {
        if (!"local.ziyan.notes.camera".equals(uri.getAuthority())
                || uri.getPathSegments().size() != 1) throw new FileNotFoundException();
        String name = uri.getLastPathSegment();
        if (name == null || !name.matches("capture_[a-f0-9-]{36}\\.jpg"))
            throw new FileNotFoundException();
        return new File(new File(getContext().getCacheDir(), "camera"), name);
    }
    @Override public boolean onCreate() { return true; }
    @Override public String getType(Uri uri) { return "image/jpeg"; }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File file = resolve(uri);
        int flags = "r".equals(mode) ? ParcelFileDescriptor.MODE_READ_ONLY
                : ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_CREATE;
        if (mode.contains("t")) flags |= ParcelFileDescriptor.MODE_TRUNCATE;
        return ParcelFileDescriptor.open(file, flags);
    }
    @Override public Cursor query(Uri uri, String[] projection, String selection,
            String[] args, String order) {
        try {
            File file = resolve(uri);
            String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
            MatrixCursor cursor = new MatrixCursor(columns);
            Object[] values = new Object[columns.length];
            for (int i = 0; i < columns.length; i++) {
                if (OpenableColumns.DISPLAY_NAME.equals(columns[i])) values[i] = file.getName();
                if (OpenableColumns.SIZE.equals(columns[i])) values[i] = file.length();
            }
            cursor.addRow(values); return cursor;
        } catch (FileNotFoundException e) { return null; }
    }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { return 0; }
    @Override public int delete(Uri uri, String selection, String[] args) { return 0; }
}
