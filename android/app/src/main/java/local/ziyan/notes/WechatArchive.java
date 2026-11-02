package local.ziyan.notes;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.*;
import java.util.zip.*;

/** Reads the plain ZIP format exported by WeChat, without trusting archive paths. */
final class WechatArchive {
    static final long MAX_FILE = 200L * 1024 * 1024;
    static final long MAX_TOTAL = 512L * 1024 * 1024;
    static final class Part {
        final String name, mime; final long size; final int index;
        Part(String name,String mime,long size,int index){this.name=name;this.mime=mime;this.size=size;this.index=index;}
    }
    static final class Result {
        String text; final List<Part> parts = new ArrayList<>();
    }
    static String mime(String name) {
        String ext=name.substring(name.lastIndexOf('.')+1).toLowerCase(Locale.ROOT);
        switch(ext) {
            case "jpg": case "jpeg": return "image/jpeg";
            case "png": return "image/png"; case "gif": return "image/gif";
            case "webp": return "image/webp"; case "bmp": return "image/bmp";
            case "heic": return "image/heic"; case "heif": return "image/heif";
            case "mp4": return "video/mp4"; case "webm": return "video/webm";
            case "mov": return "video/quicktime"; case "3gp": return "video/3gpp";
            case "pdf": return "application/pdf";
            case "doc": return "application/msword"; case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "ppt": return "application/vnd.ms-powerpoint"; case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            case "xls": return "application/vnd.ms-excel"; case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            case "zip": return "application/zip"; case "txt": return "text/plain"; case "csv": return "text/csv";
            case "json": return "application/json"; case "html": case "htm": return "text/html";
            case "mp3": return "audio/mpeg"; case "wav": return "audio/wav";
            default: return "application/octet-stream";
        }
    }
    static boolean isChat(File file) {
        try(ZipFile zip=new ZipFile(file,StandardCharsets.UTF_8)){return zip.getEntry("Chat history.txt")!=null||zip.getEntry("聊天记录.txt")!=null;}
        catch(IOException ignored){return false;}
    }
    static Result unpack(File archive,File directory,int startIndex) throws IOException {
        if(startIndex<0||archive.length()>MAX_FILE)throw new IOException("聊天 ZIP 上限 200MB");
        Result result=new Result();List<File> created=new ArrayList<>();
        try(ZipFile zip=new ZipFile(archive,StandardCharsets.UTF_8)) {
            Set<String> paths=new HashSet<>(),names=new HashSet<>();long total=0;int count=0;
            Enumeration<? extends ZipEntry> entries=zip.entries();
            while(entries.hasMoreElements()) {
                ZipEntry entry=entries.nextElement();String path=entry.getName();
                if(++count>256)throw new IOException("聊天 ZIP 最多 256 个条目");
                if(path.length()>1000||path.startsWith("/")||path.contains("\\")||path.contains(":")||path.indexOf('\0')>=0||!paths.add(path))
                    throw new IOException("聊天 ZIP 路径无效或重复");
                for(String segment:path.split("/"))if(segment.equals("..")||segment.equals("."))throw new IOException("聊天 ZIP 路径无效");
                if(entry.isDirectory())continue;
                boolean transcript=path.equals("Chat history.txt")||path.equals("聊天记录.txt");
                String name=path.substring(path.lastIndexOf('/')+1);
                if(name.isEmpty()||name.length()>180||name.chars().anyMatch(c->c<32)||!names.add(name))throw new IOException("聊天 ZIP 附件名无效或重复");
                long limit=transcript?8L*1024*1024:MAX_FILE;
                if(entry.getSize()<0||entry.getSize()>limit||entry.getSize()>MAX_TOTAL-total)throw new IOException("聊天 ZIP 解压大小超过限制");
                if(transcript&&result.text!=null)throw new IOException("聊天 ZIP 中存在多份聊天正文");
                String type=transcript?"":mime(name);int index=startIndex+result.parts.size();
                File output=transcript?null:new File(directory,index+".bin");
                if(output!=null)created.add(output);
                ByteArrayOutputStream text=transcript?new ByteArrayOutputStream():null;
                long size=0;CRC32 crc=new CRC32();
                try(InputStream input=zip.getInputStream(entry);OutputStream target=transcript?text:new FileOutputStream(output)) {
                    byte[] bytes=new byte[65536];int n;
                    while((n=input.read(bytes))!=-1) {
                        size+=n;total+=n;
                        if(size>limit||total>MAX_TOTAL)throw new IOException("聊天 ZIP 解压大小超过限制");
                        crc.update(bytes,0,n);target.write(bytes,0,n);
                    }
                }
                if(size!=entry.getSize()||crc.getValue()!=entry.getCrc())throw new IOException("聊天 ZIP 已损坏，未导入任何内容");
                if(transcript) {
                    result.text=StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(text.toByteArray())).toString()
                        .replace("\uFEFF","").replace("\r\n","\n").replace('\r','\n');
                    if(result.text.trim().isEmpty()||result.text.length()>8*1024*1024)throw new IOException("聊天正文为空或超过 8MB");
                } else {
                    if(size==0)throw new IOException("聊天 ZIP 含空附件");
                    result.parts.add(new Part(name,type,size,index));
                }
            }
            if(result.text==null)throw new IOException("不是支持的微信聊天 ZIP：缺少 Chat history.txt");
            // Do not silently import a broken image reference as a complete conversation.
            Matcher refs=Pattern.compile("(?m)^\\s*·?\\[(?:Photo|Image|Video|File|图片|视频|文件)\\] ([^\\n]+)$").matcher(result.text);
            Set<String> media=new HashSet<>();for(Part part:result.parts)media.add(part.name);
            while(refs.find())if(!media.contains(refs.group(1).trim()))throw new IOException("聊天 ZIP 缺少引用的附件："+refs.group(1));
            return result;
        } catch(Exception error) {
            for(File file:created)file.delete();
            if(error instanceof IOException)throw (IOException)error;
            throw new IOException("聊天 ZIP 无法读取；可能已加密、损坏或格式不支持",error);
        }
    }
}
