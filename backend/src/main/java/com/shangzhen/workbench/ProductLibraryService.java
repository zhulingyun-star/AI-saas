package com.shangzhen.workbench;

import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import java.util.regex.Pattern;
import static com.shangzhen.workbench.Models.Asset;

/** 商品库：文件夹、商品所在文件夹、分析核对状态、商品理解和目标人群。商品按 productGroupId 记录。 */
@Service
public class ProductLibraryService {
    static final List<String> SECTIONS=List.of("core","sub","pain","obj","scene","when");
    static final List<String> HOOKS=List.of("痛点型","反常识型","对比型","结果前置型","价格型","人群锁定型","悬念型","身份代入型");
    static final Set<String> RESERVED=Set.of("全部商品","未分类","待核对");
    /** 核对时已经补充过答案的「需要确认」条目以此结尾，不再算作待确认。 */
    static final String DONE="（已补充）";
    static final int MAX_PERSONAS=12,MAX_TAGS=12,TAG_LENGTH=60;
    private static final Pattern RISKY=Pattern.compile("价格|售价|原价|优惠|折扣|包邮|[0-9]+\\s*元|¥|￥|产地|原产|功效|疗效|治疗|治愈");
    private static final TypeReference<List<String>> STRINGS=new TypeReference<>(){};
    private final Store s;private final MediaService media;private final ProductAnalysisService analysis;private final AiService ai;
    private final LibraryFolders folderRules;
    public ProductLibraryService(Store s,MediaService media,ProductAnalysisService analysis,AiService ai){this.s=s;this.media=media;this.analysis=analysis;this.ai=ai;this.folderRules=new LibraryFolders(s,"product_folders","product_profiles","商品",RESERVED);}

    public record Persona(String id,String name,String pain,String want,String tone,String scene,String worry,List<String> hooks,int revision) {}
    private final RowMapper<Map<String,Object>> profileRows=(r,n)->{Map<String,Object> m=new HashMap<>();m.put("group_id",r.getString("group_id"));m.put("folder_id",r.getString("folder_id"));m.put("confirmed_json",r.getString("confirmed_json"));m.put("reviewed_analysis_at",r.getString("reviewed_analysis_at"));m.put("personas_initialized",r.getBoolean("personas_initialized"));return m;};
    private final RowMapper<Map<String,Object>> understandingRows=(r,n)->Map.of("content_json",r.getString("content_json"),"source",r.getString("source"),"edited_count",r.getInt("edited_count"),"revision",r.getInt("revision"));
    private final RowMapper<Persona> personas=this::persona;
    private Persona persona(java.sql.ResultSet r,int n) throws java.sql.SQLException {
        return new Persona(r.getString("id"),r.getString("name"),r.getString("pain"),r.getString("want"),r.getString("tone"),r.getString("scene"),r.getString("worry"),s.read(r.getString("hooks"),STRINGS),r.getInt("revision"));
    }

    // ---------- 列表汇总 ----------
    public Map<String,Object> library(String client) {
        List<LibraryFolders.Folder> fs=folderRules.list(client);
        Map<String,List<Asset>> groups=new LinkedHashMap<>();
        Map<String,String> keyOfAsset=new HashMap<>();
        for(Asset a:s.db.query("SELECT * FROM assets WHERE client_id=? AND kind='PRODUCT' ORDER BY created_at,id",s.assets,client)) {
            String key=MediaService.productKey(a);groups.computeIfAbsent(key,k->new ArrayList<>()).add(a);keyOfAsset.put(a.id(),key);
        }
        Map<String,Map<String,Object>> profiles=new HashMap<>();
        for(Map<String,Object> row:s.db.query("SELECT * FROM product_profiles WHERE client_id=?",profileRows,client)) profiles.put(row.get("group_id").toString(),row);
        Set<String> analyzed=new HashSet<>(s.db.queryForList("SELECT group_id FROM product_analyses WHERE client_id=?",String.class,client));
        Set<String> understood=new HashSet<>(s.db.queryForList("SELECT group_id FROM product_understandings WHERE client_id=?",String.class,client));
        Map<String,Integer> personaCounts=new HashMap<>();
        for(Map<String,Object> row:s.db.queryForList("SELECT group_id,COUNT(*) AS n FROM product_personas WHERE client_id=? GROUP BY group_id",client)) personaCounts.put(row.get("group_id").toString(),((Number)row.get("n")).intValue());
        Map<String,Set<String>> projects=new HashMap<>();
        // 关联项目：新版项目（作品）里记下的商品；按商品组去重计数
        for(Models.Project p:s.db.query("SELECT * FROM projects WHERE client_id=?",s.projects,client)) {
            String key=keyOfAsset.get(Objects.toString(p.config().get("productAnchorId"),""));if(key!=null) projects.computeIfAbsent(key,k->new HashSet<>()).add(p.id());
        }
        Map<String,Object> products=new LinkedHashMap<>();
        for(var entry:groups.entrySet()) {
            Asset first=entry.getValue().get(0);
            String group=Objects.toString(first.metadata().get("productGroupId"),"");
            Map<String,Object> profile=profiles.get(group);
            Map<String,Object> item=new LinkedHashMap<>();
            item.put("groupId",group);item.put("anchorId",first.id());
            item.put("folderId",profile==null?null:profile.get("folder_id"));
            Map<String,Object> summary=null;
            if(!group.isBlank()&&analyzed.contains(group)) summary=summary(analysis.get(client,first.id()));
            item.put("analysis",summary);
            String reviewedAt=profile==null?null:(String)profile.get("reviewed_analysis_at");
            item.put("reviewed",summary!=null&&reviewedAt!=null&&!reviewedAt.isBlank()&&reviewedAt.equals(summary.get("analyzedAt")));
            item.put("confirmed",profile==null?List.of():s.read(profile.get("confirmed_json").toString(),STRINGS));
            item.put("understandingSaved",understood.contains(group));
            item.put("personaCount",personaCounts.getOrDefault(group,0));
            item.put("projectCount",projects.getOrDefault(entry.getKey(),Set.of()).size());
            products.put(entry.getKey(),item);
        }
        return Map.of("folders",fs,"products",products);
    }
    @SuppressWarnings("unchecked")
    static Map<String,Object> summary(Map<String,Object> a) {
        Map<String,Object> out=new LinkedHashMap<>();
        for(String k:List.of("status","revision","model","analyzedAt","stale","error")) if(a.get(k)!=null) out.put(k,a.get(k));
        if(a.get("report") instanceof Map<?,?> report) {
            Map<String,Object> r=(Map<String,Object>)report;
            List<Map<String,String>> provable=rows(r,"provable_points");
            long unverified=provable.stream().filter(p->Objects.toString(p.get("evidence"),"").contains("待验证")).count();
            out.put("hasReport",true);out.put("category",str(r,"category"));
            out.put("confirmCount",strings(r,"confirm").stream().filter(x->!x.endsWith(DONE)).count());out.put("unverifiedCount",unverified);
            out.put("provableCount",provable.size()-unverified);out.put("riskCount",rows(r,"exaggeration_risks").size());
        } else out.put("hasReport",false);
        return out;
    }

    // ---------- 文件夹（规则在 LibraryFolders，和参考视频库共用） ----------
    @Transactional public LibraryFolders.Folder createFolder(String client,String user,String name,String parentId){return folderRules.create(client,user,name,parentId);}
    @Transactional public LibraryFolders.Folder renameFolder(String client,String user,String id,String name,int revision){return folderRules.rename(client,user,id,name,revision);}
    @Transactional public void deleteFolder(String client,String user,String id){folderRules.delete(client,user,id);}

    // ---------- 商品档案（文件夹、核对状态） ----------
    private Map<String,Object> profile(String client,String group) {
        return s.db.query("SELECT * FROM product_profiles WHERE client_id=? AND group_id=?",profileRows,client,group).stream().findFirst().orElse(null);
    }
    private void ensureProfile(String client,String group) {
        if(profile(client,group)==null) s.db.update("INSERT INTO product_profiles(client_id,group_id,confirmed_json,personas_initialized,updated_at) VALUES(?,?,'[]',FALSE,?)",client,group,Store.now());
    }
    @Transactional
    public Map<String,Object> move(String client,String user,String anchor,String folderId) {
        String target=folderRules.target(client,folderId);
        String group=media.ensureProductGroup(client,anchor);ensureProfile(client,group);
        s.db.update("UPDATE product_profiles SET folder_id=?,updated_at=? WHERE client_id=? AND group_id=?",target,Store.now(),client,group);
        s.audit(client,user,"移动商品",folderRules.label(client,target));
        return Map.of("groupId",group,"folderId",Objects.toString(target,""));
    }
    @Transactional
    public Map<String,Object> review(String client,String anchor,List<String> confirmed,boolean reviewed) {
        List<String> clean=new ArrayList<>(new LinkedHashSet<>(confirmed==null?List.of():confirmed));
        if(clean.size()>300||clean.stream().anyMatch(x->x==null||x.length()>1200)) throw Store.bad("核对记录过长");
        Map<String,Object> current=analysis.get(client,anchor);
        if(reviewed&&current.get("report")==null) throw Store.bad("还没有分析结果，先分析商品");
        String group=media.ensureProductGroup(client,anchor);ensureProfile(client,group);
        String at=reviewed?Objects.toString(current.get("analyzedAt"),""):null;
        s.db.update("UPDATE product_profiles SET confirmed_json=?,reviewed_analysis_at=?,updated_at=? WHERE client_id=? AND group_id=?",s.write(clean),at,Store.now(),client,group);
        return Map.of("confirmed",clean,"reviewed",reviewed);
    }

    // ---------- 商品理解 ----------
    @SuppressWarnings("unchecked")
    private Map<String,Object> report(String client,String anchor) {
        Object report=analysis.get(client,anchor).get("report");
        return report instanceof Map<?,?> r?(Map<String,Object>)r:null;
    }
    private String groupOf(String client,String anchor) {
        return Objects.toString(media.productMembers(client,anchor).get(0).metadata().get("productGroupId"),"");
    }
    public Map<String,Object> understanding(String client,String anchor) {
        String group=groupOf(client,anchor);
        Map<String,Object> report=report(client,anchor);
        Map<String,Object> row=group.isBlank()?null:s.db.query("SELECT * FROM product_understandings WHERE client_id=? AND group_id=?",understandingRows,client,group).stream().findFirst().orElse(null);
        Map<String,Object> profile=group.isBlank()?null:profile(client,group);
        boolean initialized=profile!=null&&Boolean.TRUE.equals(profile.get("personas_initialized"));
        Map<String,Object> out=new LinkedHashMap<>();
        out.put("hasAnalysis",report!=null);
        out.put("saved",row!=null);
        out.put("understanding",row!=null?s.read(row.get("content_json").toString(),new TypeReference<Map<String,List<String>>>(){}):derive(report));
        out.put("source",row!=null?row.get("source"):report!=null?"DERIVED":"EMPTY");
        out.put("editedCount",row==null?0:((Number)row.get("edited_count")).intValue());
        out.put("revision",row==null?0:((Number)row.get("revision")).intValue());
        out.put("aiEnabled",ai.enabled());
        out.put("personasSaved",initialized);
        out.put("personas",initialized?s.db.query("SELECT * FROM product_personas WHERE client_id=? AND group_id=? ORDER BY sort_order,created_at,id",personas,client,group):derivePersonas(report));
        return out;
    }
    @Transactional
    public Map<String,Object> saveUnderstanding(String client,String anchor,Map<String,Object> raw,int revision) {
        Map<String,List<String>> content=cleanUnderstanding(raw);
        String group=media.ensureProductGroup(client,anchor);
        write(client,group,content,"EDITED",revision,true);
        return understanding(client,anchor);
    }
    @Transactional
    public Map<String,Object> extract(String client,String anchor,int revision) {
        Map<String,Object> report=report(client,anchor);
        if(report==null) throw Store.bad("还没有商品分析结果，先分析商品再提取");
        Map<String,List<String>> content;String source;
        if(ai.enabled()) {
            String name=Objects.toString(media.productMembers(client,anchor).get(0).metadata().get("productName"),"");
            AiService.UnderstandingDraft draft=ai.understanding(name,report);
            String sourceText=s.write(report);
            Map<String,Object> raw=new LinkedHashMap<>();
            raw.put("core",guard(draft.core(),sourceText));raw.put("sub",guard(draft.sub(),sourceText));raw.put("pain",guard(draft.pain(),sourceText));
            raw.put("obj",guard(draft.obj(),sourceText));raw.put("scene",guard(draft.scene(),sourceText));raw.put("when",guard(draft.when(),sourceText));
            content=cleanUnderstanding(raw);source="AI";
        } else {content=derive(report);source="DERIVED";}
        String group=media.ensureProductGroup(client,anchor);
        write(client,group,content,source,revision,false);
        return understanding(client,anchor);
    }
    private void write(String client,String group,Map<String,List<String>> content,String source,int revision,boolean edited) {
        boolean exists=s.db.queryForObject("SELECT COUNT(*) FROM product_understandings WHERE client_id=? AND group_id=?",Integer.class,client,group)>0;
        if(!exists) {
            if(revision!=0) throw new ResponseStatusException(HttpStatus.CONFLICT,"商品理解刚被改过，请刷新后再改");
            s.db.update("INSERT INTO product_understandings(client_id,group_id,content_json,source,edited_count,revision,updated_at) VALUES(?,?,?,?,?,1,?)",client,group,s.write(content),source,edited?1:0,Store.now());
        } else if(s.db.update("UPDATE product_understandings SET content_json=?,source=?,edited_count="+(edited?"edited_count+1":"0")+",revision=revision+1,updated_at=? WHERE client_id=? AND group_id=? AND revision=?",s.write(content),source,Store.now(),client,group,revision)==0)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"商品理解刚被改过，请刷新后再改");
    }
    static Map<String,List<String>> cleanUnderstanding(Map<String,Object> raw) {
        if(raw==null) throw Store.bad("商品理解不能为空");
        for(String key:raw.keySet()) if(!SECTIONS.contains(key)) throw Store.bad("商品理解里有不认识的分类");
        Map<String,List<String>> out=new LinkedHashMap<>();
        for(String key:SECTIONS) {
            LinkedHashSet<String> values=new LinkedHashSet<>();
            Object value=raw.get(key);
            if(value!=null&&!(value instanceof List<?>)) throw Store.bad("商品理解格式不正确");
            if(value instanceof List<?> list) for(Object item:list) {
                if(!(item instanceof String text)) throw Store.bad("标签必须是文字");
                String t=text.trim();if(t.isEmpty()) continue;
                if(t.length()>TAG_LENGTH) throw Store.bad("每个标签最多 "+TAG_LENGTH+" 个字");
                values.add(t);
            }
            if(values.size()>MAX_TAGS) throw Store.bad("每一类最多 "+MAX_TAGS+" 个标签");
            out.put(key,new ArrayList<>(values));
        }
        return out;
    }
    /** 模型提取结果中出现价格、功效、产地等字眼，但商品分析里没有对应字眼时，丢弃该标签。 */
    static List<String> guard(List<String> items,String source) {
        if(items==null) return List.of();
        List<String> out=new ArrayList<>();
        for(String item:items) {
            if(item==null) continue;
            String t=item.trim();if(t.isEmpty()) continue;
            var m=RISKY.matcher(t);boolean ok=true;
            while(m.find()) if(!source.contains(m.group())) {ok=false;break;}
            if(ok) out.add(t.length()>TAG_LENGTH?t.substring(0,TAG_LENGTH):t);
            if(out.size()>=6) break;
        }
        return out;
    }

    // ---------- 从商品分析推导（确定性，只用分析里已有的文字） ----------
    static Map<String,List<String>> derive(Map<String,Object> r) {
        Map<String,List<String>> out=new LinkedHashMap<>();
        for(String key:SECTIONS) out.put(key,new ArrayList<>());
        if(r==null) return out;
        List<Map<String,String>> provable=rows(r,"provable_points");
        for(Map<String,String> p:provable) if(!Objects.toString(p.get("evidence"),"").contains("待验证")) add(out.get("core"),shortText(p.get("claim"),30),5);
        for(Map<String,String> p:rows(r,"showcase_points")) {
            String part=Objects.toString(p.get("part"),"").trim(),what=Objects.toString(p.get("what"),"").trim();
            String text=part.isEmpty()?what:what.isEmpty()?part:part+"："+what;
            text=shortText(text,30);if(!out.get("core").contains(text)) add(out.get("sub"),text,6);
        }
        if(out.get("core").isEmpty()&&!out.get("sub").isEmpty()) out.get("core").add(out.get("sub").remove(0));
        for(String p:strings(r,"pain_points")) add(out.get("pain"),shortText(p,30),6);
        for(String c:strings(r,"confirm")) if(!c.endsWith(DONE)) add(out.get("obj"),shortText(c,30),6);
        for(Map<String,String> p:provable) if(Objects.toString(p.get("evidence"),"").contains("待验证")) add(out.get("obj"),shortText(p.get("claim"),24)+"（还没验证）",6);
        for(String piece:fragments(str(r,"usage"))) add(out.get("scene"),piece,4);
        for(String piece:fragments(str(r,"styling"))) add(out.get("scene"),piece,6);
        // 购买时机：分析里没有对应字段，本地推导不编造，留空。
        return out;
    }
    static List<Persona> derivePersonas(Map<String,Object> r) {
        if(r==null) return List.of();
        String audience=str(r,"audience");
        if(audience.isBlank()) return List.of();
        List<String> fr=fragments(audience);
        String name=shortText(fr.isEmpty()?audience:fr.get(0),20);
        List<String> pains=strings(r,"pain_points");
        List<String> claims=rows(r,"provable_points").stream().filter(p->!Objects.toString(p.get("evidence"),"").contains("待验证")).map(p->shortText(p.get("claim"),40)).filter(x->!x.isBlank()).limit(2).toList();
        List<String> worries=strings(r,"confirm").stream().filter(x->!x.endsWith(DONE)).limit(2).map(x->shortText(x,60)).toList();
        List<String> scenes=fragments(str(r,"usage"));
        Set<String> hooks=new LinkedHashSet<>();
        String fit=rows(r,"fit_types").stream().map(f->Objects.toString(f.get("type"),"")+Objects.toString(f.get("why"),"")).reduce("",String::concat);
        if(fit.contains("痛点")) hooks.add("痛点型");if(fit.contains("反常识")) hooks.add("反常识型");if(fit.contains("对比")) hooks.add("对比型");
        if(fit.contains("结果")||fit.contains("效果")) hooks.add("结果前置型");if(fit.contains("价格")) hooks.add("价格型");
        if(fit.contains("人群")) hooks.add("人群锁定型");if(fit.contains("悬念")) hooks.add("悬念型");if(fit.contains("身份")||fit.contains("代入")) hooks.add("身份代入型");
        if(hooks.isEmpty()&&!pains.isEmpty()) hooks.add("痛点型");
        return List.of(new Persona(null,name,clip(String.join("；",pains.stream().limit(2).map(x->shortText(x,60)).toList()),300),
            clip(String.join("、",claims),300),"",clip(String.join("、",scenes.stream().limit(3).toList()),300),clip(String.join("；",worries),300),new ArrayList<>(hooks),0));
    }
    private static void add(List<String> target,String text,int limit) {
        String t=Objects.toString(text,"").trim();if(t.length()>TAG_LENGTH) t=t.substring(0,TAG_LENGTH-1)+"…";
        if(t.isBlank()||target.contains(t)||target.size()>=limit) return;target.add(t);
    }
    static String shortText(String text,int max) {
        String t=Objects.toString(text,"").replaceAll("（[^）]*）|\\([^)]*\\)","").trim();
        for(String stop:List.of("。","；",";","\n")) {int i=t.indexOf(stop);if(i>0) t=t.substring(0,i);}
        t=t.trim();
        return t.length()>max?t.substring(0,max-1)+"…":t;
    }
    static List<String> fragments(String text) {
        List<String> out=new ArrayList<>();
        for(String piece:Objects.toString(text,"").replaceAll("（[^）]*）|\\([^)]*\\)","").split("[，,、；;。\\n]")) {
            String t=piece.trim().replaceAll("^(适合|适用于|可搭配|可以搭配|可|及|和|与)","").trim();
            if(t.length()>=2&&t.length()<=30&&!out.contains(t)) out.add(t);
        }
        return out;
    }
    private static String clip(String t,int max){return t.length()>max?t.substring(0,max):t;}
    static String str(Map<String,Object> r,String key){return r.get(key) instanceof String v?v.trim():"";}
    static List<String> strings(Map<String,Object> r,String key) {
        List<String> out=new ArrayList<>();if(r.get(key) instanceof List<?> list) for(Object v:list) if(v instanceof String t&&!t.isBlank()) out.add(t.trim());return out;
    }
    static List<Map<String,String>> rows(Map<String,Object> r,String key) {
        List<Map<String,String>> out=new ArrayList<>();
        if(r.get(key) instanceof List<?> list) for(Object v:list) if(v instanceof Map<?,?> m) {
            Map<String,String> row=new LinkedHashMap<>();m.forEach((k,val)->row.put(String.valueOf(k),Objects.toString(val,"")));out.add(row);
        }
        return out;
    }

    // ---------- 目标人群 ----------
    public record PersonaInput(String name,String pain,String want,String tone,String scene,String worry,List<String> hooks) {}
    private PersonaInput cleanPersona(PersonaInput p) {
        String name=Objects.toString(p.name(),"").trim();
        if(name.isEmpty()||name.length()>30) throw Store.bad("人群名称需要 1 到 30 个字");
        List<String> hooks=new ArrayList<>(new LinkedHashSet<>(p.hooks()==null?List.of():p.hooks()));
        if(!HOOKS.containsAll(hooks)) throw Store.bad("开头类型只能从 8 种里选");
        return new PersonaInput(name,field(p.pain()),field(p.want()),field(p.tone()),field(p.scene()),field(p.worry()),hooks);
    }
    private String field(String v){String t=Objects.toString(v,"").trim();if(t.length()>300) throw Store.bad("每一项最多 300 个字");return t;}
    private boolean initialized(String client,String group){Map<String,Object> p=profile(client,group);return p!=null&&Boolean.TRUE.equals(p.get("personas_initialized"));}
    private void insertPersona(String client,String group,PersonaInput p) {
        if(s.db.queryForObject("SELECT COUNT(*) FROM product_personas WHERE client_id=? AND group_id=?",Integer.class,client,group)>=MAX_PERSONAS) throw Store.bad("一个商品最多 "+MAX_PERSONAS+" 个人群");
        Integer max=s.db.queryForObject("SELECT MAX(sort_order) FROM product_personas WHERE client_id=? AND group_id=?",Integer.class,client,group);
        s.db.update("INSERT INTO product_personas(id,client_id,group_id,name,pain,want,tone,scene,worry,hooks,sort_order,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?,?)",
            Store.id(),client,group,p.name(),p.pain(),p.want(),p.tone(),p.scene(),p.worry(),s.write(p.hooks()),max==null?0:max+1,Store.now(),Store.now());
    }
    /** 把根据商品分析推导的人群建议写进库里；已经保存过人群的商品不会重复写入。 */
    @Transactional
    public Map<String,Object> adoptPersonas(String client,String anchor) {
        String group=media.ensureProductGroup(client,anchor);
        adopt(client,anchor,group);
        return understanding(client,anchor);
    }
    private void adopt(String client,String anchor,String group) {
        if(initialized(client,group)) return;
        ensureProfile(client,group);
        for(Persona p:derivePersonas(report(client,anchor))) insertPersona(client,group,cleanPersona(new PersonaInput(p.name(),p.pain(),p.want(),p.tone(),p.scene(),p.worry(),p.hooks())));
        s.db.update("UPDATE product_profiles SET personas_initialized=TRUE,updated_at=? WHERE client_id=? AND group_id=?",Store.now(),client,group);
    }
    @Transactional
    public Map<String,Object> createPersona(String client,String anchor,PersonaInput input) {
        PersonaInput p=cleanPersona(input);
        String group=media.ensureProductGroup(client,anchor);
        adopt(client,anchor,group);insertPersona(client,group,p);
        return understanding(client,anchor);
    }
    @Transactional
    public Map<String,Object> updatePersona(String client,String anchor,String id,PersonaInput input,int revision) {
        PersonaInput p=cleanPersona(input);String group=groupOf(client,anchor);
        if(s.db.queryForObject("SELECT COUNT(*) FROM product_personas WHERE client_id=? AND group_id=? AND id=?",Integer.class,client,group,id)==0) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"人群不存在");
        if(s.db.update("UPDATE product_personas SET name=?,pain=?,want=?,tone=?,scene=?,worry=?,hooks=?,revision=revision+1,updated_at=? WHERE client_id=? AND group_id=? AND id=? AND revision=?",
            p.name(),p.pain(),p.want(),p.tone(),p.scene(),p.worry(),s.write(p.hooks()),Store.now(),client,group,id,revision)==0)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"这个人群刚被改过，请刷新后再改");
        return understanding(client,anchor);
    }
    @Transactional
    public Map<String,Object> deletePersona(String client,String anchor,String id) {
        String group=groupOf(client,anchor);
        if(s.db.update("DELETE FROM product_personas WHERE client_id=? AND group_id=? AND id=?",client,group,id)==0) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"人群不存在");
        return understanding(client,anchor);
    }
}
