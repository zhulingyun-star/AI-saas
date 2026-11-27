package com.shangzhen.workbench;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Pattern;
import static com.shangzhen.workbench.Models.*;
import static com.shangzhen.workbench.ProjectFlowService.str;

/**
 * 成片的标准命名（PRD F1）：{YYMMDD}-{商品简称}-{内容形式}-{创作者}-V{版本}，例如 251126-儿童家居服-短视频-欣怡-V1。
 * 投放时用它给千川素材命名，导入表格时据此对上成片。
 * - 日期：成片生成那天（北京时间）；商品简称：商品库里的商品名去掉空白和连字符，最多 10 个字（商品库还没有单独的简称字段）；
 *   内容形式默认「短视频」；创作者：出片人的显示名（V13 display_name，空则用账号），去掉连字符，最多 10 个字。
 * - 同一天、同一商品简称、同一创作者，版本从 V1 往上加。
 * - 出片人：新出的版本记在 jobs.created_by；以前的版本按操作记录里同一时刻的「出片 / 提交制作 / 提交一键成片」补。
 *   补不出来（没有商品、不知道是谁出的、名字太短）就不生成，界面写「未规范化」，problem 里写原因。
 * - 用户不能自由改名，只能改商品简称、内容形式和版本（PUT /jobs/{id}/naming）。
 */
@Service
public class NamingService {
    public static final List<String> FORMS=List.of("图文","短视频","直播切片");
    static final Pattern NAME=Pattern.compile("^\\d{6}-[^-]{2,10}-(图文|短视频|直播切片)-[^-]{2,10}-V\\d{1,2}$");
    static final DateTimeFormatter YYMMDD=DateTimeFormatter.ofPattern("yyMMdd");
    private static final List<String> MADE_ACTIONS=List.of("出片","提交制作","提交一键成片");
    private final Store s;private final ProjectFlowService flow;private final org.springframework.transaction.support.TransactionTemplate tx;
    public NamingService(Store s,ProjectFlowService flow,org.springframework.transaction.PlatformTransactionManager tm){this.s=s;this.flow=flow;this.tx=new org.springframework.transaction.support.TransactionTemplate(tm);}

    public record Naming(String jobId,String standardName,String date,String productAnchor,String productShort,String form,String creatorUser,String creatorName,Integer version,String problem,int revision) {}
    private final org.springframework.jdbc.core.RowMapper<Naming> rows=(r,n)->{
        int v=r.getInt("version");Integer version=r.wasNull()?null:v;
        return new Naming(r.getString("job_id"),r.getString("standard_name"),r.getString("name_date"),r.getString("product_anchor"),r.getString("product_short"),r.getString("content_form"),
            r.getString("creator_user"),r.getString("creator_name"),version,r.getString("problem"),r.getInt("revision"));
    };
    Map<String,Naming> all(String client){
        Map<String,Naming> out=new HashMap<>();
        for(Naming n:s.db.query("SELECT * FROM job_names WHERE client_id=?",rows,client)) out.put(n.jobId(),n);
        return out;
    }
    Naming of(String client,String job){
        return s.db.query("SELECT * FROM job_names WHERE client_id=? AND job_id=?",rows,client,job).stream().findFirst().orElse(null);
    }
    static Map<String,Object> view(Naming n){
        if(n==null) return null;
        Map<String,Object> m=new LinkedHashMap<>();
        m.put("standardName",n.standardName());m.put("date",n.date());m.put("productShort",n.productShort());m.put("form",n.form());
        m.put("creator",n.creatorName());m.put("version",n.version());m.put("problem",n.problem());m.put("revision",n.revision());
        return m;
    }

    /** 名字里的一段：去掉空白和各种横线（命名用横线分段），最多 10 个字 */
    static String part(String raw){
        String t=str(raw).replaceAll("[\\s\\-－—–_]","");
        return t.length()>10?t.substring(0,10):t;
    }
    static String compose(String date,String product,String form,String creator,int version){
        return date+"-"+product+"-"+form+"-"+creator+"-V"+version;
    }
    static boolean valid(String name){return name!=null&&NAME.matcher(name).matches();}

    /** 还没命名的出好的成片都补上（按生成时间先后，版本号按先后递增）。列表、详情、导入前都会调一次；都命名过了就只查一次库。 */
    public void ensure(String client){
        Integer missing=s.db.queryForObject("SELECT COUNT(*) FROM jobs j WHERE j.client_id=? AND j.output_name IS NOT NULL AND NOT EXISTS(SELECT 1 FROM job_names n WHERE n.job_id=j.id)",Integer.class,client);
        if(missing==null||missing==0) return;
        try{tx.executeWithoutResult(st->fill(client));}catch(DuplicateKeyException e){/* 另一个请求同时在补，下次再看 */}
    }
    private void fill(String client){
        s.db.queryForObject("SELECT id FROM clients WHERE id=? FOR UPDATE",String.class,client);
        List<Object[]> todo=s.db.query("SELECT j.id,j.created_at,j.created_by,j.snapshot,j.project_id FROM jobs j WHERE j.client_id=? AND j.output_name IS NOT NULL AND NOT EXISTS(SELECT 1 FROM job_names n WHERE n.job_id=j.id) ORDER BY j.created_at,j.id",
            (r,n)->new Object[]{r.getString(1),r.getTimestamp(2).toLocalDateTime(),r.getString(3),r.getString(4),r.getString(5)},client);
        if(todo.isEmpty()) return;
        Map<String,Asset> assets=flow.assets(client);
        Map<String,Project> projects=new HashMap<>();
        for(Project p:s.db.query("SELECT * FROM projects WHERE client_id=?",s.projects,client)) projects.put(p.id(),p);
        for(Object[] j:todo){
            String jobId=(String)j[0];LocalDateTime created=(LocalDateTime)j[1];
            String date=VideoLibraryService.madeOn(created).format(YYMMDD);
            Project snap;try{snap=s.snapshot((String)j[3]);}catch(RuntimeException e){snap=null;}
            Project cur=projects.get((String)j[4]);
            Map<String,Object> product=snap==null?null:flow.productCard(assets.get(ProjectFlowService.anchorOf(snap)),assets);
            if(product==null&&cur!=null) product=flow.productCard(assets.get(ProjectFlowService.anchorOf(cur)),assets);
            String anchor=product==null?null:str(product.get("anchorId"));
            String shortName=product==null?"":part(str(product.get("name")));
            String user=str((String)j[2]);
            if(user.isEmpty()) user=madeBy(client,created);
            String creator=user.isEmpty()?"":part(displayName(user));
            List<String> problems=new ArrayList<>();
            if(product==null) problems.add("商品不在了");else if(shortName.length()<2) problems.add("商品简称不到 2 个字");
            if(user.isEmpty()) problems.add("不知道是谁出的");else if(creator.length()<2) problems.add("创作者名字不到 2 个字");
            String name=null;Integer version=null;
            if(problems.isEmpty()){
                version=next(client,date,shortName,creator,null);
                if(version>99){problems.add("同一天同一商品同一人超过 V99");version=null;}
                else name=compose(date,shortName,"短视频",creator,version);
            }
            s.db.update("INSERT INTO job_names(job_id,client_id,standard_name,name_date,product_anchor,product_short,content_form,creator_user,creator_name,version,problem,revision,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?,?)",
                jobId,client,name,date,anchor,shortName.isEmpty()?null:shortName,"短视频",user.isEmpty()?null:user,creator.isEmpty()?null:creator,version,String.join("；",problems),"system",Store.now());
        }
    }
    /** 以前的版本没有记出片人：找同一客户、同一时刻（前后 10 秒内）最近的一条出片操作记录 */
    private String madeBy(String client,LocalDateTime created){
        List<Object[]> hits=s.db.query("SELECT actor,created_at FROM audit_events WHERE client_id=? AND action IN ('出片','提交制作','提交一键成片') AND created_at BETWEEN ? AND ?",
            (r,n)->new Object[]{r.getString(1),r.getTimestamp(2).toLocalDateTime()},client,Timestamp.valueOf(created.minusSeconds(10)),Timestamp.valueOf(created.plusSeconds(10)));
        return hits.stream().min(Comparator.comparingLong(x->Math.abs(java.time.Duration.between(created,(LocalDateTime)x[1]).toMillis()))).map(x->str(x[0])).orElse("");
    }
    String displayName(String user){
        List<String> n=s.db.queryForList("SELECT display_name FROM app_users WHERE username=?",String.class,user);
        String d=n.isEmpty()?"":str(n.get(0)).trim();
        return d.isEmpty()?user:d;
    }
    /** 同一天、同一商品简称、同一创作者的下一个版本号（except：改名时排除自己） */
    private int next(String client,String date,String product,String creator,String except){
        Integer max=s.db.queryForObject("SELECT MAX(version) FROM job_names WHERE client_id=? AND name_date=? AND product_short=? AND creator_name=?"+(except==null?"":" AND job_id<>?"),
            Integer.class,except==null?new Object[]{client,date,product,creator}:new Object[]{client,date,product,creator,except});
        return max==null?1:max+1;
    }

    /** 改命名：只能改商品简称、内容形式和版本（不传版本就取下一个空着的）；改完的名字在这个客户里不能和别的成片重复 */
    @Transactional
    public Naming update(String client,String user,String jobId,String productShort,String form,Integer version,int revision){
        Job job=s.job(client,jobId);
        if(!job.hasOutput()) throw Store.bad("这一版还没出好，出好了才有命名");
        ensure(client);
        s.db.queryForObject("SELECT id FROM clients WHERE id=? FOR UPDATE",String.class,client);
        Naming n=of(client,jobId);
        if(n==null) throw Store.bad("这条成片还没有命名");
        if(n.revision()!=revision) throw new ResponseStatusException(HttpStatus.CONFLICT,"命名刚被别人改过，请刷新后再改");
        String p=str(productShort).trim();
        if(p.contains("-")||p.contains("－")) throw Store.bad("商品简称里不能有横线");
        p=p.replaceAll("\\s","");
        if(p.length()<2||p.length()>10) throw Store.bad("商品简称要 2 到 10 个字");
        String f=str(form).trim();if(f.isEmpty()) f="短视频";
        if(!FORMS.contains(f)) throw Store.bad("内容形式只能选图文、短视频或直播切片");
        if(n.creatorName()==null||n.creatorName().length()<2) throw Store.bad("这条成片不知道是谁出的，命名补不全");
        int v=version==null?next(client,n.date(),p,n.creatorName(),jobId):version;
        if(v<1||v>99) throw Store.bad("版本只能是 V1 到 V99");
        String name=compose(n.date(),p,f,n.creatorName(),v);
        if(!valid(name)) throw Store.bad("命名不符合规范："+name);
        Integer taken=s.db.queryForObject("SELECT COUNT(*) FROM job_names WHERE client_id=? AND standard_name=? AND job_id<>?",Integer.class,client,name,jobId);
        if(taken!=null&&taken>0) throw Store.bad("「"+name+"」已经有一条成片在用了，换个版本号");
        if(s.db.update("UPDATE job_names SET standard_name=?,product_short=?,content_form=?,version=?,problem='',revision=revision+1,updated_by=?,updated_at=? WHERE job_id=? AND client_id=? AND revision=?",
            name,p,f,v,user,Store.now(),jobId,client,revision)==0) throw new ResponseStatusException(HttpStatus.CONFLICT,"命名刚被别人改过，请刷新后再改");
        s.audit(client,user,"改成片命名",(n.standardName()==null?"未规范化":n.standardName())+" → "+name);
        return of(client,jobId);
    }
}
