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
    public Asset upload(String client,String user,String kind,String sku,String tags,String productName,String productGroupId,MultipartFile file) throws IOException {
        if(!KINDS.contains(kind)) throw Store.bad("未知素材分类");
        String mime=Objects.toString(file.getContentType(),"");
        if(!MIMES.containsKey(mime)) throw Store.bad("支持 JPG、PNG、WebP、MP4、MOV、WebM、MP3、WAV 和 OGG");
        if(file.isEmpty()) throw Store.bad("文件为空");
        if(sku.length()>100||tags.length()>500) throw Store.bad("SKU 或标签过长");
        if(productName.length()>100||productGroupId.length()>100) throw Store.bad("商品信息过长");
        String id=Store.id(), stored=id+"."+MIMES.get(mime);
        String name=Objects.toString(file.getOriginalFilename(),"未命名素材").replace('\\','/');name=name.substring(name.lastIndexOf('/')+1);
        if(name.length()>255) name=name.substring(name.length()-255);
        Path path=root.resolve(stored);file.transferTo(path);
        Map<String,Object> metadata=new HashMap<>();
        if(!productName.isBlank()) metadata.put("productName",productName.trim());
        if(kind.equals("PRODUCT")&&!productGroupId.isBlank()) metadata.put("productGroupId",productGroupId);
        try {s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",id,client,name,kind,sku,tags,mime,file.getSize(),stored,s.write(metadata),Store.now());}
        catch(RuntimeException e) {Files.deleteIfExists(path);throw e;}
        s.audit(client,user,"上传素材",name);return s.asset(client,id);
    }
    static String productKey(Asset asset) {
        String group=Objects.toString(asset.metadata().get("productGroupId"),"");
        String name=Objects.toString(asset.metadata().get("productName"),"").trim();
        return !group.isBlank()?"group:"+group:!asset.sku().isBlank()?"sku:"+asset.sku().trim():!name.isBlank()?"name:"+name.toLowerCase(Locale.ROOT):"asset:"+asset.id();
    }
    public List<Asset> productMembers(String client,String id) {
        Asset anchor=s.asset(client,id);
        if(!anchor.kind().equals("PRODUCT")) throw Store.bad("请选择商品素材组");
        return s.db.query("SELECT * FROM assets WHERE client_id=? AND kind='PRODUCT' ORDER BY created_at,id",s.assets,client).stream().filter(a->productKey(a).equals(productKey(anchor))).toList();
    }
    @org.springframework.transaction.annotation.Transactional
    public String ensureProductGroup(String client,String id) {
        List<Asset> members=productMembers(client,id);
        String existing=Objects.toString(members.get(0).metadata().get("productGroupId"),"");
        if(!existing.isBlank()) return existing;
        String group=Store.id();
        for(Asset member:members) {
            Map<String,Object> metadata=new HashMap<>(member.metadata());metadata.put("productGroupId",group);
            s.db.update("UPDATE assets SET metadata=? WHERE client_id=? AND id=?",s.write(metadata),client,member.id());
        }
        return group;
    }
    @org.springframework.transaction.annotation.Transactional
    public List<Asset> editProduct(String client,String id,String name,String sku) {
        Asset anchor=s.asset(client,id);
        if(!anchor.kind().equals("PRODUCT")) throw Store.bad("请选择商品素材组");
        String key=productKey(anchor);
        String group=Objects.toString(anchor.metadata().get("productGroupId"),"");
        if(group.isBlank()) group=Store.id();
        List<Asset> members=s.db.query("SELECT * FROM assets WHERE client_id=? AND kind='PRODUCT' ORDER BY created_at,id",s.assets,client).stream().filter(a->productKey(a).equals(key)).toList();
        for(Asset member:members) {
            Map<String,Object> metadata=new HashMap<>(member.metadata());
            metadata.put("productGroupId",group);metadata.put("productName",name.trim());
            s.db.update("UPDATE assets SET sku=?,metadata=? WHERE client_id=? AND id=?",sku.trim(),s.write(metadata),client,member.id());
        }
        return members.stream().map(a->s.asset(client,a.id())).toList();
    }
    Path assetPath(String client,String id) {
        s.asset(client,id);return resolve(s.db.queryForObject("SELECT storage_name FROM assets WHERE id=?",String.class,id));
    }
    @org.springframework.transaction.annotation.Transactional
    public List<Asset> setProductCover(String client,String id,String coverId) {
        Asset anchor=s.asset(client,id);
        if(!anchor.kind().equals("PRODUCT")) throw Store.bad("请选择商品素材组");
        List<Asset> members=s.db.query("SELECT * FROM assets WHERE client_id=? AND kind='PRODUCT' ORDER BY created_at,id",s.assets,client).stream().filter(a->productKey(a).equals(productKey(anchor))).toList();
        Asset cover=members.stream().filter(a->a.id().equals(coverId)).findFirst().orElseThrow(()->Store.bad("封面必须是此商品的图片"));
        if(!cover.mime().startsWith("image/")) throw Store.bad("请选择图片作为封面");
        for(Asset member:members) {
            Map<String,Object> metadata=new HashMap<>(member.metadata());
            metadata.put("coverAssetId",coverId);
            s.db.update("UPDATE assets SET metadata=? WHERE client_id=? AND id=?",s.write(metadata),client,member.id());
        }
        return members.stream().map(a->s.asset(client,a.id())).toList();
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
