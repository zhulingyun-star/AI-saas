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
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.awaitility.Awaitility.await;
import static com.shangzhen.workbench.ReferenceStoryboardService.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:storyboard;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE","app.storage=./target/storyboard-media","app.worker-delay=3600000","app.storyboard.poll-delay=3600000","app.ai.mode=openai","app.ai.api-key=test-key","app.ai.model=test-vision"})
@AutoConfigureMockMvc
class ReferenceStoryboardTest {
    static final List<String> requests=new CopyOnWriteArrayList<>();
    static volatile boolean fail;
    static volatile String output="{}";
    static volatile java.util.concurrent.CountDownLatch gate;
    static final HttpServer server;
    static {try{server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.createContext("/v1beta/models/test-vision:generateContent",e->{
        requests.add(new String(e.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));
        var waiting=gate;if(waiting!=null)try{waiting.await(8,java.util.concurrent.TimeUnit.SECONDS);}catch(InterruptedException interrupted){Thread.currentThread().interrupt();}
        String result=requests.get(requests.size()-1).contains("audio/wav")?"{\"dialogue\":[{\"start\":0,\"end\":1,\"text\":\"不得覆盖字幕\"},{\"start\":2,\"end\":4,\"text\":\"无字幕原声\"}]}":output;
        String body=fail?"gateway timeout":new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(Map.of("candidates",List.of(Map.of("finishReason","STOP","content",Map.of("parts",List.of(Map.of("text",result))))),"usageMetadata",Map.of("promptTokenCount",500)));
        byte[] bytes=body.getBytes(StandardCharsets.UTF_8);e.sendResponseHeaders(fail?524:200,bytes.length);e.getResponseBody().write(bytes);e.close();});server.start();}catch(Exception e){throw new RuntimeException(e);}}
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("app.ai.base-url",()->"http://127.0.0.1:"+server.getAddress().getPort()+"/v1");}
    @AfterAll static void stop(){server.stop(0);}
    @Autowired Store s;@Autowired MockMvc mvc;@Autowired MediaService media;@Autowired ProjectService projects;@MockitoSpyBean ReferenceStoryboardService service;
    @Test void nativeVideoPersistenceEditsSuggestionsConflictAndFailure() throws Exception {
        requests.clear();fail=false;String c=Store.id(),a=Store.id();Path file=media.resolve(a+".mp4");Files.write(file,new byte[]{1,2,3,4});
        s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",c,"admin","分镜测试","美妆",Store.now());
        s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",a,c,"sample.mp4","REFERENCE","","","video/mp4",4,a+".mp4","{}",Store.now());
        doReturn(4d).when(service).duration(any(Path.class));
        doReturn(List.of(shot("a",0,2),shot("b",2,4))).when(service).detect(any(Path.class),anyDouble());
        doReturn(file).when(service).clip(any(Path.class),any(Path.class),anyString(),anyDouble(),anyDouble(),anyBoolean());
        output=s.write(Map.of("shots",List.of(Map.of("id","a","action","展示双瓶","camera","固定","transition","开头","text","","productText","瓶身品牌"),Map.of("id","b","action","连续按压","camera","固定","transition","连续","text","后期功效词","productText","SPF印字")),"dialogue",List.of(Map.of("start",0,"end",2,"text","字幕原文")),"audio_gaps",List.of(),"summary","展示使用","music","背景音乐"));
        String path="/api/clients/"+c+"/assets/"+a+"/storyboard";
        mvc.perform(get(path).with(user("other"))).andExpect(status().isNotFound());
        mvc.perform(post(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"revision\":0,\"confirmed\":false}" )).andExpect(status().isBadRequest());
        mvc.perform(post(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"revision\":0,\"confirmed\":true}" )).andExpect(status().isOk());
        mvc.perform(post(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"revision\":0,\"confirmed\":true}" )).andExpect(status().isConflict());
        gate=new java.util.concurrent.CountDownLatch(1);
        try {
            service.tick();await().atMost(Duration.ofSeconds(5)).until(()->!requests.isEmpty());
            mvc.perform(get(path).with(user("admin"))).andExpect(jsonPath("$.status").value("RUNNING")).andExpect(jsonPath("$.progress.phase").value("读取整片画面与字幕（2个候选镜头）"));
        } finally {gate.countDown();gate=null;}
        await().atMost(Duration.ofSeconds(10)).until(()->service.get(c,a).get("status").equals("COMPLETED"));
        assertThat(requests).hasSize(1);assertThat(requests.get(0)).contains("inlineData","AQIDBA==","video/mp4").doesNotContain("video_url");
        Report report=(Report)service.get(c,a).get("report");assertThat(report.dialogue().get(0).source()).isEqualTo("subtitle");
        assertThat(report.shots().get(0).text()).isEmpty();assertThat(report.shots().get(0).productText()).isEqualTo("瓶身品牌");assertThat(report.shots().get(1).text()).isEqualTo("后期功效词");
        assertThat(((Map<?,?>)service.get(c,a).get("progress")).get("phase")).isEqualTo("分析完成");
        assertThat(requests.get(0)).contains("productText","文字随瓶身透视");
        Report merged=new Report(4,List.of(new Shot("a",0,4,"手动合并","固定","开头","无","","已核对","瓶身品牌")),report.dialogue(),report.summary(),report.music(),List.of());
        int rev=(int)service.get(c,a).get("revision");
        mvc.perform(put(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(Map.of("revision",rev,"report",merged)))).andExpect(status().isOk()).andExpect(jsonPath("$.report.shots.length()").value(1)).andExpect(jsonPath("$.report.shots[0].productText").value("瓶身品牌"));
        mvc.perform(put(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(Map.of("revision",rev,"report",merged)))).andExpect(status().isConflict());
        output="{\"action\":\"补读建议\",\"camera\":\"固定\",\"transition\":\"连续\",\"review\":\"待核对\"}";
        service.start(c,a,new ReferenceStoryboardController.Start((int)service.get(c,a).get("revision"),true,"a",false));service.tick();
        await().atMost(Duration.ofSeconds(10)).until(()->service.get(c,a).get("status").equals("COMPLETED"));
        Report reread=(Report)service.get(c,a).get("report");assertThat(reread.shots().get(0).action()).isEqualTo("手动合并");assertThat(reread.suggestions()).hasSize(1);assertThat(reread.suggestions().get(0).targetEnd()).isEqualTo(4);
        fail=true;service.start(c,a,new ReferenceStoryboardController.Start((int)service.get(c,a).get("revision"),true,"a",true));service.tick();
        await().atMost(Duration.ofSeconds(10)).until(()->service.get(c,a).get("status").equals("FAILED"));
        assertThat(((Report)service.get(c,a).get("report")).shots().get(0).action()).isEqualTo("手动合并");assertThat(requests).hasSize(3);assertThat(service.get(c,a).get("error").toString()).contains("524");
    }
    static Shot shot(String id,double a,double b){return new Shot(id,a,b,"动作","固定","待确认","","","");}
    @Test void referenceDeletionIsScopedRejectsActiveAndReferencedAssetsAndRemovesFiles() throws Exception {
        String c=Store.id(),a=Store.id(),image=Store.id();
        s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",c,"admin","删除参考测试","美妆",Store.now());
        for(String id:List.of(a,image))s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",id,c,"test",id.equals(a)?"REFERENCE":"PRODUCT","","",id.equals(a)?"video/mp4":"image/png",3,id+".bin","{}",Store.now());
        Path source=media.resolve(a+".bin"),thumb=media.resolve("ref-"+a+"-100.jpg");Files.write(source,new byte[]{1,2,3});Files.write(thumb,new byte[]{4});
        String route="/api/clients/"+c+"/assets/"+a+"/reference";
        mvc.perform(delete(route).with(user("other")).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(delete(route).with(user("admin"))).andExpect(status().isForbidden());
        mvc.perform(delete("/api/clients/"+c+"/assets/"+image+"/reference").with(user("admin")).with(csrf())).andExpect(status().isBadRequest());
        s.db.update("INSERT INTO reference_storyboards(client_id,asset_id,status,updated_at) VALUES(?,?,'QUEUED',?)",c,a,Store.now());
        mvc.perform(delete(route).with(user("admin")).with(csrf())).andExpect(status().isConflict());
        assertThat(Files.exists(source)).isTrue();
        s.db.update("UPDATE reference_storyboards SET status='COMPLETED' WHERE asset_id=?",a);
        var p=projects.create(c,"admin",new Models.ProjectInput("引用测试","","美妆","抖音","细节演示",10,"已确认事实",true,List.of(),Map.of("referenceLinks",List.of(Map.of("assetId",a))),0));
        mvc.perform(delete(route).with(user("admin")).with(csrf())).andExpect(status().isConflict());
        s.db.update("UPDATE projects SET config='{}' WHERE id=?",p.id());
        String job=Store.id();s.db.update("INSERT INTO jobs(id,client_id,project_id,name,provider,status,progress,snapshot,message,revision,created_at,updated_at) VALUES(?,?,?,?,'LOCAL','FAILED',0,?,'',0,?,?)",job,c,p.id(),"历史任务",s.write(Map.of("reference",a)),Store.now(),Store.now());
        mvc.perform(delete(route).with(user("admin")).with(csrf())).andExpect(status().isConflict());
        s.db.update("DELETE FROM jobs WHERE id=?",job);
        mvc.perform(delete(route).with(user("admin")).with(csrf())).andExpect(status().isNoContent());
        assertThat(Files.exists(source)).isFalse();assertThat(Files.exists(thumb)).isFalse();
        assertThat(s.db.queryForObject("SELECT COUNT(*) FROM reference_storyboards WHERE asset_id=?",Integer.class,a)).isZero();
        mvc.perform(get("/api/clients/"+c+"/assets/"+a+"/file").with(user("admin"))).andExpect(status().isNotFound());
        mvc.perform(delete(route).with(user("admin")).with(csrf())).andExpect(status().isNotFound());
        assertThat(s.asset(c,image).kind()).isEqualTo("PRODUCT");
    }
    @Test void audioFallbackOnlyFillsGapsAndDoesNotOverwriteSubtitles() throws Exception {
        fail=false;requests.clear();String c=Store.id(),a=Store.id();Path file=media.resolve(a+".mp4");Files.write(file,new byte[]{1,2,3});
        s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",c,"admin","音频补词测试","美妆",Store.now());
        s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",a,c,"sample.mp4","REFERENCE","","","video/mp4",3,a+".mp4","{}",Store.now());
        doReturn(4d).when(service).duration(any(Path.class));doReturn(List.of(shot("a",0,4))).when(service).detect(any(Path.class),anyDouble());doReturn(file).when(service).extractAudio(any(Path.class),any(Path.class));
        output=s.write(Map.of("shots",List.of(Map.of("id","a","action","连续动作")),"dialogue",List.of(Map.of("start",0,"end",2,"text","原字幕")),"audio_gaps",List.of(Map.of("start",2,"end",4))));
        service.start(c,a,new ReferenceStoryboardController.Start(0,true,null,false));service.tick();
        await().atMost(Duration.ofSeconds(10)).until(()->service.get(c,a).get("status").equals("COMPLETED"));
        Report r=(Report)service.get(c,a).get("report");assertThat(r.dialogue()).extracting(Line::text).containsExactly("原字幕","无字幕原声");assertThat(r.dialogue()).extracting(Line::source).containsExactly("subtitle","audio");assertThat(requests).hasSize(2);assertThat(requests.get(1)).contains("audio/wav");
    }
    @Test void rejectsHolesOverlapsNonFiniteAndDuplicateIds(){
        for(List<Shot> list:List.of(List.of(shot("a",0,1),shot("b",2,4)),List.of(shot("a",0,3),shot("b",2,4)),List.of(shot("a",0,2),shot("a",2,4)),List.of(shot("a",0,Double.NaN))))
            assertThatThrownBy(()->validate(new Report(4,list,List.of(),"","",List.of()))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatCode(()->validate(new Report(4,List.of(shot("a",0,4)),List.of(new Line("line",0,4,"人工台词","manual")),"","",List.of()))).doesNotThrowAnyException();
    }
}
