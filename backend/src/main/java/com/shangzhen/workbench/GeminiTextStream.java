package com.shangzhen.workbench;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/** Reads Gemini SSE without treating an interrupted partial answer as complete. */
final class GeminiTextStream {
    private static final ScheduledExecutorService DEADLINES = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "gemini-stream-deadline"); t.setDaemon(true); return t;
    });

    static String generate(HttpClient http, HttpRequest request, ObjectMapper json,
                           Duration timeout, Consumer<String> progress) throws Exception {
        long started = System.nanoTime();
        var response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
        try (InputStream body = response.body()) {
            if (response.statusCode() != 200) throw providerError(response.statusCode(), body, json);
            if (!response.headers().firstValue("Content-Type").orElse("").contains("text/event-stream"))
                throw new IllegalStateException("生成服务未返回流式内容");
            AtomicBoolean expired = new AtomicBoolean();
            long remaining = Math.max(0, timeout.toNanos() - (System.nanoTime() - started));
            var deadline = DEADLINES.schedule(() -> {
                expired.set(true);
                try { body.close(); } catch (IOException ignored) { }
            }, remaining, TimeUnit.NANOSECONDS);
            StringBuilder answer = new StringBuilder(), event = new StringBuilder();
            try (var reader = new BufferedReader(new InputStreamReader(body, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (expired.get()) throw new HttpTimeoutException("stream deadline");
                    if (line.isEmpty()) {
                        if (!event.isEmpty() && accept(event.toString(), json, answer, progress)) return answer.toString().trim();
                        event.setLength(0);
                    } else if (line.startsWith("data:")) {
                        if (!event.isEmpty()) event.append('\n');
                        event.append(line.substring(5).stripLeading());
                        if (event.length() > 1_000_000) throw new IllegalStateException("生成服务返回内容过大");
                    }
                }
                if (expired.get()) throw new HttpTimeoutException("stream deadline");
                if (!event.isEmpty() && accept(event.toString(), json, answer, progress)) return answer.toString().trim();
                throw new IOException("stream ended without STOP");
            } catch (IOException e) {
                if (expired.get()) throw new HttpTimeoutException("stream deadline");
                throw e;
            } finally { deadline.cancel(false); }
        }
    }

    private static IllegalStateException providerError(int status, InputStream body, ObjectMapper json) throws IOException {
        String response = new String(body.readNBytes(8192), StandardCharsets.UTF_8);
        String code = "", message = "";
        try {
            var error = json.readTree(response).path("error");
            code = error.path("code").asText("");
            message = error.path("message").asText("");
        } catch (Exception ignored) { }
        if (status == 503 && (code.equals("system_disk_overloaded") || message.toLowerCase().contains("disk overloaded")))
            return new IllegalStateException("模型服务商系统过载（HTTP 503）；已保存内容保留，请稍后再试");
        if (status == 503) return new IllegalStateException("模型服务商暂时不可用（HTTP 503）；已保存内容保留，请稍后再试");
        if (status == 429) return new IllegalStateException("模型服务商限流（HTTP 429）；已保存内容保留，请稍后再试");
        return new IllegalStateException("生成服务返回HTTP " + status);
    }

    private static boolean accept(String data, ObjectMapper json, StringBuilder answer, Consumer<String> progress) throws IOException {
        if (data.equals("[DONE]")) return false;
        var root = json.readTree(data);
        if (root.has("error")) throw new IllegalStateException("生成服务返回流式错误");
        var candidate = root.path("candidates").path(0);
        for (var part : candidate.path("content").path("parts")) {
            if (!part.path("thought").asBoolean()) answer.append(part.path("text").asText(""));
        }
        if (answer.length() > 100_000) throw new IllegalStateException("生成内容过长");
        if (!answer.isEmpty()) progress.accept(answer.toString());
        String finish = candidate.path("finishReason").asText("");
        if (finish.equals("FINISH_REASON_UNSPECIFIED")) finish = "";
        if (!finish.isEmpty() && !finish.equals("STOP")) throw new IllegalStateException("生成内容未完整结束（" + finish.replaceAll("[^A-Z_]", "") + "）");
        return finish.equals("STOP") && !answer.toString().isBlank();
    }
}
