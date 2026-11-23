package com.shangzhen.workbench;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Pattern;
import static com.shangzhen.workbench.Models.*;

/**
 * 团队管理：成员、角色、负责的客户、停用和工作负荷。
 * 一支团队 = 一个主账号（team_owner）和它开通的账号；团队的客户就是主账号名下的客户。
 * 只有管理员能开通、改角色、改负责客户、停用和重设密码；这些规则都在这里校验，不靠界面藏按钮。
 * 密码只存 BCrypt 摘要，不回显、不写进操作记录。
 */
@Service
public class TeamService {
    public static final List<String> ROLES=List.of("ADMIN","LEAD","BUYER","MAKER","VIEWER");
    static final Map<String,String> ROLE_LABEL=Map.of("ADMIN","管理员","LEAD","客户负责人","BUYER","投手","MAKER","内容制作","VIEWER","只读");
    private static final Pattern USERNAME=Pattern.compile("[A-Za-z0-9][A-Za-z0-9._@-]{2,59}");
    private final Store s; private final PasswordEncoder encoder; private final ProjectFlowService flow;
    TeamService(Store s,PasswordEncoder encoder,ProjectFlowService flow){this.s=s;this.encoder=encoder;this.flow=flow;}

    public record Account(String username,String displayName,String role,String status,String teamOwner,LocalDateTime createdAt,LocalDateTime lastLoginAt,int revision){
        boolean owner(){return username.equals(teamOwner);}
        boolean admin(){return "ADMIN".equals(role);}
        boolean disabled(){return "DISABLED".equals(status);}
        String name(){return displayName==null||displayName.isBlank()?username:displayName;}
    }
    private static LocalDateTime time(Timestamp t){return t==null?null:t.toLocalDateTime();}
    private static Account mapAccount(java.sql.ResultSet r) throws java.sql.SQLException {
        return new Account(r.getString("username"),r.getString("display_name"),r.getString("role"),r.getString("status"),r.getString("team_owner"),time(r.getTimestamp("created_at")),time(r.getTimestamp("last_login_at")),r.getInt("revision"));
    }
    Account account(String username){
        return s.db.query("SELECT * FROM app_users WHERE username=?",(r,n)->mapAccount(r),username).stream().findFirst().orElse(null);
    }
    Account requireMember(String user){
        Account a=account(user);
        if(a==null||a.disabled()) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"这个账号已停用，请联系管理员");
        return a;
    }
    Account requireAdmin(String user){
        Account a=requireMember(user);
        if(!a.admin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"只有管理员能管理团队成员和客户");
        return a;
    }
    private Account target(Account me,String username){
        Account t=account(username);
        if(t==null||!me.teamOwner().equals(t.teamOwner())) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"团队里没有这个成员");
        return t;
    }
    List<Account> accounts(String teamOwner){
        return s.db.query("SELECT * FROM app_users WHERE team_owner=? ORDER BY CASE WHEN username=team_owner THEN 0 ELSE 1 END, created_at, username",(r,n)->mapAccount(r),teamOwner);
    }
    List<Client> teamClients(String teamOwner){
        return s.db.query("SELECT * FROM clients WHERE owner=? ORDER BY created_at",s.clients,teamOwner);
    }
    private void event(Account actor,String action,String target,String detail){
        s.db.update("INSERT INTO team_events(id,team_owner,actor,action,target,detail,created_at) VALUES(?,?,?,?,?,?,?)",Store.id(),actor.teamOwner(),actor.username(),action,target,detail.substring(0,Math.min(500,detail.length())),Store.now());
    }

    // ---------- 登录、当前账号 ----------
    void loggedIn(String user){
        s.db.update("UPDATE app_users SET last_login_at=?, status=CASE WHEN status='PENDING' THEN 'ACTIVE' ELSE status END WHERE username=?",Store.now(),user);
    }
    Map<String,Object> me(String user){
        Account a=account(user);
        Map<String,Object> m=new LinkedHashMap<>();m.put("username",user);
        if(a==null){m.put("displayName",user);return m;}
        m.put("displayName",a.name());m.put("role",a.role());m.put("roleLabel",ROLE_LABEL.getOrDefault(a.role(),a.role()));
        m.put("status",a.status());m.put("owner",a.owner());m.put("canManage",a.admin()&&!a.disabled());
        return m;
    }

    // ---------- 成员列表 ----------
    private Map<String,List<String>> memberships(String teamOwner){
        Map<String,List<String>> out=new HashMap<>();
        s.db.query("SELECT m.username,m.client_id FROM client_members m JOIN clients c ON c.id=m.client_id WHERE c.owner=? ORDER BY c.created_at",rs->{out.computeIfAbsent(rs.getString(1),k->new ArrayList<>()).add(rs.getString(2));},teamOwner);
        return out;
    }
    Map<String,Object> members(String user){
        Account me=requireMember(user);
        List<Client> clients=teamClients(me.teamOwner());
        Map<String,String> names=new LinkedHashMap<>();clients.forEach(c->names.put(c.id(),c.name()));
        Map<String,List<String>> of=memberships(me.teamOwner());
        List<Map<String,Object>> rows=new ArrayList<>();
        for(Account a:accounts(me.teamOwner())) rows.add(row(a,me,of.getOrDefault(a.username(),List.of()),names));
        Map<String,Object> out=new LinkedHashMap<>();
        out.put("members",rows);
        out.put("clients",clients.stream().map(c->Map.of("id",c.id(),"name",c.name(),"category",c.category())).toList());
        out.put("canManage",me.admin());out.put("you",me.username());
        return out;
    }
    private Map<String,Object> row(Account a,Account me,List<String> clientIds,Map<String,String> names){
        Map<String,Object> m=new LinkedHashMap<>();
        m.put("username",a.username());m.put("displayName",a.name());m.put("role",a.role());m.put("status",a.status());
        m.put("owner",a.owner());m.put("you",a.username().equals(me.username()));
        m.put("createdAt",a.createdAt()==null?null:a.createdAt().toString());m.put("lastLoginAt",a.lastLoginAt()==null?null:a.lastLoginAt().toString());
        m.put("revision",a.revision());m.put("allClients",a.admin());
        m.put("clients",a.admin()?List.of():clientIds.stream().filter(names::containsKey).map(id->Map.of("id",id,"name",names.get(id))).toList());
        return m;
    }
    private Map<String,Object> rowOf(Account me,String username){
        Account a=account(username);
        Map<String,String> names=new LinkedHashMap<>();teamClients(me.teamOwner()).forEach(c->names.put(c.id(),c.name()));
        return row(a,me,memberships(me.teamOwner()).getOrDefault(username,List.of()),names);
    }

    // ---------- 开通、修改、停用 ----------
    private static String role(String raw){
        String r=Objects.toString(raw,"").trim().toUpperCase(Locale.ROOT);
        if(!ROLES.contains(r)) throw Store.bad("角色只能选管理员、客户负责人、投手、内容制作或只读");
        return r;
    }
    private static String displayName(String raw){
        String n=Objects.toString(raw,"").trim();
        if(n.isEmpty()) throw Store.bad("请填写成员姓名");
        if(n.length()>60) throw Store.bad("姓名最多 60 个字");
        return n;
    }
    private static void checkPassword(String password,String username){
        String p=Objects.toString(password,"");
        if(p.isBlank()) throw Store.bad("密码不能全是空格");
        if(p.length()<12) throw Store.bad("密码至少 12 位");
        if(p.getBytes(StandardCharsets.UTF_8).length>72) throw Store.bad("密码太长了，最多 72 个字节（英文和数字最多 72 位）");
        if(p.equalsIgnoreCase(username)) throw Store.bad("密码不能和登录账号一样");
    }
    private List<String> clientIds(Account me,List<String> raw){
        Set<String> team=new HashSet<>(teamClients(me.teamOwner()).stream().map(Client::id).toList());
        List<String> ids=new ArrayList<>(new LinkedHashSet<>(raw==null?List.<String>of():raw));
        for(String id:ids) if(!team.contains(id)) throw Store.bad("只能分配本团队的客户");
        return ids;
    }
    private void setClients(Account me,String username,List<String> ids){
        s.db.update("DELETE FROM client_members WHERE username=? AND client_id IN (SELECT id FROM clients WHERE owner=?)",username,me.teamOwner());
        for(String id:ids) s.db.update("INSERT INTO client_members(client_id,username,created_by,created_at) VALUES(?,?,?,?)",id,username,me.username(),Store.now());
    }
    private String clientNames(Account me,List<String> ids){
        Map<String,String> names=new HashMap<>();teamClients(me.teamOwner()).forEach(c->names.put(c.id(),c.name()));
        return ids.isEmpty()?"没有分配客户":String.join("、",ids.stream().map(names::get).toList());
    }

    @Transactional public Map<String,Object> create(String user,TeamController.CreateInput in){
        Account me=requireAdmin(user);
        String username=Objects.toString(in.username(),"").trim();
        if(!USERNAME.matcher(username).matches()) throw Store.bad("登录账号用 3 到 60 位英文字母、数字或 . _ @ -，以字母或数字开头");
        String name=displayName(in.displayName()),role=role(in.role());
        checkPassword(in.password(),username);
        List<String> ids=clientIds(me,in.clientIds());
        if(s.db.queryForObject("SELECT COUNT(*) FROM app_users WHERE LOWER(username)=LOWER(?)",Integer.class,username)>0)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"这个登录账号已经有人用了，换一个");
        s.db.update("INSERT INTO app_users(username,password,display_name,role,status,team_owner,created_at,revision) VALUES(?,?,?,?,?,?,?,0)",username,encoder.encode(in.password()),name,role,"PENDING",me.teamOwner(),Store.now());
        if(!role.equals("ADMIN")) setClients(me,username,ids);
        event(me,"开通账号",username,name+" / "+ROLE_LABEL.get(role)+(role.equals("ADMIN")?" / 全部客户":" / "+clientNames(me,ids)));
        return rowOf(me,username);
    }

    @Transactional public Map<String,Object> update(String user,String username,TeamController.UpdateInput in){
        Account me=requireAdmin(user);Account t=target(me,username);
        String name=displayName(in.displayName()),role=role(in.role());
        if(t.owner()&&!role.equals("ADMIN")) throw Store.bad("团队主账号一直是管理员，不能改角色");
        if(t.username().equals(me.username())&&!role.equals(t.role())) throw Store.bad("不能改自己的角色，请让另一位管理员来改");
        List<String> ids=clientIds(me,in.clientIds());
        if(s.db.update("UPDATE app_users SET display_name=?,role=?,revision=revision+1 WHERE username=? AND revision=?",name,role,username,in.revision())==0)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"这个成员刚被别人改过，请刷新后重试");
        setClients(me,username,role.equals("ADMIN")?List.of():ids);
        List<String> changes=new ArrayList<>();
        if(!role.equals(t.role())) changes.add("角色 "+ROLE_LABEL.get(t.role())+" → "+ROLE_LABEL.get(role));
        if(!name.equals(t.name())) changes.add("姓名 "+t.name()+" → "+name);
        changes.add(role.equals("ADMIN")?"负责全部客户":"负责 "+clientNames(me,ids));
        event(me,"修改成员",username,String.join("；",changes));
        return rowOf(me,username);
    }

    @Transactional public Map<String,Object> setEnabled(String user,String username,boolean enabled,int revision){
        Account me=requireAdmin(user);Account t=target(me,username);
        if(!enabled&&t.owner()) throw Store.bad("团队主账号不能停用");
        if(!enabled&&t.username().equals(me.username())) throw Store.bad("不能停用自己的账号");
        String next=enabled?(t.lastLoginAt()==null?"PENDING":"ACTIVE"):"DISABLED";
        if(s.db.update("UPDATE app_users SET status=?,revision=revision+1 WHERE username=? AND revision=?",next,username,revision)==0)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"这个成员刚被别人改过，请刷新后重试");
        event(me,enabled?"重新启用":"停用账号",username,t.name());
        return rowOf(me,username);
    }

    @Transactional public Map<String,Object> resetPassword(String user,String username,String password,int revision){
        Account me=requireAdmin(user);Account t=target(me,username);
        if(t.username().equals(me.username())) throw Store.bad("改自己的密码请用「改我的密码」，要先输入现在的密码");
        if(t.owner()) throw Store.bad("团队主账号的密码只能由主账号自己改");
        checkPassword(password,username);
        if(s.db.update("UPDATE app_users SET password=?,revision=revision+1 WHERE username=? AND revision=?",encoder.encode(password),username,revision)==0)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"这个成员刚被别人改过，请刷新后重试");
        event(me,"重设密码",username,t.name());
        return rowOf(me,username);
    }

    @Transactional public void changeOwnPassword(String user,String current,String next){
        Account me=requireMember(user);
        String hash=s.db.queryForObject("SELECT password FROM app_users WHERE username=?",String.class,user);
        if(!encoder.matches(Objects.toString(current,""),hash)) throw Store.bad("现在的密码不对");
        checkPassword(next,user);
        if(next.equals(current)) throw Store.bad("新密码不能和现在的一样");
        s.db.update("UPDATE app_users SET password=?,revision=revision+1 WHERE username=?",encoder.encode(next),user);
        event(me,"改了自己的密码",user,me.name());
    }

    List<Map<String,Object>> events(String user){
        Account me=requireAdmin(user);
        Map<String,String> names=new HashMap<>();accounts(me.teamOwner()).forEach(a->names.put(a.username(),a.name()));
        return s.db.query("SELECT * FROM team_events WHERE team_owner=? ORDER BY created_at DESC LIMIT 20",(r,n)->{
            Map<String,Object> m=new LinkedHashMap<>();
            m.put("actor",names.getOrDefault(r.getString("actor"),r.getString("actor")));m.put("action",r.getString("action"));
            m.put("target",names.getOrDefault(r.getString("target"),r.getString("target")));m.put("detail",r.getString("detail"));
            m.put("createdAt",r.getTimestamp("created_at").toLocalDateTime().toString());return m;
        },me.teamOwner());
    }

    // ---------- 工作负荷 ----------
    /** 每个人手上的项目（负责人 = 接力里的负责人，新建项目时默认是建项目的账号），只算当前账号能进的客户。 */
    Map<String,Object> workload(String user){
        Account me=requireMember(user);
        List<Client> clients=s.visibleClients(user);
        List<Account> team=accounts(me.teamOwner());
        Map<String,Account> byName=new LinkedHashMap<>();team.forEach(a->byName.put(a.username(),a));
        Map<String,List<Map<String,Object>>> mine=new LinkedHashMap<>();
        Map<String,List<String>> of=memberships(me.teamOwner());
        List<Map<String,Object>> perClient=new ArrayList<>();
        int others=0;
        for(Client c:clients){
            Map<String,String> assignee=new HashMap<>();
            s.db.query("SELECT f.project_id,f.assignee FROM work_flow f JOIN projects p ON p.id=f.project_id WHERE p.client_id=?",rs->{assignee.put(rs.getString(1),rs.getString(2));},c.id());
            @SuppressWarnings("unchecked") List<Map<String,Object>> items=(List<Map<String,Object>>)flow.library(c.id()).get("projects");
            long cp=0,ci=0,cu=0,cr=0;
            for(Map<String,Object> it:items){
                Map<String,Object> p=project(c,it);cp++;
                if(Boolean.TRUE.equals(p.get("inProgress"))) ci++;
                cu+=((Number)p.get("unreviewed")).longValue();cr+=((Number)p.get("running")).longValue();
                String a=assignee.get(it.get("id").toString());
                if(a!=null&&byName.containsKey(a)) mine.computeIfAbsent(a,k->new ArrayList<>()).add(p); else others++;
            }
            List<String> leads=team.stream().filter(a->"LEAD".equals(a.role())&&!a.disabled()&&of.getOrDefault(a.username(),List.of()).contains(c.id())).map(Account::name).toList();
            long assigned=team.stream().filter(a->!a.admin()&&!a.disabled()&&of.getOrDefault(a.username(),List.of()).contains(c.id())).count();
            Map<String,Object> m=new LinkedHashMap<>();
            m.put("id",c.id());m.put("name",c.name());m.put("leads",leads);m.put("members",assigned);
            m.put("projects",cp);m.put("inProgress",ci);m.put("unreviewed",cu);m.put("running",cr);
            perClient.add(m);
        }
        Set<String> visible=new HashSet<>(clients.stream().map(Client::id).toList());
        Map<String,Integer> reviewed=new HashMap<>();
        s.db.query("SELECT client_id,updated_by FROM job_verdicts WHERE updated_at>=?",rs->{if(visible.contains(rs.getString(1))) reviewed.merge(rs.getString(2),1,Integer::sum);},Timestamp.valueOf(Store.now().minusDays(7)));
        List<Map<String,Object>> perMember=new ArrayList<>();
        for(Account a:team){
            List<Map<String,Object>> list=new ArrayList<>(mine.getOrDefault(a.username(),List.of()));
            list.sort(Comparator.comparing((Map<String,Object> x)->!Boolean.TRUE.equals(x.get("inProgress"))).thenComparing(x->Objects.toString(x.get("updatedAt"),""),Comparator.reverseOrder()));
            Map<String,Object> m=new LinkedHashMap<>();
            m.put("username",a.username());m.put("displayName",a.name());m.put("role",a.role());m.put("status",a.status());m.put("you",a.username().equals(user));
            m.put("projects",list.size());m.put("inProgress",list.stream().filter(x->Boolean.TRUE.equals(x.get("inProgress"))).count());
            m.put("unreviewed",list.stream().mapToLong(x->((Number)x.get("unreviewed")).longValue()).sum());
            m.put("running",list.stream().mapToLong(x->((Number)x.get("running")).longValue()).sum());
            m.put("reviewedThisWeek",reviewed.getOrDefault(a.username(),0));
            m.put("items",list.size()>40?new ArrayList<>(list.subList(0,40)):list);
            perMember.add(m);
        }
        Map<String,Object> out=new LinkedHashMap<>();
        out.put("members",perMember);out.put("clients",perClient);out.put("unassignedProjects",others);
        return out;
    }
    private static Map<String,Object> project(Client c,Map<String,Object> it){
        Map<?,?> v=(Map<?,?>)it.get("versions");
        long running=((Number)v.get("running")).longValue(),unreviewed=((Number)v.get("unreviewed")).longValue(),usable=((Number)v.get("usable")).longValue(),count=((Number)v.get("count")).longValue();
        String state=running>0?"出片中 "+running+" 版":unreviewed>0?unreviewed+" 版待审片":usable>0?"有可投放的版本":count==0?(Boolean.TRUE.equals(it.get("storyboardConfirmed"))?"分镜已确认，还没出片":"还没出片"):"审过了，还没有可投放的版本";
        Map<String,Object> m=new LinkedHashMap<>();
        boolean flowable=Boolean.TRUE.equals(it.get("flow"));
        m.put("id",it.get("id"));m.put("name",it.get("name"));m.put("clientId",c.id());m.put("clientName",c.name());m.put("mode",it.get("mode"));
        m.put("path",flowable?"/p/"+it.get("id"):Objects.toString(it.get("legacyPath"),"/p/"+it.get("id")));
        m.put("state",state);m.put("inProgress",usable==0);m.put("running",running);m.put("unreviewed",unreviewed);m.put("versions",count);
        m.put("updatedAt",it.get("updatedAt"));
        return m;
    }
}
