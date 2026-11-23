package com.shangzhen.workbench;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 团队管理：开通成员、角色和负责客户只能由管理员改，访问范围、停用和按角色拦修改都在后端生效。测试密码只在这个内存库里用。 */
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:team;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE","app.storage=./target/team-media","app.worker-delay=3600000"})
@AutoConfigureMockMvc
class TeamManagementTest {
    @Autowired Store s; @Autowired MockMvc mvc; @Autowired PasswordEncoder encoder;
    static final String PASS="team-test-only-1234";
    String a,b,tag;

    @BeforeEach void setup(){
        a=Store.id();b=Store.id();tag=Long.toString(System.nanoTime(),36);
        s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",a,"admin","团队测试 A","服饰",Store.now());
        s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",b,"admin","团队测试 B","美妆",Store.now());
    }
    ResultActions call(String as,MockHttpServletRequestBuilder req,Object body) throws Exception {
        if(body!=null) req=req.contentType(MediaType.APPLICATION_JSON).content(s.write(body));
        return mvc.perform(req.with(user(as)).with(csrf()));
    }
    JsonNode json(ResultActions r) throws Exception {return s.json.readTree(r.andReturn().getResponse().getContentAsString());}
    String member(String role,List<String> clients) throws Exception {
        String name=role.toLowerCase()+"-"+tag;
        call("admin",post("/api/team/members"),Map.of("username",name,"displayName","测试"+role,"role",role,"clientIds",clients,"password",PASS)).andExpect(status().isOk());
        return name;
    }
    int revision(String name){return s.db.queryForObject("SELECT revision FROM app_users WHERE username=?",Integer.class,name);}

    @Test void adminCreatesMemberWithHashedPasswordAndNoEcho() throws Exception {
        var r=call("admin",post("/api/team/members"),Map.of("username","lead-"+tag,"displayName","李娜","role","LEAD","clientIds",List.of(a),"password",PASS)).andExpect(status().isOk());
        String body=r.andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain(PASS).doesNotContain("password");
        JsonNode m=json(r);
        assertThat(m.get("status").asText()).isEqualTo("PENDING");
        assertThat(m.get("clients").get(0).get("name").asText()).isEqualTo("团队测试 A");
        String hash=s.db.queryForObject("SELECT password FROM app_users WHERE username=?",String.class,"lead-"+tag);
        assertThat(hash).isNotEqualTo(PASS).startsWith("$2");assertThat(encoder.matches(PASS,hash)).isTrue();
        assertThat(s.db.queryForObject("SELECT COUNT(*) FROM team_events WHERE detail LIKE ?",Integer.class,"%"+PASS+"%")).isZero();
        // 列表、事件里也没有密码
        assertThat(call("admin",get("/api/team/members"),null).andReturn().getResponse().getContentAsString()).doesNotContain(PASS).doesNotContain("$2");
        // 重名、密码太短、未知角色、别的团队的客户
        call("admin",post("/api/team/members"),Map.of("username","LEAD-"+tag,"displayName","重名","role","LEAD","clientIds",List.of(),"password",PASS)).andExpect(status().isConflict());
        call("admin",post("/api/team/members"),Map.of("username","short-"+tag,"displayName","短","role","LEAD","clientIds",List.of(),"password","short-pass")).andExpect(status().isBadRequest());
        call("admin",post("/api/team/members"),Map.of("username","boss-"+tag,"displayName","老板","role","OWNER","clientIds",List.of(),"password",PASS)).andExpect(status().isBadRequest());
        call("admin",post("/api/team/members"),Map.of("username","x-"+tag,"displayName","外人","role","LEAD","clientIds",List.of("not-ours"),"password",PASS)).andExpect(status().isBadRequest());
    }

    @Test void nonAdminCannotManageMembersOrRoles() throws Exception {
        String lead=member("LEAD",List.of(a)),maker=member("MAKER",List.of(a));
        int rev=revision(maker);
        call(lead,put("/api/team/members/"+maker),Map.of("displayName","改名","role","ADMIN","clientIds",List.of(a,b),"revision",rev))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.message").value("只有管理员能管理团队成员和客户"));
        call(maker,put("/api/team/members/"+maker),Map.of("displayName","我自己","role","ADMIN","clientIds",List.of(a,b),"revision",rev)).andExpect(status().isForbidden());
        call(lead,post("/api/team/members"),Map.of("username","sneak-"+tag,"displayName","x","role","ADMIN","clientIds",List.of(),"password",PASS)).andExpect(status().isForbidden());
        call(lead,put("/api/team/members/"+maker+"/status"),Map.of("enabled",false,"revision",rev)).andExpect(status().isForbidden());
        call(lead,put("/api/team/members/"+maker+"/password"),Map.of("password","another-pass-123","revision",rev)).andExpect(status().isForbidden());
        call(lead,get("/api/team/events"),null).andExpect(status().isForbidden());
        call(lead,post("/api/clients"),Map.of("name","偷偷建的客户","category","服饰")).andExpect(status().isForbidden());
        assertThat(s.db.queryForObject("SELECT role FROM app_users WHERE username=?",String.class,maker)).isEqualTo("MAKER");
        assertThat(revision(maker)).isEqualTo(rev);
        // 能看成员列表，但 canManage=false
        assertThat(json(call(lead,get("/api/team/members"),null).andExpect(status().isOk())).get("canManage").asBoolean()).isFalse();
    }

    @Test void clientAccessFollowsAssignmentAndAdminSeesAll() throws Exception {
        String lead=member("LEAD",List.of(a));
        call(lead,get("/api/clients/"+a+"/overview"),null).andExpect(status().isOk());
        call(lead,get("/api/clients/"+b+"/overview"),null).andExpect(status().isNotFound());
        JsonNode list=json(call(lead,get("/api/clients"),null));
        assertThat(list).hasSize(1);assertThat(list.get(0).get("id").asText()).isEqualTo(a);
        // 管理员改成负责 B：马上只能进 B
        call("admin",put("/api/team/members/"+lead),Map.of("displayName","李娜","role","LEAD","clientIds",List.of(b),"revision",revision(lead))).andExpect(status().isOk());
        call(lead,get("/api/clients/"+a+"/overview"),null).andExpect(status().isNotFound());
        call(lead,get("/api/clients/"+b+"/overview"),null).andExpect(status().isOk());
        // 升成管理员：能进团队全部客户，也能新建客户（记在主账号名下）
        call("admin",put("/api/team/members/"+lead),Map.of("displayName","李娜","role","ADMIN","clientIds",List.of(),"revision",revision(lead))).andExpect(status().isOk());
        call(lead,get("/api/clients/"+a+"/overview"),null).andExpect(status().isOk());
        String created=json(call(lead,post("/api/clients"),Map.of("name","新客户 "+tag,"category","服饰")).andExpect(status().isOk())).get("id").asText();
        assertThat(s.db.queryForObject("SELECT owner FROM clients WHERE id=?",String.class,created)).isEqualTo("admin");
        call("admin",get("/api/clients/"+created+"/overview"),null).andExpect(status().isOk());
        // 修改版本号过期
        call("admin",put("/api/team/members/"+lead),Map.of("displayName","李娜","role","LEAD","clientIds",List.of(),"revision",0)).andExpect(status().isConflict());
    }

    @Test void ownerAndSelfAreProtected() throws Exception {
        String admin2=member("ADMIN",List.of());
        call("admin",put("/api/team/members/admin"),Map.of("displayName","主账号","role","LEAD","clientIds",List.of(),"revision",revision("admin"))).andExpect(status().isBadRequest());
        call(admin2,put("/api/team/members/admin"),Map.of("displayName","主账号","role","VIEWER","clientIds",List.of(),"revision",revision("admin")))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("团队主账号一直是管理员，不能改角色"));
        call(admin2,put("/api/team/members/admin/status"),Map.of("enabled",false,"revision",revision("admin"))).andExpect(status().isBadRequest());
        call(admin2,put("/api/team/members/admin/password"),Map.of("password","another-pass-123","revision",revision("admin"))).andExpect(status().isBadRequest());
        call(admin2,put("/api/team/members/"+admin2),Map.of("displayName","我","role","VIEWER","clientIds",List.of(),"revision",revision(admin2)))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("不能改自己的角色，请让另一位管理员来改"));
        call(admin2,put("/api/team/members/"+admin2+"/status"),Map.of("enabled",false,"revision",revision(admin2))).andExpect(status().isBadRequest());
        assertThat(s.db.queryForObject("SELECT role FROM app_users WHERE username='admin'",String.class)).isEqualTo("ADMIN");
        // 改名可以
        call(admin2,put("/api/team/members/"+admin2),Map.of("displayName","第二位管理员","role","ADMIN","clientIds",List.of(),"revision",revision(admin2))).andExpect(status().isOk());
    }

    @Test void disabledMemberLosesAccessAndCannotLogIn() throws Exception {
        String buyer=member("BUYER",List.of(a));
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(Map.of("username",buyer,"password",PASS)))).andExpect(status().isOk());
        assertThat(s.db.queryForObject("SELECT status FROM app_users WHERE username=?",String.class,buyer)).isEqualTo("ACTIVE");
        assertThat(s.db.queryForObject("SELECT last_login_at FROM app_users WHERE username=?",java.sql.Timestamp.class,buyer)).isNotNull();
        call("admin",put("/api/team/members/"+buyer+"/status"),Map.of("enabled",false,"revision",revision(buyer))).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DISABLED"));
        call(buyer,get("/api/clients/"+a+"/overview"),null).andExpect(status().isNotFound());
        assertThat(json(call(buyer,get("/api/clients"),null))).isEmpty();
        call(buyer,post("/api/clients/"+a+"/product-folders"),Map.of("name","停用后")).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(Map.of("username",buyer,"password",PASS)))).andExpect(status().isUnauthorized());
        call("admin",put("/api/team/members/"+buyer+"/status"),Map.of("enabled",true,"revision",revision(buyer))).andExpect(jsonPath("$.status").value("ACTIVE"));
        call(buyer,get("/api/clients/"+a+"/overview"),null).andExpect(status().isOk());
        // 重设密码以后旧密码不能用
        call("admin",put("/api/team/members/"+buyer+"/password"),Map.of("password","reset-test-only-5678","revision",revision(buyer))).andExpect(status().isOk());
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(Map.of("username",buyer,"password",PASS)))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(s.write(Map.of("username",buyer,"password","reset-test-only-5678")))).andExpect(status().isOk());
        // 自己改密码要先输对现在的密码
        call(buyer,put("/api/team/me/password"),Map.of("current","wrong-password-000","next","mine-test-only-9999")).andExpect(status().isBadRequest());
        call(buyer,put("/api/team/me/password"),Map.of("current","reset-test-only-5678","next","mine-test-only-9999")).andExpect(status().isOk());
    }

    @Test void rolesLimitWritesInsideClient() throws Exception {
        String viewer=member("VIEWER",List.of(a)),maker=member("MAKER",List.of(a)),buyer=member("BUYER",List.of(a));
        call(viewer,get("/api/clients/"+a+"/project-library"),null).andExpect(status().isOk());
        call(viewer,post("/api/clients/"+a+"/product-folders"),Map.of("name","只读建的"))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.message").value("只读账号只能查看，不能修改"));
        call(maker,post("/api/clients/"+a+"/product-folders"),Map.of("name","制作建的 "+tag.substring(0,4))).andExpect(status().isOk());
        call(maker,put("/api/clients/"+a+"/jobs/whatever/verdict"),Map.of("revision",0)).andExpect(status().isForbidden())
            .andExpect(jsonPath("$.message").value("内容制作不能审片，请让投手或客户负责人来审"));
        call(maker,post("/api/clients/"+a+"/performance-imports"),Map.of()).andExpect(status().isForbidden());
        call(maker,post("/api/clients/"+a+"/presets"),Map.of("name","x","kind","RULE","content","x","enabled",true)).andExpect(status().isForbidden());
        call(buyer,post("/api/clients/"+a+"/presets"),Map.of("name","x","kind","RULE","content","x","enabled",true)).andExpect(status().isForbidden());
        // 投手审片不被角色拦（版本不存在所以是 404，不是 403）
        call(buyer,put("/api/clients/"+a+"/jobs/whatever/verdict"),Map.of("revision",0)).andExpect(result->assertThat(result.getResponse().getStatus()).isNotEqualTo(403));
        // 没分到的客户：先看不到
        call(maker,post("/api/clients/"+b+"/product-folders"),Map.of("name","越权")).andExpect(status().isNotFound());
    }

    @Test void workloadCountsProjectsByAssigneeWithinVisibleClients() throws Exception {
        String maker=member("MAKER",List.of(a));
        String p=Store.id();
        s.db.update("INSERT INTO projects VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",p,a,"负荷测试项目","SKU","服饰","抖音","电商短视频",15,"事实",true,"[]","{}","DRAFT",0,Store.now(),Store.now());
        s.db.update("INSERT INTO work_flow VALUES(?,?,?,?,?,?,?,?)",p,null,maker,"PLAN",null,"",0,Store.now());
        JsonNode w=json(call(maker,get("/api/team/workload"),null).andExpect(status().isOk()));
        JsonNode me=null;for(JsonNode m:w.get("members")) if(m.get("username").asText().equals(maker)) me=m;
        assertThat(me).isNotNull();
        assertThat(me.get("projects").asInt()).isEqualTo(1);assertThat(me.get("inProgress").asInt()).isEqualTo(1);
        assertThat(me.get("items").get(0).get("name").asText()).isEqualTo("负荷测试项目");
        assertThat(me.get("items").get(0).get("state").asText()).isEqualTo("还没出片");
        assertThat(w.get("clients")).hasSize(1);assertThat(w.get("clients").get(0).get("members").asInt()).isEqualTo(1);
        // 管理员看全部客户
        assertThat(json(call("admin",get("/api/team/workload"),null)).get("clients").size()).isGreaterThanOrEqualTo(2);
    }

    @Test void roleGuardRules(){
        assertThat(RoleGuard.denied("ADMIN","jobs/x/verdict")).isNull();
        assertThat(RoleGuard.denied("LEAD","presets/1")).isNull();
        assertThat(RoleGuard.denied("VIEWER","product-folders")).isNotNull();
        assertThat(RoleGuard.denied("MAKER","jobs/x/performance/y")).isNotNull();
        assertThat(RoleGuard.denied("MAKER","metrics/import")).isNotNull();
        assertThat(RoleGuard.denied("MAKER","projects/x/storyboard")).isNull();
        assertThat(RoleGuard.denied("BUYER","jobs/x/performance")).isNull();
    }
}
