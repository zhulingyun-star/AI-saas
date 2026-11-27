package com.shangzhen.workbench;

import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.*;
import static com.shangzhen.workbench.ProjectFlowService.str;

/**
 * 投流看板（PRD F4 / F5 / F6 / F7 / F9）：按成片（素材）、商品、千川账户聚合 job_performance 里的真实数字。
 * 聚合都在 SQL 里做（按 client_id + 日期走索引）。只算有消耗或成交金额的记录（千川报表或手填了这两项的），只有曝光点击的记录不进看板。
 * 净成交 ROI = Σ净成交金额 ÷ Σ消耗、净结算率 = Σ净成交金额 ÷ Σ成交金额、整体 ROI = Σ成交金额 ÷ Σ消耗（都只用两项都有的记录）；
 * 1 小时退款率取记录的平均；比例都是百分数。没有数据就是 null，不估算、不预测。
 * 日期筛选：记录整段都落在 [start, end] 里才算（手填的一段日期不拆）。数据天数 = 有数据的不同开始日期数。
 */
@Service
public class AnalyticsService {
    static final int PAGE=50,EXPORT_MAX=20000;
    private final Store s;private final VideoLibraryService library;private final AccountService accounts;
    public AnalyticsService(Store s,VideoLibraryService library,AccountService accounts){this.s=s;this.library=library;this.accounts=accounts;}

    public record Filter(LocalDate start,LocalDate end,String accountId,String product,String creator,String job) {
        static Filter of(String start,String end,String accountId,String product,String creator,String job){
            return new Filter(day(start,"开始日期"),day(end,"结束日期"),blank(accountId),blank(product),blank(creator),blank(job));
        }
        private static String blank(String v){String t=str(v).trim();return t.isEmpty()?null:t;}
        private static LocalDate day(String v,String label){
            String t=str(v).trim();if(t.isEmpty()) return null;
            try{return LocalDate.parse(t);}catch(DateTimeParseException e){throw Store.bad(label+"要写成 2026-11-15 这样");}
        }
        Map<String,Object> view(){
            Map<String,Object> m=new LinkedHashMap<>();
            m.put("start",start==null?null:start.toString());m.put("end",end==null?null:end.toString());
            m.put("accountId",accountId);m.put("product",product);m.put("creator",creator);m.put("job",job);
            return m;
        }
    }
    private record Where(String sql,List<Object> args) {}
    private static Where where(String client,Filter f){
        StringBuilder w=new StringBuilder(" WHERE p.client_id=? AND (p.cost IS NOT NULL OR p.gmv IS NOT NULL)");List<Object> a=new ArrayList<>(List.of(client));
        if(f.start()!=null){w.append(" AND p.date_from>=?");a.add(f.start());}
        if(f.end()!=null){w.append(" AND p.date_to<=?");a.add(f.end());}
        if(f.accountId()!=null){w.append(" AND p.account_id=?");a.add(f.accountId());}
        if(f.product()!=null){w.append(" AND n.product_anchor=?");a.add(f.product());}
        if(f.creator()!=null){w.append(" AND n.creator_user=?");a.add(f.creator());}
        if(f.job()!=null){w.append(" AND p.job_id=?");a.add(f.job());}
        return new Where(w.toString(),a);
    }
    /** 同一组聚合列（按成片、按商品、按账户、汇总共用） */
    static final String MEASURES="SUM(p.cost) cost,SUM(p.gmv) gmv,SUM(p.orders) orders,SUM(p.net_gmv) net_gmv,SUM(p.net_orders) net_orders,SUM(p.coupon) coupon,"
        +"SUM(CASE WHEN p.net_gmv IS NOT NULL THEN p.cost END) nr_cost,SUM(CASE WHEN p.cost IS NOT NULL THEN p.net_gmv END) nr_gmv,"
        +"SUM(CASE WHEN p.net_gmv IS NOT NULL THEN p.gmv END) st_gmv,SUM(CASE WHEN p.gmv IS NOT NULL THEN p.net_gmv END) st_net,"
        +"SUM(CASE WHEN p.gmv IS NOT NULL THEN p.cost END) ov_cost,SUM(CASE WHEN p.cost IS NOT NULL THEN p.gmv END) ov_gmv,"
        +"AVG(p.refund_rate_1h) refund_rate,COUNT(DISTINCT p.date_from) days,MIN(p.date_from) first_day,MAX(p.date_to) last_day";
    static final String RATIOS="a.nr_gmv/NULLIF(a.nr_cost,0) net_roi,a.st_net*100/NULLIF(a.st_gmv,0) settle,a.ov_gmv/NULLIF(a.ov_cost,0) overall_roi";
    static final String FROM=" FROM job_performance p LEFT JOIN job_names n ON n.job_id=p.job_id";
    /** 能排序的列（接口参数 → SQL 列名） */
    static final Map<String,String> SORTS=Map.ofEntries(Map.entry("netRoi","net_roi"),Map.entry("netGmv","net_gmv"),Map.entry("netOrders","net_orders"),Map.entry("netSettleRate","settle"),
        Map.entry("refundRate1h","refund_rate"),Map.entry("overallRoi","overall_roi"),Map.entry("totalGmv","gmv"),Map.entry("totalCost","cost"),Map.entry("dataDays","days"),
        Map.entry("standardName","sname"),Map.entry("lastDay","last_day"));

    private static Double d(Object v){return v==null?null:((Number)v).doubleValue();}
    private static Double r(Object v,int scale){return VideoLibraryService.round(d(v),scale);}
    private static Long l(Object v){return v==null?null:((Number)v).longValue();}
    private static String day(Object v){return v==null?null:v instanceof java.sql.Date x?x.toLocalDate().toString():v.toString().substring(0,10);}
    /** 一行聚合结果 → 接口字段 */
    static Map<String,Object> measures(Map<String,Object> row){
        Map<String,Object> m=new LinkedHashMap<>();
        m.put("netRoi",r(row.get("net_roi"),2));m.put("netGmv",r(row.get("net_gmv"),2));m.put("netOrders",l(row.get("net_orders")));
        m.put("netSettleRate",r(row.get("settle"),2));m.put("refundRate1h",r(row.get("refund_rate"),2));
        m.put("overallRoi",r(row.get("overall_roi"),2));m.put("totalGmv",r(row.get("gmv"),2));m.put("totalCost",r(row.get("cost"),2));m.put("totalOrders",l(row.get("orders")));
        m.put("coupon",r(row.get("coupon"),2));
        m.put("dataDays",l(row.get("days")));m.put("from",day(row.get("first_day")));m.put("to",day(row.get("last_day")));
        return m;
    }
    private static Map<String,Object> lower(Map<String,Object> row){Map<String,Object> m=new HashMap<>();row.forEach((k,v)->m.put(k.toLowerCase(Locale.ROOT),v));return m;}

    /** 成片的展示信息（命名、封面、商品、创作者），来自资产库列表 */
    private Map<String,Map<String,Object>> meta(String client){
        Map<String,Map<String,Object>> out=new HashMap<>();
        for(Map<String,Object> v:(List<Map<String,Object>>)library.library(client).get("videos")) out.put(v.get("id").toString(),v);
        return out;
    }
    private static Map<String,Object> material(String jobId,Map<String,Object> v){
        Map<String,Object> m=new LinkedHashMap<>();
        m.put("jobId",jobId);
        if(v==null){m.put("standardName",null);m.put("title","成片不在了");return m;}
        Map<?,?> product=(Map<?,?>)v.get("product");Map<?,?> naming=(Map<?,?>)v.get("naming");
        m.put("standardName",v.get("standardName"));
        m.put("title",v.get("projectName")+" · 第 "+v.get("no")+" 版");
        m.put("productId",product==null?null:product.get("anchorId"));m.put("productName",product==null?"商品不在了":product.get("name"));
        m.put("coverId",product==null?null:product.get("coverId"));
        m.put("creator",naming==null?null:naming.get("creator"));
        m.put("ratio",v.get("ratio"));
        return m;
    }

    // ---------- 素材维度 ----------
    public Map<String,Object> materials(String client,Filter f,String sort,String order,int page,int size){
        String col=SORTS.getOrDefault(str(sort),"net_gmv");
        String dir="asc".equalsIgnoreCase(str(order))?"ASC":"DESC";
        int pageSize=Math.max(1,Math.min(size<=0?PAGE:size,500));int p=Math.max(1,page);
        Where w=where(client,f);
        String agg="SELECT p.job_id,MAX(n.standard_name) sname,"+MEASURES+FROM+w.sql()+" GROUP BY p.job_id";
        Long total=s.db.queryForObject("SELECT COUNT(*) FROM ("+agg+") t",Long.class,w.args().toArray());
        List<Object> args=new ArrayList<>(w.args());args.add(pageSize);args.add((p-1)*pageSize);
        List<Map<String,Object>> rows=s.db.queryForList("SELECT a.*,"+RATIOS+" FROM ("+agg+") a ORDER BY "+col+" "+dir+" NULLS LAST,a.job_id LIMIT ? OFFSET ?",args.toArray());
        Map<String,Map<String,Object>> meta=meta(client);
        List<Map<String,Object>> items=new ArrayList<>();
        for(Map<String,Object> raw:rows){Map<String,Object> x=lower(raw);Map<String,Object> m=material(x.get("job_id").toString(),meta.get(x.get("job_id").toString()));m.putAll(measures(x));items.add(m);}
        Map<String,Object> out=new LinkedHashMap<>();
        out.put("summary",summary(client,f));out.put("items",items);out.put("total",total==null?0:total);out.put("page",p);out.put("pageSize",pageSize);
        out.put("sort",SORTS.entrySet().stream().filter(e->e.getValue().equals(col)).map(Map.Entry::getKey).findFirst().orElse("netGmv"));out.put("order",dir.toLowerCase(Locale.ROOT));
        out.put("filter",f.view());out.put("options",options(client,meta));
        return out;
    }
    /** 汇总卡：总消耗、净成交金额、净成交订单、平均净 ROI（= Σ净成交 ÷ Σ消耗）、平均 1 小时退款率、素材数 */
    public Map<String,Object> summary(String client,Filter f){
        Where w=where(client,f);
        Map<String,Object> x=lower(s.db.queryForMap("SELECT a.*,"+RATIOS+" FROM (SELECT COUNT(DISTINCT p.job_id) materials,"+MEASURES+FROM+w.sql()+") a",w.args().toArray()));
        Map<String,Object> m=new LinkedHashMap<>();
        m.put("totalCost",r(x.get("cost"),2));m.put("netGmv",r(x.get("net_gmv"),2));m.put("netOrders",l(x.get("net_orders")));
        m.put("avgNetRoi",r(x.get("net_roi"),2));m.put("avgRefundRate1h",r(x.get("refund_rate"),2));m.put("materialCount",l(x.get("materials")));
        m.put("totalGmv",r(x.get("gmv"),2));m.put("overallRoi",r(x.get("overall_roi"),2));m.put("netSettleRate",r(x.get("settle"),2));
        m.put("from",day(x.get("first_day")));m.put("to",day(x.get("last_day")));
        return m;
    }
    /** 筛选下拉：账户、商品、创作者（只列出有数据的商品和创作者） */
    private Map<String,Object> options(String client,Map<String,Map<String,Object>> meta){
        Map<String,Object> o=new LinkedHashMap<>();
        o.put("accounts",accounts.list(client).stream().map(a->Map.of("id",a.id(),"name",a.name(),"advertiserId",a.advertiserId())).toList());
        Map<String,String> products=new LinkedHashMap<>(),creators=new LinkedHashMap<>();
        s.db.query("SELECT DISTINCT n.product_anchor,n.creator_user,n.creator_name,p.job_id"+FROM+" WHERE p.client_id=? AND (p.cost IS NOT NULL OR p.gmv IS NOT NULL)",rs->{
            String a=rs.getString(1);Map<String,Object> v=meta.get(rs.getString(4));
            if(a!=null&&v!=null&&v.get("product") instanceof Map<?,?> pm) products.putIfAbsent(a,str(pm.get("name")));
            if(rs.getString(2)!=null) creators.putIfAbsent(rs.getString(2),str(rs.getString(3)));
        },client);
        o.put("products",products.entrySet().stream().map(e->Map.of("id",e.getKey(),"name",e.getValue())).toList());
        o.put("creators",creators.entrySet().stream().map(e->Map.of("id",e.getKey(),"name",e.getValue().isEmpty()?e.getKey():e.getValue())).toList());
        return o;
    }

    // ---------- 商品维度：只给素材数和素材合计净成交（商品整体 ROI 混了不是本系统做的素材，不展示） ----------
    public Map<String,Object> products(String client,Filter f){
        Where w=where(client,new Filter(f.start(),f.end(),f.accountId(),null,f.creator(),null));
        List<Map<String,Object>> rows=s.db.queryForList("SELECT n.product_anchor,COUNT(DISTINCT p.job_id) materials,SUM(p.net_gmv) net_gmv,MAX(p.job_id) sample"+FROM+w.sql()+" GROUP BY n.product_anchor ORDER BY net_gmv DESC NULLS LAST",w.args().toArray());
        Map<String,Map<String,Object>> meta=meta(client);
        List<Map<String,Object>> items=new ArrayList<>();
        for(Map<String,Object> raw:rows){
            Map<String,Object> x=lower(raw);Map<String,Object> v=meta.get(str(x.get("sample")));
            Map<?,?> product=v==null?null:(Map<?,?>)v.get("product");
            Map<String,Object> m=new LinkedHashMap<>();
            m.put("productId",x.get("product_anchor"));m.put("productName",x.get("product_anchor")==null||product==null?"商品不在了":product.get("name"));
            m.put("coverId",product==null?null:product.get("coverId"));
            m.put("materialCount",l(x.get("materials")));m.put("netGmv",r(x.get("net_gmv"),2));
            items.add(m);
        }
        return Map.of("items",items,"filter",f.view());
    }

    // ---------- 账户维度 ----------
    public Map<String,Object> accounts(String client,Filter f){
        StringBuilder on=new StringBuilder(" AND (p.cost IS NOT NULL OR p.gmv IS NOT NULL)");List<Object> args=new ArrayList<>();
        if(f.start()!=null){on.append(" AND p.date_from>=?");args.add(f.start());}
        if(f.end()!=null){on.append(" AND p.date_to<=?");args.add(f.end());}
        args.add(client);
        List<Map<String,Object>> rows=s.db.queryForList("SELECT a.*,"+RATIOS+" FROM (SELECT q.id,COUNT(DISTINCT p.job_id) materials,"+MEASURES
            +" FROM qianchuan_accounts q LEFT JOIN job_performance p ON p.account_id=q.id"+on+" WHERE q.client_id=? AND q.status<>'DELETED' GROUP BY q.id) a",args.toArray());
        Map<String,Map<String,Object>> byId=new HashMap<>();for(Map<String,Object> r:rows){Map<String,Object> x=lower(r);byId.put(x.get("id").toString(),x);}
        String clientName=s.db.queryForObject("SELECT name FROM clients WHERE id=?",String.class,client);
        List<Map<String,Object>> items=new ArrayList<>();
        for(AccountService.Account a:accounts.list(client)){
            Map<String,Object> x=byId.getOrDefault(a.id(),Map.of());
            Map<String,Object> m=AccountService.view(a,clientName,0);m.remove("records");
            m.put("materialCount",l(x.getOrDefault("materials",0L)));m.putAll(measures(x));
            items.add(m);
        }
        items.sort(Comparator.comparing((Map<String,Object> m)->m.get("netGmv")==null?Double.NEGATIVE_INFINITY:(Double)m.get("netGmv")).reversed());
        return Map.of("items",items,"filter",f.view());
    }

    // ---------- 单条成片（资产库详情的「投放表现」） ----------
    public Map<String,Object> jobStats(String client,String jobId){
        s.job(client,jobId);
        Filter f=new Filter(null,null,null,null,null,jobId);Where w=where(client,f);
        Map<String,Object> sum=summary(client,f);
        boolean has=sum.get("materialCount")!=null&&((Long)sum.get("materialCount"))>0;
        Map<String,Object> out=new LinkedHashMap<>();
        out.put("hasData",has);
        if(!has) return out;
        Map<String,Object> x=lower(s.db.queryForMap("SELECT a.*,"+RATIOS+" FROM (SELECT "+MEASURES+FROM+w.sql()+") a",w.args().toArray()));
        out.put("summary",measures(x));
        // 最近 7 天（截至最后一天有数据的日期）每天的净成交 ROI；只用按天的记录，没数据的天是 null
        LocalDate last=LocalDate.parse(measures(x).get("to").toString());
        Map<String,Map<String,Object>> days=new HashMap<>();
        List<Object> args=new ArrayList<>(w.args());args.add(last.minusDays(6));args.add(last);
        for(Map<String,Object> r:s.db.queryForList("SELECT a.*,"+RATIOS+" FROM (SELECT p.date_from d,"+MEASURES+FROM+w.sql()+" AND p.date_from=p.date_to AND p.date_from BETWEEN ? AND ? GROUP BY p.date_from) a",args.toArray())){
            Map<String,Object> y=lower(r);days.put(day(y.get("d")),y);
        }
        List<Map<String,Object>> trend=new ArrayList<>();
        for(int i=6;i>=0;i--){
            String dd=last.minusDays(i).toString();Map<String,Object> y=days.get(dd);
            Map<String,Object> m=new LinkedHashMap<>();m.put("date",dd);
            m.put("netRoi",y==null?null:r(y.get("net_roi"),2));m.put("cost",y==null?null:r(y.get("cost"),2));m.put("netGmv",y==null?null:r(y.get("net_gmv"),2));
            trend.add(m);
        }
        out.put("trend",trend);out.put("through",last.toString());
        return out;
    }
    /** 每条成片的累计（不看筛选），给投放建议用 */
    List<Map<String,Object>> perJob(String client){
        Where w=where(client,new Filter(null,null,null,null,null,null));
        List<Map<String,Object>> out=new ArrayList<>();
        for(Map<String,Object> r:s.db.queryForList("SELECT a.*,"+RATIOS+" FROM (SELECT p.job_id,"+MEASURES+FROM+w.sql()+" GROUP BY p.job_id) a",w.args().toArray())){
            Map<String,Object> x=lower(r);Map<String,Object> m=measures(x);m.put("jobId",x.get("job_id"));out.add(m);
        }
        return out;
    }

    // ---------- 导出 CSV（UTF-8 带 BOM，Excel 直接打开不乱码） ----------
    static String csv(List<String> head,List<List<Object>> rows){
        StringBuilder b=new StringBuilder("﻿");
        b.append(String.join(",",head.stream().map(AnalyticsService::cell).toList())).append("\r\n");
        for(List<Object> r:rows) b.append(String.join(",",r.stream().map(AnalyticsService::cell).toList())).append("\r\n");
        return b.toString();
    }
    /** 一格：数字原样；文字加引号；以 = + - @ 开头的文字前面加 '，免得 Excel 当成公式 */
    static String cell(Object v){
        if(v==null) return "";
        if(v instanceof Number n){
            if(n instanceof Double x) return BigDecimal.valueOf(x).stripTrailingZeros().toPlainString();
            return n.toString();
        }
        String t=v.toString();
        if(!t.isEmpty()&&"=+-@\t\r".indexOf(t.charAt(0))>=0) t="'"+t;
        return "\""+t.replace("\"","\"\"")+"\"";
    }
    public String exportMaterials(String client,Filter f,String sort,String order){
        Map<String,Object> all=materials(client,f,sort,order,1,EXPORT_MAX);
        List<List<Object>> rows=new ArrayList<>();
        for(Map<String,Object> m:(List<Map<String,Object>>)all.get("items")) rows.add(Arrays.asList(m.get("standardName")==null?"未规范化":m.get("standardName"),m.get("title"),m.get("productName"),m.get("creator"),
            m.get("netRoi"),m.get("netGmv"),m.get("netOrders"),m.get("netSettleRate"),m.get("refundRate1h"),m.get("overallRoi"),m.get("totalGmv"),m.get("totalCost"),m.get("dataDays")));
        return csv(List.of("素材命名","成片","商品","创作者","净成交ROI","净成交金额（元）","净成交订单数","净结算率（%）","1小时退款率（%）","整体支付ROI","整体成交金额（元）","整体消耗（元）","数据天数"),rows);
    }
    public String exportProducts(String client,Filter f){
        List<List<Object>> rows=new ArrayList<>();
        for(Map<String,Object> m:(List<Map<String,Object>>)products(client,f).get("items")) rows.add(Arrays.asList(m.get("productName"),m.get("materialCount"),m.get("netGmv")));
        return csv(List.of("商品","关联素材数","素材合计净成交金额（元）"),rows);
    }
    public String exportAccounts(String client,Filter f){
        List<List<Object>> rows=new ArrayList<>();
        for(Map<String,Object> m:(List<Map<String,Object>>)accounts(client,f).get("items")) rows.add(Arrays.asList(m.get("name"),m.get("advertiserId"),m.get("clientName"),m.get("materialCount"),m.get("totalCost"),m.get("netGmv"),m.get("netRoi"),m.get("refundRate1h")));
        return csv(List.of("账户","广告主ID","客户","素材数","总消耗（元）","净成交金额（元）","净成交ROI","1小时退款率（%）"),rows);
    }
}
