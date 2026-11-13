package com.shangzhen.workbench;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

@Service
public class OssReferenceService {
    private final String bucket,endpoint,id,secret;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).followRedirects(HttpClient.Redirect.NEVER).build();
    public OssReferenceService(@Value("${app.oss.bucket:}") String bucket,@Value("${app.oss.endpoint:}") String endpoint,@Value("${app.oss.access-key-id:}") String id,@Value("${app.oss.access-key-secret:}") String secret){this.bucket=bucket.trim();this.endpoint=endpoint.trim().replaceAll("/+$","");this.id=id.trim();this.secret=secret.trim();}
    public boolean enabled(){return !bucket.isBlank()&&!endpoint.isBlank()&&!id.isBlank()&&!secret.isBlank();}
    static String signature(String secret,String value) throws Exception {Mac mac=Mac.getInstance("HmacSHA1");mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA1"));return Base64.getEncoder().encodeToString(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));}
    private String base(){
        if(!enabled())throw Store.bad("OSS尚未配置，无法提供商品参考图链接");URI u=URI.create(endpoint);
        if(!"https".equals(u.getScheme())||u.getHost()==null||!u.getHost().endsWith(".aliyuncs.com")||u.getUserInfo()!=null||u.getPort()!=-1||!bucket.matches("[a-z0-9][a-z0-9-]{1,61}[a-z0-9]"))throw Store.bad("OSS端点须为阿里云HTTPS地址");
        return "https://"+(u.getHost().startsWith(bucket+".")?u.getHost():bucket+"."+u.getHost());
    }
    public String publish(String client,byte[] bytes) throws Exception {
        if(!client.matches("[a-zA-Z0-9-]{1,60}")||bytes.length==0||bytes.length>3*1024*1024)throw Store.bad("商品参考图无效");
        String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));String object="ai-saas/video-reference/"+client+"/"+hash+".jpg",resource="/"+bucket+"/"+object;
        String date=DateTimeFormatter.RFC_1123_DATE_TIME.format(ZonedDateTime.now(ZoneOffset.UTC));String canonical="PUT\n\nimage/jpeg\n"+date+"\nx-oss-object-acl:private\n"+resource;
        HttpRequest put=HttpRequest.newBuilder(URI.create(base()+"/"+object)).timeout(Duration.ofSeconds(45)).header("Date",date).header("Content-Type","image/jpeg").header("x-oss-object-acl","private").header("Authorization","OSS "+id+":"+signature(secret,canonical)).PUT(HttpRequest.BodyPublishers.ofByteArray(bytes)).build();
        int status=http.send(put,HttpResponse.BodyHandlers.discarding()).statusCode();if(status<200||status>=300)throw new IllegalStateException("OSS上传失败（HTTP "+status+"），请核对存储配置；未提交视频生成");
        long expiry=Instant.now().getEpochSecond()+86400;String sig=signature(secret,"GET\n\n\n"+expiry+"\n"+resource);
        String url=base()+"/"+object+"?OSSAccessKeyId="+URLEncoder.encode(id,StandardCharsets.UTF_8)+"&Expires="+expiry+"&Signature="+URLEncoder.encode(sig,StandardCharsets.UTF_8);
        var check=http.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(30)).header("Range","bytes=0-31").GET().build(),HttpResponse.BodyHandlers.ofByteArray());
        if(check.statusCode()!=200&&check.statusCode()!=206||check.body().length<Math.min(32,bytes.length)||!Arrays.equals(Arrays.copyOf(check.body(),Math.min(32,bytes.length)),Arrays.copyOf(bytes,Math.min(32,bytes.length))))throw new IllegalStateException("OSS参考图链接验证失败，未提交视频生成");
        return url;
    }
}
