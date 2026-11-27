package com.shangzhen.workbench;

import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import java.util.regex.Pattern;
import static com.shangzhen.workbench.Models.*;
import static com.shangzhen.workbench.ProjectFlowService.*;

/**
 * 框架模式、一键成片的新版四步详情：商品 → 方向 → 分镜 → 出片。
 * 方向（project_directions）和每个方向的分镜（project_direction_boards）在 V11 的表里；出片的版本、审片、取消、出片词改写复用 ProjectFlowService。
 * 框架模式：按人群和时长出几套方向，选 1~3 个，每个方向各有一份分镜，确认后各自出片。
 * 一键成片：设置好以后一次点击，自动写 1 个方向和它的分镜（自动算确认），接着出片；中间两步可以看、可以改，不强制逐步确认。
 * 文字模型没配置（AI_MODE=local）时不调外部模型，按商品理解里的卖点、痛点、场景拼本地模板，source=LOCAL，界面上标明不是 AI 写的。
 */
@Service
public class DirectionFlowService {
    static final List<String> CONTENT=List.of("痛点问答","细节特写","使用演示","开箱","对比测试","场景种草","情绪片","品牌宣言");
    static final List<String> TEMPO=List.of("卡点快剪","正常","慢节奏","一镜到底");
    static final List<String> PEOPLE=List.of("有人出镜","只出手","无人出镜");
    static final List<String> VOICE=List.of("画外音","人物对白","纯音乐");
    static final List<String> LOOK=List.of("生活感实拍","质感棚拍","电影感","胶片质感");
    static final List<String> ENDING=List.of("定格商品","引导看详情","评论区互动","品牌口号");
    static final List<Integer> DURATIONS=List.of(15,30);
    static final List<String> HOOKS=ProductLibraryService.HOOKS,TASKS=ReferenceLibraryService.TASKS;
    static final int DIRECTION_COUNT=3,MAX_SELECTED=3,MAX_DIRECTIONS=12,BOARD_LINES=4;
    /** 每档时长的镜头时间和任务：15 秒 5 镜、30 秒 7 镜 */
    static final Map<Integer,List<Object[]>> SLOTS=Map.of(
        15,List.of(new Object[]{0,3,"抓住注意力"},new Object[]{3,6,"建立需求"},new Object[]{6,9,"给出方案"},new Object[]{9,12,"建立信任"},new Object[]{12,15,"推动下单"}),
        30,List.of(new Object[]{0,3,"抓住注意力"},new Object[]{3,6,"建立需求"},new Object[]{6,11,"给出方案"},new Object[]{11,17,"建立信任"},new Object[]{17,22,"打消顾虑"},new Object[]{22,26,"促进决定"},new Object[]{26,30,"推动下单"}));
    public record Direction(String title,String why,String hook,String openVisual,String openLine,String structure,List<String> points,String scene,
        String contentType,String tempo,String people,String voice,String look,String ending,String personaName,int duration) {}
    /** 一键成片的设置；空字符串 = 交给 AI */
    public record OneClick(String personaName,int duration,String src,String copy,String creative,String people,String voice,String tempo,String look) {}
    private static final TypeReference<List<StoryShot>> SHOTS=new TypeReference<>(){};
    private final Store s;private final ProjectFlowService flow;private final ProductAnalysisService analysis;private final ProductLibraryService products;
    private final MediaService media;private final AiService ai;private final VideoApiClient video;
    public DirectionFlowService(Store s,ProjectFlowService flow,ProductAnalysisService analysis,ProductLibraryService products,MediaService media,AiService ai,VideoApiClient video){
        this.s=s;this.flow=flow;this.analysis=analysis;this.products=products;this.media=media;this.ai=ai;this.video=video;
    }

    // ---------- 读 ----------
    private Project project(String client,String id){
        Project p=flow.anyFlowProject(client,id);
        if(mode(p).equals("REMAKE")) throw Store.bad("视频二创项目没有这一步");
        return p;
    }
    private Project project(String client,String id,String need){
        Project p=project(client,id);
        if(!mode(p).equals(need)) throw Store.bad(need.equals("FRAMEWORK")?"只有框架模式能这样操作":"只有一键成片能这样操作");
        return p;
    }
    record Row(String id,int sort,String source,Direction data,Direction origin,String anchor,boolean selected,int selectOrder,int revision) {}
    record Board(String direction,String source,int directionRevision,int duration,List<StoryShot> shots,boolean confirmed,int revision) {}
    private List<Row> rows(String client,String project){
        return s.db.query("SELECT id,sort_order,source,data_json,origin_json,product_anchor_id,selected,select_order,revision FROM project_directions WHERE client_id=? AND project_id=? ORDER BY sort_order,created_at,id",
            (r,n)->new Row(r.getString(1),r.getInt(2),r.getString(3),s.read(r.getString(4),new TypeReference<Direction>(){}),s.read(r.getString(5),new TypeReference<Direction>(){}),r.getString(6),r.getBoolean(7),r.getInt(8),r.getInt(9)),client,project);
    }
    private Row row(String client,String project,String id){
        return rows(client,project).stream().filter(x->x.id().equals(id)).findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"这个方向不在这个项目里"));
    }
    private Map<String,Board> boards(String client,String project){
        Map<String,Board> out=new HashMap<>();
        s.db.query("SELECT direction_id,source,direction_revision,duration,shots_json,confirmed,revision FROM project_direction_boards WHERE client_id=? AND project_id=?",rs->{
            out.put(rs.getString(1),new Board(rs.getString(1),rs.getString(2),rs.getInt(3),rs.getInt(4),s.read(rs.getString(5),SHOTS),rs.getBoolean(6),rs.getInt(7)));
        },client,project);
        return out;
    }
    private static List<Row> selected(List<Row> rows){return rows.stream().filter(Row::selected).sorted(Comparator.comparingInt(Row::selectOrder)).toList();}

    public Map<String,Object> flow(String client,String id){
        Project p=project(client,id);Map<String,Asset> assets=flow.assets(client);
        Map<String,Object> out=new LinkedHashMap<>();
        out.put("project",flow.items(client,List.of(p)).get(0));out.put("revision",p.revision());out.put("mode",mode(p));
        Map<String,Object> settings=new LinkedHashMap<>();
        settings.put("ratio",ratio(p));settings.put("resolution",resolution(p));
        settings.put("personaName",str(p.config().get("personaName")));settings.put("personaId",str(p.config().get("personaId")));
        settings.put("duration",planDuration(p));settings.put("facts",p.facts());settings.put("approach","");
        if(mode(p).equals("ONE_CLICK")) settings.put("oneClick",oneClick(p));
        out.put("settings",settings);
        Map<String,Object> product=flow.productInfo(client,p,assets);
        out.put("product",product);
        String anchor=anchorOf(p),name=str(p.config().get("productName"));int images=productImages(p).size();
        List<Map<String,Object>> versions=numbered(flow.versions(client,id),mode(p));
        Map<String,Board> boards=boards(client,id);
        List<Map<String,Object>> dirs=new ArrayList<>();
        for(Row r:rows(client,id)){
            Map<String,Object> d=new LinkedHashMap<>();
            d.put("id",r.id());d.put("source",r.source());d.put("data",r.data());d.put("origin",r.origin());d.put("edited",!r.data().equals(r.origin()));
            d.put("selected",r.selected());d.put("selectOrder",r.selectOrder());d.put("revision",r.revision());
            d.put("productChanged",!sameProduct(client,r.anchor(),anchor));
            d.put("versionCount",versions.stream().filter(v->r.id().equals(v.get("directionId"))).count());
            Board b=boards.get(r.id());
            Map<String,Object> sb=new LinkedHashMap<>();
            sb.put("saved",b!=null);sb.put("confirmed",b!=null&&b.confirmed());sb.put("revision",b==null?0:b.revision());
            sb.put("source",b==null?"":b.source());sb.put("duration",b==null?r.data().duration():b.duration());
            sb.put("stale",b!=null&&b.directionRevision()!=r.revision());
            sb.put("shots",b==null?List.of():b.shots());
            sb.put("draftSegments",b!=null&&b.confirmed()?compose(r.data(),b,ratio(p),name,images,carried(client,id,r.id())):List.of());
            d.put("board",sb);
            dirs.add(d);
        }
        out.put("directions",dirs);
        out.put("ignores",s.db.queryForList("SELECT item_key FROM project_ad_ignores WHERE project_id=? ORDER BY created_at",String.class,id));
        out.put("versions",versions);
        out.put("videoEnabled",video.enabled());out.put("aiEnabled",ai.enabled());
        Map<String,Object> options=new LinkedHashMap<>();
        options.put("hooks",HOOKS);options.put("contentTypes",CONTENT);options.put("tempos",TEMPO);options.put("people",PEOPLE);options.put("voices",VOICE);
        options.put("looks",LOOK);options.put("endings",ENDING);options.put("durations",DURATIONS);options.put("tasks",TASKS);
        out.put("options",options);
        return out;
    }
    /** 商品换过：方向是按另一个商品写的（同一组商品图算同一个商品） */
    private boolean sameProduct(String client,String a,String b){
        if(Objects.equals(a,b)) return true;
        try{return media.productMembers(client,b).stream().anyMatch(x->x.id().equals(a));}catch(RuntimeException e){return false;}
    }
    /** 框架模式每个方向的版本从 1 开始数；一键成片按整个项目数（jobNo 都是项目里的总序号） */
    private static List<Map<String,Object>> numbered(List<Map<String,Object>> versions,String mode){
        Map<String,Integer> count=new HashMap<>();
        List<Map<String,Object>> asc=new ArrayList<>(versions);Collections.reverse(asc);
        for(Map<String,Object> v:asc){
            String k=mode.equals("FRAMEWORK")?str(v.get("directionId")):"";int n=count.merge(k,1,Integer::sum);
            v.put("jobNo",v.get("no"));v.put("no",n);
        }
        return versions;
    }
    static int planDuration(Project p){Object d=p.config().get("planDuration");return d instanceof Number n&&DURATIONS.contains(n.intValue())?n.intValue():15;}
    static OneClick oneClick(Project p){
        if(p.config().get("oneClick") instanceof Map<?,?> m){
            Object d=m.get("duration");
            return new OneClick(str(m.get("personaName")),d instanceof Number n&&DURATIONS.contains(n.intValue())?n.intValue():15,"copy".equals(m.get("src"))?"copy":"idea",
                str(m.get("copy")),str(m.get("creative")),str(m.get("people")),str(m.get("voice")),str(m.get("tempo")),str(m.get("look")));
        }
        return new OneClick("",15,"idea","","","","","","");
    }

    // ---------- 设置、换商品 ----------
    @Transactional
    public Map<String,Object> settings(String client,String user,String id,SettingsInput in,Integer duration,Map<String,Object> oneClick){
        Project p=project(client,id);
        if(p.revision()!=in.revision()) throw conflict();
        Map<String,Object> config=new LinkedHashMap<>(p.config());String name=p.name();
        if(in.ratio()!=null) config.put("videoRatio",pick(in.ratio(),RATIOS,"画幅只能选竖屏 9:16 或横屏 16:9"));
        if(in.resolution()!=null) config.put("videoResolution",pick(in.resolution(),RESOLUTIONS,"分辨率只能选 480p、720p 或 1080p"));
        if(in.personaName()!=null){
            String persona=in.personaName().trim();
            if(persona.length()>30) throw Store.bad("人群名称最多 30 个字");
            if(persona.isEmpty()){config.remove("personaId");config.remove("personaName");}
            else {config.put("personaName",persona);config.put("personaId",str(in.personaId()));}
        }
        if(duration!=null){if(!DURATIONS.contains(duration)) throw Store.bad("时长只能选 15 秒或 30 秒");config.put("planDuration",duration);}
        if(oneClick!=null){if(!mode(p).equals("ONE_CLICK")) throw Store.bad("只有一键成片有这些设置");config.put("oneClick",cleanOneClick(oneClick));}
        if(in.name()!=null){name=in.name().trim();if(name.isEmpty()||name.length()>150) throw Store.bad("项目名称需要 1 到 150 个字");}
        flow.writeConfig(client,p,name,config);
        s.audit(client,user,"修改项目设置",name);
        return flow(client,id);
    }
    static OneClick cleanOneClick(Map<String,Object> m){
        String persona=str(m.get("personaName")).trim();if(persona.length()>30) throw Store.bad("人群名称最多 30 个字");
        int d=m.get("duration") instanceof Number n?n.intValue():15;if(!DURATIONS.contains(d)) throw Store.bad("时长只能选 15 秒或 30 秒");
        String src=str(m.get("src")).isBlank()?"idea":str(m.get("src"));if(!Set.of("idea","copy").contains(src)) throw Store.bad("出发点只能选让 AI 构思或我有文案");
        String copy=str(m.get("copy")).trim(),creative=str(m.get("creative")).trim();
        if(copy.length()>500) throw Store.bad("文案最多 500 字");if(creative.length()>500) throw Store.bad("创意要求最多 500 字");
        return new OneClick(persona,d,src,src.equals("copy")?copy:"",creative,opt(m.get("people"),PEOPLE,"出镜人物"),opt(m.get("voice"),VOICE,"台词和声音"),opt(m.get("tempo"),TEMPO,"节奏"),opt(m.get("look"),LOOK,"片种"));
    }
    private static String opt(Object raw,List<String> allowed,String label){String v=str(raw).trim();if(!v.isEmpty()&&!allowed.contains(v)) throw Store.bad(label+"只能从给定的选项里选");return v;}
    @Transactional
    public Map<String,Object> changeProduct(String client,String user,String id,String anchor,int revision){
        Project p=project(client,id);if(p.revision()!=revision) throw conflict();
        List<Asset> members=media.productMembers(client,anchor);List<Asset> images=orderedImages(members);
        if(images.isEmpty()||images.size()>30) throw Store.bad("商品需要 1 到 30 张图片");
        Map<String,Object> card=flow.productCard(members.get(0),flow.assets(client));
        Map<String,Object> config=new LinkedHashMap<>(p.config());
        config.put("productAnchorId",members.get(0).id());config.put("productName",card.get("name"));config.put("productAssetIds",images.stream().map(Asset::id).toList());config.put("productCoverId",card.get("coverId"));
        config.remove("personaId");config.remove("personaName");config.remove("oneClickPlanKey");
        flow.writeConfig(client,p,p.name(),config);
        s.db.update("UPDATE projects SET sku=? WHERE id=?",members.get(0).sku(),id);
        s.db.update("UPDATE project_direction_boards SET confirmed=FALSE,revision=revision+1,updated_at=? WHERE project_id=?",Store.now(),id);
        s.audit(client,user,"项目换商品",p.name()+" → "+card.get("name"));
        return flow(client,id);
    }

    // ---------- 方向 ----------
    /** 写方向用的商品资料：名称、事实、分析、商品理解、人群 */
    private record Material(String name,String facts,Object report,Map<String,List<String>> understanding,List<ProductLibraryService.Persona> personas,boolean hasPrice) {}
    @SuppressWarnings("unchecked")
    private Material material(String client,Project p){
        String anchor=anchorOf(p);Map<String,Object> a=analysis.get(client,anchor);
        Map<String,Object> u=products.understanding(client,anchor);
        Map<String,List<String>> understanding=u.get("understanding") instanceof Map<?,?> m?(Map<String,List<String>>)m:Map.of();
        List<ProductLibraryService.Persona> personas=u.get("personas") instanceof List<?> l?l.stream().filter(ProductLibraryService.Persona.class::isInstance).map(ProductLibraryService.Persona.class::cast).toList():List.of();
        Object report=a.getOrDefault("report",Map.of());
        return new Material(str(p.config().get("productName")),p.facts(),report,understanding,personas,a.get("report")!=null&&hasPrice(s.write(report)));
    }
    private static ProductLibraryService.Persona persona(Material m,String name){return m.personas().stream().filter(x->x.name().equals(name)).findFirst().orElse(null);}
    /** 写 count 套方向：有文字模型走 AI，没有就按商品理解拼本地模板 */
    private List<Direction> write(Material m,String personaName,int duration,int count,int offset,List<String> avoidTitles,OneClick oc){
        if(!ai.enabled()) return local(m,personaName,duration,count,offset,oc);
        Map<String,Object> input=new LinkedHashMap<>();
        input.put("product",m.name());input.put("facts",m.facts());input.put("analysis",m.report());input.put("understanding",m.understanding());
        ProductLibraryService.Persona pr=persona(m,personaName);
        input.put("persona",pr==null?(personaName.isBlank()?"从商品的人群里挑最合适的一个":personaName):pr);
        input.put("personas",m.personas().stream().map(ProductLibraryService.Persona::name).toList());
        input.put("duration",duration+" 秒");input.put("hasPrice",m.hasPrice());input.put("avoidTitles",avoidTitles);
        if(oc!=null){
            Map<String,Object> want=new LinkedHashMap<>();
            want.put("creative",oc.creative());if(oc.src().equals("copy")) want.put("copy",oc.copy());
            want.put("people",oc.people());want.put("voice",oc.voice());want.put("tempo",oc.tempo());want.put("look",oc.look());
            input.put("userSettings",want);
        }
        input.put("options",Map.of("hook",HOOKS,"contentType",CONTENT,"tempo",TEMPO,"people",PEOPLE,"voice",VOICE,"look",LOOK,"ending",ENDING));
        List<Direction> out=new ArrayList<>();
        for(AiService.DirectionDraft x:ai.directions(input,count).directions()){
            if(x==null) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"AI 写方向没成功，原来的内容没有改动，请稍后再试");
            String hook=HOOKS.contains(x.hook())?x.hook():"痛点型";if(hook.equals("价格型")&&!m.hasPrice()) hook="痛点型";
            String who=personaName.isBlank()&&!m.personas().isEmpty()?m.personas().get(0).name():personaName;
            Direction d=new Direction(clip(str(x.title()).trim(),30),clip(str(x.why()).trim(),200),hook,clip(str(x.openVisual()).trim(),300),clip(str(x.openLine()).trim().replaceAll("^[「“\"]|[」”\"]$",""),60),
                clip(str(x.structure()).trim(),200),points(x.points()),clip(str(x.scene()).trim(),60),
                pickOr(x.contentType(),CONTENT,"",CONTENT.get(0)),pickOr(x.tempo(),TEMPO,oc==null?"":oc.tempo(),"正常"),pickOr(x.people(),PEOPLE,oc==null?"":oc.people(),"有人出镜"),
                pickOr(x.voice(),VOICE,oc==null?"":oc.voice(),"画外音"),pickOr(x.look(),LOOK,oc==null?"":oc.look(),"生活感实拍"),pickOr(x.ending(),ENDING,"","引导看详情"),who,duration);
            if(d.title().isBlank()) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"AI 返回的方向缺了名字，原来的内容没有改动，请再试一次");
            out.add(d);
        }
        return out;
    }
    /** 用户定了的格子以用户为准，否则用 AI 选的（不在选项里就用默认） */
    private static String pickOr(String raw,List<String> allowed,String forced,String fallback){
        if(forced!=null&&!forced.isBlank()) return forced;
        String v=str(raw).trim();return allowed.contains(v)?v:fallback;
    }
    private static List<String> points(List<String> raw){
        if(raw==null) return List.of();
        return raw.stream().filter(Objects::nonNull).map(String::trim).filter(x->!x.isEmpty()).map(x->clip(x,40)).limit(3).toList();
    }
    private static String first(List<String> l,int i){return l==null||l.isEmpty()?"":str(l.get(Math.floorMod(i,l.size()))).trim().replaceAll("[。！？!?，,；;]+$","");}
    /** 资料里的一句话常常很长，开头只取第一小句 */
    private static String clause(String t){String v=str(t).trim();String[] parts=v.split("[；;，,。！？!?、]");return parts.length==0?"":parts[0].trim();}
    private static final List<String> HOOK_ORDER=List.of("痛点型","结果前置型","对比型","悬念型","人群锁定型","身份代入型","反常识型");
    /** 本地模板：只用商品理解里已有的话拼，缺的就空着让人写；不是 AI 写的，界面上会标出来 */
    List<Direction> local(Material m,String personaName,int duration,int count,int offset,OneClick oc){
        Map<String,List<String>> u=m.understanding();
        List<String> core=u.getOrDefault("core",List.of()),sub=u.getOrDefault("sub",List.of()),pain=u.getOrDefault("pain",List.of()),scene=u.getOrDefault("scene",List.of());
        ProductLibraryService.Persona pr=persona(m,personaName);
        if(pr==null&&personaName.isBlank()&&!m.personas().isEmpty()) pr=m.personas().get(0);
        String who=pr==null?personaName:pr.name();
        List<String> hooks=new ArrayList<>();
        if(pr!=null&&pr.hooks()!=null) for(String h:pr.hooks()) if(HOOKS.contains(h)&&!hooks.contains(h)&&!h.equals("价格型")) hooks.add(h);
        for(String h:HOOK_ORDER) if(!hooks.contains(h)) hooks.add(h);
        List<Direction> out=new ArrayList<>();
        for(int i=0;i<count;i++){
            int k=offset+i;String hook=hooks.get(Math.floorMod(k,hooks.size()));
            String c0=clause(first(core,k)),p0=clause(pr!=null&&!str(pr.pain()).isBlank()?str(pr.pain()):first(pain,k)),sc=clause(pr!=null&&!str(pr.scene()).isBlank()?str(pr.scene()):first(scene,k)),detail=clause(first(sub.isEmpty()?core:sub,k));
            String title,visual,line,structure,content;
            switch(hook){
                case "痛点型"->{title="痛点开场";visual=p0.isEmpty()?"人物面对日常里的麻烦，皱眉犹豫":"人物遇到“"+p0+"”的情况，皱眉犹豫";line=p0.isEmpty()?"":p0+"？";structure="说出麻烦 → 亮出商品 → 细节证明 → 用起来的样子 → 引导看详情";content="痛点问答";}
                case "结果前置型"->{title="效果先给你看";visual="开场直接展示用上商品以后的样子"+(c0.isEmpty()?"":"，突出"+c0);line=c0.isEmpty()?"":"先看效果："+c0;structure="先给结果 → 倒回去讲怎么做到 → 细节证明 → 引导看详情";content="使用演示";}
                case "对比型"->{title="放一起对比";visual="左右分屏，普通款和这款放在一起"+(c0.isEmpty()?"":"，差别落在"+c0);line=c0.isEmpty()?"":"放一起看，差别在"+c0;structure="对比开场 → 讲清差别 → 细节特写 → 引导看详情";content="对比测试";}
                case "悬念型"->{title="细节先藏后露";visual="微距只露出商品的一角"+(detail.isEmpty()?"":"（"+detail+"）")+"，慢慢拉开";line="先别看全貌，看这一处";structure="局部特写 → 慢慢露出全貌 → 细节逐个看 → 定格商品";content="细节特写";}
                case "人群锁定型"->{title="点名给谁看";visual=who.isEmpty()?"目标人群的日常场景":"“"+who+"”的日常场景"+(sc.isEmpty()?"":"："+sc);line=who.isEmpty()?"":who+"，这条是给你的";structure="点名人群 → 说他们的需要 → 亮出商品 → 引导看详情";content="场景种草";}
                case "身份代入型"->{title="代入日常";visual="第一视角"+(sc.isEmpty()?"在日常场景里":"在“"+sc+"”里")+"拿起商品";line="";structure="代入场景 → 自然用上商品 → 细节 → 引导看详情";content="场景种草";}
                default->{title="反着说开场";visual="商品特写";line="";structure="反常识开场 → 解释为什么 → 细节证明 → 引导看详情";content="痛点问答";}
            }
            List<String> pts=new ArrayList<>();for(int j=0;j<Math.min(3,core.size());j++) pts.add(clip(first(core,k+j),40));
            out.add(new Direction(title,"本地模板：按开头类型「"+hook+"」和商品理解里的卖点、痛点、场景拼出来的，没有经过文字模型，请按实际情况改",hook,clip(visual,300),clip(line,60),structure,
                pts.stream().distinct().toList(),clip(sc,60),content,oc!=null&&!oc.tempo().isBlank()?oc.tempo():"正常",oc!=null&&!oc.people().isBlank()?oc.people():"有人出镜",
                oc!=null&&!oc.voice().isBlank()?oc.voice():"画外音",oc!=null&&!oc.look().isBlank()?oc.look():"生活感实拍","引导看详情",who,duration));
        }
        return out;
    }
    private String insert(String client,String project,int sort,String source,Direction d,String anchor,boolean selected,int selectOrder){
        String id=Store.id();var now=Store.now();
        s.db.update("INSERT INTO project_directions(id,project_id,client_id,sort_order,source,data_json,origin_json,product_anchor_id,selected,select_order,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,0,?,?)",
            id,project,client,sort,source,s.write(d),s.write(d),anchor,selected,selectOrder,now,now);
        return id;
    }
    private boolean hasVersions(String project,String direction){
        return s.db.queryForList("SELECT snapshot FROM jobs WHERE project_id=?",String.class,project).stream().anyMatch(x->direction.equals(str(s.snapshot(x).config().get("directionId"))));
    }
    private void deleteDirection(String id){
        s.db.update("DELETE FROM project_direction_boards WHERE direction_id=?",id);
        s.db.update("DELETE FROM project_directions WHERE id=?",id);
    }
    /** 框架模式：按人群和时长出 3 套方向。没选中、也没出过片的旧方向会被替换；出过片的留着。 */
    @Transactional
    public Map<String,Object> generate(String client,String user,String id,int revision,String personaName,Integer duration){
        Project p=project(client,id,"FRAMEWORK");
        if(p.revision()!=revision) throw conflict();
        String persona=str(personaName).trim();if(persona.length()>30) throw Store.bad("人群名称最多 30 个字");
        int d=duration==null?planDuration(p):duration;if(!DURATIONS.contains(d)) throw Store.bad("时长只能选 15 秒或 30 秒");
        Material m=material(client,p);
        List<Row> old=rows(client,id);
        List<Direction> made=write(m,persona,d,DIRECTION_COUNT,old.size(),old.stream().map(x->x.data().title()).toList(),null);
        for(Row r:old) if(!r.selected()&&!hasVersions(id,r.id())) deleteDirection(r.id());
        List<Row> kept=rows(client,id);
        if(kept.size()+made.size()>MAX_DIRECTIONS) throw Store.bad("这个项目的方向太多了，先取消选中一些再出");
        int sort=kept.stream().mapToInt(Row::sort).max().orElse(0);
        for(Direction x:made) insert(client,id,++sort,ai.enabled()?"AI":"LOCAL",x,anchorOf(p),false,0);
        Map<String,Object> config=new LinkedHashMap<>(p.config());config.put("planDuration",d);
        if(persona.isEmpty()){config.remove("personaName");config.remove("personaId");}else config.put("personaName",persona);
        flow.writeConfig(client,p,p.name(),config);
        s.audit(client,user,"出方向",p.name()+" / "+made.size()+" 套 / "+(ai.enabled()?"AI":"本地模板"));
        return flow(client,id);
    }
    /** 单独重出一套：换掉这一套的内容（原文也换），分镜会提示按新方向重写 */
    @Transactional
    public Map<String,Object> regenerate(String client,String user,String id,String dirId,int revision){
        Project p=project(client,id);Row r=row(client,id,dirId);
        if(r.revision()!=revision) throw new ResponseStatusException(HttpStatus.CONFLICT,"这个方向刚被改过，请刷新后再改");
        Material m=material(client,p);List<Row> all=rows(client,id);
        Direction x=write(m,r.data().personaName(),r.data().duration(),1,all.size()+r.sort(),all.stream().map(y->y.data().title()).toList(),mode(p).equals("ONE_CLICK")?oneClick(p):null).get(0);
        if(s.db.update("UPDATE project_directions SET data_json=?,origin_json=?,source=?,product_anchor_id=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",s.write(x),s.write(x),ai.enabled()?"AI":"LOCAL",anchorOf(p),Store.now(),dirId,revision)==0)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"这个方向刚被改过，请刷新后再改");
        touch(id);s.audit(client,user,"重出一套方向",p.name()+" / "+x.title());
        return flow(client,id);
    }
    /** 改方向里的格子（恢复原文就是把原文发回来） */
    @Transactional
    public Map<String,Object> edit(String client,String user,String id,String dirId,int revision,Map<String,Object> raw){
        Project p=project(client,id);Row r=row(client,id,dirId);
        if(r.revision()!=revision) throw new ResponseStatusException(HttpStatus.CONFLICT,"这个方向刚被改过，请刷新后再改");
        Direction d=cleanDirection(raw);
        if(d.equals(r.data())) return flow(client,id);
        if(s.db.update("UPDATE project_directions SET data_json=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",s.write(d),Store.now(),dirId,revision)==0)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"这个方向刚被改过，请刷新后再改");
        touch(id);s.audit(client,user,"改方向",p.name()+" / "+d.title());
        return flow(client,id);
    }
    static Direction cleanDirection(Map<String,Object> m){
        String title=str(m.get("title")).trim();if(title.isEmpty()||title.length()>30) throw Store.bad("方向名需要 1 到 30 个字");
        String hook=str(m.get("hook")).trim();if(!HOOKS.contains(hook)) throw Store.bad("开头类型只能从 8 种里选");
        int d=m.get("duration") instanceof Number n?n.intValue():15;if(!DURATIONS.contains(d)) throw Store.bad("时长只能选 15 秒或 30 秒");
        List<String> pts=new ArrayList<>();
        if(m.get("points") instanceof List<?> l) for(Object o:l){String t=str(o).trim();if(t.isEmpty()) continue;if(t.length()>40) throw Store.bad("每个卖点最多 40 字");pts.add(t);}
        if(pts.size()>3) throw Store.bad("一个方向最多讲 3 个卖点");
        return new Direction(title,len(m.get("why"),200,"为什么这么拍"),hook,len(m.get("openVisual"),300,"前 3 秒画面"),len(m.get("openLine"),60,"前 3 秒台词"),len(m.get("structure"),200,"结构"),pts,len(m.get("scene"),60,"场景"),
            must(m.get("contentType"),CONTENT,"内容类型"),must(m.get("tempo"),TEMPO,"节奏"),must(m.get("people"),PEOPLE,"人物"),must(m.get("voice"),VOICE,"声音"),must(m.get("look"),LOOK,"片种"),must(m.get("ending"),ENDING,"收尾"),
            len(m.get("personaName"),30,"人群名称"),d);
    }
    private static String len(Object raw,int max,String label){String v=str(raw).trim();if(v.length()>max) throw Store.bad(label+"最多 "+max+" 字");return v;}
    private static String must(Object raw,List<String> allowed,String label){String v=str(raw).trim();if(!allowed.contains(v)) throw Store.bad(label+"只能从给定的选项里选");return v;}
    private void touch(String id){s.db.update("UPDATE projects SET updated_at=? WHERE id=?",Store.now(),id);}
    /** 框架模式：确认选哪几个方向（1~3 个，按顺序记 A/B/C），还没有分镜的方向这时写分镜 */
    @Transactional
    public Map<String,Object> confirm(String client,String user,String id,int revision,List<String> ids){
        Project p=project(client,id,"FRAMEWORK");
        if(p.revision()!=revision) throw conflict();
        List<String> pickIds=new ArrayList<>(new LinkedHashSet<>(ids==null?List.<String>of():ids));
        if(pickIds.isEmpty()) throw Store.bad("至少选一个方向");
        if(pickIds.size()>MAX_SELECTED) throw Store.bad("最多同时测 "+MAX_SELECTED+" 个方向");
        List<Row> all=rows(client,id);
        for(String x:pickIds) if(all.stream().noneMatch(r->r.id().equals(x))) throw Store.bad("选的方向不在这个项目里");
        Map<String,Board> boards=boards(client,id);Material m=null;
        for(Row r:all){
            int at=pickIds.indexOf(r.id());
            s.db.update("UPDATE project_directions SET selected=?,select_order=? WHERE id=?",at>=0,Math.max(0,at),r.id());
            if(at>=0&&!boards.containsKey(r.id())){if(m==null) m=material(client,p);writeBoard(client,p,r,m,null,false,0);}
        }
        flow.writeConfig(client,p,p.name(),new LinkedHashMap<>(p.config()));
        s.audit(client,user,"选定方向",p.name()+" / "+pickIds.size()+" 个");
        return flow(client,id);
    }

    // ---------- 分镜 ----------
    /** 按方向写分镜：镜头时间和任务按时长档定好，只写画面和台词；写出来的同时存一份原文（可以恢复） */
    private void writeBoard(String client,Project p,Row r,Material m,OneClick oc,boolean confirmed,int expectRevision){
        Direction d=r.data();List<Object[]> slots=SLOTS.get(d.duration());
        List<StoryShot> shots=new ArrayList<>();String source;
        if(ai.enabled()){
            Map<String,Object> input=new LinkedHashMap<>();
            input.put("product",m.name());input.put("facts",m.facts());input.put("analysis",m.report());input.put("understanding",m.understanding());
            input.put("direction",d);input.put("slots",slots.stream().map(x->Map.of("start",x[0],"end",x[1],"task",x[2])).toList());
            if(oc!=null){if(oc.src().equals("copy")) input.put("copy",oc.copy());if(!oc.creative().isBlank()) input.put("creative",oc.creative());}
            AiService.BoardDraft b=ai.directionBoard(input,slots.size());
            for(int i=0;i<slots.size();i++){
                AiService.BoardDraftShot x=b.shots().get(i);
                List<String> lines=x.lines()==null?List.of():x.lines().stream().filter(Objects::nonNull).map(String::trim).filter(t->!t.isEmpty()).map(t->clip(t,LINE_LENGTH)).limit(BOARD_LINES).toList();
                shots.add(shot(i,slots.get(i),clip(x.visual().trim(),VISUAL_LENGTH),lines));
            }
            source="AI";
        } else {shots=localBoard(m,d,oc,slots);source="LOCAL";}
        if(expectRevision==0&&s.db.queryForObject("SELECT COUNT(*) FROM project_direction_boards WHERE direction_id=?",Integer.class,r.id())==0)
            s.db.update("INSERT INTO project_direction_boards(direction_id,project_id,client_id,source,direction_revision,duration,shots_json,confirmed,revision,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?)",r.id(),p.id(),client,source,r.revision(),d.duration(),s.write(shots),confirmed,Store.now());
        else if(s.db.update("UPDATE project_direction_boards SET source=?,direction_revision=?,duration=?,shots_json=?,confirmed=?,revision=revision+1,updated_at=? WHERE direction_id=? AND revision=?",source,r.revision(),d.duration(),s.write(shots),confirmed,Store.now(),r.id(),expectRevision)==0)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"分镜刚被改过，请刷新后再改");
    }
    private static StoryShot shot(int i,Object[] slot,String visual,List<String> lines){
        return new StoryShot("f"+(i+1),((Number)slot[0]).doubleValue(),((Number)slot[1]).doubleValue(),"",visual,lines,"",visual,lines,slot[2].toString());
    }
    private static final Pattern SENTENCE=Pattern.compile("[^。！？!?\\n]+[。！？!?]?");
    List<StoryShot> localBoard(Material m,Direction d,OneClick oc,List<Object[]> slots){
        Map<String,List<String>> u=m.understanding();
        List<String> core=u.getOrDefault("core",List.of()),pain=u.getOrDefault("pain",List.of()),obj=u.getOrDefault("obj",List.of()),scene=u.getOrDefault("scene",List.of());
        String name=m.name().isBlank()?"商品":"「"+m.name()+"」";
        String sc=!d.scene().isBlank()?d.scene():clause(first(scene,0));
        List<String> copy=new ArrayList<>();
        if(oc!=null&&oc.src().equals("copy")){var mt=SENTENCE.matcher(oc.copy());while(mt.find()){String t=mt.group().trim();if(!t.isEmpty()) copy.add(clip(t,LINE_LENGTH));}}
        List<StoryShot> out=new ArrayList<>();int trust=0;
        for(int i=0;i<slots.size();i++){
            String task=slots.get(i)[2].toString();String visual;List<String> lines=new ArrayList<>();
            switch(task){
                case "抓住注意力"->{visual=d.openVisual().isBlank()?name+"出现在画面中央":d.openVisual();if(!d.openLine().isBlank()) lines.add(d.openLine());}
                case "建立需求"->{String p0=clause(first(pain,0));visual=p0.isEmpty()?"表现观众日常里不方便的时候":"表现“"+p0+"”的时候";}
                case "给出方案"->visual="亮出"+name+"，完整展示外观";
                case "建立信任"->{String pt=d.points().isEmpty()?first(core,trust):d.points().get(Math.min(trust,d.points().size()-1));visual=pt.isEmpty()?"近景特写商品细节":"近景特写："+pt;if(!pt.isEmpty()) lines.add(pt);trust++;}
                case "打消顾虑"->{String o=clause(first(obj,0));visual=o.isEmpty()?"近景展示商品做工细节":"针对“"+o+"”，展示能看清的细节";}
                case "促进决定"->visual=sc.isEmpty()?"在日常场景里用上商品":"在“"+sc+"”里用上商品";
                default->visual=switch(d.ending()){case "评论区互动"->"商品定格，画面中间留出提问";case "品牌口号"->"商品定格，品牌标识淡入";case "定格商品"->"商品定格在画面中央";default->"商品定格，画面下方留出看详情的提示";};
            }
            if(d.people().equals("无人出镜")&&visual.startsWith("人物")) visual="画面"+visual.substring(2);
            out.add(shot(i,slots.get(i),clip(visual,VISUAL_LENGTH),lines));
        }
        if(!copy.isEmpty()){
            // 照用户的文案：按顺序平均放进各镜，一个字不改
            List<StoryShot> withCopy=new ArrayList<>();int n=out.size();
            for(int i=0;i<n;i++){
                int a=copy.size()<=n?Math.min(i,copy.size()):i*copy.size()/n,b=copy.size()<=n?Math.min(i+1,copy.size()):(i+1)*copy.size()/n;
                List<String> lines=new ArrayList<>(copy.subList(a,b));
                if(lines.size()>BOARD_LINES){List<String> merged=new ArrayList<>(lines.subList(0,BOARD_LINES-1));merged.add(clip(String.join("",lines.subList(BOARD_LINES-1,lines.size())),LINE_LENGTH));lines=merged;}
                StoryShot x=out.get(i);withCopy.add(new StoryShot(x.id(),x.start(),x.end(),"",x.visual(),lines,"",x.visual(),lines,x.task()));
            }
            out=withCopy;
        }
        return out;
    }
    public record ShotEdit(String id,String visual,List<String> lines,String task) {}
    @Transactional
    public Map<String,Object> saveBoard(String client,String user,String id,String dirId,int revision,List<ShotEdit> edits,boolean confirmed){
        Project p=project(client,id);Row r=row(client,id,dirId);Board b=boards(client,id).get(dirId);
        if(b==null) throw Store.bad("这个方向还没有分镜");
        if(b.revision()!=revision) throw new ResponseStatusException(HttpStatus.CONFLICT,"分镜刚被改过，请刷新后再改");
        if(edits==null||edits.size()!=b.shots().size()) throw new ResponseStatusException(HttpStatus.CONFLICT,"镜头数对不上，请刷新后再改");
        if(mode(p).equals("ONE_CLICK")) confirmed=true;
        List<StoryShot> next=new ArrayList<>();
        for(int i=0;i<b.shots().size();i++){
            StoryShot o=b.shots().get(i);ShotEdit e=edits.get(i);
            if(e==null||!o.id().equals(e.id())) throw new ResponseStatusException(HttpStatus.CONFLICT,"镜头顺序变了，请刷新后再改");
            String visual=str(e.visual()).trim(),task=str(e.task()).trim();
            if(visual.length()>VISUAL_LENGTH) throw Store.bad("第 "+(i+1)+" 镜的画面最多 "+VISUAL_LENGTH+" 字");
            if(!task.isEmpty()&&!TASKS.contains(task)) throw Store.bad("这一镜的任务只能从 7 种里选");
            List<String> lines=new ArrayList<>();
            for(String l:e.lines()==null?List.<String>of():e.lines()){String t=str(l).trim();if(t.isEmpty()) continue;if(t.length()>LINE_LENGTH) throw Store.bad("每句台词最多 "+LINE_LENGTH+" 字");lines.add(t);}
            if(lines.size()>BOARD_LINES) throw Store.bad("一镜最多 "+BOARD_LINES+" 句台词");
            if(confirmed&&visual.isEmpty()) throw Store.bad("第 "+(i+1)+" 镜还没写画面");
            next.add(new StoryShot(o.id(),o.start(),o.end(),"",o.origVisual(),o.origLines(),"",visual,lines,task));
        }
        if(s.db.update("UPDATE project_direction_boards SET shots_json=?,confirmed=?,revision=revision+1,updated_at=? WHERE direction_id=? AND revision=?",s.write(next),confirmed,Store.now(),dirId,revision)==0)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"分镜刚被改过，请刷新后再改");
        touch(id);s.audit(client,user,confirmed&&mode(p).equals("FRAMEWORK")?"确认分镜":"保存分镜",p.name()+" / "+r.data().title());
        return flow(client,id);
    }
    /** 按方向重写分镜（方向改过以后）：写过的会被替换，原文也换成新的 */
    @Transactional
    public Map<String,Object> rewriteBoard(String client,String user,String id,String dirId,int revision){
        Project p=project(client,id);Row r=row(client,id,dirId);Board b=boards(client,id).get(dirId);
        if((b==null?0:b.revision())!=revision) throw new ResponseStatusException(HttpStatus.CONFLICT,"分镜刚被改过，请刷新后再改");
        boolean oc=mode(p).equals("ONE_CLICK");
        writeBoard(client,p,r,material(client,p),oc?oneClick(p):null,oc,revision);
        touch(id);s.audit(client,user,"按方向重写分镜",p.name()+" / "+r.data().title());
        return flow(client,id);
    }

    // ---------- 出片 ----------
    /** 每个方向的出片词：画面和商品图（带上片种、场景、人物、节奏）、每一镜、声音、之前审片说差的原因 */
    static List<Segment> compose(Direction d,Board b,String ratio,String productName,int images,List<String> avoid){
        List<Segment> base=ProjectFlowService.compose(b.shots(),ratio,b.duration(),productName,images,"",avoid);
        List<Segment> out=new ArrayList<>();
        for(Segment x:base){
            if(x.key().equals("style")){
                List<String> extra=new ArrayList<>();
                extra.add("片种："+d.look());if(!d.scene().isBlank()) extra.add("拍摄场景："+d.scene());extra.add("人物："+d.people());extra.add("节奏："+d.tempo());
                out.add(new Segment("style",x.title(),x.text()+String.join("；",extra)+"。"));
            } else if(x.key().equals("sound")){
                out.add(new Segment("sound","声音",d.voice().equals("纯音乐")?"不要画外音和对白，只用背景音乐；分镜里的台词只作为字幕参考。":d.voice().equals("人物对白")?"台词由画面里的人物说出来，口型自然；不生成字幕。":"画外音只作为声音，语气自然、吐字清楚，不生成对白字幕。"));
            } else out.add(x);
        }
        return out;
    }
    private List<String> carried(String client,String project,String direction){
        List<String> out=new ArrayList<>();
        s.db.query("SELECT v.reason,j.snapshot FROM job_verdicts v JOIN jobs j ON j.id=v.job_id WHERE j.client_id=? AND j.project_id=? AND v.rating='BAD' ORDER BY j.created_at",rs->{
            String r=str(rs.getString(1)).trim();
            if(!r.isEmpty()&&!out.contains(r)&&direction.equals(str(s.snapshot(rs.getString(2)).config().get("directionId")))) out.add(r);
        },client,project);
        return out;
    }
    @Transactional
    public Map<String,Object> createVersion(String client,String user,String id,VersionInput in,String directionId){
        if(!in.confirmed()) throw Store.bad("先确认出片");
        Project p=project(client,id);
        if(str(directionId).isBlank()) throw Store.bad("要说明是哪个方向出片");
        Row r=row(client,id,directionId);Board b=boards(client,id).get(directionId);
        boolean framework=mode(p).equals("FRAMEWORK");
        if(framework&&!r.selected()) throw Store.bad("这个方向没有选上，先在方向里选它");
        if(b==null||!b.confirmed()) throw Store.bad(framework?"先确认这个方向的分镜再出片":"先出一版，自动写好方向和分镜");
        return submit(client,user,p,r,b,cleanSegments(in.segments()),in.note(),in.basedOn(),framework?null:oneClick(p));
    }
    private Map<String,Object> submit(String client,String user,Project p,Row r,Board b,List<Segment> input,String rawNote,String rawBasedOn,OneClick snapshot){
        String id=p.id();
        s.db.queryForObject("SELECT id FROM clients WHERE id=? FOR UPDATE",String.class,client);
        List<JobRow> jobs=flow.jobRows(client,id);
        Map<String,String> dirOf=new HashMap<>();
        for(JobRow j:jobs) dirOf.put(j.id(),str(s.snapshot(s.db.queryForObject("SELECT snapshot FROM jobs WHERE id=?",String.class,j.id())).config().get("directionId")));
        boolean framework=snapshot==null;
        List<JobRow> lane=framework?jobs.stream().filter(j->r.id().equals(dirOf.get(j.id()))).toList():jobs;
        if(lane.stream().anyMatch(j->Set.of("QUEUED","RUNNING").contains(j.status()))) throw new ResponseStatusException(HttpStatus.CONFLICT,framework?"这个方向有一版正在出片，等它出好或先取消":"有一版正在出片，等它出好或先取消");
        if(lane.stream().anyMatch(ProjectFlowService::uncertain)) throw new ResponseStatusException(HttpStatus.CONFLICT,"有一版的提交结果还不确定，先去核对那一版（核对完可以点“取消这一版”）再出新的");
        int duration=b.duration();
        List<Segment> segments=new ArrayList<>(input);
        List<String> avoid=carried(client,id,r.id());
        if(!avoid.isEmpty()) segments.add(new Segment("avoid","要避开的问题","之前审片说差的地方，这一版要避开："+String.join("；",avoid)));
        String prompt=String.join("\n\n",segments.stream().map(Segment::text).toList());
        if(prompt.length()>PROMPT_LENGTH) throw Store.bad("出片词超过 "+PROMPT_LENGTH+" 字，删掉一些再出");
        String basedOn=str(rawBasedOn).trim();
        if(!basedOn.isEmpty()&&lane.stream().noneMatch(j->j.id().equals(basedOn))) throw Store.bad("要改的那一版不在这个"+(framework?"方向":"项目")+"里");
        String note=str(rawNote).trim();
        if(note.isEmpty()) note=lane.isEmpty()?(framework?"首版：按已确认的分镜出片":"首版：按设置自动写方向和分镜"):"";
        if(note.isEmpty()) throw Store.bad("写一句这一版改了什么");
        if(note.length()>200) throw Store.bad("改动说明最多 200 字");
        List<String> images=orderedImages(media.productMembers(client,anchorOf(p))).stream().map(Asset::id).toList();
        if(images.isEmpty()||images.size()>30) throw Store.bad("商品需要 1 到 30 张图片");
        Map<String,Object> config=new LinkedHashMap<>(p.config());
        config.put("productAssetIds",images);config.put("generationPrompt",prompt);config.put("promptSegments",segments);
        config.put("changeNote",note);config.put("carriedReasons",avoid);
        if(basedOn.isEmpty()) config.remove("basedOnJobId"); else config.put("basedOnJobId",basedOn);
        config.put("directionId",r.id());config.put("directionTitle",r.data().title());
        if(snapshot==null) config.remove("oneClickSnapshot"); else config.put("oneClickSnapshot",snapshot);
        config.put("confirmedDialogue",dialogue(b.shots(),duration));
        List<Shot> shots=List.of(new Shot(duration,"按已确认的分镜和出片词生成；完整时间轴见出片词","",images.get(0),0,true));
        if(s.write(config).length()>20000) throw Store.bad("出片词和项目配置太长了");
        if(s.db.update("UPDATE projects SET shots=?,config=?,duration=?,facts_confirmed=TRUE,status='SCRIPT_READY',revision=revision+1,updated_at=? WHERE client_id=? AND id=? AND revision=?",s.write(shots),s.write(config),duration,Store.now(),client,id,p.revision())==0) throw conflict();
        Project snap=s.project(client,id);
        if(video.enabled()) for(String image:images) if(!s.asset(client,image).mime().startsWith("image/")) throw Store.bad("视频参考素材必须是图片");
        // 同一个项目可以几个方向同时出片，所以不走 ProjectService.submit 的“一个项目只能一条在做”；其余检查和它一样
        String jobId=Store.id();var now=Store.now();
        int no=s.db.queryForObject("SELECT COALESCE(MAX(revision),0)+1 FROM jobs WHERE project_id=?",Integer.class,id);
        String status=video.enabled()?"QUEUED":"BLOCKED";
        String message=video.enabled()?"已排队：提交后将调用 "+video.model():"视频供应商未配置；未发出请求";
        s.db.update("INSERT INTO jobs(id,client_id,project_id,name,provider,status,progress,snapshot,message,output_name,revision,created_at,updated_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",jobId,client,id,p.name(),"VIDEO_API",status,0,s.write(snap),message,null,no,now,now,user);
        s.db.update("UPDATE work_flow SET phase='PRODUCTION',revision=revision+1,updated_at=? WHERE project_id=? AND phase='PLAN'",now,id);
        s.audit(client,user,"出片",p.name()+" / "+r.data().title()+" / "+note);
        return numbered(flow.versions(client,id),mode(p)).stream().filter(v->v.get("id").equals(jobId)).findFirst().orElseThrow();
    }
    /** 一键成片：保存设置；设置和上次一样就沿用现在的方向和分镜（你可能改过），不一样就重新写 1 个方向和它的分镜；然后出片 */
    @Transactional
    public Map<String,Object> run(String client,String user,String id,int revision,Map<String,Object> raw,String note){
        Project p=project(client,id,"ONE_CLICK");
        if(p.revision()!=revision) throw conflict();
        OneClick oc=cleanOneClick(raw==null?Map.of():raw);
        if(oc.src().equals("copy")&&oc.copy().isBlank()) throw Store.bad("选了“我有文案”，先把文案填上");
        String key=s.write(Map.of("settings",oc,"product",anchorOf(p)));
        Map<String,Object> config=new LinkedHashMap<>(p.config());config.put("oneClick",oc);
        List<Row> all=rows(client,id);Row cur=all.stream().filter(Row::selected).findFirst().orElse(null);
        boolean fresh=cur==null||!key.equals(str(p.config().get("oneClickPlanKey")))||!boards(client,id).containsKey(cur.id());
        if(fresh){
            Material m=material(client,p);
            Direction d=write(m,oc.personaName(),oc.duration(),1,all.size(),all.stream().map(x->x.data().title()).toList(),oc).get(0);
            s.db.update("UPDATE project_directions SET selected=FALSE WHERE project_id=?",id);
            String dirId=insert(client,id,all.stream().mapToInt(Row::sort).max().orElse(0)+1,ai.enabled()?"AI":"LOCAL",d,anchorOf(p),true,0);
            writeBoard(client,p,row(client,id,dirId),m,oc,true,0);
            config.put("oneClickPlanKey",key);
        }
        flow.writeConfig(client,p,p.name(),config);
        Project now=s.project(client,id);
        Row r=rows(client,id).stream().filter(Row::selected).findFirst().orElseThrow();Board b=boards(client,id).get(r.id());
        List<Segment> segments=compose(r.data(),b,ratio(now),str(now.config().get("productName")),productImages(now).size(),List.of());
        String n=str(note).trim();
        if(n.isEmpty()&&!flow.jobRows(client,id).isEmpty()) n=fresh?"改了设置，重新写了方向和分镜":"设置没变，按现在的方向和分镜再出一版";
        return submit(client,user,now,r,b,segments,n,null,oc);
    }
}
