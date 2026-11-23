package com.shangzhen.workbench;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 新版项目：文件夹、新建三种方式、视频二创分镜、多版本出片 / 审片 / 取消。本地模式，视频接口是桩，不发任何真实请求。 */
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:projectflow;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE","app.storage=./target/projectflow-media","app.worker-delay=3600000","app.storyboard.poll-delay=3600000","app.product-analysis.poll-delay=3600000","app.remake-draft.poll-delay=3600000","app.ai.mode=local"})
@AutoConfigureMockMvc
class ProjectFlowTest {
    @Autowired Store s;@Autowired MockMvc mvc;@Autowired JobWorker worker;
    @MockitoBean VideoApiClient video;@MockitoBean OssReferenceService oss;@MockitoSpyBean ProductAnalysisService analysis;
    String client,ref,raw,shoe,shoe2,shirt,base;

    static final String REPORT="""
        {"duration":10.4,"shots":[
          {"id":"s1","start":0,"end":4,"action":"双手按压泵头挤出膏体","camera":"俯拍特写","transition":"开头","effects":"","text":"","review":""},
          {"id":"s2","start":4,"end":10.4,"action":"正面出镜涂抹","camera":"平视近景","transition":"硬切","effects":"","text":"","review":""}],
         "dialogue":[{"id":"l1","start":0,"end":1.5,"text":"出门不想化妆","source":"subtitle"},{"id":"l2","start":1.5,"end":3,"text":"懒得化妆","source":"subtitle"},{"id":"l3","start":5,"end":8,"text":"这款最好用","source":"subtitle"}],
         "summary":"痛点开场","music":"轻快吉他","suggestions":[]}""";

    @BeforeEach void setup() throws Exception {
        client=Store.id();ref=Store.id();raw=Store.id();shoe=Store.id();shoe2=Store.id();shirt=Store.id();base="/api/clients/"+client;
        s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",client,"admin","项目测试","鞋子",Store.now());
        s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",ref,client,"防晒.mp4","REFERENCE","","","video/mp4",4,ref+".mp4","{}",Store.now());
        s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",raw,client,"没拆.mp4","REFERENCE","","","video/mp4",4,raw+".mp4","{}",Store.now());
        int age=20;
        for(String id:List.of(shoe,shoe2)) s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",id,client,id+".png","PRODUCT","NB-992","","image/png",3,id+".png",s.write(Map.of("productName","新百伦鞋子","productGroupId","g-shoe")),Store.now().minusSeconds(age-=5));
        s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",shirt,client,"t.png","PRODUCT","","","image/png",3,shirt+".png",s.write(Map.of("productName","白T恤","productGroupId","g-shirt")),Store.now());
        s.db.update("INSERT INTO reference_storyboards(client_id,asset_id,status,revision,report_json,updated_at) VALUES(?,?,'COMPLETED',2,?,?)",client,ref,REPORT.strip(),Store.now());
        s.db.update("INSERT INTO reference_profiles(client_id,asset_id,hook,shot_tasks_json,revision,updated_at) VALUES(?,?,?,?,1,?)",client,ref,"痛点型",s.write(Map.of("s1",Map.of("task","抓住注意力","start",0,"end",4))),Store.now());
        when(video.enabled()).thenReturn(false);
    }
    ResultActions call(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req,Object body) throws Exception {
        if(body!=null) req=req.contentType(MediaType.APPLICATION_JSON).content(s.write(body));
        return mvc.perform(req.with(user("admin")).with(csrf()));
    }
    JsonNode json(ResultActions r) throws Exception {return s.json.readTree(r.andReturn().getResponse().getContentAsString());}
    Map<String,Object> create(String mode,String ratio) {
        Map<String,Object> m=new LinkedHashMap<>();
        m.put("mode",mode);m.put("productAnchorId",shoe2);m.put("ratio",ratio);m.put("resolution","720p");m.put("facts","灰白拼色网眼鞋面");m.put("factsConfirmed",true);
        if(mode.equals("REMAKE")) m.put("referenceAssetId",ref);
        return m;
    }
    String remake(String ratio) throws Exception {return json(call(post(base+"/project-library/projects"),create("REMAKE",ratio)).andExpect(status().isOk())).path("id").asText();}
    JsonNode flow(String id) throws Exception {return json(call(get(base+"/projects/"+id+"/flow"),null).andExpect(status().isOk()));}
    List<Map<String,Object>> edits(JsonNode shots,String visual,List<List<String>> lines){
        List<Map<String,Object>> out=new ArrayList<>();
        for(int i=0;i<shots.size();i++){JsonNode x=shots.path(i);out.add(new LinkedHashMap<>(Map.of("id",x.path("id").asText(),"camera",x.path("camera").asText(),"visual",visual.isEmpty()?"":visual+(i+1),"lines",lines.get(i),"task",x.path("task").asText())));}
        return out;
    }
    String confirmBoard(String id) throws Exception {
        JsonNode f=flow(id);
        JsonNode r=json(call(put(base+"/projects/"+id+"/storyboard"),Map.of("revision",f.path("storyboard").path("revision").asInt(),"shots",edits(f.path("storyboard").path("shots"),"双手托鞋展示鞋面",List.of(List.of("出门不想穿搭"),List.of())),"confirmed",true)).andExpect(status().isOk()));
        return r.path("storyboard").path("revision").asText();
    }
    void output(String job){s.db.update("UPDATE jobs SET status='REVIEW',output_name=? WHERE id=?",job+".mp4",job);}

    @Test void foldersRenameMoveAndClientIsolation() throws Exception {
        mvc.perform(get(base+"/project-library").with(user("intruder"))).andExpect(status().isNotFound());
        String nov=json(call(post(base+"/project-folders"),Map.of("name","11 月上新")).andExpect(status().isOk())).path("id").asText();
        String sub=json(call(post(base+"/project-folders"),Map.of("name","鞋","parentId",nov)).andExpect(status().isOk())).path("id").asText();
        call(post(base+"/project-folders"),Map.of("name","第三层","parentId",sub)).andExpect(status().isBadRequest());
        call(post(base+"/project-folders"),Map.of("name","全部项目")).andExpect(status().isBadRequest());
        call(put(base+"/project-folders/"+nov),Map.of("name","十一月","revision",3)).andExpect(status().isConflict());
        call(put(base+"/project-folders/"+nov),Map.of("name","十一月","revision",0)).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("十一月"));
        Map<String,Object> in=create("REMAKE","9:16");in.put("folderId",sub);in.put("name","鞋 · 二创测试");
        JsonNode item=json(call(post(base+"/project-library/projects"),in).andExpect(status().isOk()));
        String id=item.path("id").asText();
        assertThat(item.path("folderId").asText()).isEqualTo(sub);assertThat(item.path("flow").asBoolean()).isTrue();
        call(delete(base+"/project-folders/"+sub),null).andExpect(status().isBadRequest());
        call(put(base+"/projects/"+id+"/folder"),Map.of("folderId",nov)).andExpect(status().isOk());
        call(delete(base+"/project-folders/"+sub),null).andExpect(status().isNoContent());
        int rev=s.project(client,id).revision();
        call(put(base+"/projects/"+id+"/name"),Map.of("name","改过的名字","revision",rev+5)).andExpect(status().isConflict());
        call(put(base+"/projects/"+id+"/name"),Map.of("name","改过的名字","revision",rev)).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("改过的名字"));
        JsonNode lib=json(call(get(base+"/project-library"),null));
        assertThat(lib.path("folders").size()).isEqualTo(1);assertThat(lib.path("projects").path(0).path("folderId").asText()).isEqualTo(nov);
        assertThat(lib.path("projects").path(0).path("product").path("name").asText()).isEqualTo("新百伦鞋子");
        assertThat(lib.path("projects").path(0).path("product").path("anchorId").asText()).isEqualTo(shoe);
        mvc.perform(put(base+"/projects/"+id+"/folder").with(user("intruder")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNotFound());
    }

    @Test void createsThreeModesWithoutCampaignAndLinksProduct() throws Exception {
        Map<String,Object> bad=create("REMAKE","1:1");call(post(base+"/project-library/projects"),bad).andExpect(status().isBadRequest());
        Map<String,Object> story=create("STORY","9:16");call(post(base+"/project-library/projects"),story).andExpect(status().isBadRequest());
        Map<String,Object> notReady=create("REMAKE","9:16");notReady.put("referenceAssetId",raw);
        call(post(base+"/project-library/projects"),notReady).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("参考视频还没拆解完，拆解完才能用来做视频二创"));
        Map<String,Object> unchecked=create("FRAMEWORK","9:16");unchecked.put("factsConfirmed",false);call(post(base+"/project-library/projects"),unchecked).andExpect(status().isBadRequest());
        JsonNode r=json(call(post(base+"/project-library/projects"),create("REMAKE","16:9")).andExpect(status().isOk()));
        JsonNode f=json(call(post(base+"/project-library/projects"),create("FRAMEWORK","9:16")).andExpect(status().isOk()));
        JsonNode o=json(call(post(base+"/project-library/projects"),create("ONE_CLICK","9:16")).andExpect(status().isOk()));
        assertThat(r.path("name").asText()).isEqualTo("新百伦鞋子 · 视频二创");assertThat(r.path("ratio").asText()).isEqualTo("16:9");assertThat(r.path("resolution").asText()).isEqualTo("720p");
        assertThat(r.path("duration").asInt()).isEqualTo(11);assertThat(r.path("reference").path("name").asText()).isEqualTo("防晒.mp4");
        assertThat(f.path("flow").asBoolean()).isFalse();assertThat(f.path("legacyPath").asText()).isEqualTo("/studio/"+f.path("id").asText()+"?framework=1");
        assertThat(o.path("legacyPath").asText()).isEqualTo("/studio/"+o.path("id").asText());assertThat(o.path("mode").asText()).isEqualTo("ONE_CLICK");
        for(JsonNode x:List.of(r,f,o)) assertThat(s.db.queryForObject("SELECT COUNT(*) FROM work_flow WHERE project_id=? AND campaign_id IS NULL",Integer.class,x.path("id").asText())).isEqualTo(1);
        assertThat(s.db.queryForObject("SELECT COUNT(*) FROM jobs WHERE client_id=?",Integer.class,client)).isZero();
        assertThat(s.db.queryForObject("SELECT COUNT(*) FROM campaigns WHERE client_id=?",Integer.class,client)).isZero();
        var config=s.project(client,o.path("id").asText()).config();
        assertThat(config.get("productionMode")).isEqualTo("ONE_CLICK");assertThat(config.get("productAssetIds")).isEqualTo(List.of(shoe,shoe2));
        JsonNode linked=json(call(get(base+"/product-groups/"+shoe+"/projects"),null).andExpect(status().isOk()));
        assertThat(linked.size()).isEqualTo(3);
        assertThat(json(call(get(base+"/product-groups/"+shirt+"/projects"),null)).size()).isZero();
        JsonNode products=json(call(get(base+"/product-library"),null));
        assertThat(products.path("products").path("group:g-shoe").path("projectCount").asInt()).isEqualTo(3);
        // 参考视频库能看到这条参考视频用在了哪个项目
        JsonNode refItem=json(call(get(base+"/references/"+ref),null));
        assertThat(refItem.path("usedBy").path(0).path("id").asText()).isEqualTo(r.path("id").asText());
        call(get(base+"/projects/"+f.path("id").asText()+"/flow"),null).andExpect(status().isBadRequest());
    }

    @Test void storyboardStartsFromReferenceAndSavesEditsWithRevision() throws Exception {
        String id=remake("9:16");
        JsonNode f=flow(id);JsonNode sb=f.path("storyboard");
        assertThat(sb.path("saved").asBoolean()).isFalse();assertThat(sb.path("shots").size()).isEqualTo(2);
        JsonNode first=sb.path("shots").path(0);
        assertThat(first.path("origCamera").asText()).isEqualTo("俯拍特写");assertThat(first.path("origVisual").asText()).isEqualTo("双手按压泵头挤出膏体");
        assertThat(first.path("origLines").toString()).isEqualTo("[\"出门不想化妆\",\"懒得化妆\"]");assertThat(first.path("camera").asText()).isEqualTo("俯拍特写");
        assertThat(first.path("visual").asText()).isEmpty();assertThat(first.path("task").asText()).isEqualTo("抓住注意力");
        assertThat(sb.path("shots").path(1).path("origLines").toString()).isEqualTo("[\"这款最好用\"]");
        assertThat(f.path("reference").path("hook").asText()).isEqualTo("痛点型");assertThat(f.path("draftSegments").size()).isZero();
        call(put(base+"/projects/"+id+"/storyboard"),Map.of("revision",0,"shots",edits(sb.path("shots"),"",List.of(List.of(),List.of())),"confirmed",true)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("第 1 镜还没写改成什么画面"));
        List<Map<String,Object>> e=edits(sb.path("shots"),"手托鞋",List.of(List.of("出门不想穿搭","懒得配鞋"," "),List.of("上脚百搭")));
        e.get(1).put("task","推动下单");
        JsonNode saved=json(call(put(base+"/projects/"+id+"/storyboard"),Map.of("revision",0,"shots",e,"confirmed",false)).andExpect(status().isOk()));
        assertThat(saved.path("storyboard").path("revision").asInt()).isEqualTo(1);assertThat(saved.path("storyboard").path("shots").path(0).path("lines").size()).isEqualTo(2);
        assertThat(saved.path("storyboard").path("shots").path(1).path("task").asText()).isEqualTo("推动下单");
        assertThat(saved.path("storyboard").path("shots").path(0).path("origLines").size()).isEqualTo(2);
        call(put(base+"/projects/"+id+"/storyboard"),Map.of("revision",0,"shots",e,"confirmed",true)).andExpect(status().isConflict());
        e.get(0).put("task","乱写的任务");
        call(put(base+"/projects/"+id+"/storyboard"),Map.of("revision",1,"shots",e,"confirmed",true)).andExpect(status().isBadRequest());
        e.get(0).put("task","抓住注意力");
        JsonNode ok=json(call(put(base+"/projects/"+id+"/storyboard"),Map.of("revision",1,"shots",e,"confirmed",true)).andExpect(status().isOk()));
        assertThat(ok.path("storyboard").path("confirmed").asBoolean()).isTrue();
        JsonNode segs=ok.path("draftSegments");
        assertThat(segs.path(0).path("text").asText()).contains("竖屏 9:16").contains("时长 11 秒").contains("图1至图2");
        assertThat(segs.path(1).path("title").asText()).isEqualTo("镜头 1");assertThat(segs.path(1).path("text").asText()).contains("第 1 镜（第 0.0~4.2 秒）").contains("「出门不想穿搭」「懒得配鞋」");
        assertThat(segs.path(3).path("text").asText()).contains("轻快吉他");
        // 忽略记录持久化
        call(post(base+"/projects/"+id+"/ad-ignores"),Map.of("key","s2|最|0|abc")).andExpect(status().isOk());
        call(post(base+"/projects/"+id+"/ad-ignores"),Map.of("key","s2|最|0|abc")).andExpect(status().isOk());
        assertThat(flow(id).path("ignores").toString()).isEqualTo("[\"s2|最|0|abc\"]");
        // 本地模式：AI 写分镜、改出片词都明确说没配置，不写假内容
        call(post(base+"/projects/"+id+"/storyboard/draft"),Map.of("revision",2)).andExpect(status().isServiceUnavailable());
        // 参考视频重新拆解后提示分镜过时，可以按新拆解重做
        s.db.update("UPDATE reference_storyboards SET revision=3 WHERE client_id=? AND asset_id=?",client,ref);
        assertThat(flow(id).path("storyboard").path("stale").asBoolean()).isTrue();
        JsonNode reset=json(call(post(base+"/projects/"+id+"/storyboard/reset"),Map.of("revision",2)).andExpect(status().isOk()));
        assertThat(reset.path("storyboard").path("saved").asBoolean()).isFalse();assertThat(reset.path("storyboard").path("stale").asBoolean()).isFalse();
    }

    @Test void legacyRemakeWorkOpensInNewFlowWithItsPromptAndLines() throws Exception {
        String campaign=Store.id(),draft=Store.id();
        s.db.update("INSERT INTO campaigns VALUES(?,?,?,?,?,?,?,?,?,?,?)",campaign,client,"旧交付项目","admin",null,1,"",false,0,Store.now(),Store.now());
        var lines=List.of(new RemakeDraftService.CopyLine("l1",0,1.5,"出门不想化妆","出门不想穿搭"),new RemakeDraftService.CopyLine("l3",5,8,"这款最好用","上脚百搭"));
        s.db.update("INSERT INTO remake_drafts(id,client_id,campaign_id,asset_id,anchor_id,revision,status,draft_json,updated_at) VALUES(?,?,?,?,?,1,'READY',?,?)",draft,client,campaign,ref,shoe,s.write(new RemakeDraftService.Draft("跨品类","护肤和鞋不同","换成鞋面展示",lines,List.of(),false,11,"",true)),Store.now());
        String prompt="明亮柔和的室内光。\n\n第 1 镜(第 0.0~4.2 秒):高角度俯拍特写。双手托住两只鞋的后跟。\n  画外音:「出门不想穿搭」\n\n第 2 镜(第 4.2~11.0 秒):平视近景。上脚走两步。\n  画外音:「上脚百搭」\n\n背景音乐：轻快。";
        Map<String,Object> config=new LinkedHashMap<>(Map.of("campaignId",campaign,"creationMode","VIDEO_REMAKE","remakeDraftId",draft,"productAnchorId",shoe,"productAssetIds",List.of(shoe,shoe2),"generationPrompt",prompt,"videoResolution","480p","referenceLinks",List.of(Map.of("assetId",ref))));
        String work=Store.id();
        s.db.update("INSERT INTO projects VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",work,client,"新百伦鞋子 · 视频二创","","商品二创","抖音","参考片改编",11,"已核对",true,s.write(List.of(new Models.Shot(11,"按提示词","",shoe,0,true))),s.write(config),"SCRIPT_READY",0,Store.now(),Store.now());
        s.db.update("INSERT INTO work_flow VALUES(?,?,?,?,?,?,?,?)",work,campaign,"admin","PRODUCTION",null,"",0,Store.now());
        s.db.update("INSERT INTO jobs(id,client_id,project_id,name,provider,status,progress,snapshot,message,output_name,revision,created_at,updated_at) VALUES(?,?,?,?,'VIDEO_API','REVIEW',100,?,'已生成',?,1,?,?)",Store.id(),client,work,"新百伦鞋子 · 视频二创",s.write(s.project(client,work)),"x.mp4",Store.now(),Store.now());
        JsonNode item=json(call(get(base+"/project-library"),null)).path("projects").path(0);
        assertThat(item.path("flow").asBoolean()).isTrue();assertThat(item.path("legacyPath").asText()).isEqualTo("/projects/"+campaign+"/remake?reference="+ref);
        assertThat(item.path("versions").path("count").asInt()).isEqualTo(1);assertThat(item.path("versions").path("unreviewed").asInt()).isEqualTo(1);
        JsonNode f=flow(work);
        JsonNode shots=f.path("storyboard").path("shots");
        assertThat(shots.path(0).path("camera").asText()).isEqualTo("高角度俯拍特写");assertThat(shots.path(0).path("visual").asText()).isEqualTo("双手托住两只鞋的后跟。");
        assertThat(shots.path(0).path("lines").toString()).isEqualTo("[\"出门不想穿搭\"]");assertThat(shots.path(1).path("lines").toString()).isEqualTo("[\"上脚百搭\"]");
        assertThat(f.path("legacyApproach").path("approach").asText()).isEqualTo("换成鞋面展示");
        JsonNode v=f.path("versions").path(0);
        assertThat(v.path("no").asInt()).isEqualTo(1);assertThat(v.path("ratio").asText()).isEqualTo("9:16");assertThat(v.path("resolution").asText()).isEqualTo("480p");
        assertThat(v.path("segments").path(0).path("title").asText()).isEqualTo("画面风格");assertThat(v.path("segments").path(1).path("title").asText()).isEqualTo("镜头 1");
        assertThat(v.path("segments").path(3).path("title").asText()).isEqualTo("声音");
    }

    @Test void versionsKeepTheirPromptSettingsVerdictsAndCarryBadReasons() throws Exception {
        String id=remake("9:16");
        call(post(base+"/projects/"+id+"/versions"),Map.of("segments",List.of(Map.of("key","style","title","画面","text","x")),"confirmed",true)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("先确认分镜再出片"));
        confirmBoard(id);
        JsonNode f=flow(id);
        call(post(base+"/projects/"+id+"/versions"),Map.of("segments",f.path("draftSegments"),"confirmed",false)).andExpect(status().isBadRequest());
        JsonNode v1=json(call(post(base+"/projects/"+id+"/versions"),Map.of("segments",f.path("draftSegments"),"confirmed",true)).andExpect(status().isOk()));
        // 本地没启用视频接口：任务停在 BLOCKED，并写明没发出请求
        assertThat(v1.path("status").asText()).isEqualTo("BLOCKED");assertThat(v1.path("message").asText()).contains("未配置");
        assertThat(v1.path("no").asInt()).isEqualTo(1);assertThat(v1.path("note").asText()).isEqualTo("首版：按已确认的分镜出片");
        assertThat(v1.path("ratio").asText()).isEqualTo("9:16");assertThat(v1.path("resolution").asText()).isEqualTo("720p");
        String job1=v1.path("id").asText();
        call(put(base+"/jobs/"+job1+"/verdict"),Map.of("rating","GOOD","revision",0)).andExpect(status().isBadRequest());
        output(job1);
        call(put(base+"/jobs/"+job1+"/verdict"),Map.of("rating","BAD","reason"," ","revision",0)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("评价为差时要写差在哪"));
        call(put(base+"/jobs/"+job1+"/verdict"),Map.of("rating","BAD","reason","鞋面颜色偏黄","revision",0)).andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1));
        call(put(base+"/jobs/"+job1+"/verdict"),Map.of("rating","BAD","reason","鞋面颜色偏黄","use","DISCARDED","revision",0)).andExpect(status().isConflict());
        call(put(base+"/jobs/"+job1+"/verdict"),Map.of("rating","BAD","reason","鞋面颜色偏黄","use","DISCARDED","revision",1)).andExpect(status().isOk());
        // 画幅改成横屏只影响之后的版本
        int rev=flow(id).path("revision").asInt();
        call(put(base+"/projects/"+id+"/settings"),Map.of("revision",rev,"ratio","16:9","resolution","1080p","personaName","通勤上班族")).andExpect(status().isOk());
        call(put(base+"/projects/"+id+"/settings"),Map.of("revision",rev,"ratio","9:16")).andExpect(status().isConflict());
        JsonNode f2=flow(id);
        assertThat(f2.path("settings").path("personaName").asText()).isEqualTo("通勤上班族");
        assertThat(f2.path("draftSegments").path(0).path("text").asText()).contains("横屏 16:9");
        List<Map<String,Object>> segs=new ArrayList<>();
        for(JsonNode x:f2.path("versions").path(0).path("segments")) segs.add(new LinkedHashMap<>(Map.of("key",x.path("key").asText(),"title",x.path("title").asText(),"text",x.path("text").asText())));
        segs.get(1).put("text",segs.get(1).get("text")+"鞋面颜色按图1还原。");
        call(post(base+"/projects/"+id+"/versions"),Map.of("segments",segs,"basedOn",job1,"confirmed",true)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("写一句这一版改了什么"));
        JsonNode v2=json(call(post(base+"/projects/"+id+"/versions"),Map.of("segments",segs,"basedOn",job1,"note","直接改了 镜头 1","confirmed",true)).andExpect(status().isOk()));
        assertThat(v2.path("no").asInt()).isEqualTo(2);assertThat(v2.path("ratio").asText()).isEqualTo("16:9");assertThat(v2.path("resolution").asText()).isEqualTo("1080p");
        assertThat(v2.path("basedOn").asText()).isEqualTo(job1);assertThat(v2.path("carriedReasons").toString()).isEqualTo("[\"鞋面颜色偏黄\"]");
        JsonNode last=v2.path("segments").path(v2.path("segments").size()-1);
        assertThat(last.path("key").asText()).isEqualTo("avoid");assertThat(last.path("text").asText()).contains("鞋面颜色偏黄");
        Models.Project snap=s.snapshot(s.db.queryForObject("SELECT snapshot FROM jobs WHERE id=?",String.class,v2.path("id").asText()));
        assertThat(snap.config().get("generationPrompt").toString()).contains("鞋面颜色按图1还原。").contains("鞋面颜色偏黄");
        assertThat(snap.config().get("videoRatio")).isEqualTo("16:9");
        JsonNode versions=flow(id).path("versions");
        assertThat(versions.size()).isEqualTo(2);assertThat(versions.path(0).path("no").asInt()).isEqualTo(2);
        assertThat(versions.path(1).path("verdict").path("use").asText()).isEqualTo("DISCARDED");assertThat(versions.path(1).path("ratio").asText()).isEqualTo("9:16");
        // 一句话让 AI 改：本地模式明确说没配置
        call(post(base+"/projects/"+id+"/versions/rewrite"),Map.of("basedOn",job1,"instruction","开头再快一点")).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.message").value("文字模型没配置，AI 改不了；出片词没有动，可以展开下面的段落直接改"));
    }

    @Test void cancelStopsQueuedVersionsAndUncertainOnesBlockNewVersions() throws Exception {
        String id=remake("9:16");confirmBoard(id);
        JsonNode segs=flow(id).path("draftSegments");
        String job=json(call(post(base+"/projects/"+id+"/versions"),Map.of("segments",segs,"confirmed",true))).path("id").asText();
        s.db.update("UPDATE jobs SET status='QUEUED' WHERE id=?",job);
        call(post(base+"/projects/"+id+"/versions"),Map.of("segments",segs,"note","再来","confirmed",true)).andExpect(status().isConflict());
        call(post(base+"/jobs/"+job+"/cancel"),null).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED")).andExpect(jsonPath("$.message").value("已取消，没有发出视频请求"));
        call(post(base+"/jobs/"+job+"/cancel"),null).andExpect(status().isBadRequest());
        String second=json(call(post(base+"/projects/"+id+"/versions"),Map.of("segments",segs,"note","再来","confirmed",true)).andExpect(status().isOk())).path("id").asText();
        s.db.update("UPDATE jobs SET status='BLOCKED',message='供应商提交结果不确定；请核对供应商控制台后再决定是否重试' WHERE id=?",second);
        call(post(base+"/projects/"+id+"/versions"),Map.of("segments",segs,"note","第三版","confirmed",true)).andExpect(status().isConflict());
        call(post(base+"/jobs/"+second+"/cancel"),null).andExpect(status().isOk());
        call(post(base+"/projects/"+id+"/versions"),Map.of("segments",segs,"note","第三版","confirmed",true)).andExpect(status().isOk()).andExpect(jsonPath("$.no").value(3));
    }

    @Test void workerSendsTheProjectRatioAndResolutionToTheVideoApi() throws Exception {
        when(video.enabled()).thenReturn(true);when(video.model()).thenReturn("seedance-test");when(oss.enabled()).thenReturn(true);
        when(oss.publish(eq(client),any())).thenReturn("https://example.oss-cn-hangzhou.aliyuncs.com/p.jpg?Expires=1&Signature=x");
        doReturn(new byte[]{1,2,3}).when(analysis).readImage(any());
        when(video.submit(anyString(),anyInt(),anyList(),anyString(),anyString())).thenReturn("task-landscape");
        Map<String,Object> in=create("REMAKE","16:9");in.put("resolution","1080p");
        String id=json(call(post(base+"/project-library/projects"),in)).path("id").asText();confirmBoard(id);
        JsonNode v=json(call(post(base+"/projects/"+id+"/versions"),Map.of("segments",flow(id).path("draftSegments"),"confirmed",true)).andExpect(status().isOk()));
        assertThat(v.path("status").asText()).isEqualTo("QUEUED");
        worker.tick();
        verify(video,times(1)).submit(argThat(p->p.contains("横屏 16:9")&&p.contains("「出门不想穿搭」")),eq(11),argThat(r->r.size()==2),eq("1080p"),eq("16:9"));
        JsonNode after=flow(id).path("versions").path(0);
        assertThat(after.path("status").asText()).isEqualTo("RUNNING");assertThat(after.path("submitted").asBoolean()).isTrue();
        // 已交给视频接口的取消：只停止等待，不会再被轮询改回来
        call(post(base+"/jobs/"+v.path("id").asText()+"/cancel"),null).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        worker.tick();
        verify(video,never()).status(anyString());
    }
}
