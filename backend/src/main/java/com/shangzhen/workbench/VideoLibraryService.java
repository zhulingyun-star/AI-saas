package com.shangzhen.workbench;

import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.*;
import static com.shangzhen.workbench.Models.*;
import static com.shangzhen.workbench.ProjectFlowService.*;

/**
 * 资产库：所有项目出过的成片（jobs 里出好的那些版本），带来源（项目 / 方向 / 版本）、审片结果和投放数据。
 * 投放数据只来自用户手填或导入的表格（job_performance），没有就是没有；累计、「哪种赢了」「该换新了」都只按这些真实记录算。
 * 记录的增删改和表格导入在 PerformanceService。
 */
@Service
public class VideoLibraryService {
    static final ZoneId CN=ZoneId.of("Asia/Shanghai");
    /** 「该换新了」的三个信号 */
    static final double CTR_DROP=30,NEGATIVE_MAX=0.8,RETAIN_MIN=25;
    static final String LETTERS="ABC";
    private final Store s;private final ProjectFlowService flow;private final ProductAnalysisService analysis;private final NamingService naming;
    public VideoLibraryService(Store s,ProjectFlowService flow,ProductAnalysisService analysis,NamingService naming){this.s=s;this.flow=flow;this.analysis=analysis;this.naming=naming;}

    /** 一条投放记录；比例字段是百分数，金额是元，没填就是 null。账户、千川素材 ID 只有从千川表格导入的记录才有。 */
    public record Perf(String id,String jobId,LocalDate from,LocalDate to,Long impressions,Long clicks,Double retain3s,Double finishRate,Long productClicks,Long orders,
        Double gpm,Double roi,Double negativeRate,String note,String source,String importId,int revision,String updatedBy,String updatedAt,
        String accountId,String materialId,String materialName,Double cost,Double gmv,Double refundGmv,Long refundOrders,Double netGmv,Long netOrders,Double refundRate1h,Double coupon) {
        long imp(){return impressions==null?0:impressions;}
        long clk(){return clicks==null?0:clicks;}
        /** 这一条的整体投产比：有消耗和成交金额就按它们算，否则用表里填的投产比 */
        Double overallRoi(){return cost!=null&&gmv!=null&&cost>0?Double.valueOf(gmv/cost):roi;}
    }
    private static Double dec(java.math.BigDecimal v){return v==null?null:v.doubleValue();}
    private static Long lng(java.sql.ResultSet r,String c) throws java.sql.SQLException {long v=r.getLong(c);return r.wasNull()?null:v;}
    final org.springframework.jdbc.core.RowMapper<Perf> perfRows=(r,n)->new Perf(r.getString("id"),r.getString("job_id"),r.getDate("date_from").toLocalDate(),r.getDate("date_to").toLocalDate(),
        lng(r,"impressions"),lng(r,"clicks"),dec(r.getBigDecimal("retain_3s")),dec(r.getBigDecimal("finish_rate")),lng(r,"product_clicks"),lng(r,"orders"),
        dec(r.getBigDecimal("gpm")),dec(r.getBigDecimal("roi")),dec(r.getBigDecimal("negative_rate")),r.getString("note"),r.getString("source"),r.getString("import_id"),
        r.getInt("revision"),r.getString("updated_by"),r.getTimestamp("updated_at").toLocalDateTime().toString(),
        r.getString("account_id"),r.getString("material_id"),r.getString("material_name"),dec(r.getBigDecimal("cost")),dec(r.getBigDecimal("gmv")),dec(r.getBigDecimal("refund_gmv")),lng(r,"refund_orders"),
        dec(r.getBigDecimal("net_gmv")),lng(r,"net_orders"),dec(r.getBigDecimal("refund_rate_1h")),dec(r.getBigDecimal("coupon")));
    List<Perf> records(String client,String job){
        return s.db.query("SELECT * FROM job_performance WHERE client_id=? AND job_id=? ORDER BY date_from,date_to,created_at",perfRows,client,job);
    }
    Map<String,List<Perf>> allRecords(String client){
        Map<String,List<Perf>> out=new HashMap<>();
        for(Perf p:s.db.query("SELECT * FROM job_performance WHERE client_id=? ORDER BY date_from,date_to,created_at",perfRows,client)) out.computeIfAbsent(p.jobId(),k->new ArrayList<>()).add(p);
        return out;
    }

    // ---------- 累计和「该换新了」 ----------
    static Double round(Double v,int scale){if(v==null||v.isNaN()||v.isInfinite()) return null;double f=Math.pow(10,scale);return Math.round(v*f)/f;}
    /** 按曝光加权；曝光都是 0 或没填时没法加权，返回 null */
    private static Double weighted(List<Perf> rows,java.util.function.Function<Perf,Double> f){
        double w=0,sum=0;
        for(Perf p:rows){Double v=f.apply(p);if(v==null||p.imp()<=0) continue;w+=p.imp();sum+=v*p.imp();}
        return w>0?sum/w:null;
    }
    private static Double sumD(List<Perf> rows,java.util.function.Function<Perf,Double> f){
        Double out=null;for(Perf p:rows){Double v=f.apply(p);if(v!=null) out=(out==null?0:out)+v;}return out==null?null:round(out,2);
    }
    private static Long sumL(List<Perf> rows,java.util.function.Function<Perf,Long> f){
        Long out=null;for(Perf p:rows){Long v=f.apply(p);if(v!=null) out=(out==null?0:out)+v;}return out;
    }
    /** Σa ÷ Σb，只用两项都有的记录；分母是 0 时算不出来 */
    private static Double quotient(List<Perf> rows,java.util.function.Function<Perf,Double> a,java.util.function.Function<Perf,Double> b){
        double x=0,y=0;boolean any=false;
        for(Perf p:rows){Double u=a.apply(p),v=b.apply(p);if(u==null||v==null) continue;x+=u;y+=v;any=true;}
        return any&&y>0?x/y:null;
    }
    /**
     * 累计：数量和金额直接加；点击率 = 点击 ÷ 曝光，转化率 = 成交单数 ÷ 点击（只算填了成交单数的记录）；
     * 投产比：有消耗的记录按消耗加权（= 成交金额 ÷ 消耗），一条消耗都没有时按曝光加权；3 秒留存、完播率、千次曝光成交额、负反馈率按曝光加权。
     * 净成交 ROI = 净成交金额 ÷ 消耗、净结算率 = 净成交金额 ÷ 成交金额（百分数），都只用两项都有的记录；1 小时退款率取记录的平均。
     */
    static Map<String,Object> summary(List<Perf> rows){
        if(rows==null||rows.isEmpty()) return null;
        long imp=0,clk=0,ord=0,ordClk=0,pclk=0;boolean hasImp=false,hasOrd=false,hasPclk=false;
        LocalDate from=rows.get(0).from(),to=rows.get(0).to();
        for(Perf p:rows){
            if(p.impressions()!=null){hasImp=true;imp+=p.impressions();clk+=p.clk();}
            if(p.orders()!=null){hasOrd=true;ord+=p.orders();ordClk+=p.clk();}
            if(p.productClicks()!=null){hasPclk=true;pclk+=p.productClicks();}
            if(p.from().isBefore(from)) from=p.from();if(p.to().isAfter(to)) to=p.to();
        }
        Map<String,Object> m=new LinkedHashMap<>();
        m.put("records",rows.size());m.put("from",from.toString());m.put("to",to.toString());
        m.put("impressions",hasImp?imp:null);m.put("clicks",hasImp?clk:null);m.put("productClicks",hasPclk?pclk:null);m.put("orders",hasOrd?ord:null);
        m.put("ctr",imp>0?round(clk*100.0/imp,4):null);
        m.put("cvr",hasOrd&&ordClk>0?round(ord*100.0/ordClk,4):null);
        m.put("retain3s",round(weighted(rows,Perf::retain3s),2));m.put("finishRate",round(weighted(rows,Perf::finishRate),2));
        m.put("gpm",round(weighted(rows,Perf::gpm),2));
        Double byCost=quotient(rows,p->p.overallRoi()==null||p.cost()==null?null:p.overallRoi()*p.cost(),p->p.overallRoi()==null?null:p.cost());
        m.put("roi",round(byCost!=null?byCost:weighted(rows,Perf::roi),2));
        m.put("negativeRate",round(weighted(rows,Perf::negativeRate),3));
        m.put("cost",sumD(rows,Perf::cost));m.put("gmv",sumD(rows,Perf::gmv));m.put("netGmv",sumD(rows,Perf::netGmv));m.put("netOrders",sumL(rows,Perf::netOrders));
        m.put("netRoi",round(quotient(rows,Perf::netGmv,p->p.netGmv()==null?null:p.cost()),2));
        Double settle=quotient(rows,p->p.gmv()==null?null:p.netGmv(),p->p.netGmv()==null?null:p.gmv());
        m.put("netSettleRate",settle==null?null:round(settle*100,2));
        List<Double> rr=rows.stream().map(Perf::refundRate1h).filter(Objects::nonNull).toList();
        m.put("refundRate1h",rr.isEmpty()?null:round(rr.stream().mapToDouble(x->x).average().orElse(0),2));
        return m;
    }
    /** 同一天（同一段日期）有好几条记录（不同千川账户 / 素材）时合成一个点：曝光、点击相加，比例按曝光加权 */
    static List<Perf> byDay(List<Perf> rows){
        Map<String,List<Perf>> g=new LinkedHashMap<>();
        for(Perf p:rows) g.computeIfAbsent(p.from()+"|"+p.to(),k->new ArrayList<>()).add(p);
        List<Perf> out=new ArrayList<>();
        for(List<Perf> l:g.values()){
            if(l.size()==1){out.add(l.get(0));continue;}
            Perf a=l.get(0);
            out.add(new Perf(a.id(),a.jobId(),a.from(),a.to(),sumL(l,Perf::impressions),sumL(l,Perf::clicks),weighted(l,Perf::retain3s),weighted(l,Perf::finishRate),sumL(l,Perf::productClicks),sumL(l,Perf::orders),
                weighted(l,Perf::gpm),weighted(l,Perf::roi),weighted(l,Perf::negativeRate),"",a.source(),null,0,"","",null,null,null,null,null,null,null,null,null,null,null));
        }
        return out;
    }
    private static double avg(List<Perf> rows,java.util.function.Function<Perf,Double> f){return rows.stream().mapToDouble(x->f.apply(x)).average().orElse(0);}
    private static double ctr(Perf p){return p.clk()*100.0/p.imp();}
    private static String f1(double v){return String.format(Locale.ROOT,"%.1f",v);}
    /**
     * 该换新了：按日期排好的记录里，只看曝光大于 0 的，至少 3 条才判断，少于 3 条返回 null（还判断不了）。
     * 1. 点击率掉了 30% 以上：最近 7 条里有 6 条以上时，后 3 条的平均点击率比前 3 条低 30% 以上；
     * 2. 负反馈超过 0.8%：最近 3 条里填了负反馈率的平均；
     * 3. 有效播放低于 25%：表里没有「有效播放」，用最近 3 条的 3 秒留存平均代替。
     * 每条记录算一个点（按天填最准）。
     */
    static List<Map<String,Object>> signals(List<Perf> sorted){
        List<Perf> rows=sorted==null?List.of():byDay(sorted).stream().filter(p->p.imp()>0).sorted(Comparator.comparing(Perf::from).thenComparing(Perf::to)).toList();
        if(rows.size()<3) return null;
        List<Map<String,Object>> out=new ArrayList<>();
        List<Perf> last7=rows.subList(Math.max(0,rows.size()-7),rows.size()),last3=rows.subList(rows.size()-3,rows.size());
        if(last7.size()>=6){
            double a=avg(last7.subList(0,3),VideoLibraryService::ctr),b=avg(last7.subList(last7.size()-3,last7.size()),VideoLibraryService::ctr);
            double d=a>0?(a-b)/a*100:0;
            out.add(signal("ctrDrop","点击率掉了 30% 以上",d>=CTR_DROP,"最近 "+last7.size()+" 条记录里，后 3 条平均点击率 "+f1(b)+"%，"+(d>0?"比前 3 条的 "+f1(a)+"% 低了 "+Math.round(d)+"%":"比前 3 条的 "+f1(a)+"% 没有下降")));
        }
        List<Perf> neg=last3.stream().filter(p->p.negativeRate()!=null).toList();
        if(!neg.isEmpty()){double x=avg(neg,Perf::negativeRate);out.add(signal("negative","负反馈超过 0.8%",x>NEGATIVE_MAX,"最近 "+neg.size()+" 条记录的平均负反馈率 "+String.format(Locale.ROOT,"%.2f",x)+"%"));}
        List<Perf> r3=last3.stream().filter(p->p.retain3s()!=null).toList();
        if(!r3.isEmpty()){double x=avg(r3,Perf::retain3s);out.add(signal("retain","有效播放低于 25%",x<RETAIN_MIN,"最近 "+r3.size()+" 条记录的 3 秒留存平均 "+Math.round(x)+"%（表里没有「有效播放」这一项，先用 3 秒留存看）"));}
        return out;
    }
    private static Map<String,Object> signal(String key,String title,boolean hit,String detail){
        Map<String,Object> m=new LinkedHashMap<>();m.put("key",key);m.put("title",title);m.put("hit",hit);m.put("detail",detail);return m;
    }
    static List<String> tired(List<Perf> rows){
        List<Map<String,Object>> sig=signals(rows);
        return sig==null?List.of():sig.stream().filter(x->Boolean.TRUE.equals(x.get("hit"))).map(x->x.get("title").toString()).toList();
    }

    // ---------- 成片列表 ----------
    record JobSnap(String id,String project,String status,int revision,boolean output,String message,Project snap,LocalDateTime created,LocalDateTime updated) {}
    record Dir(String id,String project,DirectionFlowService.Direction data,boolean selected,int selectOrder) {}
    private final class Ctx {
        final String client;final Map<String,Project> projects=new HashMap<>();final Map<String,Asset> assets;final Map<String,Map<String,Object>> verdicts;
        final Map<String,Dir> dirs=new HashMap<>();final Map<String,String> letters=new HashMap<>();final Map<String,String[]> refProfiles=new HashMap<>();
        final Map<String,List<Perf>> perf;final Map<String,Boolean> prices=new HashMap<>();final Map<String,Integer> numbers=new HashMap<>();final Map<String,NamingService.Naming> names;
        Ctx(String client,List<JobSnap> jobs){
            this.client=client;
            for(Project p:s.db.query("SELECT * FROM projects WHERE client_id=?",s.projects,client)) projects.put(p.id(),p);
            assets=flow.assets(client);verdicts=flow.verdicts(client);perf=allRecords(client);names=naming.all(client);
            s.db.query("SELECT id,project_id,data_json,selected,select_order FROM project_directions WHERE client_id=?",rs->{
                dirs.put(rs.getString(1),new Dir(rs.getString(1),rs.getString(2),s.read(rs.getString(3),new TypeReference<DirectionFlowService.Direction>(){}),rs.getBoolean(4),rs.getInt(5)));
            },client);
            Map<String,List<Dir>> picked=new HashMap<>();
            for(Dir d:dirs.values()) if(d.selected()) picked.computeIfAbsent(d.project(),k->new ArrayList<>()).add(d);
            picked.values().forEach(l->{l.sort(Comparator.comparingInt(Dir::selectOrder));for(int i=0;i<l.size()&&i<LETTERS.length();i++) letters.put(l.get(i).id(),String.valueOf(LETTERS.charAt(i)));});
            s.db.query("SELECT asset_id,hook,display_name FROM reference_profiles WHERE client_id=?",rs->{refProfiles.put(rs.getString(1),new String[]{str(rs.getString(2)),str(rs.getString(3))});},client);
            // 版本号：框架模式每个方向从 1 数；一键成片按项目顺序数；其他按出片序号（和项目详情一致）
            Map<String,Integer> count=new HashMap<>();
            for(JobSnap j:jobs.stream().sorted(Comparator.comparing(JobSnap::created).thenComparing(JobSnap::id)).toList()){
                Project p=projects.get(j.project());String m=p==null?"OTHER":mode(p);
                if(m.equals("FRAMEWORK")) numbers.put(j.id(),count.merge(j.project()+"|"+(j.snap()==null?"":str(j.snap().config().get("directionId"))),1,Integer::sum));
                else if(m.equals("ONE_CLICK")) numbers.put(j.id(),count.merge(j.project(),1,Integer::sum));
                else numbers.put(j.id(),j.revision());
            }
        }
        boolean hasPrice(String anchor){
            return prices.computeIfAbsent(anchor,a->{
                try{Object r=analysis.get(client,a).get("report");return r!=null&&ProjectFlowService.hasPrice(s.write(r));}catch(RuntimeException e){return false;}
            });
        }
    }
    List<JobSnap> jobs(String client,String only){
        String sql="SELECT id,project_id,status,revision,output_name,message,snapshot,created_at,updated_at FROM jobs WHERE client_id=?"+(only==null?"":" AND id=?");
        Object[] args=only==null?new Object[]{client}:new Object[]{client,only};
        return s.db.query(sql,(r,n)->{
            Project snap;
            try{snap=s.snapshot(r.getString(7));}catch(RuntimeException e){snap=null;}
            return new JobSnap(r.getString(1),r.getString(2),r.getString(3),r.getInt(4),r.getString(5)!=null,str(r.getString(6)),snap,r.getTimestamp(8).toLocalDateTime(),r.getTimestamp(9).toLocalDateTime());
        },args).stream().map(j->j.snap()!=null?j:new JobSnap(j.id(),j.project(),j.status(),j.revision(),j.output(),j.message(),null,j.created(),j.updated())).toList();
    }
    /** 视频编号：任务编号去掉横线的前 8 位，投放时写进投放用名，导入表格时据此对上 */
    static String code(String jobId){return jobId.replace("-","").substring(0,Math.min(8,jobId.replace("-","").length())).toLowerCase(Locale.ROOT);}
    private static String part(String v,String empty){String t=str(v).replaceAll("\\s+","").replace("_","-");return t.isEmpty()?empty:t;}
    /** 投放用名：商品_开头类型_人群_场景_时长_版本_视频编号。投放时用它给素材命名，导入表格时先按它对。 */
    static String adName(String product,String hook,String persona,String scene,int duration,int no,String code){
        return String.join("_",part(product,"未命名商品"),part(hook,"未标开头"),part(persona,"未标人群"),part(scene,"未标场景"),duration+"秒","v"+no,code);
    }
    private Map<String,Object> item(Ctx c,JobSnap j){
        Project cur=c.projects.get(j.project());Project snap=j.snap()!=null?j.snap():cur;
        if(cur==null||snap==null) return null;
        String m=mode(cur);
        Map<String,Object> v=new LinkedHashMap<>();
        v.put("id",j.id());v.put("code",code(j.id()));
        v.put("projectId",cur.id());v.put("projectName",cur.name());v.put("mode",m);
        boolean flowOk=flowable(cur,c.assets);
        v.put("projectFlow",flowOk);v.put("projectPath",flowOk?"/p/"+cur.id():legacyPath(cur));
        int no=c.numbers.getOrDefault(j.id(),j.revision());
        v.put("no",no);v.put("jobNo",j.revision());
        v.put("status",j.status());v.put("message",j.message());v.put("hasOutput",j.output());
        v.put("createdAt",j.created().toString());v.put("updatedAt",j.updated().toString());
        v.put("ratio",ratio(snap));v.put("resolution",resolution(snap));v.put("duration",snap.duration());
        v.put("note",str(snap.config().get("changeNote")));
        Map<String,Object> product=flow.productCard(c.assets.get(anchorOf(snap)),c.assets);
        if(product==null) product=flow.productCard(c.assets.get(anchorOf(cur)),c.assets);
        v.put("product",product==null?null:Map.of("anchorId",product.get("anchorId"),"name",product.get("name"),"coverId",Objects.toString(product.get("coverId"),"")));
        String hook="",persona=str(snap.config().get("personaName")),scene="",content="",dirTitle="",dirId=str(snap.config().get("directionId"));
        Map<String,Object> reference=null;
        if(m.equals("REMAKE")){
            Asset ref=c.assets.get(referenceId(snap));
            if(ref!=null&&ref.kind().equals("REFERENCE")){
                String[] prof=c.refProfiles.getOrDefault(ref.id(),new String[]{"",""});
                hook=prof[0];reference=Map.of("assetId",ref.id(),"name",prof[1].isBlank()?ref.name():prof[1]);
            }
        } else if(!dirId.isEmpty()){
            Dir d=c.dirs.get(dirId);
            dirTitle=str(snap.config().get("directionTitle"));
            if(d!=null){
                hook=d.data().hook();scene=d.data().scene();content=d.data().contentType();
                if(dirTitle.isEmpty()) dirTitle=d.data().title();
                if(persona.isEmpty()) persona=d.data().personaName();
            }
            if(snap.config().get("oneClickSnapshot") instanceof Map<?,?> oc&&!str(oc.get("personaName")).isBlank()) persona=str(oc.get("personaName"));
        }
        v.put("reference",reference);
        v.put("direction",dirId.isEmpty()?null:Map.of("id",dirId,"title",dirTitle,"letter",m.equals("FRAMEWORK")?c.letters.getOrDefault(dirId,""):""));
        v.put("hook",str(hook));v.put("personaName",str(persona));v.put("scene",str(scene));v.put("contentType",str(content));
        v.put("verdict",c.verdicts.get(j.id()));
        String anchor=product==null?"":str(product.get("anchorId"));
        v.put("hasPrice",!anchor.isEmpty()&&c.hasPrice(anchor));
        v.put("adName",adName(product==null?"":str(product.get("name")),hook,persona,scene,snap.duration(),no,code(j.id())));
        NamingService.Naming nm=c.names.get(j.id());
        v.put("standardName",nm==null?null:nm.standardName());v.put("naming",NamingService.view(nm));
        List<Perf> rows=c.perf.getOrDefault(j.id(),List.of());
        v.put("perf",summary(rows));v.put("tired",tired(rows));
        return v;
    }
    /** 资产库列表：只列出好了的版本（有成片文件），新的在前；没出好的版本只给个数 */
    public Map<String,Object> library(String client){
        naming.ensure(client);
        List<JobSnap> jobs=jobs(client,null);Ctx c=new Ctx(client,jobs);
        List<Map<String,Object>> videos=new ArrayList<>();int pending=0;
        for(JobSnap j:jobs.stream().sorted(Comparator.comparing(JobSnap::created).thenComparing(JobSnap::id).reversed()).toList()){
            if(!j.output()){pending++;continue;}
            Map<String,Object> v=item(c,j);if(v!=null) videos.add(v);
        }
        Map<String,Object> out=new LinkedHashMap<>();
        out.put("videos",videos);out.put("pendingVersions",pending);out.put("hooks",ProductLibraryService.HOOKS);
        return out;
    }
    /** 一条成片的详情：来源、出片词、审片、投放记录、累计和「该换新了」的每个信号 */
    public Map<String,Object> detail(String client,String jobId){
        naming.ensure(client);
        List<JobSnap> one=jobs(client,jobId);
        if(one.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"这条成片不存在");
        JobSnap j=one.get(0);
        List<JobSnap> sameProject=jobs(client,null).stream().filter(x->x.project().equals(j.project())).toList();
        Ctx c=new Ctx(client,sameProject);
        Map<String,Object> v=item(c,j);
        if(v==null) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"这条成片的项目不在了");
        Project snap=j.snap()!=null?j.snap():c.projects.get(j.project());
        v.put("segments",segmentsOf(snap,s));
        v.put("carriedReasons",snap.config().get("carriedReasons") instanceof List<?> l?l:List.of());
        List<Perf> rows=c.perf.getOrDefault(j.id(),List.of());
        List<Perf> desc=new ArrayList<>(rows);desc.sort(Comparator.comparing(Perf::from).thenComparing(Perf::to).reversed());
        v.put("records",desc);v.put("signals",signals(rows));
        v.put("madeOn",madeOn(j.created()).toString());
        return v;
    }
    /** 成片生成的那天（按北京时间），投放数据不能早于这天 */
    static LocalDate madeOn(LocalDateTime utc){return utc.atOffset(ZoneOffset.UTC).atZoneSameInstant(CN).toLocalDate();}
    static LocalDate today(){return LocalDate.now(CN);}
}
