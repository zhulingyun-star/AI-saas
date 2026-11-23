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
import java.time.LocalDate;
import java.util.*;
import static com.shangzhen.workbench.Models.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 资产库和投放数据：成片列表与来源、手填 / 改 / 删（revision）、累计、该换新了、CSV 导入（认列、对视频、错误行）。本地模式，视频接口是桩。 */
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:videolibrary;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE","app.storage=./target/videolibrary-media","app.worker-delay=3600000","app.storyboard.poll-delay=3600000","app.product-analysis.poll-delay=3600000","app.remake-draft.poll-delay=3600000","app.ai.mode=local"})
@AutoConfigureMockMvc
class VideoLibraryTest {
    @Autowired Store s;@Autowired MockMvc mvc;
    @MockitoBean VideoApiClient video;@MockitoBean OssReferenceService oss;
    String client,shoe,base,project,dirA,dirB;int no;

    @BeforeEach void setup() throws Exception {
        client=Store.id();shoe=Store.id();base="/api/clients/"+client;no=0;
        s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",client,"admin","资产测试","鞋子",Store.now());
        s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",shoe,client,"a.png","PRODUCT","NB-992","","image/png",3,shoe+".png",s.write(Map.of("productName","新百伦 鞋子","productGroupId","g-shoe")),Store.now().minusDays(60));
        call(put(base+"/product-groups/"+shoe+"/understanding"),Map.of("revision",0,"understanding",Map.of("core",List.of("灰色拼接鞋面"),"pain",List.of("早上赶时间"),"scene",List.of("通勤路上"),"obj",List.of("尺码")))).andExpect(status().isOk());
        call(post(base+"/product-groups/"+shoe+"/personas"),Map.of("name","通勤上班族","pain","纠结穿哪双","hooks",List.of("对比型"))).andExpect(status().isOk());
        when(video.enabled()).thenReturn(false);
        project=json(call(post(base+"/project-library/projects"),Map.of("mode","FRAMEWORK","productAnchorId",shoe,"ratio","9:16","resolution","720p","facts","灰白拼色网眼鞋面","factsConfirmed",true)).andExpect(status().isOk())).path("id").asText();
        JsonNode f=json(call(get(base+"/projects/"+project+"/flow"),null));
        f=json(call(post(base+"/projects/"+project+"/directions/generate"),Map.of("revision",f.path("revision").asInt(),"personaName","通勤上班族","duration",15)).andExpect(status().isOk()));
        dirA=f.path("directions").path(0).path("id").asText();dirB=f.path("directions").path(1).path("id").asText();
        json(call(post(base+"/projects/"+project+"/directions/confirm"),Map.of("revision",f.path("revision").asInt(),"ids",List.of(dirA,dirB))).andExpect(status().isOk()));
    }
    ResultActions call(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req,Object body) throws Exception {
        if(body!=null) req=req.contentType(MediaType.APPLICATION_JSON).content(s.write(body));
        return mvc.perform(req.with(user("admin")).with(csrf()));
    }
    JsonNode json(ResultActions r) throws Exception {return s.json.readTree(r.andReturn().getResponse().getContentAsString());}
    /** 直接写一版出片（视频接口是桩，出不了真片），daysAgo 天前生成 */
    String job(String dir,boolean output,int daysAgo){
        Project p=s.project(client,project);Map<String,Object> cfg=new LinkedHashMap<>(p.config());
        cfg.put("directionId",dir);cfg.put("changeNote","首版：按已确认的分镜出片");
        cfg.put("promptSegments",List.of(Map.of("key","style","title","画面风格","text","明亮自然光"),Map.of("key","shot-1","title","镜头 1","text","第1镜 双手托鞋")));
        Project snap=new Project(p.id(),p.clientId(),p.name(),p.sku(),p.category(),p.platform(),p.format(),15,p.facts(),true,p.shots(),cfg,p.status(),p.revision(),p.createdAt(),p.updatedAt());
        String id=Store.id();var at=Store.now().minusDays(daysAgo).plusSeconds(++no);
        s.db.update("INSERT INTO jobs(id,client_id,project_id,name,provider,status,progress,snapshot,message,output_name,revision,created_at,updated_at) VALUES(?,?,?,?,'VIDEO_API',?,?,?,?,?,?,?,?)",
            id,client,project,p.name(),output?"REVIEW":"BLOCKED",output?100:0,s.write(snap),output?"已生成":"视频供应商未配置；未发出请求",output?id+".mp4":null,no,at,at);
        return id;
    }
    static String day(int ago){return LocalDate.now(VideoLibraryService.CN).minusDays(ago).toString();}
    Map<String,Object> rec(int ago,long imp,long clk){Map<String,Object> m=new LinkedHashMap<>();m.put("dateFrom",day(ago));m.put("impressions",imp);m.put("clicks",clk);return m;}
    JsonNode add(String job,Map<String,Object> body) throws Exception {return json(call(post(base+"/jobs/"+job+"/performance"),body).andExpect(status().isOk()));}
    static boolean none(JsonNode n){return n.isNull()||n.isMissingNode();}
    JsonNode lib() throws Exception {return json(call(get(base+"/video-library"),null).andExpect(status().isOk()));}

    @Test void listsOnlyFinishedVersionsWithSourceAndNoMadeUpNumbers() throws Exception {
        mvc.perform(get(base+"/video-library").with(user("intruder"))).andExpect(status().isNotFound());
        String a1=job(dirA,true,20),b1=job(dirB,true,19),a2=job(dirA,true,18);job(dirB,false,1);
        JsonNode l=lib();
        assertThat(l.path("videos").size()).isEqualTo(3);assertThat(l.path("pendingVersions").asInt()).isEqualTo(1);
        JsonNode first=l.path("videos").path(0);
        assertThat(first.path("id").asText()).isEqualTo(a2);
        assertThat(first.path("no").asInt()).isEqualTo(2);assertThat(first.path("mode").asText()).isEqualTo("FRAMEWORK");
        assertThat(first.path("direction").path("letter").asText()).isEqualTo("A");
        assertThat(first.path("projectFlow").asBoolean()).isTrue();assertThat(first.path("projectPath").asText()).isEqualTo("/p/"+project);
        assertThat(first.path("personaName").asText()).isEqualTo("通勤上班族");assertThat(first.path("hook").asText()).isNotBlank();
        assertThat(first.path("product").path("name").asText()).isEqualTo("新百伦 鞋子");
        assertThat(first.path("code").asText()).hasSize(8);
        assertThat(first.path("adName").asText()).startsWith("新百伦鞋子_").endsWith("_15秒_v2_"+first.path("code").asText());
        assertThat(none(first.path("perf"))).isTrue();assertThat(first.path("tired").size()).isZero();
        JsonNode b=l.path("videos").path(1);
        assertThat(b.path("id").asText()).isEqualTo(b1);assertThat(b.path("no").asInt()).isEqualTo(1);assertThat(b.path("direction").path("letter").asText()).isEqualTo("B");
        JsonNode d=json(call(get(base+"/video-library/"+a1),null).andExpect(status().isOk()));
        assertThat(d.path("segments").size()).isEqualTo(2);assertThat(d.path("records").size()).isZero();assertThat(none(d.path("signals"))).isTrue();
        call(get(base+"/video-library/"+Store.id()),null).andExpect(status().isNotFound());
        // 审片结果和项目详情是同一份
        call(put(base+"/jobs/"+a1+"/verdict"),Map.of("rating","GOOD","use","USABLE","revision",0)).andExpect(status().isOk());
        assertThat(json(call(get(base+"/video-library/"+a1),null)).path("verdict").path("use").asText()).isEqualTo("USABLE");
    }

    @Test void manualRecordsValidateOverlapRevisionAndSummary() throws Exception {
        String a1=job(dirA,true,20),pending=job(dirB,false,5);
        call(post(base+"/jobs/"+pending+"/performance"),rec(3,1000,10)).andExpect(status().isBadRequest());
        call(post(base+"/jobs/"+a1+"/performance"),rec(3,100,200)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("点击比曝光还多")));
        call(post(base+"/jobs/"+a1+"/performance"),rec(30,100,2)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("早于这条成片生成的日期")));
        call(post(base+"/jobs/"+a1+"/performance"),rec(-2,100,2)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("不能晚于今天")));
        Map<String,Object> bad=rec(3,100,2);bad.put("retain3s",120);
        call(post(base+"/jobs/"+a1+"/performance"),bad).andExpect(status().isBadRequest());
        Map<String,Object> r1=rec(10,10000,300);r1.put("orders",6);r1.put("retain3s",40);r1.put("roi",2);r1.put("note","加了预算");
        JsonNode d=add(a1,r1);
        assertThat(d.path("records").size()).isEqualTo(1);
        Map<String,Object> r2=rec(9,30000,600);r2.put("dateTo",day(8));r2.put("retain3s",20);r2.put("roi",1);
        d=add(a1,r2);
        // 日期重叠不收
        call(post(base+"/jobs/"+a1+"/performance"),rec(8,10,1)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("日期不能重叠")));
        JsonNode sum=d.path("perf");
        assertThat(sum.path("impressions").asLong()).isEqualTo(40000);assertThat(sum.path("clicks").asLong()).isEqualTo(900);
        assertThat(sum.path("ctr").asDouble()).isEqualTo(2.25);
        assertThat(sum.path("orders").asLong()).isEqualTo(6);assertThat(sum.path("cvr").asDouble()).isEqualTo(2.0); // 只算填了成交单数的那条：6 ÷ 300
        assertThat(sum.path("retain3s").asDouble()).isEqualTo(25.0); // 按曝光加权 (40×1万 + 20×3万) ÷ 4万
        assertThat(sum.path("roi").asDouble()).isEqualTo(1.25);
        assertThat(none(sum.path("gpm"))).isTrue();
        assertThat(sum.path("from").asText()).isEqualTo(day(10));assertThat(sum.path("to").asText()).isEqualTo(day(8));
        // 改：revision 不对 409，对了才改
        JsonNode first=d.path("records").path(1);
        Map<String,Object> edit=rec(10,10000,500);edit.put("revision",3);
        call(put(base+"/jobs/"+a1+"/performance/"+first.path("id").asText()),edit).andExpect(status().isConflict());
        edit.put("revision",first.path("revision").asInt());
        d=json(call(put(base+"/jobs/"+a1+"/performance/"+first.path("id").asText()),edit).andExpect(status().isOk()));
        assertThat(d.path("perf").path("clicks").asLong()).isEqualTo(1100);
        call(put(base+"/jobs/"+a1+"/performance/"+first.path("id").asText()),edit).andExpect(status().isConflict());
        // 删
        JsonNode cur=d.path("records").path(1);
        call(delete(base+"/jobs/"+a1+"/performance/"+cur.path("id").asText()+"?revision=9"),null).andExpect(status().isConflict());
        d=json(call(delete(base+"/jobs/"+a1+"/performance/"+cur.path("id").asText()+"?revision="+cur.path("revision").asInt()),null).andExpect(status().isOk()));
        assertThat(d.path("records").size()).isEqualTo(1);
        // 别的客户看不到也改不了
        mvc.perform(post(base+"/jobs/"+a1+"/performance").with(user("intruder")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(rec(2,1,1)))).andExpect(status().isNotFound());
    }

    @Test void tiredSignalsOnlyFromRealRecords() throws Exception {
        String a1=job(dirA,true,20),b1=job(dirB,true,20);
        // 两条记录：还判断不了
        add(a1,rec(12,10000,300));add(a1,rec(11,10000,300));
        assertThat(none(json(call(get(base+"/video-library/"+a1),null)).path("signals"))).isTrue();
        // 7 天：前 3 天 3%，后 3 天 1.5%，掉了 50%
        long[] clicks={300,300,300,250,150,150,150};
        String bb=b1;
        for(int i=0;i<7;i++){Map<String,Object> r=rec(10-i,10000,clicks[i]);r.put("negativeRate",0.3);r.put("retain3s",40);add(bb,r);}
        JsonNode d=json(call(get(base+"/video-library/"+b1),null));
        JsonNode sig=d.path("signals");
        assertThat(sig.size()).isEqualTo(3);
        assertThat(sig.path(0).path("hit").asBoolean()).isTrue();assertThat(sig.path(0).path("detail").asText()).contains("低了 50%");
        assertThat(sig.path(1).path("hit").asBoolean()).isFalse();assertThat(sig.path(2).path("hit").asBoolean()).isFalse();
        assertThat(d.path("tired").toString()).isEqualTo("[\"点击率掉了 30% 以上\"]");
        // 负反馈高、3 秒留存低
        Map<String,Object> r=rec(10,10000,300);r.put("negativeRate",1.2);r.put("retain3s",18);
        String c1=job(dirA,true,20);add(c1,r);r=rec(9,10000,300);r.put("negativeRate",1.0);r.put("retain3s",20);add(c1,r);r=rec(8,10000,300);r.put("negativeRate",0.9);add(c1,r);
        JsonNode c=json(call(get(base+"/video-library/"+c1),null));
        assertThat(c.path("signals").size()).isEqualTo(2);
        assertThat(c.path("tired").toString()).contains("负反馈超过 0.8%").contains("有效播放低于 25%");
        assertThat(lib().path("videos").findValues("tired").stream().filter(t->t.size()>0).count()).isEqualTo(2);
    }

    @Test void csvImportMapsColumnsMatchesVideosAndExplainsBadRows() throws Exception {
        String a1=job(dirA,true,20),b1=job(dirB,true,20),a2=job(dirA,true,20);
        JsonNode l=lib();
        Map<String,JsonNode> v=new HashMap<>();l.path("videos").forEach(x->v.put(x.path("id").asText(),x));
        add(a2,rec(6,1000,10));
        String csv="﻿素材名称,视频编号,日期,展示数,点击数,3秒播放率,成交订单数,消耗回报率,负反馈率,点击率\n"
            +v.get(a1).path("adName").asText()+",,"+day(5)+",\"12,000\",360,41.5%,8,2.1,0.4%,3%\n"           // 2 按投放用名对上
            +"随便起的名字,"+v.get(b1).path("code").asText()+","+day(5).replace("-","/")+" 至 "+day(4).replace("-","/")+",8000,200,,,,,\n" // 3 按视频编号对上，一段日期
            +"新百伦_改过的名字_"+v.get(a2).path("code").asText()+",,"+day(5)+",5000,100,,,,,\n"           // 4 名字里带编号
            +"对不上的名字,,"+day(5)+",5000,100,,,,,\n"                                                    // 5 没对上
            +v.get(a1).path("adName").asText()+",,"+day(4)+",abc,10,,,,,\n"                                // 6 曝光不是数字
            +v.get(a1).path("adName").asText()+",,"+day(5)+",100,10,,,,,\n"                               // 7 和第 2 行重叠
            +v.get(a2).path("adName").asText()+",,"+day(6)+",100,10,,,,,\n"                               // 8 和已有记录重叠
            +v.get(a1).path("adName").asText()+",,11/15,100,10,,,,,\n";                                    // 9 日期看不懂
        Map<String,Object> body=new LinkedHashMap<>();body.put("fileName","千川素材报表.csv");body.put("text",csv);
        JsonNode p=json(call(post(base+"/performance-imports/preview"),body).andExpect(status().isOk()));
        assertThat(p.path("missing").size()).isZero();
        assertThat(p.path("mapping").path("adName").asInt()).isEqualTo(0);assertThat(p.path("mapping").path("impressions").asInt()).isEqualTo(3);
        assertThat(p.path("mapping").path("roi").asInt()).isEqualTo(7);assertThat(p.path("mapping").has("ctr")).isFalse();
        JsonNode rows=p.path("rows");
        assertThat(rows.size()).isEqualTo(8);
        assertThat(rows.path(0).path("status").asText()).isEqualTo("OK");assertThat(rows.path(0).path("by").asText()).isEqualTo("NAME");assertThat(rows.path(0).path("values").path("impressions").asLong()).isEqualTo(12000);
        assertThat(rows.path(1).path("status").asText()).isEqualTo("OK");assertThat(rows.path(1).path("by").asText()).isEqualTo("CODE");assertThat(rows.path(1).path("dateTo").asText()).isEqualTo(day(4));
        assertThat(rows.path(2).path("by").asText()).isEqualTo("NAME_CODE");assertThat(rows.path(2).path("jobId").asText()).isEqualTo(a2);
        assertThat(rows.path(3).path("status").asText()).isEqualTo("UNMATCHED");
        assertThat(rows.path(4).path("status").asText()).isEqualTo("ERROR");assertThat(rows.path(4).path("messages").toString()).contains("「曝光」不是数字");
        assertThat(rows.path(5).path("messages").toString()).contains("和第 2 行是同一条成片");
        assertThat(rows.path(6).path("messages").toString()).contains("已经有 "+day(6));
        assertThat(rows.path(7).path("messages").toString()).contains("日期看不懂");
        assertThat(p.path("counts").path("ok").asInt()).isEqualTo(3);assertThat(p.path("counts").path("error").asInt()).isEqualTo(4);
        // 还有没对上的行：不能导
        body.put("confirmed",true);
        call(post(base+"/performance-imports"),body).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("没对上")));
        body.put("confirmed",false);body.put("assign",Map.of("5","skip"));
        call(post(base+"/performance-imports"),body).andExpect(status().isBadRequest());
        // 第 5 行手动指认给 b1
        body.put("assign",Map.of("5",b1));
        p=json(call(post(base+"/performance-imports/preview"),body).andExpect(status().isOk()));
        assertThat(p.path("rows").path(3).path("by").asText()).isEqualTo("MANUAL");assertThat(p.path("rows").path(3).path("status").asText()).isEqualTo("ERROR"); // 和第 3 行同一条、日期重叠
        body.put("assign",Map.of("5","skip"));body.put("confirmed",true);
        JsonNode r=json(call(post(base+"/performance-imports"),body).andExpect(status().isOk()));
        assertThat(r.path("imported").asInt()).isEqualTo(3);assertThat(r.path("skipped").asInt()).isEqualTo(1);assertThat(r.path("errors").size()).isEqualTo(4);
        assertThat(r.path("errors").path(0).path("row").asInt()).isEqualTo(6);
        JsonNode d=json(call(get(base+"/video-library/"+a1),null));
        assertThat(d.path("records").path(0).path("source").asText()).isEqualTo("IMPORT");assertThat(d.path("records").path(0).path("retain3s").asDouble()).isEqualTo(41.5);
        assertThat(d.path("perf").path("roi").asDouble()).isEqualTo(2.1);
        // 再导一次同一个文件：都是重叠，没有能导入的行
        call(post(base+"/performance-imports"),body).andExpect(status().isBadRequest());
        JsonNode imports=json(call(get(base+"/performance-imports"),null).andExpect(status().isOk()));
        assertThat(imports.size()).isEqualTo(1);assertThat(imports.path(0).path("imported").asInt()).isEqualTo(3);
        // 手动改列：缺曝光列时给出缺什么，不逐行检查
        body.put("mapping",Map.of("adName",0,"date",2,"clicks",4));body.put("confirmed",false);
        p=json(call(post(base+"/performance-imports/preview"),body).andExpect(status().isOk()));
        assertThat(p.path("missing").toString()).contains("曝光");assertThat(p.path("rows").size()).isZero();
        call(post(base+"/performance-imports/preview"),Map.of("text","只有表头\n")).andExpect(status().isBadRequest());
    }

    @Test void csvParserHandlesQuotesTabsAndDates() {
        List<List<String>> rows=PerformanceService.parse("a,b\n\"x,1\",\"say \"\"hi\"\"\"\r\n\n3,4");
        assertThat(rows).containsExactly(List.of("a","b"),List.of("x,1","say \"hi\""),List.of("3","4"));
        assertThat(PerformanceService.parse("名\t曝光\nv\t10")).containsExactly(List.of("名","曝光"),List.of("v","10"));
        List<String> err=new ArrayList<>();
        assertThat(PerformanceService.dates("2026年11月5日",err,"日期")).containsExactly("2026-11-05","2026-11-05");
        assertThat(PerformanceService.dates("20261105~20261107",err,"日期")).containsExactly("2026-11-05","2026-11-07");
        assertThat(err).isEmpty();
        PerformanceService.dates("2026-02-30",err,"日期");assertThat(err).hasSize(1);
        assertThat(PerformanceService.number("1,234",  "impressions",err)).isEqualTo(1234L);
        assertThat(PerformanceService.number("—","roi",err)).isNull();
        assertThat(PerformanceService.guess(List.of("视频编号","统计日期","展现","点击次数","3 秒留存（%）"))).containsEntry("code",0).containsEntry("date",1).containsEntry("impressions",2).containsEntry("retain3s",4);
        assertThat(VideoLibraryService.adName("新百伦 鞋子","对比型","","",15,2,"abcd1234")).isEqualTo("新百伦鞋子_对比型_未标人群_未标场景_15秒_v2_abcd1234");
    }
}
