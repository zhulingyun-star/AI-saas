package com.shangzhen.workbench;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.*;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import java.nio.file.*;
import java.io.*;
import java.util.*;
import static com.shangzhen.workbench.Models.*;

@Service
public class MediaService {
    final Store s; final Path root;
    static final Set<String> KINDS=Set.of("PRODUCT","REFERENCE","MODEL","GARMENT","VOICE","OTHER");
    // Exclude SVG/HTML and arbitrary executable formats from inline serving.
    static final Map<String,String> MIMES=Map.of("image/jpeg","jpg","image/png","png","image/webp","webp","video/mp4","mp4","video/webm","webm","video/quicktime","mov","audio/mpeg","mp3","audio/wav","wav","audio/x-wav","wav","audio/ogg","ogg");
    public MediaService(Store s,@Value("${app.storage}") String root) throws IOException {this.s=s;this.root=Path.of(root).toAbsolutePath().normalize();Files.createDirectories(this.root);}
    public Asset upload(String client,String user,String kind,String sku,String tags,MultipartFile file) throws IOException {
        if(!KINDS.contains(kind)) throw Store.bad("未知素材分类");
        String mime=Objects.toString(file.getContentType(),"");
        if(!MIMES.containsKey(mime)) throw Store.bad("支持 JPG、PNG、WebP、MP4、MOV、WebM、MP3、WAV 和 OGG");
        if(file.isEmpty()) throw Store.bad("文件为空");
        if(sku.length()>100||tags.length()>500) throw Store.bad("SKU 或标签过长");
        String id=Store.id(), stored=id+"."+MIMES.get(mime);
        String name=Objects.toString(file.getOriginalFilename(),"未命名素材").replace('\\','/');name=name.substring(name.lastIndexOf('/')+1);
        if(name.length()>255) name=name.substring(name.length()-255);
        Path path=root.resolve(stored);file.transferTo(path);
        try {s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",id,client,name,kind,sku,tags,mime,file.getSize(),stored,"{}",Store.now());}
        catch(RuntimeException e) {Files.deleteIfExists(path);throw e;}
        s.audit(client,user,"上传素材",name);return s.asset(client,id);
    }
    Path assetPath(String client,String id) {
        s.asset(client,id);return resolve(s.db.queryForObject("SELECT storage_name FROM assets WHERE id=?",String.class,id));
    }
    Path resolve(String name) {
        if(name==null) throw Store.bad("文件尚未生成");
        Path p=root.resolve(name).normalize();if(!p.startsWith(root)) throw Store.bad("无效文件路径");return p;
    }
    ResponseEntity<Resource> file(Path p,String mime,String name,boolean attachment) throws IOException {
        if(!Files.isRegularFile(p)) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND,"文件不存在");
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(mime)).contentLength(Files.size(p))
            .header(HttpHeaders.CONTENT_DISPOSITION,(attachment?ContentDisposition.attachment():ContentDisposition.inline()).filename(name,java.nio.charset.StandardCharsets.UTF_8).build().toString())
            .header(HttpHeaders.CACHE_CONTROL,"private, no-store").body(new FileSystemResource(p));
    }
}
