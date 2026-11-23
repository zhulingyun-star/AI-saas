package com.shangzhen.workbench;

import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import java.nio.file.Files;
import java.util.*;
import static com.shangzhen.workbench.Models.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:oneclick;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE","app.storage=./target/oneclick-media","app.worker-delay=3600000"})
@AutoConfigureMockMvc
class OneClickWorkflowTest {
    @Autowired Store s; @Autowired MockMvc mvc; @Autowired JobWorker worker; @Autowired MediaService media;
    @MockitoBean AiService ai; @MockitoBean VideoApiClient video;
    @MockitoBean ProductAnalysisService images; @MockitoBean OssReferenceService oss;
    String client,campaign,image,path; ProjectInput input;

    @BeforeEach void setup() throws Exception {
        client=Store.id();campaign=Store.id();image=Store.id();
        s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",client,"admin","一键测试","服饰",Store.now());
        s.db.update("INSERT INTO campaigns VALUES(?,?,?,?,?,?,?,?,?,?,?)",campaign,client,"测试项目","admin",null,1,"",false,0,Store.now(),Store.now());
        s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",image,client,"鞋.png","PRODUCT","","","image/png",3,image+".png","{}",Store.now());
        s.db.update("INSERT INTO campaign_products VALUES(?,?,0)",campaign,image);
        input=new ProjectInput("灰白鞋子","","服饰鞋包","抖音","电商短视频",4,"灰白鞋面拼接",true,List.of(),Map.of("campaignId",campaign,"productAnchorId",image,"creationMode","ECOMMERCE_VIDEO","productionMode","ONE_CLICK","productAssetIds",List.of(image),"videoResolution","480p"),0);
        path="/api/clients/"+client+"/projects/one-click";
        when(ai.enabled()).thenReturn(true);when(video.enabled()).thenReturn(true);when(oss.enabled()).thenReturn(true);
        when(ai.oneClickDraft(any())).thenReturn(new AiService.OneClickDraft("细节证据","先整体再细节",List.of(new AiService.DraftShot(2,"双鞋平放，展示整体配色","看看这双鞋"),new AiService.DraftShot(2,"鞋面拼接近景，固定机位","灰白拼接层次清楚"))));
        when(video.defaultResolution()).thenReturn("480p");when(video.submit(anyString(),anyInt(),anyList(),anyString(),anyString())).thenReturn("task-oneclick");
        when(images.readImage(any())).thenReturn(new byte[]{1,2,3});when(oss.publish(eq(client),any())).thenReturn("https://example.oss-cn-hangzhou.aliyuncs.com/product.jpg");
    }

    String start(ProjectInput body) throws Exception {
        var result=mvc.perform(post(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(new OneClickStart(body,true))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.job.status").value("QUEUED")).andReturn();
        return s.json.readTree(result.getResponse().getContentAsString()).path("job").path("id").asText();
    }

    @Test void confirmedRequestGeneratesPersistsAndCompletesOneVideoTask() throws Exception {
        String id=start(input);worker.tick();
        Job job=s.job(client,id);assertThat(job.status()).isEqualTo("RUNNING");
        Project saved=s.project(client,job.projectId());assertThat(saved.shots()).hasSize(2);
        assertThat(saved.config().get("creativeFramework")).isInstanceOf(Map.class);
        verify(video).submit(argThat(prompt->prompt.contains("0–2秒")&&prompt.contains("2–4秒")&&prompt.contains("看看这双鞋")&&prompt.contains("灰白拼接层次清楚")),eq(4),argThat(refs->refs.size()==1),eq("480p"),eq("9:16"));
        Project snapshot=s.snapshot(s.db.queryForObject("SELECT snapshot FROM jobs WHERE id=?",String.class,id));
        assertThat(snapshot.shots()).isEqualTo(saved.shots());
        when(video.status("task-oneclick")).thenReturn(new VideoApiClient.VideoStatus("completed",100,""));
        byte[] providerBytes={0,0,0,12,'f','t','y','p','i','s','o','m'};
        when(video.download("task-oneclick")).thenReturn(providerBytes);worker.tick();worker.tick();
        assertThat(s.job(client,id).status()).isEqualTo("REVIEW");assertThat(s.job(client,id).hasOutput()).isTrue();
        assertThat(Files.readAllBytes(media.resolve(id+".mp4"))).isEqualTo(providerBytes);
        assertThat(Files.readString(media.resolve(id+".srt"))).contains("看看这双鞋","灰白拼接层次清楚");
        verify(ai,times(1)).oneClickDraft(any());verify(video,times(1)).submit(anyString(),anyInt(),anyList(),anyString(),anyString());
    }

    @Test void modelFailureKeepsProjectAndDoesNotSubmitOrAutomaticallyRetry() throws Exception {
        when(ai.oneClickDraft(any())).thenThrow(new IllegalStateException("model failed"));
        String id=start(input);worker.tick();worker.tick();
        assertThat(s.job(client,id).status()).isEqualTo("FAILED");assertThat(s.project(client,s.job(client,id).projectId()).facts()).isEqualTo(input.facts());
        verify(ai,times(1)).oneClickDraft(any());verify(video,never()).submit(anyString(),anyInt(),anyList(),anyString(),anyString());
    }

    @Test void userEditDuringQueuedTaskIsPreservedWithoutSubmitting() throws Exception {
        String id=start(input);String work=s.job(client,id).projectId();
        s.db.update("UPDATE projects SET facts='用户修改的资料',revision=revision+1 WHERE id=?",work);worker.tick();
        assertThat(s.job(client,id).status()).isEqualTo("FAILED");assertThat(s.project(client,work).facts()).isEqualTo("用户修改的资料");
        verify(ai,never()).oneClickDraft(any());verify(video,never()).submit(anyString(),anyInt(),anyList(),anyString(),anyString());
    }

    @Test void unavailableStorageInvalidDurationAndMissingConsentCreateNothing() throws Exception {
        mvc.perform(post(path).with(user("other")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(new OneClickStart(input,true)))).andExpect(status().isNotFound());
        mvc.perform(post(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(new OneClickStart(input,false)))).andExpect(status().isBadRequest());
        var tooLong=new ProjectInput(input.name(),"",input.category(),input.platform(),input.format(),31,input.facts(),true,List.of(),input.config(),0);
        mvc.perform(post(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(new OneClickStart(tooLong,true)))).andExpect(status().isBadRequest());
        when(oss.enabled()).thenReturn(false);
        mvc.perform(post(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(new OneClickStart(input,true)))).andExpect(status().isServiceUnavailable());
        assertThat(s.db.queryForObject("SELECT COUNT(*) FROM projects WHERE client_id=?",Integer.class,client)).isZero();
        assertThat(s.db.queryForObject("SELECT COUNT(*) FROM jobs WHERE client_id=?",Integer.class,client)).isZero();
    }
}
