package com.shangzhen.workbench;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.http.client.MultipartBodyBuilder;

import java.nio.file.Path;

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

    public String submit(String prompt, int seconds, Path reference, String mime, String filename) {
        MultipartBodyBuilder form = new MultipartBodyBuilder();
        form.part("model", model);
        form.part("prompt", prompt);
        form.part("seconds", String.valueOf(seconds));
        form.part("size", size);
        if(reference != null) form.part("input_reference", new FileSystemResource(reference))
                .filename(filename).contentType(MediaType.parseMediaType(mime));
        JsonNode response = http.post().uri("/videos").body(form.build()).retrieve().body(JsonNode.class);
        String id = response == null ? null : text(response, "id");
        if (id == null || id.isBlank()) throw new IllegalStateException("视频供应商没有返回任务编号");
        return id;
    }

    public VideoStatus status(String id) {
        JsonNode response = http.get().uri("/videos/{id}", id).retrieve().body(JsonNode.class);
        if (response == null) throw new IllegalStateException("视频供应商返回了空任务状态");
        String status = text(response, "status");
        int progress = response.path("progress").asInt(status != null && status.equalsIgnoreCase("completed") ? 100 : 10);
        String error = response.path("error").isObject() ? text(response.path("error"), "message") : text(response, "error");
        return new VideoStatus(status == null ? "" : status.toLowerCase(), Math.max(0, Math.min(99, progress)), error);
    }

    public byte[] download(String id) {
        byte[] content = http.get().uri("/videos/{id}/content", id).retrieve().body(byte[].class);
        if (content == null || content.length == 0) throw new IllegalStateException("视频供应商返回了空文件");
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
