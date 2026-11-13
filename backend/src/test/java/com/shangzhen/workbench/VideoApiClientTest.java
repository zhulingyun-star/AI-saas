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
                response = new byte[]{0, 1, 2, 3};
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
        Path reference = temp.resolve("ref.png");
        Files.write(reference, new byte[]{1, 2});
        String id = client.submit("test prompt", 8, reference, "image/png", "ref.png");
        assertThat(id).isEqualTo("video-task-1");
        assertThat(authorization.get()).isEqualTo("Bearer test-key");
        assertThat(requestBody.get()).contains("name=\"model\"", "seedance-2.5-m2", "name=\"prompt\"", "test prompt", "name=\"seconds\"", "8", "name=\"size\"", "720x1280", "name=\"input_reference\"", "filename=\"ref.png\"");

        var state = client.status(id);
        assertThat(state.status()).isEqualTo("in_progress");
        assertThat(state.progress()).isEqualTo(42);
        assertThat(client.download(id)).isEqualTo(new byte[]{0, 1, 2, 3});
        assertThat(authorization.get()).isEqualTo("Bearer test-key");
    }
}
