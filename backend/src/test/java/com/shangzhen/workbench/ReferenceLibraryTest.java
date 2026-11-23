package com.shangzhen.workbench;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 参考视频库：文件夹、显示名、开头类型、每镜任务、用过的项目。本地模式，不调用任何模型。 */
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:reflib;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE","app.storage=./target/reflib-media","app.worker-delay=3600000","app.storyboard.poll-delay=3600000","app.product-analysis.poll-delay=3600000","app.ai.mode=local"})
@AutoConfigureMockMvc
class ReferenceLibraryTest {
    @Autowired Store s;@Autowired MockMvc mvc;@Autowired MediaService media;
    String client,ref,other,product,base;

    static final String REPORT="""
        {"duration":18.8,"shots":[
          {"id":"shot-1","start":0,"end":2.8,"action":"双手按压泵头","camera":"俯拍特写","transition":"开头","effects":"","text":"","review":""},
          {"id":"shot-2","start":2.8,"end":18.8,"action":"正面出镜","camera":"平视近景","transition":"硬切","effects":"","text":"","review":""}],
         "dialogue":[{"id":"l1","start":0,"end":0.9,"text":"出门不想化妆","source":"subtitle"}],"summary":"痛点开场","music":"轻快","suggestions":[]}""";

    @BeforeEach void setup() {
        client=Store.id();ref=Store.id();other=Store.id();product=Store.id();base="/api/clients/"+client;
        s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",client,"admin","参考库测试","美妆",Store.now());
        s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",ref,client,"1cff.mp4","REFERENCE","","","video/mp4",4,ref+".mp4","{}",Store.now());
        s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",other,client,"second.mp4","REFERENCE","","","video/mp4",4,other+".mp4","{}",Store.now());
        s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",product,client,"p.png","PRODUCT","","","image/png",3,product+".png",s.write(Map.of("productName","鞋","productGroupId","g")),Store.now());
    }
    void completed(String asset) {
        s.db.update("INSERT INTO reference_storyboards(client_id,asset_id,status,revision,report_json,updated_at) VALUES(?,?,'COMPLETED',3,?,?)",client,asset,REPORT.strip(),Store.now());
    }
    ResultActions call(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req,Object body) throws Exception {
        if(body!=null) req=req.contentType(MediaType.APPLICATION_JSON).content(s.write(body));
        return mvc.perform(req.with(user("admin")).with(csrf()));
    }
    JsonNode json(ResultActions r) throws Exception {return s.json.readTree(r.andReturn().getResponse().getContentAsString());}
    JsonNode item(JsonNode lib,String id){for(JsonNode x:lib.path("references")) if(x.path("assetId").asText().equals(id)) return x; return null;}

    @Test void listsOnlyReferenceVideosWithStoryboardSummaryAndNoGuessedLabels() throws Exception {
        mvc.perform(get(base+"/reference-library").with(user("intruder"))).andExpect(status().isNotFound());
        completed(ref);
        JsonNode lib=json(call(get(base+"/reference-library"),null).andExpect(status().isOk()));
        assertThat(lib.path("references")).hasSize(2);
        assertThat(lib.path("analysisEnabled").asBoolean()).isFalse();
        JsonNode r=item(lib,ref);
        assertThat(r.path("name").asText()).isEqualTo("1cff.mp4");
        assertThat(r.path("storyboard").path("status").asText()).isEqualTo("COMPLETED");
        assertThat(r.path("storyboard").path("shotCount").asInt()).isEqualTo(2);
        assertThat(r.path("storyboard").path("lineCount").asInt()).isEqualTo(1);
        assertThat(r.path("storyboard").path("duration").asDouble()).isEqualTo(18.8);
        assertThat(r.path("hook").asText("")).isEmpty();
        assertThat(r.path("usedBy")).isEmpty();
        JsonNode empty=item(lib,other);
        assertThat(empty.path("storyboard").path("status").asText()).isEqualTo("EMPTY");
        assertThat(empty.path("storyboard").path("hasReport").asBoolean()).isFalse();
        JsonNode detail=json(call(get(base+"/references/"+ref),null).andExpect(status().isOk()));
        assertThat(detail.path("shotTasks").size()).isZero();
        assertThat(detail.path("labelRevision").asInt()).isZero();
        call(get(base+"/references/"+product),null).andExpect(status().isNotFound());
        call(get(base+"/references/missing"),null).andExpect(status().isNotFound());
    }

    @Test void foldersFollowTheSameRulesAsProductsAndEachVideoLivesInOneFolder() throws Exception {
        String beauty=json(call(post(base+"/reference-folders"),Map.of("name","美妆护肤")).andExpect(status().isOk())).path("id").asText();
        String sub=json(call(post(base+"/reference-folders"),Map.of("name","防晒","parentId",beauty)).andExpect(status().isOk())).path("id").asText();
        call(post(base+"/reference-folders"),Map.of("name","第三层","parentId",sub)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("文件夹最多两层"));
        call(post(base+"/reference-folders"),Map.of("name","全部参考视频")).andExpect(status().isBadRequest());
        call(post(base+"/reference-folders"),Map.of("name","未分类")).andExpect(status().isBadRequest());
        call(post(base+"/reference-folders"),Map.of("name","美妆护肤")).andExpect(status().isBadRequest());
        // 商品库和参考视频库的文件夹互不影响
        call(post(base+"/product-folders"),Map.of("name","美妆护肤")).andExpect(status().isOk());
        call(put(base+"/reference-folders/"+beauty),Map.of("name","美妆","revision",5)).andExpect(status().isConflict());
        call(put(base+"/reference-folders/"+beauty),Map.of("name","美妆","revision",0)).andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1));
        call(put(base+"/references/"+ref+"/folder"),Map.of("folderId",sub)).andExpect(status().isOk()).andExpect(jsonPath("$.folderId").value(sub));
        call(put(base+"/references/"+ref+"/folder"),Map.of("folderId",beauty)).andExpect(status().isOk());
        JsonNode lib=json(call(get(base+"/reference-library"),null));
        assertThat(lib.path("folders")).hasSize(2);
        assertThat(item(lib,ref).path("folderId").asText()).isEqualTo(beauty);
        assertThat(item(lib,other).path("folderId").asText("")).isEmpty();
        call(delete(base+"/reference-folders/"+beauty),null).andExpect(status().isBadRequest());
        call(delete(base+"/reference-folders/"+sub),null).andExpect(status().isNoContent());
        call(delete(base+"/reference-folders/"+beauty),null).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("文件夹里还有参考视频，先把参考视频移走"));
        call(put(base+"/references/"+ref+"/folder"),new HashMap<>()).andExpect(status().isOk());
        call(delete(base+"/reference-folders/"+beauty),null).andExpect(status().isNoContent());
        call(put(base+"/references/"+ref+"/folder"),Map.of("folderId","missing")).andExpect(status().isNotFound());
        call(put(base+"/references/"+product+"/folder"),new HashMap<>()).andExpect(status().isNotFound());
        String outsider=Store.id();
        s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",outsider,"admin","别的客户","服饰",Store.now());
        String foreign=json(call(post("/api/clients/"+outsider+"/reference-folders"),Map.of("name","别人的"))).path("id").asText();
        call(put(base+"/references/"+ref+"/folder"),Map.of("folderId",foreign)).andExpect(status().isNotFound());
    }

    @Test void renameAndLabelsShareARevisionAndTasksOnlyStickToUnchangedShots() throws Exception {
        call(put(base+"/references/"+ref+"/name"),Map.of("name","  ","revision",0)).andExpect(status().isBadRequest());
        call(put(base+"/references/"+ref+"/name"),Map.of("name","防晒隔离霜 · 美妆带货","revision",0)).andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("防晒隔离霜 · 美妆带货")).andExpect(jsonPath("$.fileName").value("1cff.mp4")).andExpect(jsonPath("$.labelRevision").value(1));
        call(put(base+"/references/"+ref+"/name"),Map.of("name","旧页面的改名","revision",0)).andExpect(status().isConflict());
        // 没有拆解结果时可以标开头类型，但不能标每镜任务
        call(put(base+"/references/"+ref+"/labels"),Map.of("hook","痛点型","shotTasks",Map.of("shot-1","抓住注意力"),"revision",1)).andExpect(status().isBadRequest());
        call(put(base+"/references/"+ref+"/labels"),Map.of("hook","随便型","shotTasks",Map.of(),"revision",1)).andExpect(status().isBadRequest());
        completed(ref);
        call(put(base+"/references/"+ref+"/labels"),Map.of("hook","痛点型","shotTasks",Map.of("shot-1","抓住注意力","shot-2","乱写"),"revision",1)).andExpect(status().isBadRequest());
        call(put(base+"/references/"+ref+"/labels"),Map.of("hook","痛点型","shotTasks",Map.of("shot-9","建立需求"),"revision",1)).andExpect(status().isConflict());
        JsonNode saved=json(call(put(base+"/references/"+ref+"/labels"),Map.of("hook","痛点型","shotTasks",Map.of("shot-1","抓住注意力","shot-2",""),"revision",1)).andExpect(status().isOk()));
        assertThat(saved.path("hook").asText()).isEqualTo("痛点型");
        assertThat(saved.path("shotTasks").path("shot-1").asText()).isEqualTo("抓住注意力");
        assertThat(saved.path("shotTasks").has("shot-2")).isFalse();
        assertThat(saved.path("labelRevision").asInt()).isEqualTo(2);
        // 镜头区间被改过（例如重新拆解）后，旧任务不再挂在新镜头上
        s.db.update("UPDATE reference_storyboards SET report_json=? WHERE client_id=? AND asset_id=?",REPORT.strip().replace("\"end\":2.8","\"end\":3.1").replace("\"start\":2.8","\"start\":3.1"),client,ref);
        JsonNode after=json(call(get(base+"/references/"+ref),null));
        assertThat(after.path("shotTasks").has("shot-1")).isFalse();
        assertThat(after.path("hook").asText()).isEqualTo("痛点型");
        // 清空开头类型
        call(put(base+"/references/"+ref+"/labels"),Map.of("shotTasks",Map.of(),"revision",2)).andExpect(status().isOk()).andExpect(jsonPath("$.hook").doesNotExist());
    }

    @Test void usedByCountsRealProjectsOnlyAndDeleteCleansTheProfile() throws Exception {
        String campaign=Store.id(),work=Store.id(),loose=Store.id();
        s.db.update("INSERT INTO campaigns VALUES(?,?,?,?,?,?,?,?,?,?,?)",campaign,client,"新百伦鞋子 · 视频二创","admin",null,1,"",false,0,Store.now(),Store.now());
        s.db.update("INSERT INTO remake_drafts(id,client_id,campaign_id,asset_id,anchor_id,updated_at) VALUES(?,?,?,?,?,?)",Store.id(),client,campaign,ref,product,Store.now());
        String config=s.write(Map.of("referenceLinks",List.of(Map.of("assetId",ref))));
        for(String id:List.of(work,loose)) s.db.update("INSERT INTO projects VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",id,client,id.equals(work)?"作品一":"散作品","","鞋","抖音","参考片改编",15,"",false,"[]",config,"DRAFT",0,Store.now(),Store.now());
        s.db.update("INSERT INTO work_flow(project_id,campaign_id,assignee,phase,note,revision,updated_at) VALUES(?,?,?,?,?,?,?)",work,campaign,"admin","PLAN","",0,Store.now());
        // 只是名字里含有视频 id 的配置不算引用
        s.db.update("INSERT INTO projects VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",Store.id(),client,"无关","","鞋","抖音","细节演示",15,"",false,"[]",s.write(Map.of("note",ref)),"DRAFT",0,Store.now(),Store.now());
        JsonNode r=item(json(call(get(base+"/reference-library"),null)),ref);
        assertThat(r.path("usedBy")).hasSize(2);
        assertThat(r.path("usedBy").get(0).path("name").asText()).isEqualTo("新百伦鞋子 · 视频二创");
        assertThat(r.path("usedBy").get(1).path("kind").asText()).isEqualTo("work");
        assertThat(item(json(call(get(base+"/reference-library"),null)),other).path("usedBy")).isEmpty();
        // 删除沿用原来的接口：被用过的不能删；没用过的删掉后，库信息一起清掉
        call(put(base+"/references/"+other+"/name"),Map.of("name","第二条","revision",0)).andExpect(status().isOk());
        Files.createDirectories(media.resolve("."));Files.write(media.assetPath(client,other),new byte[]{1});
        call(delete(base+"/assets/"+ref+"/reference"),null).andExpect(status().isConflict());
        call(delete(base+"/assets/"+other+"/reference"),null).andExpect(status().isNoContent());
        assertThat(s.db.queryForObject("SELECT COUNT(*) FROM reference_profiles WHERE asset_id=?",Integer.class,other)).isZero();
        assertThat(json(call(get(base+"/reference-library"),null)).path("references")).hasSize(1);
    }
}
