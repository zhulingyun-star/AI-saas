package com.shangzhen.workbench;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:library;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE","app.storage=./target/library-media","app.worker-delay=3600000","app.product-analysis.poll-delay=3600000"})
@AutoConfigureMockMvc
class ProductLibraryTest {
    @Autowired Store s;@Autowired MockMvc mvc;
    @MockitoBean AiService ai;
    String client,first,second,base;

    static final String REPORT="""
        {"category":"低帮系带运动休闲鞋","audience":"偏好复古运动风、寻找日常百搭鞋款的人群","tone":"简约","summary":"灰白拼色低帮运动鞋",
         "appearance":"低帮系带","material":"可见绒面质感，成分待确认","colors":["浅灰"],"usage":"适合日常休闲出行、城市通勤（具体运动性能待确认）。","operation":"","styling":"可搭配牛仔裤",
         "showcase_points":[{"part":"鞋舌","where":"上部","what":"印有992字样"}],
         "provable_points":[{"claim":"灰白多材质拼接外观","evidence":"图片1可见","how":"近景"},{"claim":"上脚舒适缓震","evidence":"待验证","how":"需试穿"}],
         "image_views":[{"image":"1","view":"侧面"}],"pain_points":["普通运动鞋单调"],"pitch_lines":["灰白拼接很耐看"],
         "fit_types":[{"type":"新旧对比型广告","why":"细节多"}],"exaggeration_risks":[{"point":"美产","why":"无依据"}],"confirm":["鞋面具体材质成分","尺码是否偏大"]}""";

    @BeforeEach void setup() {
        client=Store.id();first=Store.id();second=Store.id();base="/api/clients/"+client;
        s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",client,"admin","商品库测试","鞋子",Store.now());
        for(String id:List.of(first,second)) s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",id,client,id+".png","PRODUCT","","","image/png",3,id+".png",s.write(Map.of("productName",id.equals(first)?"新百伦鞋子":"白T恤","productGroupId","g-"+id)),Store.now());
    }
    void analyzed(String asset) {
        s.db.update("INSERT INTO product_analyses(client_id,group_id,anchor_id,brief,status,input_json,result_input_json,result_json,model,revision,analyzed_at,updated_at) VALUES(?,?,?,'','COMPLETED','{}','{}',?,'test',1,?,?)",
            client,"g-"+asset,asset,REPORT.strip(),Store.now(),Store.now());
    }
    ResultActions call(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req,Object body) throws Exception {
        if(body!=null) req=req.contentType(MediaType.APPLICATION_JSON).content(s.write(body));
        return mvc.perform(req.with(user("admin")).with(csrf()));
    }
    JsonNode json(ResultActions r) throws Exception {return s.json.readTree(r.andReturn().getResponse().getContentAsString());}

    @Test void foldersAreTwoLevelsUniqueRenamableAndHoldEachProductOnce() throws Exception {
        mvc.perform(get(base+"/product-library").with(user("intruder"))).andExpect(status().isNotFound());
        mvc.perform(post(base+"/product-folders").with(user("intruder")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"偷建\"}")).andExpect(status().isNotFound());
        String shoes=json(call(post(base+"/product-folders"),Map.of("name","鞋靴")).andExpect(status().isOk())).path("id").asText();
        JsonNode sport=json(call(post(base+"/product-folders"),Map.of("name","运动休闲","parentId",shoes)).andExpect(status().isOk()));
        assertThat(sport.path("parentId").asText()).isEqualTo(shoes);
        call(post(base+"/product-folders"),Map.of("name","第三层","parentId",sport.path("id").asText())).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("文件夹最多两层"));
        call(post(base+"/product-folders"),Map.of("name","鞋靴")).andExpect(status().isBadRequest());
        call(post(base+"/product-folders"),Map.of("name","未分类")).andExpect(status().isBadRequest());
        call(post(base+"/product-folders"),Map.of("name","全部商品")).andExpect(status().isBadRequest());
        call(put(base+"/product-folders/"+shoes),Map.of("name","鞋子","revision",3)).andExpect(status().isConflict());
        call(put(base+"/product-folders/"+shoes),Map.of("name","鞋子","revision",0)).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("鞋子")).andExpect(jsonPath("$.revision").value(1));
        String sportId=sport.path("id").asText();
        call(put(base+"/product-groups/"+first+"/folder"),Map.of("folderId",sportId)).andExpect(status().isOk());
        call(put(base+"/product-groups/"+first+"/folder"),Map.of("folderId",shoes)).andExpect(status().isOk());
        JsonNode lib=json(call(get(base+"/product-library"),null));
        assertThat(lib.path("folders")).hasSize(2);
        assertThat(lib.path("products").path("group:g-"+first).path("folderId").asText()).isEqualTo(shoes);
        assertThat(lib.path("products").path("group:g-"+second).path("folderId").asText("")).isEmpty();
        assertThat(s.db.queryForObject("SELECT COUNT(*) FROM product_profiles WHERE client_id=? AND group_id=?",Integer.class,client,"g-"+first)).isEqualTo(1);
        call(delete(base+"/product-folders/"+shoes),null).andExpect(status().isBadRequest());
        call(put(base+"/product-groups/"+first+"/folder"),Map.of("folderId","missing")).andExpect(status().isNotFound());
        call(put(base+"/product-groups/"+first+"/folder"),new HashMap<>()).andExpect(status().isOk());
        call(delete(base+"/product-folders/"+shoes),null).andExpect(status().isBadRequest());
        call(delete(base+"/product-folders/"+sportId),null).andExpect(status().isNoContent());
        call(delete(base+"/product-folders/"+shoes),null).andExpect(status().isNoContent());
        // 别的客户的文件夹不能用
        String other=Store.id();s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",other,"admin","另一个客户","服饰",Store.now());
        String foreign=json(call(post("/api/clients/"+other+"/product-folders"),Map.of("name","别人的"))).path("id").asText();
        call(put(base+"/product-groups/"+first+"/folder"),Map.of("folderId",foreign)).andExpect(status().isNotFound());
    }

    @Test void understandingIsDerivedFromAnalysisWithoutInventedFactsAndSavedWithRevision() throws Exception {
        call(post(base+"/product-groups/"+first+"/understanding/extract"),Map.of("revision",0)).andExpect(status().isBadRequest());
        JsonNode empty=json(call(get(base+"/product-groups/"+first+"/understanding"),null));
        assertThat(empty.path("source").asText()).isEqualTo("EMPTY");
        analyzed(first);
        JsonNode derived=json(call(get(base+"/product-groups/"+first+"/understanding"),null).andExpect(status().isOk()));
        assertThat(derived.path("source").asText()).isEqualTo("DERIVED");assertThat(derived.path("saved").asBoolean()).isFalse();
        JsonNode u=derived.path("understanding");
        assertThat(u.path("core").toString()).contains("灰白多材质拼接外观").doesNotContain("上脚舒适缓震");
        assertThat(u.path("sub").toString()).contains("鞋舌：印有992字样");
        assertThat(u.path("obj").toString()).contains("鞋面具体材质成分","上脚舒适缓震（还没验证）");
        assertThat(u.path("scene").toString()).contains("日常休闲出行","城市通勤").doesNotContain("待确认");
        assertThat(u.path("when")).isEmpty();
        assertThat(u.toString()).doesNotContain("元").doesNotContain("美产");
        Map<String,Object> edited=new LinkedHashMap<>();
        edited.put("core",List.of("灰白多材质拼接外观"," 白色分层中底 "));edited.put("pain",List.of("出门纠结穿哪双"));edited.put("when",List.of("换季添一双日常鞋"));
        JsonNode saved=json(call(put(base+"/product-groups/"+first+"/understanding"),Map.of("understanding",edited,"revision",0)).andExpect(status().isOk()));
        assertThat(saved.path("saved").asBoolean()).isTrue();assertThat(saved.path("source").asText()).isEqualTo("EDITED");assertThat(saved.path("editedCount").asInt()).isEqualTo(1);
        assertThat(saved.path("understanding").path("core").get(1).asText()).isEqualTo("白色分层中底");
        assertThat(saved.path("understanding").path("sub")).isEmpty();
        call(put(base+"/product-groups/"+first+"/understanding"),Map.of("understanding",edited,"revision",0)).andExpect(status().isConflict());
        call(put(base+"/product-groups/"+first+"/understanding"),Map.of("understanding",Map.of("price",List.of("99")),"revision",1)).andExpect(status().isBadRequest());
        call(put(base+"/product-groups/"+first+"/understanding"),Map.of("understanding",Map.of("core",List.of("很".repeat(61))),"revision",1)).andExpect(status().isBadRequest());
        JsonNode again=json(call(post(base+"/product-groups/"+first+"/understanding/extract"),Map.of("revision",1)).andExpect(status().isOk()));
        assertThat(again.path("source").asText()).isEqualTo("DERIVED");assertThat(again.path("revision").asInt()).isEqualTo(2);assertThat(again.path("editedCount").asInt()).isZero();
        assertThat(again.path("understanding")).isEqualTo(u);
        verify(ai,never()).understanding(anyString(),anyMap());
        mvc.perform(get(base+"/product-groups/"+first+"/understanding").with(user("intruder"))).andExpect(status().isNotFound());
    }

    @Test void aiExtractionGoesThroughAiServiceAndDropsInventedPriceOrOrigin() throws Exception {
        analyzed(first);
        when(ai.enabled()).thenReturn(true);
        when(ai.understanding(anyString(),anyMap())).thenReturn(new AiService.UnderstandingDraft(List.of("灰白拼接外观","到手价 199 元"),List.of("鞋舌 992 字样"),List.of("鞋子单调"),List.of("材质待确认"),List.of("城市通勤","美国原产工艺"),List.of("换季")));
        JsonNode r=json(call(post(base+"/product-groups/"+first+"/understanding/extract"),Map.of("revision",0)).andExpect(status().isOk()));
        assertThat(r.path("source").asText()).isEqualTo("AI");
        assertThat(r.path("understanding").toString()).contains("灰白拼接外观","城市通勤","换季").doesNotContain("199").doesNotContain("原产");
        verify(ai).understanding(eq("新百伦鞋子"),anyMap());
    }

    @Test void personasStartAsSuggestionsThenAreSavedEditedAndDeleted() throws Exception {
        analyzed(first);
        String path=base+"/product-groups/"+first+"/personas";
        JsonNode u=json(call(get(base+"/product-groups/"+first+"/understanding"),null));
        assertThat(u.path("personasSaved").asBoolean()).isFalse();
        JsonNode suggestion=u.path("personas").get(0);
        assertThat(suggestion.path("id").isMissingNode()||suggestion.path("id").isNull()).isTrue();
        assertThat(suggestion.path("name").asText()).isEqualTo("偏好复古运动风");
        assertThat(suggestion.path("hooks").toString()).contains("对比型");
        Map<String,Object> persona=new LinkedHashMap<>(Map.of("name","通勤上班族","pain","早上赶时间","want","百搭","tone","直接","scene","通勤","worry","尺码","hooks",List.of("痛点型","人群锁定型")));
        Map<String,Object> bad=new LinkedHashMap<>(persona);bad.put("hooks",List.of("促销型"));
        call(post(path),bad).andExpect(status().isBadRequest());
        call(post(path+"/adopt"),null).andExpect(status().isOk()).andExpect(jsonPath("$.personasSaved").value(true)).andExpect(jsonPath("$.personas.length()").value(1));
        call(post(path+"/adopt"),null).andExpect(jsonPath("$.personas.length()").value(1));
        JsonNode created=json(call(post(path),persona).andExpect(status().isOk()));
        assertThat(created.path("personas")).hasSize(2);
        String id=created.path("personas").get(1).path("id").asText();
        persona.put("name","赶时间的上班族");
        call(put(path+"/"+id),Map.of("persona",persona,"revision",5)).andExpect(status().isConflict());
        call(put(path+"/"+id),Map.of("persona",persona,"revision",0)).andExpect(status().isOk()).andExpect(jsonPath("$.personas[1].name").value("赶时间的上班族")).andExpect(jsonPath("$.personas[1].revision").value(1));
        call(delete(path+"/"+id),null).andExpect(status().isOk()).andExpect(jsonPath("$.personas.length()").value(1));
        call(delete(path+"/"+id),null).andExpect(status().isNotFound());
        // 另一个商品的人群互不影响，新增时会先采用建议
        JsonNode other=json(call(post(base+"/product-groups/"+second+"/personas"),persona).andExpect(status().isOk()));
        assertThat(other.path("personas")).hasSize(1);
    }

    @Test void reviewStateFollowsTheCurrentAnalysis() throws Exception {
        call(put(base+"/product-groups/"+first+"/review"),Map.of("confirmed",List.of(),"reviewed",true)).andExpect(status().isBadRequest());
        analyzed(first);
        call(put(base+"/product-groups/"+first+"/review"),Map.of("confirmed",List.of("provable_points|灰白多材质拼接外观"),"reviewed",false)).andExpect(status().isOk());
        JsonNode p=json(call(get(base+"/product-library"),null)).path("products").path("group:g-"+first);
        assertThat(p.path("reviewed").asBoolean()).isFalse();assertThat(p.path("confirmed")).hasSize(1);
        assertThat(p.path("analysis").path("category").asText()).isEqualTo("低帮系带运动休闲鞋");
        assertThat(p.path("analysis").path("confirmCount").asInt()).isEqualTo(2);assertThat(p.path("analysis").path("unverifiedCount").asInt()).isEqualTo(1);
        call(put(base+"/product-groups/"+first+"/review"),Map.of("confirmed",List.of(),"reviewed",true)).andExpect(status().isOk());
        assertThat(json(call(get(base+"/product-library"),null)).path("products").path("group:g-"+first).path("reviewed").asBoolean()).isTrue();
        s.db.update("UPDATE product_analyses SET analyzed_at=? WHERE client_id=? AND group_id=?",Store.now().plusMinutes(1),client,"g-"+first);
        assertThat(json(call(get(base+"/product-library"),null)).path("products").path("group:g-"+first).path("reviewed").asBoolean()).isFalse();
    }
}
