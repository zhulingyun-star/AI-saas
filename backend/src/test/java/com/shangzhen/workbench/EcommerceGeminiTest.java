package com.shangzhen.workbench;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.*;
import static com.shangzhen.workbench.Models.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:ecommerce-gemini;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE","app.storage=./target/ecommerce-gemini-media","app.worker-delay=3600000"})
class EcommerceGeminiTest {
    @Autowired Store s;
    @Test void frameworksShotsAndAutomaticPlanUseNativeGeminiStreamAndParseCompleteJson() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var calls=new AtomicInteger();
        List<String> paths=Collections.synchronizedList(new ArrayList<>());
        List<String> inputs=Collections.synchronizedList(new ArrayList<>());
        server.createContext("/",exchange->{
            inputs.add(new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));paths.add(exchange.getRequestURI().toString());
            int call=calls.getAndIncrement();
            Object result;
            var shots=List.of(new AiService.DraftShot(1,"鞋面近景","灰白拼接"),new AiService.DraftShot(1,"鞋侧细节","看看鞋型"),new AiService.DraftShot(1,"鞋底近景","拼色鞋底"),new AiService.DraftShot(1,"双鞋全貌","查看详情"));
            if(call==0)result=new AiService.FrameworkResult(List.of(new AiService.FrameworkOption("a","细节证据","鞋面近景","从整体到细节","拼接外观","查看详情"),new AiService.FrameworkOption("b","场景展示","出门选鞋","日常穿搭","上脚外观","查看详情"),new AiService.FrameworkOption("c","外观展示","双鞋全貌","多角度展示","灰白配色","查看详情")));
            else if(call==1)result=new AiService.Draft(shots);
            else result=new AiService.OneClickDraft("细节证据","从整体到细节",shots);
            String answer=s.write(result);
            String wire="data: "+s.write(Map.of("candidates",List.of(Map.of("finishReason","STOP","content",Map.of("parts",List.of(Map.of("text",answer)))))))+"\n\n";
            exchange.getResponseHeaders().add("Content-Type","text/event-stream");exchange.sendResponseHeaders(200,0);
            exchange.getResponseBody().write(wire.getBytes(StandardCharsets.UTF_8));exchange.close();
        });server.start();
        try {
            AiService ai=new AiService(s,"openai","http://127.0.0.1:"+server.getAddress().getPort()+"/v1","test-key","gemini-test");
            Project work=new Project("test","test-client","鞋子","","服饰鞋包","抖音","电商短视频",4,"灰白鞋面拼接",true,List.of(),Map.of("selectedFramework",Map.of("title","细节证据")),"DRAFT",0,Store.now(),Store.now());
            assertThat(ai.frameworks(work)).hasSize(3);
            assertThat((List<?>)ai.draft(work).get("shots")).hasSize(4);
            assertThat(ai.oneClickDraft(work).shots()).hasSize(4);
            assertThat(paths).hasSize(3).allMatch(path->path.equals("/v1beta/models/gemini-test:streamGenerateContent?alt=sse"));
            assertThat(inputs.get(1)).contains("selectedFramework","细节证据");
        }finally{server.stop(0);}
    }
}
