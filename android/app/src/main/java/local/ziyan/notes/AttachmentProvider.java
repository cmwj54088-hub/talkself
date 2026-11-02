package local.ziyan.notes;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** Only exact, randomly named, read-granted payload URIs are exposed. */
public final class AttachmentProvider extends ContentProvider {
    private File directory(Uri uri) throws FileNotFoundException {
        if(!"local.ziyan.notes.attachments".equals(uri.getAuthority())||uri.getPathSegments().size()!=2
            ||!uri.getPathSegments().get(0).matches("[a-f0-9-]{36}"))throw new FileNotFoundException();
        File dir=new File(new File(getContext().getCacheDir(),"open-files"),uri.getPathSegments().get(0));
        try { if(!uri.getLastPathSegment().equals(metadata(dir).getString("name")))throw new FileNotFoundException(); }
        catch(Exception e){throw new FileNotFoundException();}return dir;
    }
    private JSONObject metadata(File dir)throws Exception {
        File f=new File(dir,"meta.json");if(f.length()>4096)throw new IOException();
        byte[] bytes=new byte[(int)f.length()];try(DataInputStream in=new DataInputStream(new FileInputStream(f))){in.readFully(bytes);}
        return new JSONObject(new String(bytes,StandardCharsets.UTF_8));
    }
    @Override public boolean onCreate(){return true;}
    @Override public String getType(Uri uri){try{return metadata(directory(uri)).getString("mime");}catch(Exception e){return "application/octet-stream";}}
    @Override public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException {
        if(!"r".equals(mode))throw new FileNotFoundException("Read only");
        return ParcelFileDescriptor.open(new File(directory(uri),"payload"),ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String order){
        try {File dir=directory(uri);JSONObject meta=metadata(dir);
            String[] columns=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;
            Object[] values=new Object[columns.length];for(int i=0;i<columns.length;i++){
                if(OpenableColumns.DISPLAY_NAME.equals(columns[i]))values[i]=meta.getString("name");
                if(OpenableColumns.SIZE.equals(columns[i]))values[i]=new File(dir,"payload").length();
            }MatrixCursor cursor=new MatrixCursor(columns);cursor.addRow(values);return cursor;
        }catch(Exception e){return null;}
    }
    @Override public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}
    @Override public int update(Uri u,ContentValues v,String s,String[] a){return 0;}
    @Override public int delete(Uri u,String s,String[] a){return 0;}
}
