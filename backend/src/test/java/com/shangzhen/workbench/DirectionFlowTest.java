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

/** 框架模式 / 一键成片的新版四步：方向、每个方向的分镜、多方向出片、一键出片。本地模式 + 视频接口是桩；AI 路径用桩测，不调任何真实模型。 */
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:directionflow;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE","app.storage=./target/directionflow-media","app.worker-delay=3600000","app.storyboard.poll-delay=3600000","app.product-analysis.poll-delay=3600000","app.remake-draft.poll-delay=3600000","app.ai.mode=local"})
@AutoConfigureMockMvc
class DirectionFlowTest {
    @Autowired Store s;@Autowired MockMvc mvc;
    @MockitoBean VideoApiClient video;@MockitoBean OssReferenceService oss;@MockitoSpyBean AiService ai;
    String client,shoe,shoe2,base;

    @BeforeEach void setup() throws Exception {
        client=Store.id();shoe=Store.id();shoe2=Store.id();base="/api/clients/"+client;
        s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",client,"admin","方向测试","鞋子",Store.now());
        int age=20;
        for(String id:List.of(shoe,shoe2)) s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",id,client,id+".png","PRODUCT","NB-992","","image/png",3,id+".png",s.write(Map.of("productName","新百伦鞋子","productGroupId","g-shoe")),Store.now().minusSeconds(age-=5));
        call(put(base+"/product-groups/"+shoe+"/understanding"),Map.of("revision",0,"understanding",Map.of("core",List.of("灰色拼接鞋面","侧面 N 字标识"),"pain",List.of("早上赶时间不想配鞋"),"scene",List.of("通勤路上"),"obj",List.of("尺码合不合脚")))).andExpect(status().isOk());
        call(post(base+"/product-groups/"+shoe+"/personas"),Map.of("name","通勤上班族","pain","出门前纠结穿哪双","hooks",List.of("对比型"))).andExpect(status().isOk());
        when(video.enabled()).thenReturn(false);
    }
    ResultActions call(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req,Object body) throws Exception {
        if(body!=null) req=req.contentType(MediaType.APPLICATION_JSON).content(s.write(body));
        return mvc.perform(req.with(user("admin")).with(csrf()));
    }
    JsonNode json(ResultActions r) throws Exception {return s.json.readTree(r.andReturn().getResponse().getContentAsString());}
    String create(String mode) throws Exception {
        return json(call(post(base+"/project-library/projects"),Map.of("mode",mode,"productAnchorId",shoe,"ratio","9:16","resolution","720p","facts","灰白拼色网眼鞋面","factsConfirmed",true)).andExpect(status().isOk())).path("id").asText();
    }
    JsonNode flow(String id) throws Exception {return json(call(get(base+"/projects/"+id+"/flow"),null).andExpect(status().isOk()));}
    @SuppressWarnings("unchecked") Map<String,Object> data(JsonNode d){return s.json.convertValue(d.path("data"),Map.class);}
    List<Map<String,Object>> edits(JsonNode shots,String visual){
        List<Map<String,Object>> out=new ArrayList<>();
        for(JsonNode x:shots){List<String> lines=new ArrayList<>();x.path("lines").forEach(l->lines.add(l.asText()));out.add(new LinkedHashMap<>(Map.of("id",x.path("id").asText(),"visual",visual==null?x.path("visual").asText():visual,"lines",lines,"task",x.path("task").asText())));}
        return out;
    }
    JsonNode dir(JsonNode f,String id){for(JsonNode d:f.path("directions")) if(d.path("id").asText().equals(id)) return d;throw new AssertionError(id);}

    @Test void frameworkLocalDirectionsBoardsAndPerDirectionVersions() throws Exception {
        String id=create("FRAMEWORK");
        JsonNode f=flow(id);
        assertThat(f.path("mode").asText()).isEqualTo("FRAMEWORK");assertThat(f.path("directions").size()).isZero();assertThat(f.path("aiEnabled").asBoolean()).isFalse();
        assertThat(f.path("options").path("durations").toString()).isEqualTo("[15,30]");
        int rev=f.path("revision").asInt();
        call(post(base+"/projects/"+id+"/directions/generate"),Map.of("revision",rev,"personaName","通勤上班族","duration",20)).andExpect(status().isBadRequest());
        call(post(base+"/projects/"+id+"/directions/generate"),Map.of("revision",rev+3,"personaName","通勤上班族","duration",15)).andExpect(status().isConflict());
        f=json(call(post(base+"/projects/"+id+"/directions/generate"),Map.of("revision",rev,"personaName","通勤上班族","duration",15)).andExpect(status().isOk()));
        JsonNode ds=f.path("directions");
        assertThat(ds.size()).isEqualTo(3);
        // 本地模板：标明不是 AI 写的，只用商品理解里的话；人群常用的开头排第一
        assertThat(ds.path(0).path("source").asText()).isEqualTo("LOCAL");assertThat(ds.path(0).path("data").path("why").asText()).contains("本地模板").contains("没有经过文字模型");
        assertThat(ds.path(0).path("data").path("hook").asText()).isEqualTo("对比型");assertThat(ds.path(0).path("data").path("openLine").asText()).contains("灰色拼接鞋面");
        assertThat(ds.path(1).path("data").path("hook").asText()).isEqualTo("痛点型");assertThat(ds.path(1).path("data").path("openLine").asText()).isEqualTo("出门前纠结穿哪双？");
        assertThat(ds.path(0).path("data").path("personaName").asText()).isEqualTo("通勤上班族");assertThat(ds.path(0).path("data").path("duration").asInt()).isEqualTo(15);
        assertThat(f.path("settings").path("personaName").asText()).isEqualTo("通勤上班族");
        verify(ai,never()).directions(anyMap(),anyInt());
        String a=ds.path(0).path("id").asText(),b=ds.path(1).path("id").asText(),c=ds.path(2).path("id").asText();
        // 改格子：选项外的值不收；恢复原文 = 把原文发回来
        Map<String,Object> edit=data(ds.path(1));edit.put("hook","乱写");
        call(put(base+"/projects/"+id+"/directions/"+b),Map.of("revision",0,"direction",edit)).andExpect(status().isBadRequest());
        edit.put("hook","悬念型");edit.put("openLine","先别看全貌");edit.put("points",List.of("灰色拼接鞋面"));
        JsonNode edited=dir(json(call(put(base+"/projects/"+id+"/directions/"+b),Map.of("revision",0,"direction",edit)).andExpect(status().isOk())),b);
        assertThat(edited.path("edited").asBoolean()).isTrue();assertThat(edited.path("revision").asInt()).isEqualTo(1);assertThat(edited.path("origin").path("hook").asText()).isEqualTo("痛点型");
        call(put(base+"/projects/"+id+"/directions/"+b),Map.of("revision",0,"direction",edit)).andExpect(status().isConflict());
        JsonNode restored=dir(json(call(put(base+"/projects/"+id+"/directions/"+b),Map.of("revision",1,"direction",s.json.convertValue(edited.path("origin"),Map.class))).andExpect(status().isOk())),b);
        assertThat(restored.path("edited").asBoolean()).isFalse();
        // 单独重出一套
        JsonNode again=dir(json(call(post(base+"/projects/"+id+"/directions/"+c+"/regenerate"),Map.of("revision",0)).andExpect(status().isOk())),c);
        assertThat(again.path("revision").asInt()).isEqualTo(1);assertThat(again.path("edited").asBoolean()).isFalse();
        // 选 2 个方向一起测：每个方向各写一份分镜（15 秒 5 镜）
        rev=flow(id).path("revision").asInt();
        call(post(base+"/projects/"+id+"/directions/confirm"),Map.of("revision",rev,"ids",List.of())).andExpect(status().isBadRequest());
        call(post(base+"/projects/"+id+"/directions/confirm"),Map.of("revision",rev,"ids",List.of(a,b,c,"x"))).andExpect(status().isBadRequest());
        f=json(call(post(base+"/projects/"+id+"/directions/confirm"),Map.of("revision",rev,"ids",List.of(b,a))).andExpect(status().isOk()));
        assertThat(dir(f,b).path("selectOrder").asInt()).isZero();assertThat(dir(f,a).path("selectOrder").asInt()).isEqualTo(1);assertThat(dir(f,c).path("selected").asBoolean()).isFalse();
        JsonNode boardA=dir(f,a).path("board");
        assertThat(boardA.path("saved").asBoolean()).isTrue();assertThat(boardA.path("confirmed").asBoolean()).isFalse();assertThat(boardA.path("source").asText()).isEqualTo("LOCAL");
        assertThat(boardA.path("shots").size()).isEqualTo(5);assertThat(boardA.path("shots").path(0).path("task").asText()).isEqualTo("抓住注意力");
        assertThat(boardA.path("shots").path(0).path("lines").path(0).asText()).isEqualTo(dir(f,a).path("data").path("openLine").asText());
        assertThat(boardA.path("shots").path(4).path("end").asDouble()).isEqualTo(15.0);
        JsonNode lib=json(call(get(base+"/project-library"),null)).path("projects").path(0);
        assertThat(lib.path("flow").asBoolean()).isTrue();assertThat(lib.path("plan").path("selected").asInt()).isEqualTo(2);assertThat(lib.path("plan").path("boardsConfirmed").asInt()).isZero();
        // 再出 3 套：选中的方向留着
        rev=f.path("revision").asInt();
        f=json(call(post(base+"/projects/"+id+"/directions/generate"),Map.of("revision",rev,"personaName","通勤上班族","duration",15)).andExpect(status().isOk()));
        assertThat(f.path("directions").size()).isEqualTo(5);assertThat(dir(f,a).path("selected").asBoolean()).isTrue();
        // 分镜：确认时每镜都要有画面；可以改、可以恢复原文；方向改了时长，分镜提示按新方向重写
        call(put(base+"/projects/"+id+"/directions/"+a+"/storyboard"),Map.of("revision",1,"shots",edits(boardA.path("shots"),""),"confirmed",true)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("第 1 镜还没写画面"));
        List<Map<String,Object>> e=edits(boardA.path("shots"),null);e.get(1).put("visual","手拿鞋子转一圈");e.get(1).put("lines",List.of("这款最好看"));
        JsonNode saved=dir(json(call(put(base+"/projects/"+id+"/directions/"+a+"/storyboard"),Map.of("revision",1,"shots",e,"confirmed",false)).andExpect(status().isOk())),a).path("board");
        assertThat(saved.path("shots").path(1).path("visual").asText()).isEqualTo("手拿鞋子转一圈");assertThat(saved.path("shots").path(1).path("origVisual").asText()).isEqualTo(boardA.path("shots").path(1).path("visual").asText());
        call(put(base+"/projects/"+id+"/directions/"+a+"/storyboard"),Map.of("revision",1,"shots",e,"confirmed",false)).andExpect(status().isConflict());
        Map<String,Object> longer=data(dir(f,a));longer.put("duration",30);
        JsonNode stale=dir(json(call(put(base+"/projects/"+id+"/directions/"+a),Map.of("revision",0,"direction",longer)).andExpect(status().isOk())),a);
        assertThat(stale.path("board").path("stale").asBoolean()).isTrue();assertThat(stale.path("board").path("duration").asInt()).isEqualTo(15);
        JsonNode rewritten=dir(json(call(post(base+"/projects/"+id+"/directions/"+a+"/storyboard/rewrite"),Map.of("revision",2)).andExpect(status().isOk())),a).path("board");
        assertThat(rewritten.path("stale").asBoolean()).isFalse();assertThat(rewritten.path("shots").size()).isEqualTo(7);assertThat(rewritten.path("duration").asInt()).isEqualTo(30);
        // 出片：分镜没确认不能出；确认后每个方向各自出片、各自数版本
        call(post(base+"/projects/"+id+"/versions"),Map.of("segments",List.of(Map.of("key","style","title","画面","text","x")),"confirmed",true,"directionId",a)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("先确认这个方向的分镜再出片"));
        JsonNode fa=dir(json(call(put(base+"/projects/"+id+"/directions/"+a+"/storyboard"),Map.of("revision",3,"shots",edits(rewritten.path("shots"),null),"confirmed",true)).andExpect(status().isOk())),a);
        JsonNode fbBoard=dir(flow(id),b).path("board");
        JsonNode ff=json(call(put(base+"/projects/"+id+"/directions/"+b+"/storyboard"),Map.of("revision",fbBoard.path("revision").asInt(),"shots",edits(fbBoard.path("shots"),null),"confirmed",true)).andExpect(status().isOk()));
        JsonNode segA=fa.path("board").path("draftSegments");
        assertThat(segA.path(0).path("text").asText()).contains("时长 30 秒").contains("片种：");assertThat(segA.path(1).path("text").asText()).contains("第 1 镜（第 0.0~3.0 秒）");
        String unpicked="";for(JsonNode x:flow(id).path("directions")) if(!x.path("selected").asBoolean()) unpicked=x.path("id").asText();
        call(post(base+"/projects/"+id+"/versions"),Map.of("segments",segA,"confirmed",true,"directionId",c)).andExpect(status().isNotFound());
        call(post(base+"/projects/"+id+"/versions"),Map.of("segments",segA,"confirmed",true,"directionId",unpicked)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("这个方向没有选上，先在方向里选它"));
        JsonNode v1=json(call(post(base+"/projects/"+id+"/versions"),Map.of("segments",segA,"confirmed",true,"directionId",a)).andExpect(status().isOk()));
        assertThat(v1.path("status").asText()).isEqualTo("BLOCKED");assertThat(v1.path("message").asText()).contains("未配置").doesNotContain("费用");
        assertThat(v1.path("directionId").asText()).isEqualTo(a);assertThat(v1.path("no").asInt()).isEqualTo(1);assertThat(v1.path("duration").asInt()).isEqualTo(30);
        Models.Project snap=s.snapshot(s.db.queryForObject("SELECT snapshot FROM jobs WHERE id=?",String.class,v1.path("id").asText()));
        assertThat(snap.shots()).hasSize(1);assertThat(snap.config().get("directionId")).isEqualTo(a);assertThat(snap.config().get("generationPrompt").toString()).contains("第 7 镜");
        // A 有一版在出片时，A 不能再出，B 可以
        s.db.update("UPDATE jobs SET status='QUEUED' WHERE id=?",v1.path("id").asText());
        call(post(base+"/projects/"+id+"/versions"),Map.of("segments",segA,"note","再来","confirmed",true,"directionId",a)).andExpect(status().isConflict());
        JsonNode vb=json(call(post(base+"/projects/"+id+"/versions"),Map.of("segments",dir(ff,b).path("board").path("draftSegments"),"confirmed",true,"directionId",b)).andExpect(status().isOk()));
        assertThat(vb.path("no").asInt()).isEqualTo(1);assertThat(vb.path("jobNo").asInt()).isEqualTo(2);
        // B 审片说差，原因只带进 B 的下一版
        s.db.update("UPDATE jobs SET status='REVIEW',output_name='x.mp4' WHERE id=?",vb.path("id").asText());
        call(put(base+"/jobs/"+vb.path("id").asText()+"/verdict"),Map.of("rating","BAD","reason","开头太慢","revision",0)).andExpect(status().isOk());
        JsonNode g=flow(id);
        assertThat(dir(g,b).path("board").path("draftSegments").toString()).contains("开头太慢");assertThat(dir(g,a).path("board").path("draftSegments").toString()).doesNotContain("开头太慢");
        assertThat(dir(g,b).path("versionCount").asInt()).isEqualTo(1);
        // 别的客户看不到
        mvc.perform(get(base+"/projects/"+id+"/flow").with(user("intruder"))).andExpect(status().isNotFound());
        mvc.perform(post(base+"/projects/"+id+"/directions/confirm").with(user("intruder")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"revision\":0,\"ids\":[]}")).andExpect(status().isNotFound());
    }

    @Test void aiPathUsesStubbedModelAndKeepsOptionsInRange() throws Exception {
        doReturn(true).when(ai).enabled();
        var x=new AiService.DirectionDraft("通勤痛点开场","人群最在意出门搭配","价格型","玄关一排鞋","每天出门都在纠结穿哪双鞋？","痛点 → 亮出鞋子 → 细节",List.of("灰色拼接鞋面","侧面 N 字标识"),"玄关","乱写的类型","卡点快剪","有人出镜","画外音","生活感实拍","定格商品");
        doReturn(new AiService.DirectionsDraft(List.of(x,x,x))).when(ai).directions(anyMap(),eq(3));
        List<AiService.BoardDraftShot> shots=new ArrayList<>();for(int i=0;i<5;i++) shots.add(new AiService.BoardDraftShot("镜头"+(i+1)+"画面",List.of("台词"+(i+1))));
        doReturn(new AiService.BoardDraft(shots)).when(ai).directionBoard(anyMap(),eq(5));
        String id=create("FRAMEWORK");
        JsonNode f=json(call(post(base+"/projects/"+id+"/directions/generate"),Map.of("revision",flow(id).path("revision").asInt(),"personaName","","duration",15)).andExpect(status().isOk()));
        JsonNode d=f.path("directions").path(0);
        assertThat(d.path("source").asText()).isEqualTo("AI");
        // 没有价格资料时不收价格型开头；选项外的内容类型换成默认
        assertThat(d.path("data").path("hook").asText()).isEqualTo("痛点型");assertThat(d.path("data").path("contentType").asText()).isEqualTo("痛点问答");
        assertThat(d.path("data").path("personaName").asText()).isEqualTo("通勤上班族");
        f=json(call(post(base+"/projects/"+id+"/directions/confirm"),Map.of("revision",f.path("revision").asInt(),"ids",List.of(d.path("id").asText()))).andExpect(status().isOk()));
        JsonNode board=f.path("directions").path(0).path("board");
        assertThat(board.path("source").asText()).isEqualTo("AI");assertThat(board.path("shots").path(2).path("visual").asText()).isEqualTo("镜头3画面");
        verify(ai,times(1)).directionBoard(argThat(m->m.containsKey("slots")&&m.containsKey("direction")),eq(5));
        // 模型出错：原来的内容不动
        doThrow(new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_GATEWAY,"AI 写方向没成功，原来的内容没有改动，请稍后再试")).when(ai).directions(anyMap(),eq(1));
        call(post(base+"/projects/"+id+"/directions/"+d.path("id").asText()+"/regenerate"),Map.of("revision",0)).andExpect(status().isBadGateway());
        assertThat(flow(id).path("directions").path(0).path("revision").asInt()).isZero();
    }

    @Test void oneClickRunWritesDirectionAndBoardThenOutputsWithSettingsSnapshot() throws Exception {
        String id=create("ONE_CLICK");
        JsonNode f=flow(id);
        assertThat(f.path("mode").asText()).isEqualTo("ONE_CLICK");assertThat(f.path("settings").path("oneClick").path("duration").asInt()).isEqualTo(15);
        assertThat(s.db.queryForObject("SELECT COUNT(*) FROM jobs WHERE project_id=?",Integer.class,id)).isZero();
        int rev=f.path("revision").asInt();
        call(post(base+"/projects/"+id+"/directions/generate"),Map.of("revision",rev,"duration",15)).andExpect(status().isBadRequest());
        call(post(base+"/projects/"+id+"/one-click/run"),Map.of("revision",rev,"settings",Map.of("src","copy","copy"," "))).andExpect(status().isBadRequest());
        call(post(base+"/projects/"+id+"/one-click/run"),Map.of("revision",rev,"settings",Map.of("duration",20))).andExpect(status().isBadRequest());
        Map<String,Object> set=new LinkedHashMap<>(Map.of("personaName","通勤上班族","duration",15,"src","copy","copy","出门不想配鞋？试试这双。灰色拼接，配什么都行！点下面看看。","people","只出手","tempo","卡点快剪"));
        JsonNode v1=json(call(post(base+"/projects/"+id+"/one-click/run"),Map.of("revision",rev,"settings",set)).andExpect(status().isOk()));
        assertThat(v1.path("status").asText()).isEqualTo("BLOCKED");assertThat(v1.path("note").asText()).isEqualTo("首版：按设置自动写方向和分镜");
        assertThat(v1.path("oneClick").path("people").asText()).isEqualTo("只出手");assertThat(v1.path("oneClick").path("src").asText()).isEqualTo("copy");
        f=flow(id);
        JsonNode d=f.path("directions").path(0);
        assertThat(f.path("directions").size()).isEqualTo(1);assertThat(d.path("selected").asBoolean()).isTrue();assertThat(d.path("source").asText()).isEqualTo("LOCAL");
        assertThat(d.path("data").path("people").asText()).isEqualTo("只出手");assertThat(d.path("data").path("tempo").asText()).isEqualTo("卡点快剪");
        JsonNode board=d.path("board");
        assertThat(board.path("confirmed").asBoolean()).isTrue();
        // 照文案：一个字不改地按顺序放进各镜
        StringBuilder all=new StringBuilder();for(JsonNode x:board.path("shots")) for(JsonNode l:x.path("lines")) all.append(l.asText());
        assertThat(all.toString()).isEqualTo("出门不想配鞋？试试这双。灰色拼接，配什么都行！点下面看看。");
        Models.Project snap=s.snapshot(s.db.queryForObject("SELECT snapshot FROM jobs WHERE id=?",String.class,v1.path("id").asText()));
        assertThat(snap.shots()).hasSize(1);assertThat(snap.config().get("generationPrompt").toString()).contains("只出手").contains("「出门不想配鞋？」");
        // 设置没变：沿用（改过的）分镜
        List<Map<String,Object>> e=edits(board.path("shots"),null);e.get(2).put("visual","双手捧鞋转到侧面");
        call(put(base+"/projects/"+id+"/directions/"+d.path("id").asText()+"/storyboard"),Map.of("revision",board.path("revision").asInt(),"shots",e,"confirmed",false)).andExpect(status().isOk());
        assertThat(dir(flow(id),d.path("id").asText()).path("board").path("confirmed").asBoolean()).isTrue();
        rev=flow(id).path("revision").asInt();
        JsonNode v2=json(call(post(base+"/projects/"+id+"/one-click/run"),Map.of("revision",rev,"settings",set)).andExpect(status().isOk()));
        assertThat(v2.path("note").asText()).isEqualTo("设置没变，按现在的方向和分镜再出一版");
        assertThat(v2.path("segments").toString()).contains("双手捧鞋转到侧面");assertThat(flow(id).path("directions").size()).isEqualTo(1);
        // 有一版在出片时不能再出
        s.db.update("UPDATE jobs SET status='QUEUED' WHERE id=?",v2.path("id").asText());
        rev=flow(id).path("revision").asInt();
        call(post(base+"/projects/"+id+"/one-click/run"),Map.of("revision",rev,"settings",set)).andExpect(status().isConflict());
        s.db.update("UPDATE jobs SET status='CANCELLED' WHERE id=?",v2.path("id").asText());
        // 改设置：重新写一个方向，旧的留着（版本还指着它）
        set.put("duration",30);set.put("src","idea");
        JsonNode v3=json(call(post(base+"/projects/"+id+"/one-click/run"),Map.of("revision",rev,"settings",set)).andExpect(status().isOk()));
        assertThat(v3.path("note").asText()).isEqualTo("改了设置，重新写了方向和分镜");assertThat(v3.path("duration").asInt()).isEqualTo(30);assertThat(v3.path("oneClick").path("duration").asInt()).isEqualTo(30);
        f=flow(id);
        assertThat(f.path("directions").size()).isEqualTo(2);assertThat(f.path("directions").path(1).path("selected").asBoolean()).isTrue();assertThat(f.path("directions").path(0).path("selected").asBoolean()).isFalse();
        assertThat(f.path("directions").path(1).path("board").path("shots").size()).isEqualTo(7);
        assertThat(f.path("versions").path(0).path("no").asInt()).isEqualTo(3);
        verify(ai,never()).directions(anyMap(),anyInt());verify(ai,never()).directionBoard(anyMap(),anyInt());
        // 视频二创的接口不会误用到这里
        call(post(base+"/projects/"+id+"/storyboard/draft"),Map.of("revision",0)).andExpect(status().isBadRequest());
    }
}
