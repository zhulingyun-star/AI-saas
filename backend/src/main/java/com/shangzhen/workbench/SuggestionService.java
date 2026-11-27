package com.shangzhen.workbench;

import com.fasterxml.jackson.core.type.TypeReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;
import java.util.*;
import static com.shangzhen.workbench.ProjectFlowService.str;

/**
 * 投放建议（PRD F8）：按每条成片的累计投放数据套四条规则，给出「建议…」，用户在系统里接受 / 忽略 / 标记已执行，自己去千川后台操作。
 * 系统只记录用户的决定，不调用任何千川接口、不执行任何操作；文案一律是「建议…」。
 * 触发：导入完成后扫一遍；另外每天早上扫一遍（app.suggestions.cron，复用项目已有的 @EnableScheduling）。
 * 同一条成片同一条规则：还有待处理的就更新它的数据；处理过的，要等有了更新的数据（数据截至日期变了）才会再提。
 * 规则的启停和阈值按客户存（suggestion_rules），第一次用时按 PRD 的默认值建好，四条默认都启用。
 */
@Service
public class SuggestionService {
    private static final Logger log=LoggerFactory.getLogger(SuggestionService.class);
    /** key、名称、建议类型、默认阈值（比例都是百分数，金额是元） */
    record Rule(String key,String name,String type,Map<String,Double> defaults,String condition) {}
    static final List<Rule> RULES=List.of(
        new Rule("HIGH_REFUND","高退款预警","STOP",ordered("refundRate1h",30.0,"minCost",100.0),"1 小时退款率 > {refundRate1h}% 且累计消耗 > {minCost} 元"),
        new Rule("HIGH_ROI","高 ROI 加码","INCREASE_BUDGET",ordered("netRoi",3.0,"netOrders",10.0,"days",3.0),"净成交 ROI ≥ {netRoi}、净成交订单 ≥ {netOrders}、数据 ≥ {days} 天"),
        new Rule("LOW_ROI","低效止损","ITERATE",ordered("netRoi",1.0,"minCost",500.0),"净成交 ROI < {netRoi} 且累计消耗 > {minCost} 元"),
        new Rule("LOW_SETTLE","结算率异常","CHECK",ordered("settleRate",50.0),"净结算率 < {settleRate}%"));
    static final Map<String,String> TYPE_LABEL=Map.of("STOP","建议停投","INCREASE_BUDGET","建议加预算","ITERATE","建议停投迭代","CHECK","建议检查");
    static final List<String> STATUSES=List.of("PENDING","ACCEPTED","REJECTED","DONE");
    private static Map<String,Double> ordered(Object... kv){Map<String,Double> m=new LinkedHashMap<>();for(int i=0;i<kv.length;i+=2) m.put((String)kv[i],(Double)kv[i+1]);return m;}

    private final Store s;private final AnalyticsService analytics;private final VideoLibraryService library;
    public SuggestionService(Store s,AnalyticsService analytics,VideoLibraryService library){this.s=s;this.analytics=analytics;this.library=library;}

    // ---------- 规则 ----------
    record Setting(Rule rule,boolean enabled,Map<String,Double> params,int revision,String updatedBy,String updatedAt) {}
    private void ensureRules(String client){
        Set<String> have=new HashSet<>(s.db.queryForList("SELECT rule_key FROM suggestion_rules WHERE client_id=?",String.class,client));
        for(Rule r:RULES) if(!have.contains(r.key())){
            try{s.db.update("INSERT INTO suggestion_rules(client_id,rule_key,enabled,params_json,revision,updated_by,updated_at) VALUES(?,?,TRUE,?,0,?,?)",client,r.key(),s.write(r.defaults()),"system",Store.now());}
            catch(org.springframework.dao.DuplicateKeyException e){/* 同时建好了 */}
        }
    }
    List<Setting> settings(String client){
        ensureRules(client);
        Map<String,Setting> by=new HashMap<>();
        s.db.query("SELECT * FROM suggestion_rules WHERE client_id=?",rs->{
            Rule rule=RULES.stream().filter(x->{try{return x.key().equals(rs.getString("rule_key"));}catch(java.sql.SQLException e){return false;}}).findFirst().orElse(null);
            if(rule==null) return;
            Map<String,Double> p=new LinkedHashMap<>(rule.defaults());
            try{p.putAll(s.read(rs.getString("params_json"),new TypeReference<Map<String,Double>>(){}));}catch(RuntimeException e){/* 坏了就用默认 */}
            p.keySet().retainAll(rule.defaults().keySet());
            by.put(rule.key(),new Setting(rule,rs.getBoolean("enabled"),p,rs.getInt("revision"),rs.getString("updated_by"),rs.getTimestamp("updated_at").toLocalDateTime().toString()));
        },client);
        return RULES.stream().map(r->by.get(r.key())).filter(Objects::nonNull).toList();
    }
    static String fmt(double v){return v==Math.floor(v)?String.valueOf((long)v):String.format(Locale.ROOT,"%.2f",v).replaceAll("0+$","").replaceAll("\\.$","");}
    static Map<String,Object> view(Setting st){
        Map<String,Object> m=new LinkedHashMap<>();
        m.put("key",st.rule().key());m.put("name",st.rule().name());m.put("type",st.rule().type());m.put("typeLabel",TYPE_LABEL.get(st.rule().type()));
        m.put("enabled",st.enabled());m.put("params",st.params());m.put("defaults",st.rule().defaults());
        String cond=st.rule().condition();for(var e:st.params().entrySet()) cond=cond.replace("{"+e.getKey()+"}",fmt(e.getValue()));
        m.put("condition",cond);m.put("revision",st.revision());m.put("updatedBy",st.updatedBy());m.put("updatedAt",st.updatedAt());
        return m;
    }
    public List<Map<String,Object>> rules(String client){return settings(client).stream().map(SuggestionService::view).toList();}
    @Transactional
    public Map<String,Object> updateRule(String client,String user,String key,boolean enabled,Map<String,Double> params,int revision){
        Setting st=settings(client).stream().filter(x->x.rule().key().equals(key)).findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"没有这条规则"));
        if(st.revision()!=revision) throw new ResponseStatusException(HttpStatus.CONFLICT,"这条规则刚被别人改过，请刷新后再改");
        Map<String,Double> next=new LinkedHashMap<>(st.params());
        if(params!=null) for(var e:params.entrySet()){
            if(!st.rule().defaults().containsKey(e.getKey())) throw Store.bad("这条规则没有「"+e.getKey()+"」这个阈值");
            Double v=e.getValue();
            if(v==null||v.isNaN()||v<0||v>1e9) throw Store.bad("阈值要是 0 以上的数字");
            if((e.getKey().equals("refundRate1h")||e.getKey().equals("settleRate"))&&v>100) throw Store.bad("比例是百分数，要在 0 到 100 之间");
            next.put(e.getKey(),Math.round(v*100)/100.0);
        }
        if(s.db.update("UPDATE suggestion_rules SET enabled=?,params_json=?,revision=revision+1,updated_by=?,updated_at=? WHERE client_id=? AND rule_key=? AND revision=?",enabled,s.write(next),user,Store.now(),client,key,revision)==0)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"这条规则刚被别人改过，请刷新后再改");
        s.audit(client,user,"改投放建议规则",st.rule().name()+" / "+(enabled?"启用":"停用")+" / "+s.write(next));
        return settings(client).stream().filter(x->x.rule().key().equals(key)).map(SuggestionService::view).findFirst().orElseThrow();
    }

    // ---------- 判断 ----------
    private static double n(Object v){return v==null?Double.NaN:((Number)v).doubleValue();}
    /** 一条成片的累计数字满足这条规则吗；满足就返回理由（「建议…」开头），不满足或数字不够判断就返回 null */
    static String judge(Rule rule,Map<String,Double> p,Map<String,Object> m){
        double cost=n(m.get("totalCost")),refund=n(m.get("refundRate1h")),roi=n(m.get("netRoi")),orders=n(m.get("netOrders")),days=n(m.get("dataDays")),settle=n(m.get("netSettleRate"));
        return switch(rule.key()){
            case "HIGH_REFUND"->refund>p.get("refundRate1h")&&cost>p.get("minCost")?"建议停投：1 小时退款率 "+fmt(refund)+"%，存在素材 / 人群错配风险":null;
            case "HIGH_ROI"->roi>=p.get("netRoi")&&orders>=p.get("netOrders")&&days>=p.get("days")?"建议加预算：净 ROI "+fmt(roi)+" 表现稳定，可复制 / 追投":null;
            case "LOW_ROI"->roi<p.get("netRoi")&&cost>p.get("minCost")?"建议停投迭代：投入产出比过低，累计消耗 ¥"+fmt(cost):null;
            case "LOW_SETTLE"->settle<p.get("settleRate")?"建议检查：净结算率仅 "+fmt(settle)+"%，退款吞噬过半成交":null;
            default->null;
        };
    }
    /** 扫一遍这个客户的所有成片，返回新提出的建议条数 */
    @Transactional
    public int scan(String client){
        List<Setting> on=settings(client).stream().filter(Setting::enabled).toList();
        if(on.isEmpty()) return 0;
        Set<String> alive=new HashSet<>(s.db.queryForList("SELECT id FROM jobs WHERE client_id=? AND output_name IS NOT NULL",String.class,client));
        int fresh=0;
        for(Map<String,Object> m:analytics.perJob(client)){
            String job=m.get("jobId").toString();if(!alive.contains(job)) continue;
            String through=str(m.get("to"));if(through.isEmpty()) continue;
            for(Setting st:on){
                String reason=judge(st.rule(),st.params(),m);
                if(reason==null) continue;
                Map<String,Object> snap=new LinkedHashMap<>();
                for(String k:List.of("totalCost","totalGmv","netGmv","netOrders","netRoi","netSettleRate","refundRate1h","overallRoi","dataDays","from","to")) snap.put(k,m.get(k));
                snap.put("rule",view(st).get("condition"));
                List<Object[]> last=s.db.query("SELECT id,status,data_through FROM campaign_suggestions WHERE client_id=? AND job_id=? AND rule_key=? ORDER BY created_at DESC,id DESC LIMIT 1",
                    (r,i)->new Object[]{r.getString(1),r.getString(2),r.getDate(3).toLocalDate().toString()},client,job,st.rule().key());
                var now=Store.now();
                if(!last.isEmpty()&&"PENDING".equals(last.get(0)[1])){
                    if(!through.equals(last.get(0)[2])) s.db.update("UPDATE campaign_suggestions SET reason=?,data_snapshot=?,data_through=?,revision=revision+1,updated_at=? WHERE id=?",reason,s.write(snap),LocalDate.parse(through),now,last.get(0)[0]);
                    continue;
                }
                if(!last.isEmpty()&&through.equals(last.get(0)[2])) continue;
                s.db.update("INSERT INTO campaign_suggestions(id,client_id,rule_key,job_id,suggestion_type,reason,data_snapshot,data_through,status,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'PENDING',0,?,?)",
                    Store.id(),client,st.rule().key(),job,st.rule().type(),reason,s.write(snap),LocalDate.parse(through),now,now);
                fresh++;
            }
        }
        return fresh;
    }
    /** 每天早上扫一遍有投放数据的客户（北京时间，默认 7:30；设成 "-" 就不扫） */
    @Scheduled(cron="${app.suggestions.cron:0 30 7 * * *}",zone="Asia/Shanghai")
    public void daily(){
        for(String client:s.db.queryForList("SELECT DISTINCT client_id FROM job_performance WHERE cost IS NOT NULL OR gmv IS NOT NULL",String.class)){
            try{scan(client);}catch(RuntimeException e){log.warn("投放建议每日扫描失败：client={} {}",client,e.getMessage());}
        }
    }

    // ---------- 列表和处理 ----------
    public Map<String,Object> list(String client,String rawStatus){
        String status=str(rawStatus).trim().toUpperCase(Locale.ROOT);
        if(!status.isEmpty()&&!status.equals("ALL")&&!STATUSES.contains(status)) throw Store.bad("状态只能是 PENDING、ACCEPTED、REJECTED、DONE 或 ALL");
        Map<String,Map<String,Object>> meta=new HashMap<>();
        for(Map<String,Object> v:(List<Map<String,Object>>)library.library(client).get("videos")) meta.put(v.get("id").toString(),v);
        Map<String,String> names=new HashMap<>();RULES.forEach(r->names.put(r.key(),r.name()));
        String sql="SELECT * FROM campaign_suggestions WHERE client_id=?"+(status.isEmpty()||status.equals("ALL")?"":" AND status=?")+" ORDER BY CASE WHEN status='PENDING' THEN 0 ELSE 1 END,created_at DESC,id LIMIT 500";
        Object[] args=status.isEmpty()||status.equals("ALL")?new Object[]{client}:new Object[]{client,status};
        List<Map<String,Object>> items=s.db.query(sql,(r,i)->{
            Map<String,Object> m=new LinkedHashMap<>();
            m.put("id",r.getString("id"));m.put("ruleKey",r.getString("rule_key"));m.put("ruleName",names.getOrDefault(r.getString("rule_key"),r.getString("rule_key")));
            m.put("type",r.getString("suggestion_type"));m.put("typeLabel",TYPE_LABEL.getOrDefault(r.getString("suggestion_type"),"建议"));
            m.put("reason",r.getString("reason"));m.put("snapshot",s.read(r.getString("data_snapshot"),new TypeReference<Map<String,Object>>(){}));
            m.put("dataThrough",r.getDate("data_through").toLocalDate().toString());m.put("status",r.getString("status"));m.put("revision",r.getInt("revision"));
            m.put("createdAt",r.getTimestamp("created_at").toLocalDateTime().toString());
            var at=r.getTimestamp("decided_at");m.put("decidedAt",at==null?null:at.toLocalDateTime().toString());m.put("decidedBy",r.getString("decided_by"));
            Map<String,Object> v=meta.get(r.getString("job_id"));
            Map<String,Object> job=new LinkedHashMap<>();job.put("id",r.getString("job_id"));
            if(v!=null){Map<?,?> p=(Map<?,?>)v.get("product");job.put("standardName",v.get("standardName"));job.put("title",v.get("projectName")+" · 第 "+v.get("no")+" 版");
                job.put("productName",p==null?"商品不在了":p.get("name"));job.put("coverId",p==null?null:p.get("coverId"));}
            else job.put("title","成片不在了");
            m.put("job",job);
            return m;
        },args);
        Map<String,Object> counts=new LinkedHashMap<>();
        for(String st:STATUSES) counts.put(st.toLowerCase(Locale.ROOT),0L);
        s.db.query("SELECT status,COUNT(*) FROM campaign_suggestions WHERE client_id=? GROUP BY status",rs->{counts.put(rs.getString(1).toLowerCase(Locale.ROOT),rs.getLong(2));},client);
        return Map.of("items",items,"counts",counts);
    }
    long pending(String client){
        Long n=s.db.queryForObject("SELECT COUNT(*) FROM campaign_suggestions WHERE client_id=? AND status='PENDING'",Long.class,client);
        return n==null?0:n;
    }
    /** 处理一条建议：待处理 → 已接受 / 已忽略 / 已执行；已接受 → 已执行。只记录，不做任何千川操作。 */
    @Transactional
    public Map<String,Object> decide(String client,String user,String id,String rawAction,int revision){
        String action=str(rawAction).trim().toUpperCase(Locale.ROOT);
        if(!List.of("ACCEPTED","REJECTED","DONE").contains(action)) throw Store.bad("只能选接受（accepted）、忽略（rejected）或已执行（done）");
        List<Object[]> cur=s.db.query("SELECT status,revision,reason FROM campaign_suggestions WHERE client_id=? AND id=?",(r,i)->new Object[]{r.getString(1),r.getInt(2),r.getString(3)},client,id);
        if(cur.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"这条建议不存在");
        String from=(String)cur.get(0)[0];
        if((int)cur.get(0)[1]!=revision) throw new ResponseStatusException(HttpStatus.CONFLICT,"这条建议刚被别人处理过，请刷新");
        boolean ok=from.equals("PENDING")||(from.equals("ACCEPTED")&&action.equals("DONE"));
        if(!ok) throw Store.bad(from.equals("ACCEPTED")?"已接受的建议只能再标记为已执行":"这条建议已经处理过了");
        var now=Store.now();
        if(s.db.update("UPDATE campaign_suggestions SET status=?,decided_at=?,decided_by=?,revision=revision+1,updated_at=? WHERE id=? AND client_id=? AND revision=?",action,now,user,now,id,client,revision)==0)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"这条建议刚被别人处理过，请刷新");
        s.audit(client,user,"处理投放建议",Map.of("ACCEPTED","接受","REJECTED","忽略","DONE","标记已执行").get(action)+" / "+cur.get(0)[2]);
        List<Map<String,Object>> items=(List<Map<String,Object>>)list(client,"ALL").get("items");
        return items.stream().filter(x->x.get("id").equals(id)).findFirst().orElseThrow();
    }
}
