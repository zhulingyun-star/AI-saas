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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import static com.shangzhen.workbench.Models.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * 投流数据回流（V14）：成片命名（生成、版本递增、补出片人、改命名）、千川账户、CSV 导入（三级命名匹配 + 旧的视频编号兜底、幂等更新）、
 * 净 / 整体指标、看板（筛选、排序、分页、导出）、四条投放建议的阈值和状态流转、按角色拦、按客户隔离。
 * 本地模式，视频接口是桩；数字都是测试里写的。
 */
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:campaign;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE","app.storage=./target/campaign-media","app.worker-delay=3600000",
    "app.storyboard.poll-delay=3600000","app.product-analysis.poll-delay=3600000","app.remake-draft.poll-delay=3600000","app.ai.mode=local","app.suggestions.cron=-"})
@AutoConfigureMockMvc
class CampaignDataTest {
    @Autowired Store s;@Autowired MockMvc mvc;
    @MockitoBean VideoApiClient video;@MockitoBean OssReferenceService oss;
    String client,shoe,base,project,dir,tag,xinyi,viewer,maker,buyer;int no;

    @BeforeEach void setup() throws Exception {
        client=Store.id();shoe=Store.id();base="/api/clients/"+client;no=0;tag=Long.toString(System.nanoTime(),36);
        s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",client,"admin","投流测试","鞋子",Store.now());
        s.db.update("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)",shoe,client,"a.png","PRODUCT","NB-992","","image/png",3,shoe+".png",s.write(Map.of("productName","新百伦 鞋子-992","productGroupId","g-"+tag)),Store.now().minusDays(60));
        call(put(base+"/product-groups/"+shoe+"/understanding"),Map.of("revision",0,"understanding",Map.of("core",List.of("灰色拼接鞋面"),"pain",List.of("早上赶时间"),"scene",List.of("通勤路上"),"obj",List.of("尺码")))).andExpect(status().isOk());
        call(post(base+"/product-groups/"+shoe+"/personas"),Map.of("name","通勤上班族","pain","纠结穿哪双","hooks",List.of("对比型"))).andExpect(status().isOk());
        when(video.enabled()).thenReturn(false);
        project=json(call(post(base+"/project-library/projects"),Map.of("mode","FRAMEWORK","productAnchorId",shoe,"ratio","9:16","resolution","720p","facts","灰白拼色网眼鞋面","factsConfirmed",true)).andExpect(status().isOk())).path("id").asText();
        JsonNode f=json(call(get(base+"/projects/"+project+"/flow"),null));
        f=json(call(post(base+"/projects/"+project+"/directions/generate"),Map.of("revision",f.path("revision").asInt(),"personaName","通勤上班族","duration",15)).andExpect(status().isOk()));
        dir=f.path("directions").path(0).path("id").asText();
        json(call(post(base+"/projects/"+project+"/directions/confirm"),Map.of("revision",f.path("revision").asInt(),"ids",List.of(dir))).andExpect(status().isOk()));
        xinyi=member("xy","欣怡","BUYER");viewer=member("vw","只看","VIEWER");maker=member("mk","小制作","MAKER");buyer=member("by","投手甲","BUYER");
    }
    /** 广告主 ID：每次运行不一样（同一个库重复跑也不会撞上「已经在别的客户里」） */
    String adv(int i){return Long.toString(Math.abs(tag.hashCode())%1_000_000_000L+1_000_000_000L)+"0"+i;}
    String member(String prefix,String name,String role){
        String u=prefix+"-"+tag;
        s.db.update("INSERT INTO app_users(username,password,display_name,role,status,team_owner,created_at,revision) VALUES(?,?,?,?,?,?,?,0)",u,"x",name,role,"ACTIVE","admin",Store.now());
        s.db.update("INSERT INTO client_members(client_id,username,created_by,created_at) VALUES(?,?,?,?)",client,u,"admin",Store.now());
        return u;
    }
    ResultActions call(MockHttpServletRequestBuilder req,Object body) throws Exception {return as("admin",req,body);}
    ResultActions as(String who,MockHttpServletRequestBuilder req,Object body) throws Exception {
        if(body!=null) req=req.contentType(MediaType.APPLICATION_JSON).content(s.write(body));
        return mvc.perform(req.with(user(who)).with(csrf()));
    }
    JsonNode json(ResultActions r) throws Exception {return s.json.readTree(r.andReturn().getResponse().getContentAsString());}
    /** 直接写一版出好的成片：createdBy 是出片人（null = 老数据没记），daysAgo 天前生成 */
    String job(String createdBy,int daysAgo){
        Project p=s.project(client,project);Map<String,Object> cfg=new LinkedHashMap<>(p.config());cfg.put("directionId",dir);
        Project snap=new Project(p.id(),p.clientId(),p.name(),p.sku(),p.category(),p.platform(),p.format(),15,p.facts(),true,p.shots(),cfg,p.status(),p.revision(),p.createdAt(),p.updatedAt());
        String id=Store.id();LocalDateTime at=Store.now().minusDays(daysAgo).minusMinutes(30).plusSeconds(30L*++no);
        s.db.update("INSERT INTO jobs(id,client_id,project_id,name,provider,status,progress,snapshot,message,output_name,revision,created_at,updated_at,created_by) VALUES(?,?,?,?,'VIDEO_API','REVIEW',100,?,?,?,?,?,?,?)",
            id,client,project,p.name(),s.write(snap),"已生成",id+".mp4",no,at,at,createdBy);
        return id;
    }
    LocalDateTime createdAt(String job){return s.db.queryForObject("SELECT created_at FROM jobs WHERE id=?",java.sql.Timestamp.class,job).toLocalDateTime();}
    String yymmdd(String job){return VideoLibraryService.madeOn(createdAt(job)).format(java.time.format.DateTimeFormatter.ofPattern("yyMMdd"));}
    static String day(int ago){return LocalDate.now(VideoLibraryService.CN).minusDays(ago).toString();}
    Map<String,JsonNode> lib() throws Exception {
        Map<String,JsonNode> out=new HashMap<>();
        json(call(get(base+"/video-library"),null).andExpect(status().isOk())).path("videos").forEach(v->out.put(v.path("id").asText(),v));
        return out;
    }
    String account(String name,String adv) throws Exception {
        return json(call(post(base+"/analytics/accounts"),Map.of("name",name,"advertiserId",adv)).andExpect(status().isOk())).path("id").asText();
    }
    /** 直接写一条千川记录（金额元、比例百分数），净成交按 成交 - 退款 算好 */
    void money(String job,String acc,String mat,int ago,double cost,double gmv,double refund,long orders,long refundOrders,Double rate1h){
        var now=Store.now();
        s.db.update("INSERT INTO job_performance(id,job_id,client_id,date_from,date_to,impressions,clicks,note,source,revision,created_by,created_at,updated_by,updated_at,account_id,material_id,cost,gmv,orders,refund_gmv,refund_orders,net_gmv,net_orders,refund_rate_1h) "
            +"VALUES(?,?,?,?,?,NULL,NULL,'','IMPORT',0,'admin',?,'admin',?,?,?,?,?,?,?,?,?,?,?)",Store.id(),job,client,LocalDate.parse(day(ago)),LocalDate.parse(day(ago)),now,now,acc,mat,cost,gmv,orders,refund,refundOrders,gmv-refund,orders-refundOrders,rate1h);
    }

    @Test void namingGeneratesVersionsBackfillsCreatorAndOnlyLetsYouChangeProductFormVersion() throws Exception {
        String j1=job(xinyi,3),j2=job(xinyi,3),j3=job("admin",3),j4=job(null,3),j5=job(null,3);
        // j4 是老数据：出片人从同一时刻的操作记录补
        s.db.update("INSERT INTO audit_events VALUES(?,?,?,?,?,?)",Store.id(),client,xinyi,"出片","老版本",createdAt(j4).plusSeconds(1));
        Map<String,JsonNode> v=lib();
        String d=yymmdd(j1);
        assertThat(v.get(j1).path("standardName").asText()).isEqualTo(d+"-新百伦鞋子992-短视频-欣怡-V1");
        assertThat(v.get(j2).path("standardName").asText()).isEqualTo(d+"-新百伦鞋子992-短视频-欣怡-V2");
        assertThat(v.get(j3).path("standardName").asText()).isEqualTo(d+"-新百伦鞋子992-短视频-admin-V1");
        assertThat(v.get(j4).path("standardName").asText()).isEqualTo(d+"-新百伦鞋子992-短视频-欣怡-V3");
        for(String j:List.of(j1,j2,j3,j4)) assertThat(NamingService.valid(v.get(j).path("standardName").asText())).isTrue();
        // 补不出来：未规范化，写明原因
        assertThat(v.get(j5).path("standardName").isMissingNode()||v.get(j5).path("standardName").isNull()).isTrue();
        assertThat(v.get(j5).path("naming").path("problem").asText()).contains("不知道是谁出的");
        // 新的一版接着往上加
        String j6=job(xinyi,3);
        assertThat(lib().get(j6).path("standardName").asText()).endsWith("-欣怡-V4");
        // 改：只能改商品简称、内容形式、版本
        JsonNode n1=v.get(j1).path("naming");
        JsonNode d1=json(call(put(base+"/jobs/"+j1+"/naming"),Map.of("productShort","NB鞋","form","图文","version",5,"revision",n1.path("revision").asInt())).andExpect(status().isOk()));
        assertThat(d1.path("standardName").asText()).isEqualTo(d+"-NB鞋-图文-欣怡-V5");
        call(put(base+"/jobs/"+j1+"/naming"),Map.of("productShort","NB鞋","form","图文","version",6,"revision",n1.path("revision").asInt())).andExpect(status().isConflict());
        JsonNode n2=v.get(j2).path("naming");
        call(put(base+"/jobs/"+j2+"/naming"),Map.of("productShort","NB鞋","form","图文","version",5,"revision",n2.path("revision").asInt())).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("已经有一条成片在用了")));
        call(put(base+"/jobs/"+j2+"/naming"),Map.of("productShort","NB-鞋","form","短视频","revision",n2.path("revision").asInt())).andExpect(status().isBadRequest());
        call(put(base+"/jobs/"+j2+"/naming"),Map.of("productShort","NB鞋","form","长视频","revision",n2.path("revision").asInt())).andExpect(status().isBadRequest());
        call(put(base+"/jobs/"+j2+"/naming"),Map.of("productShort","鞋","form","短视频","revision",n2.path("revision").asInt())).andExpect(status().isBadRequest());
        // 不传版本：同一天同商品同人的下一个
        JsonNode d2=json(call(put(base+"/jobs/"+j2+"/naming"),Map.of("productShort","NB鞋","form","图文","revision",n2.path("revision").asInt())).andExpect(status().isOk()));
        assertThat(d2.path("standardName").asText()).isEqualTo(d+"-NB鞋-图文-欣怡-V6");
        // 只读不能改；没出好的版本没有命名
        as(viewer,put(base+"/jobs/"+j3+"/naming"),Map.of("productShort","NB鞋","form","图文","revision",0)).andExpect(status().isForbidden());
        as(maker,put(base+"/jobs/"+j3+"/naming"),Map.of("productShort","NB鞋","form","图文","revision",0)).andExpect(status().isOk());
        // 静态部分：截断和去横线
        assertThat(NamingService.part("儿童-家居服 超长名字超过十个字了")).isEqualTo("儿童家居服超长名字超");
        assertThat(NamingService.valid("251126-儿童家居服-短视频-欣怡-V1")).isTrue();
        assertThat(NamingService.valid("251126-儿童家居服-长视频-欣怡-V1")).isFalse();
    }

    @Test void importMatchesByStandardNameThreeWaysFallsBackToVideoCodeAndUpdatesOnReimport() throws Exception {
        String j1=job(xinyi,10),j2=job(xinyi,10),j3=job("admin",10),j4=job(null,10);
        Map<String,JsonNode> v=lib();
        String n1=v.get(j1).path("standardName").asText(),n2=v.get(j2).path("standardName").asText(),n3=v.get(j3).path("standardName").asText();
        String acc=account("主账户",adv(1));
        String head="素材ID,素材名称,视频编号,日期,消耗,成交金额,成交订单数,支付ROI,退款金额,退款订单数,1小时退款率,智能优惠券金额\n";
        String csv=head
            +"m1,"+n1+",,"+day(3)+",100,450,9,4.5,50,1,12%,5\n"                         // 2 完全一致
            +"m2,"+n2+"_副本,,"+day(3)+",200,500,10,2.5,100,2,8%,\n"                     // 3 加了后缀
            +"m3,"+n3.substring(0,n3.length()-3)+",,"+day(3)+",50,40,2,0.8,0,0,,\n"      // 4 前一截
            +"m4,乱写的名字,"+v.get(j4).path("code").asText()+","+day(3)+",80,160,4,2,0,0,,\n" // 5 视频编号兜底
            +"m5,对不上,,"+day(3)+",10,0,0,0,0,0,,\n"                                   // 6 没对上
            +"m6,"+n1+",,"+day(2)+",abc,0,0,0,0,0,,\n"                                  // 7 消耗不是数字
            +"m7,"+n1+",,"+day(2)+",10,20,1,2,30,0,,\n";                                 // 8 退款比成交多
        Map<String,Object> body=new LinkedHashMap<>();body.put("fileName","千川素材分析.csv");body.put("text",csv);
        // 表里有素材 ID 但没选账户：先选账户
        JsonNode p=json(call(post(base+"/analytics/import/preview"),body).andExpect(status().isOk()));
        assertThat(p.path("missing").toString()).contains("千川账户");
        body.put("accountId",acc);
        p=json(call(post(base+"/analytics/import/preview"),body).andExpect(status().isOk()));
        assertThat(p.path("missing").size()).isZero();
        assertThat(p.path("mapping").path("materialId").asInt()).isZero();assertThat(p.path("mapping").path("cost").asInt()).isEqualTo(4);
        assertThat(p.path("mapping").path("refundRate1h").asInt()).isEqualTo(10);assertThat(p.path("mapping").path("coupon").asInt()).isEqualTo(11);
        JsonNode rows=p.path("rows");
        assertThat(rows.path(0).path("by").asText()).isEqualTo("STANDARD");assertThat(rows.path(0).path("jobId").asText()).isEqualTo(j1);
        assertThat(rows.path(1).path("by").asText()).isEqualTo("STANDARD_PREFIX");assertThat(rows.path(1).path("jobId").asText()).isEqualTo(j2);
        assertThat(rows.path(2).path("by").asText()).isEqualTo("STANDARD_REVERSE");assertThat(rows.path(2).path("jobId").asText()).isEqualTo(j3);
        assertThat(rows.path(3).path("by").asText()).isEqualTo("CODE");assertThat(rows.path(3).path("jobId").asText()).isEqualTo(j4);
        assertThat(rows.path(4).path("status").asText()).isEqualTo("UNMATCHED");
        assertThat(rows.path(5).path("messages").toString()).contains("「消耗（元）」不是数字");
        assertThat(rows.path(6).path("messages").toString()).contains("退款金额比成交金额还多");
        assertThat(p.path("counts").path("ok").asInt()).isEqualTo(4);assertThat(p.path("counts").path("update").asInt()).isZero();
        assertThat(p.path("videos").findValues("standardName").size()).isEqualTo(3);
        // 选的日期范围外的行不导
        body.put("rangeFrom",day(2));body.put("rangeTo",day(1));
        assertThat(json(call(post(base+"/analytics/import/preview"),body)).path("rows").path(0).path("messages").toString()).contains("不在选的范围");
        body.remove("rangeFrom");body.remove("rangeTo");
        body.put("assign",Map.of("6","skip"));body.put("confirmed",true);
        JsonNode r=json(call(post(base+"/analytics/import/confirm"),body).andExpect(status().isOk()));
        assertThat(r.path("imported").asInt()).isEqualTo(4);assertThat(r.path("updated").asInt()).isZero();assertThat(r.path("skipped").asInt()).isEqualTo(1);assertThat(r.path("errors").size()).isEqualTo(2);
        Map<String,Object> rec=s.db.queryForMap("SELECT * FROM job_performance WHERE job_id=?",j1);
        assertThat(((Number)rec.get("net_gmv")).doubleValue()).isEqualTo(400.0);assertThat(((Number)rec.get("net_orders")).longValue()).isEqualTo(8);
        assertThat(((Number)rec.get("refund_rate_1h")).doubleValue()).isEqualTo(12.0);assertThat(rec.get("material_id")).isEqualTo("m1");assertThat(rec.get("account_id")).isEqualTo(acc);
        assertThat(rec.get("impressions")).isNull();
        int before=s.db.queryForObject("SELECT COUNT(*) FROM job_performance WHERE client_id=?",Integer.class,client);
        // 同一素材同一天再导一次：更新，不新增；改了名字的 m1 也能按素材 ID 认出来
        String again=head+"m1,千川里改了名字,,"+day(3)+",120,600,12,5,60,1,10%,5\n"
            +"m2,"+n2+"_副本,,"+day(3)+",200,500,10,2.5,100,2,8%,\n"
            +"m4,乱写的名字,"+v.get(j4).path("code").asText()+","+day(2)+",80,160,4,2,0,0,,\n";
        Map<String,Object> b2=new LinkedHashMap<>(Map.of("fileName","第二次.csv","text",again,"accountId",acc));
        p=json(call(post(base+"/analytics/import/preview"),b2).andExpect(status().isOk()));
        assertThat(p.path("rows").path(0).path("by").asText()).isEqualTo("MATERIAL_ID");assertThat(p.path("rows").path(0).path("update").asBoolean()).isTrue();
        assertThat(p.path("rows").path(2).path("update").asBoolean()).isFalse(); // m4 换了一天，是新的一条
        assertThat(p.path("counts").path("update").asInt()).isEqualTo(2);
        b2.put("confirmed",true);
        r=json(call(post(base+"/analytics/import/confirm"),b2).andExpect(status().isOk()));
        assertThat(r.path("imported").asInt()).isEqualTo(1);assertThat(r.path("updated").asInt()).isEqualTo(2);
        assertThat(s.db.queryForObject("SELECT COUNT(*) FROM job_performance WHERE client_id=?",Integer.class,client)).isEqualTo(before+1);
        rec=s.db.queryForMap("SELECT * FROM job_performance WHERE job_id=?",j1);
        assertThat(((Number)rec.get("cost")).doubleValue()).isEqualTo(120.0);assertThat(((Number)rec.get("net_gmv")).doubleValue()).isEqualTo(540.0);assertThat(rec.get("material_name")).isEqualTo("千川里改了名字");
        // 同一个文件里同一素材同一天写了两遍
        String dup=head+"m9,"+n1+",,"+day(1)+",1,2,1,2,0,0,,\nm9,"+n1+",,"+day(1)+",1,2,1,2,0,0,,\n";
        p=json(call(post(base+"/analytics/import/preview"),Map.of("text",dup,"accountId",acc)).andExpect(status().isOk()));
        assertThat(p.path("rows").path(1).path("messages").toString()).contains("和第 2 行是同一个素材、同一天");
        // 手填的那天和千川数据重叠：不重复计数
        call(post(base+"/jobs/"+j1+"/performance"),Map.of("dateFrom",day(3),"impressions",100,"clicks",3)).andExpect(status().isBadRequest());
        // 手填也能填金额，不填曝光点击
        call(post(base+"/jobs/"+j1+"/performance"),Map.of("dateFrom",day(5),"cost",10,"gmv",30,"refundGmv",5)).andExpect(status().isOk());
        call(post(base+"/jobs/"+j1+"/performance"),Map.of("dateFrom",day(6))).andExpect(status().isBadRequest());
        // 导入记录里有账户、更新行数
        JsonNode hist=json(call(get(base+"/performance-imports"),null));
        assertThat(hist.path(0).path("updated").asInt()).isEqualTo(2);assertThat(hist.path(0).path("account").asText()).isEqualTo("主账户");
        // 静态：前缀匹配不让 V1 吃掉 V12
        List<Map<String,Object>> vids=List.of(Map.of("id","a","standardName","251126-鞋子-短视频-欣怡-V1"),Map.of("id","b","standardName","251126-鞋子-短视频-欣怡-V12"));
        assertThat(PerformanceService.byStandardName("251126-鞋子-短视频-欣怡-V12_副本",vids).video().get("id")).isEqualTo("b");
        assertThat(PerformanceService.byStandardName("251126-鞋子-短视频-欣怡-V1_副本",vids).video().get("id")).isEqualTo("a");
        assertThat(PerformanceService.byStandardName("251126-鞋子-短视频-欣怡-V",vids).video()).isNull(); // 前一截对上两条：要手动指认
        assertThat(PerformanceService.byStandardName("2511",vids)).isNull();
    }

    @Test void boardsAggregateNetAndOverallFilterSortPageAndExport() throws Exception {
        String j1=job(xinyi,10),j2=job(xinyi,10),j3=job("admin",10),j4=job("admin",10);
        String a1=account("主账户",adv(2)),a2=account("副账户",adv(3));
        // j1：净 ROI 4（≥3 绿），j2：净 ROI 0.5（<1 红），j3：两个账户，j4 只有曝光点击（不进看板）
        money(j1,a1,"m1",3,100,450,50,9,1,10.0);money(j1,a1,"m1",2,100,450,50,9,1,20.0);
        money(j2,a1,"m2",3,200,150,50,5,2,40.0);
        money(j3,a1,"m3",3,50,200,0,4,0,null);money(j3,a2,"m3b",3,50,100,20,2,1,5.0);
        call(post(base+"/jobs/"+j4+"/performance"),Map.of("dateFrom",day(3),"impressions",1000,"clicks",30)).andExpect(status().isOk());
        JsonNode m=json(call(get(base+"/analytics/materials"),null).andExpect(status().isOk()));
        assertThat(m.path("total").asInt()).isEqualTo(3);
        JsonNode sum=m.path("summary");
        assertThat(sum.path("totalCost").asDouble()).isEqualTo(500.0);
        assertThat(sum.path("netGmv").asDouble()).isEqualTo(1180.0);   // 800+100+200+80
        assertThat(sum.path("netOrders").asLong()).isEqualTo(24);       // 8+8+3+4+1
        assertThat(sum.path("avgNetRoi").asDouble()).isEqualTo(2.36);   // 1180 ÷ 500
        assertThat(sum.path("avgRefundRate1h").asDouble()).isEqualTo(18.75); // (10+20+40+5) ÷ 4
        assertThat(sum.path("materialCount").asInt()).isEqualTo(3);
        // 默认按净成交金额降序
        JsonNode first=m.path("items").path(0);
        assertThat(first.path("jobId").asText()).isEqualTo(j1);
        assertThat(first.path("netRoi").asDouble()).isEqualTo(4.0);assertThat(first.path("netGmv").asDouble()).isEqualTo(800.0);assertThat(first.path("netOrders").asLong()).isEqualTo(16);
        assertThat(first.path("netSettleRate").asDouble()).isEqualTo(88.89);assertThat(first.path("refundRate1h").asDouble()).isEqualTo(15.0);
        assertThat(first.path("overallRoi").asDouble()).isEqualTo(4.5);assertThat(first.path("totalGmv").asDouble()).isEqualTo(900.0);assertThat(first.path("totalCost").asDouble()).isEqualTo(200.0);
        assertThat(first.path("dataDays").asInt()).isEqualTo(2);assertThat(first.path("creator").asText()).isEqualTo("欣怡");
        assertThat(first.path("standardName").asText()).contains("-欣怡-V1");assertThat(first.path("productName").asText()).isEqualTo("新百伦 鞋子-992");
        JsonNode j3row=null;for(JsonNode x:m.path("items")) if(x.path("jobId").asText().equals(j3)) j3row=x;
        assertThat(j3row.path("netRoi").asDouble()).isEqualTo(2.8);assertThat(j3row.path("refundRate1h").asDouble()).isEqualTo(5.0); // 没填的不算进平均
        // 排序 + 分页
        JsonNode asc=json(call(get(base+"/analytics/materials?sort=netRoi&order=asc&size=1&page=1"),null));
        assertThat(asc.path("items").size()).isEqualTo(1);assertThat(asc.path("items").path(0).path("jobId").asText()).isEqualTo(j2);assertThat(asc.path("total").asInt()).isEqualTo(3);
        assertThat(json(call(get(base+"/analytics/materials?sort=netRoi&order=asc&size=1&page=3"),null)).path("items").path(0).path("jobId").asText()).isEqualTo(j1);
        // 筛选：账户、创作者、商品、日期、单条成片
        assertThat(json(call(get(base+"/analytics/materials?accountId="+a2),null)).path("total").asInt()).isEqualTo(1);
        assertThat(json(call(get(base+"/analytics/materials?creator="+xinyi),null)).path("total").asInt()).isEqualTo(2);
        assertThat(json(call(get(base+"/analytics/materials?product="+shoe),null)).path("total").asInt()).isEqualTo(3);
        assertThat(json(call(get(base+"/analytics/materials?product=nope"),null)).path("total").asInt()).isZero();
        JsonNode recent=json(call(get(base+"/analytics/materials?start="+day(2)+"&end="+day(0)),null));
        assertThat(recent.path("total").asInt()).isEqualTo(1);assertThat(recent.path("summary").path("totalCost").asDouble()).isEqualTo(100.0);
        assertThat(json(call(get(base+"/analytics/materials?job="+j2),null)).path("total").asInt()).isEqualTo(1);
        assertThat(m.path("options").path("accounts").size()).isEqualTo(2);assertThat(m.path("options").path("creators").size()).isEqualTo(2);
        call(get(base+"/analytics/materials?start=11/15"),null).andExpect(status().isBadRequest());
        // 导出：UTF-8 带 BOM，和当前筛选、排序一致
        var res=call(get(base+"/analytics/materials/export?creator="+xinyi+"&sort=netRoi&order=asc"),null).andExpect(status().isOk()).andReturn().getResponse();
        assertThat(res.getContentType()).startsWith("text/csv");assertThat(res.getHeader("Content-Disposition")).contains("attachment");
        String text=new String(res.getContentAsByteArray(),StandardCharsets.UTF_8);
        assertThat(text).startsWith("﻿\"素材命名\"");
        String[] lines=text.split("\r\n");
        assertThat(lines).hasSize(3);
        assertThat(lines[1]).contains(lib().get(j2).path("standardName").asText()).contains(",0.5,");
        assertThat(lines[2]).contains(",4,800,16,88.89,15,4.5,900,200,2");
        // 商品维度：只有素材数和素材合计净成交
        JsonNode prod=json(call(get(base+"/analytics/products"),null).andExpect(status().isOk()));
        assertThat(prod.path("items").size()).isEqualTo(1);
        assertThat(prod.path("items").path(0).path("materialCount").asInt()).isEqualTo(3);assertThat(prod.path("items").path(0).path("netGmv").asDouble()).isEqualTo(1180.0);
        assertThat(prod.path("items").path(0).has("netRoi")).isFalse();assertThat(prod.path("items").path(0).has("totalCost")).isFalse();
        assertThat(new String(call(get(base+"/analytics/products/export"),null).andReturn().getResponse().getContentAsByteArray(),StandardCharsets.UTF_8)).startsWith("﻿\"商品\",\"关联素材数\"");
        // 账户维度
        JsonNode accs=json(call(get(base+"/analytics/accounts"),null).andExpect(status().isOk()));
        JsonNode main=accs.path("items").path(0);
        assertThat(main.path("name").asText()).isEqualTo("主账户");assertThat(main.path("materialCount").asInt()).isEqualTo(3);
        assertThat(main.path("totalCost").asDouble()).isEqualTo(450.0);assertThat(main.path("netGmv").asDouble()).isEqualTo(1100.0);assertThat(main.path("clientName").asText()).isEqualTo("投流测试");
        // 成片详情的投放表现：近 7 天每天一个点；没千川数据的不显示
        JsonNode st=json(call(get(base+"/jobs/"+j1+"/campaign-stats"),null).andExpect(status().isOk()));
        assertThat(st.path("hasData").asBoolean()).isTrue();assertThat(st.path("trend").size()).isEqualTo(7);
        assertThat(st.path("through").asText()).isEqualTo(day(2));
        assertThat(st.path("trend").path(6).path("netRoi").asDouble()).isEqualTo(4.0);assertThat(st.path("trend").path(5).path("netRoi").asDouble()).isEqualTo(4.0);
        assertThat(st.path("trend").path(0).path("netRoi").isMissingNode()).isTrue();
        assertThat(st.path("summary").path("netRoi").asDouble()).isEqualTo(4.0);
        assertThat(json(call(get(base+"/jobs/"+j4+"/campaign-stats"),null)).path("hasData").asBoolean()).isFalse();
        // 列表里的累计也带上净成交（资产库卡片和详情用）
        JsonNode perf=lib().get(j1).path("perf");
        assertThat(perf.path("netRoi").asDouble()).isEqualTo(4.0);assertThat(perf.path("roi").asDouble()).isEqualTo(4.5);assertThat(perf.path("netSettleRate").asDouble()).isEqualTo(88.89);
        assertThat(perf.has("impressions")).isFalse(); // 没有曝光就是没有，不写 0
    }

    @Test void fourRulesTriggerAtThresholdsAndDecisionsAreOnlyRecorded() throws Exception {
        String acc=account("主账户",adv(4));
        String a=job(xinyi,10),a2=job(xinyi,10),b=job(xinyi,10),b2=job(xinyi,10),c=job(xinyi,10),c2=job(xinyi,10),d=job(xinyi,10),d2=job(xinyi,10);
        money(a,acc,"a",3,150,600,60,20,2,35.0);   money(a2,acc,"a2",3,150,300,30,10,1,30.0);   // 退款率 35% 且消耗 150 → 高退款；30% 不算
        for(int i=1;i<=3;i++) money(b,acc,"b",i,100,330,30,5,1,5.0);                            // 净 ROI 3.0、净订单 12、3 天 → 加预算
        for(int i=1;i<=2;i++) money(b2,acc,"b2",i,100,330,30,5,1,5.0);                          // 只有 2 天
        money(c,acc,"c",3,600,500,20,10,1,5.0);    money(c2,acc,"c2",3,500,400,10,10,1,5.0);    // 净 ROI 0.8、消耗 600 → 止损；消耗正好 500 不算
        money(d,acc,"d",3,100,400,220,10,6,5.0);   money(d2,acc,"d2",3,100,400,200,10,5,5.0);   // 净结算率 45% → 检查；正好 50% 不算
        JsonNode r=json(call(post(base+"/analytics/suggestions/scan"),null).andExpect(status().isOk()));
        assertThat(r.path("created").asInt()).isEqualTo(4);
        JsonNode list=json(call(get(base+"/analytics/suggestions?status=PENDING"),null));
        Map<String,JsonNode> byJob=new HashMap<>();list.path("items").forEach(x->byJob.put(x.path("job").path("id").asText(),x));
        assertThat(byJob.keySet()).containsExactlyInAnyOrder(a,b,c,d);
        assertThat(byJob.get(a).path("type").asText()).isEqualTo("STOP");assertThat(byJob.get(a).path("reason").asText()).isEqualTo("建议停投：1 小时退款率 35%，存在素材 / 人群错配风险");
        assertThat(byJob.get(b).path("type").asText()).isEqualTo("INCREASE_BUDGET");assertThat(byJob.get(b).path("reason").asText()).startsWith("建议加预算：净 ROI 3 ");
        assertThat(byJob.get(c).path("type").asText()).isEqualTo("ITERATE");assertThat(byJob.get(c).path("reason").asText()).contains("累计消耗 ¥600");
        assertThat(byJob.get(d).path("type").asText()).isEqualTo("CHECK");assertThat(byJob.get(d).path("reason").asText()).contains("净结算率仅 45%");
        assertThat(byJob.get(b).path("snapshot").path("netOrders").asLong()).isEqualTo(12);assertThat(byJob.get(b).path("snapshot").path("dataDays").asInt()).isEqualTo(3);
        assertThat(byJob.get(a).path("job").path("standardName").asText()).isNotBlank();
        assertThat(list.toString()).doesNotContain("自动");
        assertThat(list.path("counts").path("pending").asInt()).isEqualTo(4);
        // 再扫一遍不重复提
        assertThat(json(call(post(base+"/analytics/suggestions/scan"),null)).path("created").asInt()).isZero();
        // 状态流转：待处理 → 已接受 → 已执行；忽略了就不能再接受
        JsonNode sa=byJob.get(a);
        JsonNode acc1=json(call(post(base+"/analytics/suggestions/"+sa.path("id").asText()+"/decide"),Map.of("action","accepted","revision",sa.path("revision").asInt())).andExpect(status().isOk()));
        assertThat(acc1.path("status").asText()).isEqualTo("ACCEPTED");assertThat(acc1.path("decidedBy").asText()).isEqualTo("admin");
        call(post(base+"/analytics/suggestions/"+sa.path("id").asText()+"/decide"),Map.of("action","done","revision",sa.path("revision").asInt())).andExpect(status().isConflict());
        call(post(base+"/analytics/suggestions/"+sa.path("id").asText()+"/decide"),Map.of("action","rejected","revision",acc1.path("revision").asInt())).andExpect(status().isBadRequest());
        JsonNode done=json(call(post(base+"/analytics/suggestions/"+sa.path("id").asText()+"/decide"),Map.of("action","done","revision",acc1.path("revision").asInt())).andExpect(status().isOk()));
        assertThat(done.path("status").asText()).isEqualTo("DONE");
        call(post(base+"/analytics/suggestions/"+sa.path("id").asText()+"/decide"),Map.of("action","accepted","revision",done.path("revision").asInt())).andExpect(status().isBadRequest());
        JsonNode sb=byJob.get(b);
        JsonNode rej=json(as(buyer,post(base+"/analytics/suggestions/"+sb.path("id").asText()+"/decide"),Map.of("action","rejected","revision",sb.path("revision").asInt())).andExpect(status().isOk()));
        assertThat(rej.path("status").asText()).isEqualTo("REJECTED");
        call(post(base+"/analytics/suggestions/"+sb.path("id").asText()+"/decide"),Map.of("action","accepted","revision",rej.path("revision").asInt())).andExpect(status().isBadRequest());
        call(post(base+"/analytics/suggestions/"+sb.path("id").asText()+"/decide"),Map.of("action","stop","revision",rej.path("revision").asInt())).andExpect(status().isBadRequest());
        // 只读、内容制作不能处理；都能看
        JsonNode sc=byJob.get(c);
        as(viewer,post(base+"/analytics/suggestions/"+sc.path("id").asText()+"/decide"),Map.of("action","accepted","revision",0)).andExpect(status().isForbidden());
        as(maker,post(base+"/analytics/suggestions/"+sc.path("id").asText()+"/decide"),Map.of("action","accepted","revision",0)).andExpect(status().isForbidden());
        as(viewer,get(base+"/analytics/suggestions"),null).andExpect(status().isOk());
        // 有了新数据：处理过的（忽略的 b）再提一条新的；还在待处理的（c）更新数据，不新增
        money(b,acc,"b",0,100,330,30,5,1,5.0);money(c,acc,"c",0,100,50,0,1,0,5.0);
        assertThat(json(call(post(base+"/analytics/suggestions/scan"),null)).path("created").asInt()).isEqualTo(1);
        list=json(call(get(base+"/analytics/suggestions?status=PENDING"),null));
        assertThat(list.path("counts").path("pending").asInt()).isEqualTo(3);
        for(JsonNode x:list.path("items")) if(x.path("job").path("id").asText().equals(c)){assertThat(x.path("dataThrough").asText()).isEqualTo(day(0));assertThat(x.path("revision").asInt()).isEqualTo(1);}
        // 规则：停用、改阈值（只读不能改）
        JsonNode rules=json(call(get(base+"/analytics/suggestion-rules"),null));
        assertThat(rules.size()).isEqualTo(4);for(JsonNode x:rules) assertThat(x.path("enabled").asBoolean()).isTrue();
        JsonNode refund=rules.path(0);assertThat(refund.path("key").asText()).isEqualTo("HIGH_REFUND");assertThat(refund.path("params").path("refundRate1h").asDouble()).isEqualTo(30.0);
        as(viewer,put(base+"/analytics/suggestion-rules/HIGH_REFUND"),Map.of("enabled",false,"revision",0)).andExpect(status().isForbidden());
        JsonNode upd=json(call(put(base+"/analytics/suggestion-rules/HIGH_REFUND"),Map.of("enabled",true,"params",Map.of("refundRate1h",25),"revision",0)).andExpect(status().isOk()));
        assertThat(upd.path("condition").asText()).isEqualTo("1 小时退款率 > 25% 且累计消耗 > 100 元");
        call(put(base+"/analytics/suggestion-rules/HIGH_REFUND"),Map.of("enabled",true,"params",Map.of("refundRate1h",120),"revision",1)).andExpect(status().isBadRequest());
        call(put(base+"/analytics/suggestion-rules/HIGH_REFUND"),Map.of("enabled",true,"params",Map.of("x",1),"revision",1)).andExpect(status().isBadRequest());
        assertThat(json(call(post(base+"/analytics/suggestions/scan"),null)).path("created").asInt()).isEqualTo(1); // a2 的 30% 现在超过 25%
        call(put(base+"/analytics/suggestion-rules/LOW_SETTLE"),Map.of("enabled",false,"revision",0)).andExpect(status().isOk());
        money(d2,acc,"d2",1,100,400,300,10,8,5.0); // d2 现在净结算率很低，但规则停用了
        assertThat(json(call(post(base+"/analytics/suggestions/scan"),null)).path("created").asInt()).isZero();
        // 导入完成会自动扫
        String n=lib().get(d2).path("standardName").asText();
        Map<String,Object> body=new LinkedHashMap<>(Map.of("text","素材ID,素材名称,日期,消耗,成交金额,成交订单数,退款金额,退款订单数,1小时退款率\nq1,"+n+","+day(0)+",900,100,2,0,0,90%\n","accountId",acc,"confirmed",true));
        assertThat(json(call(post(base+"/analytics/import/confirm"),body).andExpect(status().isOk())).path("suggestions").asInt()).isEqualTo(2); // 高退款 + 低效止损
        // 静态：四条规则的阈值边界
        Map<String,Object> m=new HashMap<String,Object>(Map.of("totalCost",100.01,"refundRate1h",30.01,"netRoi",3.0,"netOrders",10L,"dataDays",3L,"netSettleRate",49.99));
        assertThat(SuggestionService.judge(SuggestionService.RULES.get(0),SuggestionService.RULES.get(0).defaults(),m)).startsWith("建议停投");
        assertThat(SuggestionService.judge(SuggestionService.RULES.get(1),SuggestionService.RULES.get(1).defaults(),m)).startsWith("建议加预算");
        assertThat(SuggestionService.judge(SuggestionService.RULES.get(3),SuggestionService.RULES.get(3).defaults(),m)).startsWith("建议检查");
        m.put("totalCost",500.0);m.put("netRoi",0.99);
        assertThat(SuggestionService.judge(SuggestionService.RULES.get(2),SuggestionService.RULES.get(2).defaults(),m)).isNull();
        m.put("totalCost",500.01);
        assertThat(SuggestionService.judge(SuggestionService.RULES.get(2),SuggestionService.RULES.get(2).defaults(),m)).startsWith("建议停投迭代");
        m.remove("netSettleRate");
        assertThat(SuggestionService.judge(SuggestionService.RULES.get(3),SuggestionService.RULES.get(3).defaults(),m)).isNull(); // 没有数字就不判断
    }

    @Test void rolesAndClientIsolation() throws Exception {
        String j1=job(xinyi,10);
        String n1=lib().get(j1).path("standardName").asText();
        Map<String,Object> acct=Map.of("name","主账户","advertiserId",adv(5));
        // 只读、内容制作不能管账户、不能导入；投手、客户负责人可以
        as(viewer,post(base+"/analytics/accounts"),acct).andExpect(status().isForbidden());
        as(maker,post(base+"/analytics/accounts"),acct).andExpect(status().isForbidden());
        String acc=json(as(buyer,post(base+"/analytics/accounts"),acct).andExpect(status().isOk())).path("id").asText();
        String lead=member("ld","负责人","LEAD");
        as(lead,post(base+"/analytics/accounts"),Map.of("name","负责人的账户","advertiserId",adv(6))).andExpect(status().isOk());
        Map<String,Object> body=new LinkedHashMap<>(Map.of("text","素材ID,素材名称,日期,消耗,成交金额\nm1,"+n1+","+day(3)+",100,300\n","accountId",acc));
        as(viewer,post(base+"/analytics/import/preview"),body).andExpect(status().isForbidden());
        as(maker,post(base+"/analytics/import/preview"),body).andExpect(status().isForbidden());
        as(viewer,post(base+"/performance-imports/preview"),body).andExpect(status().isForbidden());
        body.put("confirmed",true);
        as(maker,post(base+"/analytics/import/confirm"),body).andExpect(status().isForbidden());
        as(buyer,post(base+"/analytics/import/confirm"),body).andExpect(status().isOk());
        as(viewer,post(base+"/analytics/suggestions/scan"),null).andExpect(status().isForbidden());
        // 看板谁都能看
        for(String u:List.of(viewer,maker,buyer)) assertThat(json(as(u,get(base+"/analytics/materials"),null).andExpect(status().isOk())).path("total").asInt()).isEqualTo(1);
        as(viewer,get(base+"/analytics/materials/export"),null).andExpect(status().isOk());
        // 账户：同团队别的客户不能再挂同一个广告主 ID；改、删带 revision
        String other=Store.id();
        s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",other,"admin","另一个客户","美妆",Store.now());
        call(post("/api/clients/"+other+"/analytics/accounts"),acct).andExpect(status().isConflict());
        call(post(base+"/analytics/accounts"),Map.of("name","重复","advertiserId",adv(5))).andExpect(status().isConflict());
        call(post(base+"/analytics/accounts"),Map.of("name","坏 ID","advertiserId","abc")).andExpect(status().isBadRequest());
        // 别的客户：看不到这个客户的数据，也不能用这个客户的账户导入
        assertThat(json(call(get("/api/clients/"+other+"/analytics/materials"),null)).path("total").asInt()).isZero();
        assertThat(json(call(get("/api/clients/"+other+"/analytics/accounts"),null)).path("items").size()).isZero();
        Map<String,Object> cross=new LinkedHashMap<>(body);cross.remove("confirmed");
        call(post("/api/clients/"+other+"/analytics/import/preview"),cross).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("不在这个客户里")));
        // 没分到这个客户的成员、别的团队：进不去（404）
        String outsider="out-"+tag;
        s.db.update("INSERT INTO app_users(username,password,display_name,role,status,team_owner,created_at,revision) VALUES(?,?,?,?,?,?,?,0)",outsider,"x","外人","ADMIN","ACTIVE",outsider,Store.now());
        String onlyOther="oo-"+tag;
        s.db.update("INSERT INTO app_users(username,password,display_name,role,status,team_owner,created_at,revision) VALUES(?,?,?,?,?,?,?,0)",onlyOther,"x","别的组","BUYER","ACTIVE","admin",Store.now());
        s.db.update("INSERT INTO client_members(client_id,username,created_by,created_at) VALUES(?,?,?,?)",other,onlyOther,"admin",Store.now());
        for(String u:List.of(outsider,onlyOther)){
            as(u,get(base+"/analytics/materials"),null).andExpect(status().isNotFound());
            as(u,get(base+"/analytics/suggestions"),null).andExpect(status().isNotFound());
            as(u,get(base+"/jobs/"+j1+"/campaign-stats"),null).andExpect(status().isNotFound());
            as(u,get(base+"/analytics/materials/export"),null).andExpect(status().isNotFound());
        }
        as(onlyOther,get("/api/clients/"+other+"/analytics/materials"),null).andExpect(status().isOk());
        // 删账户：有数据只标记删除（数据还在），没数据真删
        JsonNode list=json(call(get(base+"/analytics/accounts"),null));
        assertThat(list.path("items").size()).isEqualTo(2);
        JsonNode withData=list.path("items").path(0).path("id").asText().equals(acc)?list.path("items").path(0):list.path("items").path(1);
        JsonNode empty=list.path("items").path(0).path("id").asText().equals(acc)?list.path("items").path(1):list.path("items").path(0);
        call(delete(base+"/analytics/accounts/"+acc+"?revision=9"),null).andExpect(status().isConflict());
        assertThat(json(call(delete(base+"/analytics/accounts/"+acc+"?revision="+withData.path("revision").asInt()),null).andExpect(status().isOk())).path("kept").asInt()).isEqualTo(1);
        assertThat(s.db.queryForObject("SELECT status FROM qianchuan_accounts WHERE id=?",String.class,acc)).isEqualTo("DELETED");
        assertThat(s.db.queryForObject("SELECT COUNT(*) FROM job_performance WHERE account_id=?",Integer.class,acc)).isEqualTo(1);
        call(delete(base+"/analytics/accounts/"+empty.path("id").asText()+"?revision="+empty.path("revision").asInt()),null).andExpect(status().isOk());
        assertThat(s.db.queryForObject("SELECT COUNT(*) FROM qianchuan_accounts WHERE id=?",Integer.class,empty.path("id").asText())).isZero();
        assertThat(json(call(get(base+"/analytics/accounts"),null)).path("items").size()).isZero();
        // 删掉的账户不能再导入；同一个广告主 ID 重新添加就恢复那一条
        call(post(base+"/analytics/import/preview"),cross).andExpect(status().isBadRequest());
        assertThat(json(call(post(base+"/analytics/accounts"),acct).andExpect(status().isOk())).path("id").asText()).isEqualTo(acc);
        // 停用的账户不能导入
        JsonNode cur=json(call(get(base+"/analytics/accounts"),null)).path("items").path(0);
        call(put(base+"/analytics/accounts/"+acc),Map.of("name","主账户","advertiserId",adv(5),"status","PAUSED","revision",cur.path("revision").asInt())).andExpect(status().isOk());
        call(post(base+"/analytics/import/preview"),cross).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("停用")));
        // 有数据的账户不能改广告主 ID
        cur=json(call(get(base+"/analytics/accounts"),null)).path("items").path(0);
        call(put(base+"/analytics/accounts/"+acc),Map.of("name","主账户","advertiserId",adv(7),"revision",cur.path("revision").asInt())).andExpect(status().isBadRequest());
    }
}
