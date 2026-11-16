package com.shangzhen.workbench;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.LocalDateTime;
import java.util.*;

public final class Models {
    private Models() {}
    public record Client(String id, String name, String category, LocalDateTime createdAt) {}
    public record ClientInput(@NotBlank @Size(max=100) String name, @NotBlank @Size(max=60) String category) {}
    public record Login(@NotBlank @Size(max=100) String username, @NotBlank @Size(max=200) String password) {}
    public record Shot(@Min(1) @Max(60) int duration, @NotBlank @Size(max=2000) String visual,
                       @Size(max=1000) String narration, String assetId, @Min(0) @Max(3600) int startAt, boolean locked) {}
    public record ProjectInput(@NotBlank @Size(max=150) String name, @Size(max=100) String sku,
        @NotBlank @Size(max=60) String category, @NotBlank @Size(max=40) String platform,
        @NotBlank @Size(max=60) String format, @Min(4) @Max(60) int duration,
        @NotBlank @Size(max=8000) String facts, boolean factsConfirmed,
        @NotNull @Size(max=20) List<@Valid Shot> shots,
        @NotNull Map<String, Object> config, @Min(0) int revision) {}
    public record OneClickStart(@NotNull @Valid ProjectInput project, boolean confirmed) {}
    public record Project(String id, String clientId, String name, String sku, String category, String platform,
        String format, int duration, String facts, boolean factsConfirmed, List<Shot> shots,
        Map<String, Object> config, String status, int revision, LocalDateTime createdAt, LocalDateTime updatedAt) {}
    public record Asset(String id, String clientId, String name, String kind, String sku, String tags, String mime,
        long sizeBytes, Map<String,Object> metadata, LocalDateTime createdAt) {}
    public record AssetInput(@NotBlank @Size(max=255) String name, @NotBlank String kind,
        @Size(max=100) String sku, @Size(max=500) String tags, @NotNull Map<String,Object> metadata) {}
    public record Submit(@NotEmpty @Size(max=20) List<String> projectIds, @NotBlank String provider) {}
    public record Batch(@NotEmpty @Size(max=20) List<@Valid ProjectInput> projects) {}
    public record Job(String id, String clientId, String projectId, String name, String provider, String status,
        int progress, String message, boolean hasOutput, int revision, LocalDateTime createdAt, LocalDateTime updatedAt) {}
    public record ReviewInput(@Min(0) @Max(3600) int timecode, @NotBlank String decision,
        @NotBlank @Size(max=2000) String comment) {}
    public record PresetInput(@NotBlank @Size(max=100) String name, @NotBlank String kind,
        @NotBlank @Size(max=10000) String content, boolean enabled) {}
    public record Preset(String id, String name, String kind, String content, boolean enabled) {}
}
