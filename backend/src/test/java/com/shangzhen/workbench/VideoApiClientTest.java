package com.shangzhen.workbench;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;
import org.junit.jupiter.api.io.TempDir;

import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class VideoApiClientTest {
    private HttpServer server;
    private AtomicReference<String> requestBody;
    private AtomicReference<String> authorization;
    private VideoApiClient client;
    @TempDir Path temp;

    @BeforeEach void startServer() throws Exception {
        requestBody = new AtomicReference<>();
        authorization = new AtomicReference<>();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/videos", exchange -> {
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            String path = exchange.getRequestURI().getPath();
            byte[] response;
            if (exchange.getRequestMethod().equals("POST")) {
                requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                response = "{\"id\":\"video-task-1\",\"status\":\"queued\"}".getBytes(StandardCharsets.UTF_8);
            } else if (path.endsWith("/content")) {
                response = new byte[]{0,0,0,12,102,116,121,112,105,115,111,109};
                exchange.getResponseHeaders().set("Content-Type", "video/mp4");
                exchange.sendResponseHeaders(200, response.length);
                exchange.getResponseBody().write(response);
                exchange.close();
                return;
            } else {
                response = "{\"id\":\"video-task-1\",\"status\":\"in_progress\",\"progress\":42}".getBytes(StandardCharsets.UTF_8);
            }
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();
        client = new VideoApiClient(RestClient.builder(), new ObjectMapper(), "http://127.0.0.1:" + server.getAddress().getPort() + "/v1", "test-key", "seedance-2.5-m2", "720x1280", true);
    }

    @AfterEach void stopServer() { server.stop(0); }

    @Test void submitsOncePollsAndDownloadsWithoutExposingCredentials() throws Exception {
        String reference = "https://example.oss-cn-hangzhou.aliyuncs.com/product.jpg?Expires=123&Signature=test";
        String id = client.submit("test prompt", 4, java.util.List.of(reference), "480p","9:16");
        assertThat(id).isEqualTo("video-task-1");
        assertThat(authorization.get()).isEqualTo("Bearer test-key");
        var payload=new ObjectMapper().readTree(requestBody.get());
        assertThat(payload.path("model").asText()).isEqualTo("seedance-2.5-m2-480p");assertThat(payload.path("duration").asInt()).isEqualTo(4);assertThat(payload.path("resolution").asText()).isEqualTo("480p");assertThat(payload.path("ratio").asText()).isEqualTo("9:16");assertThat(payload.path("referenceImages").path(0).asText()).isEqualTo(reference);assertThat(payload.has("seconds")).isFalse();assertThat(payload.has("input_reference")).isFalse();

        var state = client.status(id);
        assertThat(state.status()).isEqualTo("in_progress");
        assertThat(state.progress()).isEqualTo(42);
        assertThat(client.download(id)).hasSize(12);
        assertThat(authorization.get()).isEqualTo("Bearer test-key");
    }
    @Test void neverFallsBackWhenReferenceOrParametersAreInvalid(){
        org.assertj.core.api.Assertions.assertThatThrownBy(()->client.submit("prompt",4,java.util.List.of(),"480p","9:16")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(()->client.submit("prompt",3,java.util.List.of("data:image/png;base64,AQI="),"480p","9:16")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(()->client.submit("prompt",4,java.util.List.of("data:image/png;base64,AQI="),"480p","9:16")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(()->client.submit("prompt",4,java.util.List.of("https://example.com/a.jpg"),"480p","1:1")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(requestBody.get()).isNull();
    }
    @Test void sendsLandscapeRatioWhenProjectAsksForIt() throws Exception {
        client.submit("prompt",5,java.util.List.of("https://example.oss-cn-hangzhou.aliyuncs.com/a.jpg"),"1080p","16:9");
        var payload=new ObjectMapper().readTree(requestBody.get());
        assertThat(payload.path("ratio").asText()).isEqualTo("16:9");assertThat(payload.path("resolution").asText()).isEqualTo("1080p");assertThat(payload.path("model").asText()).isEqualTo("seedance-2.5-m2-1080p");
    }
}
