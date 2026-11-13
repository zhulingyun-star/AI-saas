package com.shangzhen.workbench;
import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import java.time.Duration;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static com.shangzhen.workbench.RemakeDraftService.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:remake;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE","app.storage=./target/remake-media","app.worker-delay=3600000","app.remake-draft.poll-delay=3600000","app.ai.mode=openai","app.ai.api-key=test-key"})
@AutoConfigureMockMvc
class RemakeDraftTest {
 @Autowired Store s;@Autowired MockMvc mvc;@Autowired ProjectService projects;@MockitoSpyBean RemakeDraftService service;@MockitoBean VideoApiClient video;@MockitoBean OssReferenceService oss;
 String c,p,a,g,path;
 @BeforeEach void setup(){
  c=Store.id();p=Store.id();a=Store.id();g=Store.id();when(video.enabled()).thenReturn(true);when(oss.enabled()).thenReturn(true);
  s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",c,"admin","改编测试","鞋子",Store.now());
  s.db.update("INSERT INTO campaigns VALUES(?,?,?,?,?,?,?,?,?,?,?)",p,c,"测试","admin",null,1,"",false,0,Store.now(),Store.now());
  for(String id:List.of(a,g))s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",id,c,"测试",id.equals(a)?"REFERENCE":"PRODUCT","","",id.equals(a)?"video/mp4":"image/png",3,id+".bin",id.equals(g)?s.write(Map.of("productName","灰色鞋子","productGroupId",g)):"{}",Store.now());
  s.db.update("INSERT INTO campaign_products VALUES(?,?,0)",p,g);
  var report=new ReferenceStoryboardService.Report(10,List.of(new ReferenceStoryboardService.Shot("one",0,10,"护肤品挤压","固定","开头","","提亮","待核对",null)),List.of(new ReferenceStoryboardService.Line("line1",0,5,"原片台词","subtitle")),"展示","音乐",List.of());
  s.db.update("INSERT INTO reference_storyboards(client_id,asset_id,status,revision,report_json,updated_at) VALUES(?,?,'COMPLETED',1,?,?)",c,a,s.write(report),Store.now());
  path="/api/clients/"+c+"/campaigns/"+p+"/remake/"+a+"/"+g;
 }
 Object state(String field){return service.get(c,p,a,g).get(field);}int rev(){return (int)state("revision");}
 void awaitReady(){service.tick();await().atMost(Duration.ofSeconds(10)).until(()->!Set.of("RUNNING","QUEUED").contains(state("status")));assertThat(state("status")).isEqualTo("READY");}
 void stubCopy() throws Exception {doReturn(s.json.readTree("{\"relation\":\"跨品类\",\"reason\":\"护肤品与鞋类用途不同\",\"approach\":\"保留节奏，改为鞋面展示\",\"lines\":[{\"id\":\"line1\",\"text\":\"看看鞋面的拼接细节\"}],\"overlays\":[],\"notes\":\"性能待确认\"}")).when(service).ask(any(),anyString());}
 @Test void copyConfirmPromptRenderAndStaleSources() throws Exception {
  mvc.perform(get(path).with(user("other"))).andExpect(status().isNotFound());
  mvc.perform(post(path+"/copy").with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"revision\":0,\"duration\":10,\"confirmed\":false}" )).andExpect(status().isBadRequest());
  stubCopy();service.start(c,p,a,g,new RemakeDraftController.Start(0,true,false,10),false);awaitReady();
  Draft d=(Draft)state("draft");assertThat(d.overlaysOn()).isFalse();assertThat(d.overlays().get(0).text()).isEmpty();assertThat(d.lines().get(0).original()).isEqualTo("原片台词");assertThat(d.relation()).isEqualTo("跨品类");
  assertThatThrownBy(()->service.start(c,p,a,g,new RemakeDraftController.Start(rev(),true,false,10),true)).hasMessageContaining("确认替换文案");
  Draft confirmed=new Draft(d.relation(),d.reason(),d.approach(),List.of(new CopyLine("line1",99,100,"伪造原文","这是我们确认的台词")),d.overlays(),false,10,d.notes(),true);
  int revision=rev();service.edit(c,p,a,g,new RemakeDraftController.Edit(revision,confirmed));assertThat(((Draft)state("draft")).lines().get(0).start()).isZero();assertThat(((Draft)state("draft")).lines().get(0).original()).isEqualTo("原片台词");
  assertThatThrownBy(()->service.edit(c,p,a,g,new RemakeDraftController.Edit(revision,confirmed))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  doReturn(s.json.readTree("{\"usage\":{\"form\":{\"text\":\"低帮鞋\"}},\"diffs\":[{\"idx\":1,\"ours\":\"鞋面展示替换挤压动作\"}]}")).when(service).ask(any(),anyString());
  doReturn("浅灰台面柔和侧光，画面为一双灰色运动鞋。商品图用于鞋面配色和结构。\n第 1 镜(第 0.0~10.0 秒):双鞋静置，展示网眼拼接，固定机位。画外音「这是我们确认的台词」。\n花字关闭，画面仅呈现商品与实景。声音轻柔。商品始终保持同一双灰白鞋。").when(service).reply(any(),anyString());
  service.start(c,p,a,g,new RemakeDraftController.Start(rev(),true,false,10),true);awaitReady();
  String prompt=(String)state("prompt");assertThat(prompt).contains("这是我们确认的台词","花字关闭").doesNotContain("原片台词","提亮");assertThat(prompt.indexOf("这是我们确认的台词")).isEqualTo(prompt.lastIndexOf("这是我们确认的台词"));
  assertThat(sourcePrompt("ad-remake-copy.txt")).contains("字数贴近原句");assertThat(sourcePrompt("ad-remake-use.txt")).contains("使用方式卡");assertThat(sourcePrompt("ad-remake-body.txt")).contains("出片词");
  verify(service).ask(any(),contains("字数贴近原句"));verify(service).ask(any(),contains("使用方式卡"));verify(service).reply(any(),contains("时间轴:切镜是硬边界"));
  int renderRev=rev();var rendered=(Map<?,?>)service.render(c,p,a,g,"admin",new RemakeDraftController.Render(renderRev,true,"480p"));String id=rendered.get("projectId").toString();var work=s.project(c,id);
  assertThat(work.config().get("generationPrompt")).isEqualTo(prompt);assertThat(work.config().get("productAssetIds")).isEqualTo(List.of(g));assertThat(work.config().get("videoResolution")).isEqualTo("480p");verify(video,never()).submit(anyString(),anyInt(),anyList(),anyString());
  assertThat(JobWorker.subtitles(work)).contains("00:00:00,000 --> 00:00:05,000","这是我们确认的台词").doesNotContain("原片台词");
  assertThatThrownBy(()->service.render(c,p,a,g,"admin",new RemakeDraftController.Render(renderRev,true,"480p"))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  assertThatThrownBy(()->service.render(c,p,a,g,"admin",new RemakeDraftController.Render(rev(),true,"480p"))).hasMessageContaining("已有视频任务");
  String jobId=((Models.Job)rendered.get("job")).id();s.db.update("UPDATE jobs SET status='FAILED' WHERE id=?",jobId);
  service.editPrompt(c,p,a,g,new RemakeDraftController.PromptEdit(rev(),"用户修改的第二版提示词"));
  assertThat(state("prompt")).isEqualTo("用户修改的第二版提示词");
  var second=(Map<?,?>)service.render(c,p,a,g,"admin",new RemakeDraftController.Render(rev(),true,"480p"));
  assertThat(service.renders(c,p,a,g)).hasSize(2);assertThat(s.snapshot(s.db.queryForObject("SELECT snapshot FROM jobs WHERE id=?",String.class,jobId)).config().get("generationPrompt")).isEqualTo(prompt);
  var work2=s.project(c,second.get("projectId").toString());
  s.db.update("UPDATE reference_storyboards SET revision=revision+1 WHERE asset_id=?",a);assertThat(state("stale")).isEqualTo(true);
  assertThatThrownBy(()->RemakeDraftService.verifyProject(s,work2)).hasMessageContaining("参考分镜已变化");
  assertThatThrownBy(()->service.render(c,p,a,g,"admin",new RemakeDraftController.Render(rev(),true,"480p"))).hasMessageContaining("确认文案");
 }
 @Test void targetDurationRoundsUpAndRejectsOldDefault() throws Exception {
  var json=s.json.readTree(s.db.queryForObject("SELECT report_json FROM reference_storyboards WHERE asset_id=?",String.class,a));
  ((com.fasterxml.jackson.databind.node.ObjectNode)json).put("duration",18.773);
  s.db.update("UPDATE reference_storyboards SET report_json=? WHERE asset_id=?",json.toString(),a);
  assertThat(state("targetDuration")).isEqualTo(19);
  assertThatThrownBy(()->service.start(c,p,a,g,new RemakeDraftController.Start(0,true,false,15),false)).hasMessageContaining("向上取整");
  stubCopy();service.start(c,p,a,g,new RemakeDraftController.Start(0,true,false,19),false);awaitReady();assertThat(((Draft)state("draft")).duration()).isEqualTo(19);
 }
 @Test void editingInvalidatesPromptAndFailedRegenerationKeepsOldSourcesStale() throws Exception {
  stubCopy();service.start(c,p,a,g,new RemakeDraftController.Start(0,true,false,10),false);awaitReady();
  s.db.update("UPDATE remake_drafts SET prompt='old prompt' WHERE client_id=?",c);
  Draft d=(Draft)state("draft");service.edit(c,p,a,g,new RemakeDraftController.Edit(rev(),d));assertThat(state("prompt")).isEqualTo("");
  s.db.update("UPDATE reference_storyboards SET revision=revision+1 WHERE asset_id=?",a);
  doThrow(new IllegalStateException("test failure")).when(service).ask(any(),anyString());
  service.start(c,p,a,g,new RemakeDraftController.Start(rev(),true,false,10),false);service.tick();await().atMost(Duration.ofSeconds(10)).until(()->state("status").equals("FAILED"));
  assertThat(state("stale")).isEqualTo(true);assertThat(((Draft)state("draft")).lines()).isEqualTo(d.lines());
 }
 @Test void checkedOverlaysOnlyAndOssSigning() throws Exception {
  var src=s.json.readTree("{\"images\":[{}],\"reference\":{\"duration\":10,\"shots\":[{\"id\":\"a\",\"start\":0,\"end\":10}]}}");
  var n=s.json.readTree("{\"global\":\"浅灰台面\",\"shots\":[{\"id\":\"a\",\"visual\":\"展示鞋面\"}],\"sound\":\"轻柔\"}");
  Draft d=new Draft("同类","","",List.of(),List.of(new Overlay("a",0,5,"原","选中的花字",true),new Overlay("b",5,10,"原","没选中的词",false)),true,4,"",true);
  assertThat(compose(src,d,n)).contains("选中的花字","0.00–2.00秒").doesNotContain("没选中的词");
  assertThat(OssReferenceService.signature("test-secret","GET\n\n\n123\n/test/image.jpg")).isEqualTo(java.util.Base64.getEncoder().encodeToString(hmac("test-secret","GET\n\n\n123\n/test/image.jpg")));
 }
 byte[] hmac(String key,String value) throws Exception {var mac=javax.crypto.Mac.getInstance("HmacSHA1");mac.init(new javax.crypto.spec.SecretKeySpec(key.getBytes(),"HmacSHA1"));return mac.doFinal(value.getBytes());}
}
