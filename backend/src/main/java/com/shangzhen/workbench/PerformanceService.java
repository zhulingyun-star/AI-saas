package com.shangzhen.workbench;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import static com.shangzhen.workbench.ProjectFlowService.str;
import static com.shangzhen.workbench.VideoLibraryService.Perf;
import static com.shangzhen.workbench.Models.Job;

/**
 * 投放数据：给某条成片手填一条（一天或一段日期的合计），改、删（都带 revision），以及从 CSV 表格批量导入。
 * 只存用户填的真实数字。同一条成片的记录日期不能重叠，免得重复计数。
 * 导入分两步：预览（认列、对视频、逐行检查）→ 确认导入（重新检查一遍再写，有问题的行不导入并说明原因）。
 */
@Service
public class PerformanceService {
    static final int MAX_TEXT=2_000_000,MAX_ROWS=5000,MAX_COLUMNS=80,MAX_SPAN=366;
    private final Store s;private final VideoLibraryService library;
    public PerformanceService(Store s,VideoLibraryService library){this.s=s;this.library=library;}

    /** 一条记录的输入；日期是 yyyy-MM-dd，比例是百分数 */
    public record Values(String dateFrom,String dateTo,Long impressions,Long clicks,Double retain3s,Double finishRate,Long productClicks,Long orders,
        Double gpm,Double roi,Double negativeRate,String note) {}
    record Clean(LocalDate from,LocalDate to,long impressions,long clicks,Double retain3s,Double finishRate,Long productClicks,Long orders,Double gpm,Double roi,Double negativeRate,String note) {}
    record Video(String id,LocalDate madeOn,String label) {}

    static String md(LocalDate d){return String.format("%02d-%02d",d.getMonthValue(),d.getDayOfMonth());}
    static String range(LocalDate a,LocalDate b){return a.equals(b)?a.toString():a+" 至 "+b;}
    private static LocalDate date(String raw,String label,List<String> errors){
        String t=str(raw).trim();if(t.isEmpty()) return null;
        try{return LocalDate.parse(t);}catch(DateTimeParseException e){errors.add(label+"要写成 2026-11-15 这样");return null;}
    }
    /** 逐项检查，问题都放进 errors（表格导入时一行可能有好几个问题） */
    static Clean check(Values v,LocalDate madeOn,List<String> errors){
        LocalDate from=date(v.dateFrom(),"开始日期",errors),to=date(v.dateTo(),"结束日期",errors);
        if(from==null&&str(v.dateFrom()).isBlank()) errors.add("开始日期要填");
        if(to==null&&str(v.dateTo()).isBlank()) to=from;
        LocalDate today=VideoLibraryService.today();
        if(from!=null&&to!=null){
            if(to.isBefore(from)) errors.add("结束日期早于开始日期");
            else if(ChronoUnit.DAYS.between(from,to)+1>MAX_SPAN) errors.add("一条记录最多一年，按天或按周填更准");
            if(to.isAfter(today)) errors.add("日期不能晚于今天（"+today+"）");
            if(madeOn!=null&&from.isBefore(madeOn)) errors.add("开始日期早于这条成片生成的日期（"+madeOn+"）");
        }
        if(v.impressions()==null) errors.add("曝光要填");else if(v.impressions()<0||v.impressions()>1_000_000_000_000L) errors.add("曝光要在 0 到一万亿之间");
        if(v.clicks()==null) errors.add("点击要填");else if(v.clicks()<0) errors.add("点击不能是负数");
        else if(v.impressions()!=null&&v.clicks()>v.impressions()) errors.add("点击比曝光还多");
        pct(v.retain3s(),"3 秒留存",errors);pct(v.finishRate(),"完播率",errors);pct(v.negativeRate(),"负反馈率",errors);
        if(v.productClicks()!=null&&v.productClicks()<0) errors.add("商品点击不能是负数");
        if(v.orders()!=null&&v.orders()<0) errors.add("成交单数不能是负数");
        if(v.gpm()!=null&&(v.gpm()<0||v.gpm()>1e9)) errors.add("千次曝光成交额不对");
        if(v.roi()!=null&&(v.roi()<0||v.roi()>10000)) errors.add("投产比要在 0 到 10000 之间");
        String note=str(v.note()).trim();if(note.length()>300) errors.add("备注最多 300 字");
        if(!errors.isEmpty()) return null;
        return new Clean(from,to,v.impressions(),v.clicks(),r2(v.retain3s()),r2(v.finishRate()),v.productClicks(),v.orders(),r2(v.gpm()),r2(v.roi()),r2(v.negativeRate()),note);
    }
    private static Double r2(Double v){return v==null?null:Math.round(v*100)/100.0;}
    private static void pct(Double v,String label,List<String> errors){if(v!=null&&(v<0||v>100)) errors.add(label+"是百分数，要在 0 到 100 之间");}
    private static boolean overlaps(LocalDate a1,LocalDate a2,LocalDate b1,LocalDate b2){return !a2.isBefore(b1)&&!b2.isBefore(a1);}
    private static String overlapWith(List<Perf> existing,Clean c,String except){
        for(Perf p:existing) if(!p.id().equals(except)&&overlaps(p.from(),p.to(),c.from(),c.to())) return range(p.from(),p.to());
        return null;
    }

    // ---------- 手填、改、删 ----------
    private Video video(String client,String jobId){
        Job j=s.job(client,jobId);
        if(!j.hasOutput()) throw Store.bad("这一版还没出好，出好了再填投放数据");
        return new Video(j.id(),VideoLibraryService.madeOn(j.createdAt()),j.name()+" 第 "+j.revision()+" 版");
    }
    private void lockClient(String client){s.db.queryForObject("SELECT id FROM clients WHERE id=? FOR UPDATE",String.class,client);}
    private Clean valid(Values v,Video video){
        List<String> errors=new ArrayList<>();Clean c=check(v,video.madeOn(),errors);
        if(c==null) throw Store.bad(String.join("；",errors));
        return c;
    }
    private void insert(String client,String user,String jobId,Clean c,String source,String importId){
        var now=Store.now();
        s.db.update("INSERT INTO job_performance(id,job_id,client_id,date_from,date_to,impressions,clicks,retain_3s,finish_rate,product_clicks,orders,gpm,roi,negative_rate,note,source,import_id,revision,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)",
            Store.id(),jobId,client,c.from(),c.to(),c.impressions(),c.clicks(),c.retain3s(),c.finishRate(),c.productClicks(),c.orders(),c.gpm(),c.roi(),c.negativeRate(),c.note(),source,importId,user,now,user,now);
    }
    @Transactional
    public Map<String,Object> create(String client,String user,String jobId,Values v){
        Video video=video(client,jobId);Clean c=valid(v,video);
        lockClient(client);
        String hit=overlapWith(library.records(client,jobId),c,"");
        if(hit!=null) throw Store.bad("这条成片已经有 "+hit+" 的数据，日期不能重叠；要改就去改那一条");
        insert(client,user,jobId,c,"MANUAL",null);
        s.audit(client,user,"填投放数据",video.label()+" / "+range(c.from(),c.to()));
        return library.detail(client,jobId);
    }
    private Perf record(String client,String jobId,String id){
        return library.records(client,jobId).stream().filter(p->p.id().equals(id)).findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"这条投放数据不存在，可能已经删了"));
    }
    static ResponseStatusException changed(){return new ResponseStatusException(HttpStatus.CONFLICT,"这条投放数据刚被别人改过，请刷新后再改");}
    @Transactional
    public Map<String,Object> update(String client,String user,String jobId,String id,int revision,Values v){
        Video video=video(client,jobId);Perf old=record(client,jobId,id);
        if(old.revision()!=revision) throw changed();
        Clean c=valid(v,video);
        lockClient(client);
        String hit=overlapWith(library.records(client,jobId),c,id);
        if(hit!=null) throw Store.bad("这条成片已经有 "+hit+" 的数据，日期不能重叠");
        if(s.db.update("UPDATE job_performance SET date_from=?,date_to=?,impressions=?,clicks=?,retain_3s=?,finish_rate=?,product_clicks=?,orders=?,gpm=?,roi=?,negative_rate=?,note=?,revision=revision+1,updated_by=?,updated_at=? WHERE id=? AND client_id=? AND job_id=? AND revision=?",
            c.from(),c.to(),c.impressions(),c.clicks(),c.retain3s(),c.finishRate(),c.productClicks(),c.orders(),c.gpm(),c.roi(),c.negativeRate(),c.note(),user,Store.now(),id,client,jobId,revision)==0) throw changed();
        s.audit(client,user,"改投放数据",video.label()+" / "+range(c.from(),c.to()));
        return library.detail(client,jobId);
    }
    @Transactional
    public Map<String,Object> delete(String client,String user,String jobId,String id,int revision){
        Perf old=record(client,jobId,id);
        if(old.revision()!=revision) throw changed();
        if(s.db.update("DELETE FROM job_performance WHERE id=? AND client_id=? AND job_id=? AND revision=?",id,client,jobId,revision)==0) throw changed();
        s.audit(client,user,"删投放数据",s.job(client,jobId).name()+" / "+range(old.from(),old.to()));
        return library.detail(client,jobId);
    }

    // ---------- 表格导入 ----------
    /** 能认的列：key、名称、常见列名（千川导出、我们自己的模板） */
    static final List<String[]> FIELDS=List.of(
        new String[]{"adName","投放用名","投放用名,素材名称,素材名,视频名称,创意名称,素材标题,视频标题"},
        new String[]{"code","视频编号","视频编号,编号"},
        new String[]{"date","日期","日期,时间,统计日期,投放日期,日期范围"},
        new String[]{"dateFrom","开始日期","开始日期,起始日期"},
        new String[]{"dateTo","结束日期","结束日期,截止日期"},
        new String[]{"impressions","曝光","曝光,曝光数,展示数,展示,展现,展现数,展示次数"},
        new String[]{"clicks","点击","点击,点击数,点击次数"},
        new String[]{"retain3s","3 秒留存（%）","3秒留存,3秒留存率,3秒播放率,3秒完播率"},
        new String[]{"finishRate","完播率（%）","完播率,播放完成率,完播"},
        new String[]{"productClicks","商品点击","商品点击,商品点击数"},
        new String[]{"orders","成交单数","成交单数,成交订单数,成交订单,订单数,成交量,支付订单数"},
        new String[]{"gpm","千次曝光成交额（元）","千次曝光成交额,千次展示成交额,gpm"},
        new String[]{"roi","投产比","投产比,roi,支付roi,消耗回报率"},
        new String[]{"negativeRate","负反馈率（%）","负反馈率,负反馈"},
        new String[]{"note","备注","备注,说明"});
    static final Set<String> NUMERIC=Set.of("impressions","clicks","retain3s","finishRate","productClicks","orders","gpm","roi","negativeRate");
    static final Set<String> INTEGER=Set.of("impressions","clicks","productClicks","orders");
    static String norm(String h){return str(h).replace("﻿","").replaceAll("[（(][^）)]*[）)]","").replaceAll("[\\s　_\\-]","").toLowerCase(Locale.ROOT);}
    static String label(String key){return FIELDS.stream().filter(f->f[0].equals(key)).map(f->f[1]).findFirst().orElse(key);}

    /** 简单的 CSV 读取：支持逗号 / 制表符 / 分号分隔、双引号包起来的字段、字段里的换行，去掉开头的 BOM */
    static List<List<String>> parse(String text){
        String t=str(text);if(t.startsWith("﻿")) t=t.substring(1);
        int nl=t.indexOf('\n');String head=nl<0?t:t.substring(0,nl);
        char sep=',';int commas=count(head,','),tabs=count(head,'\t'),semis=count(head,';');
        if(tabs>commas&&tabs>=semis) sep='\t';else if(semis>commas&&semis>tabs) sep=';';
        List<List<String>> rows=new ArrayList<>();List<String> row=new ArrayList<>();StringBuilder cell=new StringBuilder();boolean quoted=false;
        for(int i=0;i<t.length();i++){
            char ch=t.charAt(i);
            if(quoted){
                if(ch=='"'){if(i+1<t.length()&&t.charAt(i+1)=='"'){cell.append('"');i++;}else quoted=false;}
                else cell.append(ch);
            } else if(ch=='"'&&cell.toString().isBlank()){cell.setLength(0);quoted=true;}
            else if(ch==sep){row.add(cell.toString().trim());cell.setLength(0);}
            else if(ch=='\n'||ch=='\r'){
                if(ch=='\r'&&i+1<t.length()&&t.charAt(i+1)=='\n') i++;
                row.add(cell.toString().trim());cell.setLength(0);
                if(!(row.size()==1&&row.get(0).isEmpty())) rows.add(row);
                row=new ArrayList<>();
            } else cell.append(ch);
        }
        if(cell.length()>0||!row.isEmpty()){row.add(cell.toString().trim());if(!(row.size()==1&&row.get(0).isEmpty())) rows.add(row);}
        return rows;
    }
    private static int count(String t,char c){int n=0;for(char x:t.toCharArray()) if(x==c) n++;return n;}
    /** 按表头猜列：每个字段取第一个对上的列 */
    static Map<String,Integer> guess(List<String> header){
        Map<String,Integer> out=new LinkedHashMap<>();
        for(String[] f:FIELDS){
            List<String> names=Arrays.stream(f[2].split(",")).map(PerformanceService::norm).toList();
            for(int i=0;i<header.size();i++) if(names.contains(norm(header.get(i)))&&!out.containsValue(i)){out.put(f[0],i);break;}
        }
        return out;
    }
    static final Pattern NUM=Pattern.compile("^-?\\d+(\\.\\d+)?$");
    /** 数字：去掉千分位逗号、百分号、元、¥；空、-、— 算没填 */
    static Object number(String raw,String key,List<String> errors){
        String t=str(raw).trim().replace(",","").replace("，","").replace("%","").replace("％","").replace("元","").replace("¥","").replace("￥","").trim();
        if(t.isEmpty()||t.matches("[-—–/]+")||t.equalsIgnoreCase("n/a")) return null;
        if(!NUM.matcher(t).matches()){errors.add("「"+label(key)+"」不是数字："+clip(raw));return null;}
        if(INTEGER.contains(key)){
            double d=Double.parseDouble(t);
            if(d!=Math.floor(d)){errors.add("「"+label(key)+"」要是整数："+clip(raw));return null;}
            if(Math.abs(d)>1e13){errors.add("「"+label(key)+"」太大了："+clip(raw));return null;}
            return (long)d;
        }
        return Double.parseDouble(t);
    }
    private static String clip(String v){String t=str(v).trim();return t.length()>30?t.substring(0,30)+"…":t;}
    static final Pattern DATE=Pattern.compile("(\\d{4})\\s*[-/.年]\\s*(\\d{1,2})\\s*[-/.月]\\s*(\\d{1,2})日?|(\\d{4})(\\d{2})(\\d{2})");
    /** 日期格子：2026-11-15、2026/11/15、20261115、2026年11月15日，也可以是一段（2026-11-15 至 2026-11-21） */
    static String[] dates(String raw,List<String> errors,String what){
        String t=str(raw).trim();if(t.isEmpty()) return new String[]{"",""};
        Matcher m=DATE.matcher(t);List<String> found=new ArrayList<>();
        while(m.find()){
            int y=Integer.parseInt(m.group(1)!=null?m.group(1):m.group(4)),mo=Integer.parseInt(m.group(2)!=null?m.group(2):m.group(5)),d=Integer.parseInt(m.group(3)!=null?m.group(3):m.group(6));
            try{found.add(LocalDate.of(y,mo,d).toString());}catch(java.time.DateTimeException e){errors.add(what+"不是有效日期："+clip(raw));return new String[]{"",""};}
        }
        if(found.isEmpty()||found.size()>2){errors.add(what+"看不懂："+clip(raw)+"（要写成 2026-11-15，或 2026-11-15 至 2026-11-21）");return new String[]{"",""};}
        return new String[]{found.get(0),found.get(found.size()-1)};
    }

    public record ImportInput(String fileName,String text,Map<String,Integer> mapping,Map<String,String> assign) {}
    record Row(int row,String name,String code,Clean clean,String dateFrom,String dateTo,Map<String,Object> values,String status,String by,String jobId,List<String> messages) {}

    /** 预览：认列 → 每行对上是哪条成片 → 检查数字和日期 → 和已有记录、和表里其他行比日期有没有重叠 */
    public Map<String,Object> preview(String client,ImportInput in){return evaluate(client,in).response();}

    private record Result(Map<String,Object> response,List<Row> rows,List<String> missing) {}
    private Result evaluate(String client,ImportInput in){
        String text=str(in.text());
        if(text.isBlank()) throw Store.bad("表格是空的");
        if(text.length()>MAX_TEXT) throw Store.bad("表格太大了（最多约 2MB），分几次导入");
        List<List<String>> all=parse(text);
        if(all.size()<2) throw Store.bad("表格里至少要有表头和一行数据");
        List<String> header=all.get(0);
        if(header.size()>MAX_COLUMNS) throw Store.bad("列太多了（最多 "+MAX_COLUMNS+" 列）");
        List<List<String>> data=all.subList(1,all.size());
        if(data.size()>MAX_ROWS) throw Store.bad("一次最多导入 "+MAX_ROWS+" 行，分几次导入");
        Map<String,Integer> mapping=new LinkedHashMap<>();
        if(in.mapping()==null) mapping.putAll(guess(header));
        else for(var e:in.mapping().entrySet()){
            if(FIELDS.stream().noneMatch(f->f[0].equals(e.getKey()))) throw Store.bad("不认识的字段："+e.getKey());
            Integer i=e.getValue();if(i==null||i<0) continue;
            if(i>=header.size()) throw Store.bad("列号超出了表格的列数");
            mapping.put(e.getKey(),i);
        }
        List<String> missing=new ArrayList<>();
        if(!mapping.containsKey("adName")&&!mapping.containsKey("code")) missing.add("投放用名或视频编号（至少一个，用来对上是哪条成片）");
        if(!mapping.containsKey("date")&&!mapping.containsKey("dateFrom")) missing.add("日期（或开始日期）");
        if(!mapping.containsKey("impressions")) missing.add("曝光");
        if(!mapping.containsKey("clicks")) missing.add("点击");

        // 能对的成片：资产库里出好的版本
        List<Map<String,Object>> videos=(List<Map<String,Object>>)library.library(client).get("videos");
        Map<String,Map<String,Object>> byId=new HashMap<>(),byName=new HashMap<>();Map<String,List<Map<String,Object>>> byCode=new HashMap<>();
        for(Map<String,Object> v:videos){byId.put(v.get("id").toString(),v);byName.putIfAbsent(norm(v.get("adName").toString()),v);byCode.computeIfAbsent(v.get("code").toString(),k->new ArrayList<>()).add(v);}
        Map<String,List<Perf>> existing=library.allRecords(client);
        Map<String,String> assign=in.assign()==null?Map.of():in.assign();

        List<Row> rows=new ArrayList<>();
        if(missing.isEmpty()){
            Map<String,List<Object[]>> taken=new HashMap<>();
            for(int k=0;k<data.size();k++){
                List<String> cells=data.get(k);int rowNo=k+2;
                java.util.function.Function<String,String> cell=f->{Integer i=mapping.get(f);return i==null||i>=cells.size()?"":cells.get(i);};
                List<String> msgs=new ArrayList<>();
                String name=cell.apply("adName").trim(),code=cell.apply("code").trim();
                String[] d=mapping.containsKey("dateFrom")?new String[]{dates(cell.apply("dateFrom"),msgs,"开始日期")[0],mapping.containsKey("dateTo")?dates(cell.apply("dateTo"),msgs,"结束日期")[0]:""}:dates(cell.apply("date"),msgs,"日期");
                if(d[0].isEmpty()&&msgs.isEmpty()) msgs.add("日期是空的");
                Map<String,Object> values=new LinkedHashMap<>();
                for(String f:NUMERIC) if(mapping.containsKey(f)) values.put(f,number(cell.apply(f),f,msgs));
                String note=cell.apply("note").trim();if(note.length()>300) note=note.substring(0,300);
                // 对视频：先投放用名，再视频编号，再投放用名里带的编号，最后看手动指认
                Map<String,Object> v=null;String by="";
                if(!name.isEmpty()&&byName.containsKey(norm(name))){v=byName.get(norm(name));by="NAME";}
                if(v==null&&!code.isEmpty()){
                    String c=code.replace("-","").toLowerCase(Locale.ROOT);
                    if(byId.containsKey(code)) {v=byId.get(code);by="CODE";}
                    else if(c.length()>=6){
                        List<Map<String,Object>> hits=videos.stream().filter(x->x.get("id").toString().replace("-","").toLowerCase(Locale.ROOT).startsWith(c)).toList();
                        if(hits.size()==1){v=hits.get(0);by="CODE";}else if(hits.size()>1) msgs.add("视频编号「"+code+"」对上了好几条，请手动指认");
                    }
                }
                if(v==null&&!name.isEmpty()){
                    String[] parts=name.split("_");String last=parts[parts.length-1].toLowerCase(Locale.ROOT);
                    List<Map<String,Object>> hits=byCode.getOrDefault(last,List.of());
                    if(hits.size()==1){v=hits.get(0);by="NAME_CODE";}
                }
                String manual=str(assign.get(String.valueOf(rowNo))).trim();
                String status;Clean clean=null;
                if(manual.equals("skip")){status="SKIPPED";v=null;by="";msgs.clear();}
                else{
                    if(v==null&&!manual.isEmpty()){
                        if(byId.containsKey(manual)){v=byId.get(manual);by="MANUAL";}
                        else msgs.add("手动指认的成片不在资产库里");
                    }
                    LocalDate made=v==null?null:VideoLibraryService.madeOn(java.time.LocalDateTime.parse(v.get("createdAt").toString()));
                    if(msgs.isEmpty()) clean=check(new Values(d[0],d[1],(Long)values.get("impressions"),(Long)values.get("clicks"),(Double)values.get("retain3s"),(Double)values.get("finishRate"),
                        (Long)values.get("productClicks"),(Long)values.get("orders"),(Double)values.get("gpm"),(Double)values.get("roi"),(Double)values.get("negativeRate"),note),made,msgs);
                    if(clean!=null&&v!=null){
                        String jid=v.get("id").toString();
                        for(Perf p:existing.getOrDefault(jid,List.of())) if(overlaps(p.from(),p.to(),clean.from(),clean.to())){msgs.add("这条成片已经有 "+range(p.from(),p.to())+" 的数据，日期重叠，不重复导入");break;}
                        for(Object[] x:taken.getOrDefault(jid,List.of())) if(overlaps((LocalDate)x[1],(LocalDate)x[2],clean.from(),clean.to())){msgs.add("和第 "+x[0]+" 行是同一条成片，日期重叠");break;}
                    }
                    if(!msgs.isEmpty()){status="ERROR";clean=null;}
                    else if(v==null) status="UNMATCHED";
                    else{status="OK";taken.computeIfAbsent(v.get("id").toString(),x->new ArrayList<>()).add(new Object[]{rowNo,clean.from(),clean.to()});}
                }
                rows.add(new Row(rowNo,name,code,clean,d[0],d[1].isEmpty()?d[0]:d[1],values,status,by,v==null?null:v.get("id").toString(),msgs));
            }
        }
        Map<String,Object> out=new LinkedHashMap<>();
        out.put("fileName",clipName(in.fileName()));
        List<Map<String,Object>> columns=new ArrayList<>();
        for(int i=0;i<header.size();i++){
            Map<String,Object> c=new LinkedHashMap<>();c.put("index",i);c.put("name",header.get(i));
            int idx=i;c.put("field",mapping.entrySet().stream().filter(e->e.getValue()==idx).map(Map.Entry::getKey).findFirst().orElse(null));
            columns.add(c);
        }
        out.put("columns",columns);out.put("mapping",mapping);
        out.put("fields",FIELDS.stream().map(f->Map.of("key",f[0],"label",f[1])).toList());
        out.put("missing",missing);
        out.put("sample",data.subList(0,Math.min(5,data.size())));
        out.put("totalRows",data.size());
        List<Map<String,Object>> rs=new ArrayList<>();
        for(Row r:rows){
            Map<String,Object> m=new LinkedHashMap<>();
            m.put("row",r.row());m.put("name",r.name());m.put("code",r.code());m.put("dateFrom",r.dateFrom());m.put("dateTo",r.dateTo());m.put("values",r.values());
            m.put("status",r.status());m.put("by",r.by());m.put("jobId",r.jobId());
            Map<String,Object> v=r.jobId()==null?null:byId.get(r.jobId());
            m.put("video",v==null?null:Map.of("id",v.get("id"),"projectName",v.get("projectName"),"no",v.get("no"),"code",v.get("code")));
            m.put("messages",r.messages());
            rs.add(m);
        }
        out.put("rows",rs);
        Map<String,Object> counts=new LinkedHashMap<>();
        for(String k:List.of("OK","ERROR","UNMATCHED","SKIPPED")) counts.put(k.toLowerCase(Locale.ROOT),rows.stream().filter(r->r.status().equals(k)).count());
        out.put("counts",counts);
        out.put("videos",videos.stream().map(v->Map.of("id",v.get("id"),"projectName",v.get("projectName"),"no",v.get("no"),"code",v.get("code"))).toList());
        return new Result(out,rows,missing);
    }
    private static String clipName(String n){String t=str(n).trim();if(t.isEmpty()) t="未命名表格.csv";return t.length()>200?t.substring(0,200):t;}

    /** 确认导入：重新检查一遍；还有没对上的行就不导；有问题的行不导入，结果里逐行说明 */
    @Transactional
    public Map<String,Object> importRows(String client,String user,ImportInput in){
        lockClient(client);
        Result r=evaluate(client,in);
        if(!r.missing().isEmpty()) throw Store.bad("表格里缺少这些列："+String.join("、",r.missing()));
        long unmatched=r.rows().stream().filter(x->x.status().equals("UNMATCHED")).count();
        if(unmatched>0) throw Store.bad("还有 "+unmatched+" 行没对上是哪条成片：手动指认或跳过以后再导入");
        List<Row> ok=r.rows().stream().filter(x->x.status().equals("OK")).toList();
        if(ok.isEmpty()) throw Store.bad("没有能导入的行");
        String importId=Store.id();
        long skipped=r.rows().stream().filter(x->x.status().equals("SKIPPED")).count(),errors=r.rows().stream().filter(x->x.status().equals("ERROR")).count();
        s.db.update("INSERT INTO performance_imports(id,client_id,file_name,total_rows,imported_rows,skipped_rows,error_rows,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            importId,client,clipName(in.fileName()),r.rows().size(),ok.size(),skipped,errors,user,Store.now());
        for(Row x:ok) insert(client,user,x.jobId(),x.clean(),"IMPORT",importId);
        s.audit(client,user,"导入投放数据",clipName(in.fileName())+" / 导入 "+ok.size()+" 行，跳过 "+skipped+" 行，有问题 "+errors+" 行");
        Map<String,Object> out=new LinkedHashMap<>();
        out.put("importId",importId);out.put("imported",ok.size());out.put("skipped",skipped);
        out.put("videos",ok.stream().map(Row::jobId).distinct().count());
        out.put("errors",r.rows().stream().filter(x->x.status().equals("ERROR")).map(x->Map.of("row",x.row(),"name",x.name(),"messages",x.messages())).toList());
        return out;
    }
    public List<Map<String,Object>> imports(String client){
        return s.db.query("SELECT * FROM performance_imports WHERE client_id=? ORDER BY created_at DESC LIMIT 20",(rs,n)->{
            Map<String,Object> m=new LinkedHashMap<>();
            m.put("id",rs.getString("id"));m.put("fileName",rs.getString("file_name"));m.put("totalRows",rs.getInt("total_rows"));m.put("imported",rs.getInt("imported_rows"));
            m.put("skipped",rs.getInt("skipped_rows"));m.put("errors",rs.getInt("error_rows"));m.put("by",rs.getString("created_by"));m.put("at",rs.getTimestamp("created_at").toLocalDateTime().toString());
            return m;
        },client);
    }
}
