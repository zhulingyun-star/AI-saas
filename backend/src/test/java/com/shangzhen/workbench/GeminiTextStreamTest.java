package com.shangzhen.workbench;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

class GeminiTextStreamTest {
    private static String chunk(String text, String finish) {
        return "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\""+text+"\"}]}"+
            (finish.isEmpty()?",\"finishReason\":null":",\"finishReason\":\""+finish+"\"")+"}]}\n\n";
    }
    @Test void deliversPartialTextBeforeCompletionAndIgnoresThoughts() throws Exception {
        CountDownLatch received = new CountDownLatch(1);
        List<String> updates = new CopyOnWriteArrayList<>();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",exchange->{
            exchange.getResponseHeaders().add("Content-Type","text/event-stream");exchange.sendResponseHeaders(200,0);
            try(var out=exchange.getResponseBody()) {
                out.write(("data: {\"candidates\":[{\"content\":{\"parts\":[{\"thought\":true,\"text\":\"private\"}]}}]}\n\n"+chunk("鞋面", "")).getBytes(StandardCharsets.UTF_8));out.flush();
                try { if(!received.await(3,TimeUnit.SECONDS)) return; } catch(InterruptedException e){Thread.currentThread().interrupt();return;}
                out.write(chunk("细节", "STOP").getBytes(StandardCharsets.UTF_8));
            }
        });server.start();
        try {
            String result=GeminiTextStream.generate(HttpClient.newHttpClient(),request(server),new ObjectMapper(),Duration.ofSeconds(5),text->{updates.add(text);received.countDown();});
            assertThat(result).isEqualTo("鞋面细节");assertThat(updates).containsExactly("鞋面","鞋面细节");
        } finally {server.stop(0);}
    }
    @Test void disconnectDoesNotPromotePartialAnswer() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);List<String> updates=new ArrayList<>();
        server.createContext("/",exchange->{exchange.getResponseHeaders().add("Content-Type","text/event-stream");exchange.sendResponseHeaders(200,0);try(var out=exchange.getResponseBody()){out.write(chunk("未完成", "").getBytes(StandardCharsets.UTF_8));}});server.start();
        try {
            assertThatThrownBy(()->GeminiTextStream.generate(HttpClient.newHttpClient(),request(server),new ObjectMapper(),Duration.ofSeconds(5),updates::add)).isInstanceOf(java.io.IOException.class);
            assertThat(updates).containsExactly("未完成");
        } finally {server.stop(0);}
    }
    @Test void deadlineAlsoCoversStalledResponseBody() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);CountDownLatch close=new CountDownLatch(1);
        server.createContext("/",exchange->{exchange.getResponseHeaders().add("Content-Type","text/event-stream");exchange.sendResponseHeaders(200,0);try(var out=exchange.getResponseBody()){out.write(": waiting\n\n".getBytes(StandardCharsets.UTF_8));out.flush();try{close.await(3,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}}});server.start();
        try {
            assertThatThrownBy(()->GeminiTextStream.generate(HttpClient.newHttpClient(),request(server),new ObjectMapper(),Duration.ofMillis(200),text->{})).isInstanceOf(HttpTimeoutException.class);
        } finally {close.countDown();server.stop(0);}
    }
    private HttpRequest request(HttpServer server){return HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/")).timeout(Duration.ofSeconds(5)).GET().build();}
}
