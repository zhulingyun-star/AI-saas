package com.shangzhen.workbench;

import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.*;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.http.MediaType;
import java.util.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:workflow;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE","app.storage=./target/test-media","app.worker-delay=3600000"})
@AutoConfigureMockMvc
class WorkflowIntegrationTest {
 @Autowired MockMvc mvc; @Autowired Store s; @Autowired ProjectService projects; @Autowired PasswordEncoder encoder; @Autowired MetricsService metrics;
 String client;
 @BeforeEach void setup(){client=s.db.queryForObject("SELECT id FROM clients WHERE owner='admin' ORDER BY created_at LIMIT 1",String.class);}
 String project() throws Exception {
  var body=new Models.ProjectInput("集成测试外套","TEST-001","服饰鞋包","抖音","细节演示",15,"外观与规格已确认",true,List.of(),Map.of(),0);
  String response=mvc.perform(post("/api/clients/"+client+"/projects").with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(body))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();return s.json.readTree(response).get("id").asText();
 }
 @Test void campaignProductBindingReturnsWholeGroupAndAnalysisAndRejectsCrossClient() throws Exception {
  String c=Store.id(),campaign=Store.id(),first=Store.id(),second=Store.id(),foreign=Store.id(),group=Store.id();
  s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",c,"admin","项目绑定测试","服饰",Store.now());
  s.db.update("INSERT INTO campaigns VALUES(?,?,?,?,?,?,?,?,?,?,?)",campaign,c,"绑定测试","admin",null,1,"",false,0,Store.now(),Store.now());
  for(String id:List.of(first,second))s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",id,c,"商品图","PRODUCT","SKU","标签","image/png",3,"test.png",s.write(Map.of("productName","鞋子","productGroupId",group)),Store.now());
  s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",foreign,client,"其他客户图","PRODUCT","","","image/png",3,"test.png","{}",Store.now());
  s.db.update("INSERT INTO product_analyses(client_id,group_id,anchor_id,brief,status,input_json,result_json,model,updated_at) VALUES(?,?,?,?,'COMPLETED','{}',?,?,?)",c,group,first,"补充说明",s.write(Map.of("summary","已手动编辑的商品分析")),"test",Store.now());
  String path="/api/clients/"+c+"/campaigns/"+campaign+"/products";
  mvc.perform(get(path).with(user("admin"))).andExpect(jsonPath("$.products.length()").value(0));
  mvc.perform(put(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(Map.of("anchorIds",List.of(first,second),"revision",0))))
   .andExpect(status().isOk()).andExpect(jsonPath("$.products.length()").value(1)).andExpect(jsonPath("$.products[0].assets.length()").value(2)).andExpect(jsonPath("$.products[0].analysis.report.summary").value("已手动编辑的商品分析"));
  mvc.perform(get(path).with(user("admin"))).andExpect(jsonPath("$.products[0].analysis.brief").value("补充说明"));
  mvc.perform(put(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(Map.of("anchorIds",List.of(foreign),"revision",1)))).andExpect(status().isNotFound());
  mvc.perform(put(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(Map.of("anchorIds",List.of(),"revision",0)))).andExpect(status().isConflict());
  mvc.perform(get(path).with(user("intruder"))).andExpect(status().isNotFound());
  mvc.perform(put(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(Map.of("anchorIds",List.of(),"revision",1)))).andExpect(jsonPath("$.products.length()").value(0));
  assertThat(s.asset(c,first).metadata().get("productName")).isEqualTo("鞋子");
 }
 @Test void authenticationCsrfAndSession() throws Exception {
  mvc.perform(get("/api/clients")).andExpect(status().isUnauthorized());
  mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"admin\",\"password\":\"change-me-local\"}")).andExpect(status().isForbidden());
  var result=mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"admin\",\"password\":\"change-me-local\"}")).andExpect(status().isOk()).andReturn();
  mvc.perform(get("/api/auth/me").session((org.springframework.mock.web.MockHttpSession)result.getRequest().getSession())).andExpect(status().isOk()).andExpect(jsonPath("$.username").value("admin"));
  mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"admin\",\"password\":\"incorrect\"}")).andExpect(status().isUnauthorized());
 }
 @Test void tenantIsolationBlocksReadsAndWrites() throws Exception {
  String id=project();
  for(String route:List.of("/projects","/projects/"+id,"/assets","/jobs","/metrics","/presets","/overview"))mvc.perform(get("/api/clients/"+client+route).with(user("intruder"))).andExpect(status().isNotFound());
  mvc.perform(post("/api/clients/"+client+"/projects/"+id+"/draft").with(user("intruder")).with(csrf())).andExpect(status().isNotFound());
 }
 @Test void localDraftLockedShotsAndOptimisticRevision() throws Exception {
  String id=project();var p=s.project(client,id);
  var shot=new Models.Shot(15,"已锁定真实画面","确认口播",null,0,true);
  var input=new Models.ProjectInput(p.name(),p.sku(),p.category(),p.platform(),p.format(),15,p.facts(),true,List.of(shot),Map.of(),0);
  projects.update(client,id,"admin",input);
  mvc.perform(post("/api/clients/"+client+"/projects/"+id+"/draft").with(user("admin")).with(csrf())).andExpect(status().isOk()).andExpect(jsonPath("$.mode").value("local")).andExpect(jsonPath("$.shots[0].visual").value("已锁定真实画面"));
  mvc.perform(put("/api/clients/"+client+"/projects/"+id).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(input))).andExpect(status().isConflict());
 }
 @Test void unavailableProviderIsBlockedAndCannotBeDelivered() throws Exception {
  String id=project();var p=s.project(client,id);projects.update(client,id,"admin",new Models.ProjectInput(p.name(),p.sku(),p.category(),p.platform(),p.format(),15,p.facts(),true,List.of(new Models.Shot(15,"真实商品","口播",null,0,false)),Map.of(),0));
  var job=projects.submit(client,"admin",new Models.Submit(List.of(id),"VIDEO_API")).get(0);
  assertThat(job.status()).isEqualTo("BLOCKED");assertThat(job.hasOutput()).isFalse();
  mvc.perform(post("/api/clients/"+client+"/jobs/"+job.id()+"/reviews").with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"DELIVERED\",\"comment\":\"不能虚假交付\",\"timecode\":0}")).andExpect(status().isBadRequest());
  mvc.perform(get("/api/clients/"+client+"/jobs/"+job.id()+"/file").with(user("admin"))).andExpect(status().isBadRequest());
 }
 @Test void actualUploadIsProtectedAndAvailable() throws Exception {
  var file=new MockMultipartFile("file","商品.png","image/png",new byte[]{(byte)137,80,78,71});
  var response=mvc.perform(multipart("/api/clients/"+client+"/assets").file(file).param("kind","PRODUCT").param("productName","集成测试商品").param("sku","TEST-001").with(user("admin")).with(csrf())).andExpect(status().isOk()).andExpect(jsonPath("$.metadata.productName").value("集成测试商品")).andReturn().getResponse().getContentAsString();String id=s.json.readTree(response).get("id").asText();
  mvc.perform(get("/api/clients/"+client+"/assets/"+id+"/file").with(user("admin"))).andExpect(status().isOk()).andExpect(content().bytes(file.getBytes()));
  mvc.perform(get("/api/clients/"+client+"/assets/"+id+"/file").with(user("intruder"))).andExpect(status().isNotFound());
  mvc.perform(multipart("/api/clients/"+client+"/assets").file(new MockMultipartFile("file","evil.svg","image/svg+xml","<svg/>".getBytes())).with(user("admin")).with(csrf())).andExpect(status().isBadRequest());
 }
 @Test void productGroupPersistsAndEditsAllMembersWithoutMergingOtherProducts() throws Exception {
  String group=Store.id();List<String> ids=new ArrayList<>();
  for(int i=0;i<2;i++) {
   String response=mvc.perform(multipart("/api/clients/"+client+"/assets")
    .file(new MockMultipartFile("file","photo"+i+".png","image/png",new byte[]{1,2,3}))
    .param("productName","同名商品").param("productGroupId",group).with(user("admin")).with(csrf()))
    .andExpect(status().isOk()).andExpect(jsonPath("$.metadata.productGroupId").value(group)).andExpect(jsonPath("$.sku").value(""))
    .andReturn().getResponse().getContentAsString();ids.add(s.json.readTree(response).get("id").asText());
  }
  String other=Store.id();s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",other,client,"other.png","PRODUCT","","","image/png",3,"other.png",s.write(Map.of("productName","同名商品","productGroupId",Store.id())),Store.now());
  String path="/api/clients/"+client+"/product-groups/"+ids.get(0);
  mvc.perform(put(path).with(user("intruder")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"productName\":\"越权\",\"sku\":\"X\"}")).andExpect(status().isNotFound());
  mvc.perform(put(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"productName\":\"新百伦鞋子\",\"sku\":\"NB-992\"}"))
   .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
  for(String id:ids) {assertThat(s.asset(client,id).sku()).isEqualTo("NB-992");assertThat(s.asset(client,id).metadata().get("productName")).isEqualTo("新百伦鞋子");}
  assertThat(s.asset(client,other).sku()).isEmpty();
  mvc.perform(put(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"productName\":\"\",\"sku\":\"X\"}")).andExpect(status().isBadRequest());
  assertThat(s.asset(client,ids.get(0)).sku()).isEqualTo("NB-992");
 }
 @Test void productCoverPersistsAndRejectsOtherGroupsOrVideo() throws Exception {
  String group=Store.id(),first=Store.id(),second=Store.id(),videoId=Store.id(),other=Store.id();
  for(String id:List.of(first,second,videoId,other)) s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",id,client,"cover-test","PRODUCT","","",id.equals(videoId)?"video/mp4":"image/png",3,"test",s.write(Map.of("productGroupId",id.equals(other)?Store.id():group,"productName","封面测试")),Store.now());
  String path="/api/clients/"+client+"/product-groups/"+first+"/cover";
  mvc.perform(put(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(Map.of("assetId",second))))
   .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(3));
  assertThat(s.asset(client,first).metadata().get("coverAssetId")).isEqualTo(second);
  assertThat(s.asset(client,other).metadata()).doesNotContainKey("coverAssetId");
  for(String invalid:List.of(other,videoId)) mvc.perform(put(path).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(Map.of("assetId",invalid)))).andExpect(status().isBadRequest());
  mvc.perform(put(path).with(user("intruder")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(Map.of("assetId",first)))).andExpect(status().isNotFound());
  mvc.perform(put("/api/clients/"+client+"/product-groups/"+first).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"productName\":\"新名称\",\"sku\":\"SKU\"}")).andExpect(status().isOk());
  assertThat(s.asset(client,first).metadata().get("coverAssetId")).isEqualTo(second);
 }
 @Test void legacyProductGroupKeepsTogetherWhenNameAndSkuChange() throws Exception {
  String name=Store.id(),first=Store.id(),second=Store.id();
  for(String id:List.of(first,second)) s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",id,client,"legacy.png","PRODUCT","","","image/png",3,"legacy.png",s.write(Map.of("productName",name,"authorization","保留授权")),Store.now());
  mvc.perform(put("/api/clients/"+client+"/product-groups/"+first).with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"productName\":\"更新名称\",\"sku\":\"\"}"))
   .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
  assertThat(s.asset(client,first).metadata().get("productGroupId")).isNotNull().isEqualTo(s.asset(client,second).metadata().get("productGroupId"));
  assertThat(s.asset(client,second).metadata().get("authorization")).isEqualTo("保留授权");
 }
 @Test void csvAggregatesWeightedAndInvalidImportRollsBack() throws Exception {
  String c=Store.id();s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",c,"admin","报表测试","服饰",Store.now());
  var file=new MockMultipartFile("file","report.csv","text/csv","materialId,impressions,clicks,spend,orders,revenue\na,100,10,20.00,2,60.00\nb,900,90,80.00,8,240.00\n".getBytes());
  metrics.importCsv(c,"admin",file);metrics.importCsv(c,"admin",file);
  var summary=(Map<?,?>)metrics.report(c).get("summary");assertThat(summary.get("ctr")).isEqualTo(0.1);assertThat(summary.get("roas").toString()).isEqualTo("3.00");assertThat(s.db.queryForObject("SELECT COUNT(*) FROM metrics WHERE client_id=?",Integer.class,c)).isEqualTo(2);
  var bad=new MockMultipartFile("file","report.csv","text/csv","materialId,impressions,clicks,spend,orders,revenue\na,100,10,999.00,2,60.00\nb,1,10,-1.00,2,20.00\n".getBytes());
  assertThatThrownBy(()->metrics.importCsv(c,"admin",bad)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  assertThat(((Map<?,?>)metrics.report(c).get("summary")).get("spend").toString()).isEqualTo("100.00");
 }
 @Test void validationAndBatchAreAtomic() throws Exception {
  mvc.perform(post("/api/clients/"+client+"/projects").with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
  int before=s.db.queryForObject("SELECT COUNT(*) FROM projects WHERE client_id=?",Integer.class,client);
  var good=new Models.ProjectInput("批次有效","","服饰","抖音","细节",15,"真实资料",true,List.of(),Map.of(),0);
  var bad=new Models.ProjectInput("批次错误","","服饰","抖音","细节",15,"真实资料",true,List.of(new Models.Shot(3,"镜头","",null,0,false)),Map.of(),0);
  assertThatThrownBy(()->projects.batch(client,"admin",List.of(good,bad))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  assertThat(s.db.queryForObject("SELECT COUNT(*) FROM projects WHERE client_id=?",Integer.class,client)).isEqualTo(before);
 }

 @Test void queuedSubmissionFreezesSnapshotAndRejectsDuplicate() throws Exception {
  String id=project();var p=s.project(client,id);String assetId=Store.id();
  s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",assetId,client,"真实素材.png","PRODUCT","","","image/png",4,"test.png","{}",Store.now());
  var input=new Models.ProjectInput(p.name(),p.sku(),p.category(),p.platform(),p.format(),15,p.facts(),true,List.of(new Models.Shot(15,"提交时的画面","",assetId,0,false)),Map.of(),0);
  var saved=projects.update(client,id,"admin",input);
  var job=projects.submit(client,"admin",new Models.Submit(List.of(id),"LOCAL")).get(0);
  assertThat(job.status()).isEqualTo("QUEUED");
  assertThatThrownBy(()->projects.submit(client,"admin",new Models.Submit(List.of(id),"LOCAL"))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  projects.update(client,id,"admin",new Models.ProjectInput(p.name(),p.sku(),p.category(),p.platform(),p.format(),15,p.facts(),true,List.of(new Models.Shot(15,"修改后的画面","",assetId,0,false)),Map.of(),saved.revision()));
  mvc.perform(get("/api/clients/"+client+"/jobs/"+job.id()+"/script").with(user("admin"))).andExpect(status().isOk()).andExpect(jsonPath("$.shots[0].visual").value("提交时的画面"));
 }
 @Test void auditTimestampUsesIsoStringAndCrossClientAssetIsRejected() throws Exception {
  mvc.perform(get("/api/clients/"+client+"/overview").with(user("admin"))).andExpect(status().isOk()).andExpect(jsonPath("$.events[0].createdAt").isString());
  String other=Store.id(),asset=Store.id();s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",other,"admin","其他客户","服饰",Store.now());
  s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",asset,other,"隔离素材.png","PRODUCT","","","image/png",4,"isolated.png","{}",Store.now());
  var input=new Models.ProjectInput("越界引用","","服饰","抖音","细节",15,"真实事实",true,List.of(new Models.Shot(15,"画面","",asset,0,false)),Map.of(),0);
  mvc.perform(post("/api/clients/"+client+"/projects").with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(input))).andExpect(status().isNotFound());
 }

 @Autowired CollaborationService collaboration;
 @Test void deliveryProjectIsolationAssignmentAndRevision() throws Exception {
  var input=new CollaborationController.CampaignInput("交付项目测试","admin",java.time.LocalDate.of(2026,12,1),12,"保留既有作品",false,0);
  String campaign=(String)collaboration.saveCampaign(client,null,"admin",input).get("id");
  String work=project();
  collaboration.flow(client,work,"admin",new CollaborationController.FlowInput(campaign,"剪辑同事","EDIT",null,"00:03 调整字幕，保留画面",0));
  var result=collaboration.works(client).stream().filter(w->work.equals(w.get("id"))).findFirst().orElseThrow();
  assertThat(result.get("campaignId")).isEqualTo(campaign);assertThat(result.get("phase")).isEqualTo("EDIT");
  assertThat(s.project(client,work).config().get("campaignId")).isEqualTo(campaign);
  assertThatThrownBy(()->collaboration.flow(client,work,"admin",new CollaborationController.FlowInput(campaign,"admin","PLAN",null,"旧版",0))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  assertThatThrownBy(()->collaboration.flow(client,work,"admin",new CollaborationController.FlowInput(campaign,"admin","DELIVERED",null,"不能假交付",1))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  mvc.perform(get("/api/clients/"+client+"/campaigns").with(user("intruder"))).andExpect(status().isNotFound());
 }
 @Test void bulkAssignmentRollsBackOnCrossClientWork() throws Exception {
  String work=project();String other=Store.id();s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",other,"admin","另一个客户","服饰",Store.now());
  var project=projects.create(other,"admin",new Models.ProjectInput("其他客户的作品","","服饰","抖音","细节",15,"真实事实",true,List.of(),Map.of(),0));
  var flow=new CollaborationController.FlowInput(null,"负责人","EDIT",null,"应回滚",0);
  assertThatThrownBy(()->collaboration.bulk(client,"admin",new CollaborationController.BulkInput(List.of(new CollaborationController.BulkItem(work,flow),new CollaborationController.BulkItem(project.id(),flow))))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  assertThat(s.db.queryForObject("SELECT revision FROM work_flow WHERE project_id=?",Integer.class,work)).isZero();
 }
 @Test void campaignCountsWorksInsteadOfRetryJobs() throws Exception {
  String campaign=(String)collaboration.saveCampaign(client,null,"admin",new CollaborationController.CampaignInput("交付统计","admin",null,5,"",false,0)).get("id");
  String work=project();collaboration.flow(client,work,"admin",new CollaborationController.FlowInput(campaign,"admin","PRODUCTION",null,"",0));
  var p=s.project(client,work);projects.update(client,work,"admin",new Models.ProjectInput(p.name(),p.sku(),p.category(),p.platform(),p.format(),15,p.facts(),true,List.of(new Models.Shot(15,"商品画面","",null,0,false)),p.config(),p.revision()));
  for(int i=0;i<3;i++){var job=projects.submit(client,"admin",new Models.Submit(List.of(work),"VIDEO_API")).get(0);s.db.update("UPDATE jobs SET status='DELIVERED',output_name='test.mp4' WHERE id=?",job.id());}
  var saved=collaboration.campaigns(client).stream().filter(c->campaign.equals(c.get("id"))).findFirst().orElseThrow();
  assertThat(saved.get("workCount")).isEqualTo(1);assertThat(saved.get("deliveredCount")).isEqualTo(1);
 }

 @Test void sceneVariantsAreBoundedDraftsAndKeepDialogue() throws Exception {
  String id=project();var p=s.project(client,id);
  projects.update(client,id,"admin",new Models.ProjectInput(p.name(),p.sku(),p.category(),p.platform(),p.format(),15,p.facts(),true,List.of(new Models.Shot(15,"商品画面","保留原口播",null,0,true)),Map.of(),0));
  var variants=projects.variants(client,id,"admin",List.of("办公室","居家窗边"));
  assertThat(variants).hasSize(2);assertThat(variants.get(0).factsConfirmed()).isFalse();assertThat(variants.get(0).shots().get(0).narration()).isEqualTo("保留原口播");assertThat(variants.get(0).config().get("sourceWorkId")).isEqualTo(id);
  assertThat(s.db.queryForObject("SELECT COUNT(*) FROM jobs WHERE project_id=?",Integer.class,variants.get(0).id())).isZero();
  mvc.perform(post("/api/clients/"+client+"/projects/"+id+"/variants").with(user("admin")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"scenes\":[\"a\",\"b\",\"c\",\"d\"]}")).andExpect(status().isBadRequest());
 }
}
