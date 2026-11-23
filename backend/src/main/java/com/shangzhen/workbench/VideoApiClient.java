package com.shangzhen.workbench;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import java.util.*;

@Component
public class VideoApiClient {
    private final RestClient http;
    private final ObjectMapper json;
    private final String model;
    private final String size;
    private final boolean enabled;

    public VideoApiClient(RestClient.Builder builder, ObjectMapper json,
                          @Value("${app.video.base-url}") String baseUrl,
                          @Value("${app.video.api-key}") String key,
                          @Value("${app.video.model}") String model,
                          @Value("${app.video.size}") String size,
                          @Value("${app.video.enabled:false}") boolean enabled) {
        this.json = json;
        this.model = model;
        this.size = size;
        this.enabled = enabled && !key.isBlank();
        this.http = builder.baseUrl(trimSlash(baseUrl)).defaultHeader("Authorization", "Bearer " + key)
                .defaultHeader("Accept", MediaType.APPLICATION_JSON_VALUE).build();
    }

    public boolean enabled() { return enabled; }
    public String model() { return model; }

    public String defaultResolution(){return size.startsWith("480")?"480p":size.startsWith("1080")?"1080p":"720p";}
    public String submit(String prompt, int seconds, List<String> references,String resolution,String ratio) {
        if(seconds<4||seconds>30)throw Store.bad("视频生成支持4至30秒");
        if(prompt==null||prompt.isBlank()||prompt.length()>5000)throw Store.bad("视频提示词须为1至5000字");
        if(!Set.of("480p","720p","1080p").contains(resolution))throw Store.bad("视频清晰度无效");
        if(!Set.of("9:16","16:9").contains(ratio))throw Store.bad("视频画幅无效");
        if(references==null||references.isEmpty()||references.size()>30)throw Store.bad("请提供1至30张商品参考图");
        for(String ref:references){java.net.URI uri;try{uri=java.net.URI.create(ref);}catch(Exception e){throw Store.bad("商品参考图链接无效");}if(!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null)throw Store.bad("视频通道要求HTTPS商品图片链接，不接受Base64");}
        Map<String,Object> body=new LinkedHashMap<>();body.put("model",model.replaceFirst("-(480p|720p|1080p)$","")+"-"+resolution);
        body.put("prompt",prompt);body.put("duration",seconds);body.put("ratio",ratio);body.put("resolution",resolution);body.put("referenceImages",references);
        JsonNode response = http.post().uri("/videos").contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode.class);
        JsonNode root=response==null?null:response.has("data")&&response.path("data").isObject()?response.path("data"):response;
        String id = root == null ? null : text(root, "id");
        if((id==null||id.isBlank())&&root!=null)id=text(root,"task_id");
        if (id == null || id.isBlank()) throw new IllegalStateException("视频供应商没有返回任务编号");
        return id;
    }

    public VideoStatus status(String id) {
        JsonNode response = http.get().uri("/videos/{id}", id).retrieve().body(JsonNode.class);
        if (response == null) throw new IllegalStateException("视频供应商返回了空任务状态");
        if(response.path("data").isObject())response=response.path("data");
        String status = text(response, "status");
        if("succeeded".equalsIgnoreCase(status))status="completed";
        int progress = response.path("progress").asInt(status != null && status.equalsIgnoreCase("completed") ? 100 : 10);
        String error = response.path("error").isObject() ? text(response.path("error"), "message") : text(response, "error");
        return new VideoStatus(status == null ? "" : status.toLowerCase(), Math.max(0, Math.min(99, progress)), error);
    }

    public byte[] download(String id) {
        byte[] content = http.get().uri("/videos/{id}/content", id).retrieve().body(byte[].class);
        if (content == null || content.length < 12 || !new String(content,4,4,java.nio.charset.StandardCharsets.US_ASCII).equals("ftyp")) throw new IllegalStateException("视频供应商返回的不是MP4文件");
        return content;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    private static String trimSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    public record VideoStatus(String status, int progress, String error) {}
}
