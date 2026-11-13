package com.shangzhen.workbench;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.awaitility.Awaitility.await;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:analysis;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE","app.storage=./target/analysis-media","app.worker-delay=3600000","app.product-analysis.poll-delay=3600000","app.ai.mode=openai","app.ai.api-key=test-key","app.ai.model=test-vision"})
@AutoConfigureMockMvc
class ProductAnalysisTest {
    static final AtomicReference<String> requestBody=new AtomicReference<>("");
    static volatile boolean fail;
    static final HttpServer server;
    static {
        try {
            server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
            server.createContext("/v1/chat/completions",exchange->{
                requestBody.set(new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));
                String content="{\"appearance\":\"灰色鞋面与白色鞋底\",\"summary\":\"鞋子\",\"showcase_points\":[{\"part\":\"鞋面\",\"where\":\"上方\",\"what\":\"灰色网眼纹理\"}],\"image_views\":[{\"image\":\"1\",\"view\":\"侧面\"}]}";
                String response=fail?"upstream-failure":"{\"choices\":[{\"finish_reason\":\"stop\",\"message\":{\"content\":"+new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(content)+"}}]}";
                byte[] bytes=response.getBytes(StandardCharsets.UTF_8);exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(fail?503:200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();
            });server.start();
        } catch(Exception e) {throw new RuntimeException(e);}
    }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {registry.add("app.ai.base-url",()->"http://127.0.0.1:"+server.getAddress().getPort()+"/v1");}
    @AfterAll static void stopServer() {server.stop(0);}
    @Autowired Store s;
    @Autowired MockMvc mvc;
    @MockitoSpyBean ProductAnalysisService analysis;
    @Test void asyncAnalysisPersistsEditsSourcesAndProtectsPriorResult() throws Exception {
        fail=false;
        doReturn(new byte[]{1,2,3}).when(analysis).readImage(any(Path.class));
        String client=Store.id(),first=Store.id(),second=Store.id();
        s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",client,"admin","商品分析测试","服饰",Store.now());
        for(String id:List.of(first,second)) s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",id,client,"test.png","PRODUCT","SKU1","","image/png",3,"test.png",s.write(Map.of("productName","鞋子")),Store.now());
        String path="/api/clients/"+client+"/product-groups/"+first+"/analysis";
        mvc.perform(get(path).with(user("intruder"))).andExpect(status().isNotFound());
        mvc.perform(get(path).with(user("admin"))).andExpect(jsonPath("$.status").value("EMPTY"));
        mvc.perform(post(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"brief\":\"灰色鞋子\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("QUEUED"));
        mvc.perform(post(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"brief\":\"重复提交\"}"))
            .andExpect(status().isConflict());
        analysis.tick();await().atMost(Duration.ofSeconds(15)).until(()->analysis.get(client,first).get("status").equals("COMPLETED"));
        var result=analysis.get(client,first);
        assertThat(result.get("stale")).isEqualTo(false);
        assertThat(requestBody.get()).contains("data:image/jpeg;base64,","图片1","图片2").doesNotContain("/api/clients/");
        assertThat(analysis.get(client,second).get("report")).isEqualTo(result.get("report"));
        Map<String,Object> report=new HashMap<>((Map<String,Object>)result.get("report"));report.put("appearance","手动核对后的灰色网眼鞋面");
        String update=s.write(Map.of("revision",result.get("revision"),"report",report,"brief","灰色鞋子"));
        mvc.perform(put(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(update)).andExpect(status().isOk()).andExpect(jsonPath("$.report.appearance").value("手动核对后的灰色网眼鞋面"));
        mvc.perform(put(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(update)).andExpect(status().isConflict());
        fail=true;analysis.start(client,first,"灰色鞋子");analysis.tick();
        await().atMost(Duration.ofSeconds(15)).until(()->analysis.get(client,first).get("status").equals("FAILED"));
        assertThat(((Map<?,?>)analysis.get(client,first).get("report")).get("appearance")).isEqualTo("手动核对后的灰色网眼鞋面");
        s.db.update("UPDATE assets SET sku='SKU2' WHERE id=?",first);
        assertThat(analysis.get(client,first).get("stale")).isEqualTo(true);
    }
    @Test void invalidReferencesAndMissingVisualContentAreRejected() {
        assertThatThrownBy(()->ProductAnalysisService.cleanReport(Map.of("image_views",List.of(Map.of("image","50","view","不存在"))),false,2)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(()->ProductAnalysisService.cleanReport(Map.of("summary","没有看图"),true,2)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
}
