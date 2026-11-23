package com.shangzhen.workbench;

import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:reference-worker;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE","app.storage=./target/reference-worker-media","app.worker-delay=3600000"})
class ReferenceVideoWorkerTest {
 @Autowired Store s;@Autowired ProjectService projects;@Autowired JobWorker worker;
 @MockitoBean VideoApiClient video;@MockitoBean ProductAnalysisService images;@MockitoBean OssReferenceService oss;
 String c,a,b;
 @BeforeEach void setup() throws Exception {
  c=Store.id();a=Store.id();b=Store.id();s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",c,"admin","图片提交测试","商品",Store.now());
  for(String id:List.of(a,b))s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",id,c,"image","PRODUCT","","","image/png",3,id+".png","{}",Store.now());
  when(video.enabled()).thenReturn(true);when(images.readImage(any())).thenReturn(new byte[]{1,2,3});when(oss.publish(eq(c),any())).thenReturn("https://example.oss-cn-hangzhou.aliyuncs.com/test.jpg?Expires=123&Signature=test");
 }
 Models.Job queued(){var p=projects.create(c,"admin",new Models.ProjectInput("测试","","商品","抖音","细节演示",4,"已核对",true,List.of(new Models.Shot(4,"展示商品","",a,0,true)),Map.of("productAssetIds",List.of(a,b),"videoResolution","480p","generationPrompt","完整提示词"),0));return projects.submit(c,"admin",new Models.Submit(List.of(p.id()),"VIDEO_API")).get(0);}
 @Test void uploadsAllImagesSubmitsJsonAdapterOnceAndPollsOriginalTask() throws Exception {
  var job=queued();when(video.submit(anyString(),anyInt(),anyList(),anyString(),anyString())).thenReturn("task-one");worker.tick();
  verify(oss,times(2)).publish(eq(c),any());verify(video).submit(eq("完整提示词"),eq(4),argThat(x->x.size()==2&&x.stream().allMatch(u->u.startsWith("https://"))),eq("480p"),eq("9:16"));
  assertThat(s.db.queryForObject("SELECT external_task_id FROM jobs WHERE id=?",String.class,job.id())).isEqualTo("task-one");
  when(video.status("task-one")).thenReturn(new VideoApiClient.VideoStatus("failed",100,"rejected"));worker.tick();assertThat(s.job(c,job.id()).status()).isEqualTo("FAILED");
  verify(video,times(1)).submit(anyString(),anyInt(),anyList(),anyString(),anyString());
 }
 @Test void ossFailureStopsBeforeVideoSubmission() throws Exception {
  var job=queued();when(oss.publish(eq(c),any())).thenThrow(new IllegalStateException("OSS上传失败（HTTP 403），未提交视频生成"));worker.tick();assertThat(s.job(c,job.id()).status()).isEqualTo("FAILED");assertThat(s.job(c,job.id()).message()).contains("OSS");verify(video,never()).submit(anyString(),anyInt(),anyList(),anyString(),anyString());
 }
 @Test void definiteRejectionIsFailedAndNotRetried(){
  var job=queued();when(video.submit(anyString(),anyInt(),anyList(),anyString(),anyString())).thenThrow(new org.springframework.web.client.HttpClientErrorException(org.springframework.http.HttpStatus.BAD_REQUEST));worker.tick();assertThat(s.job(c,job.id()).status()).isEqualTo("FAILED");assertThat(s.job(c,job.id()).message()).contains("400");worker.tick();verify(video,times(1)).submit(anyString(),anyInt(),anyList(),anyString(),anyString());
 }
}
