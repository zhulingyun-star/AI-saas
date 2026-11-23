package com.shangzhen.workbench;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import java.util.regex.Pattern;
import static com.shangzhen.workbench.Models.*;

/**
 * 新版「项目」：一个项目 = 一个商品 + 一种创作方式，就是 projects 里的一行（作品）。
 * 不再经过交付项目（campaigns）：新建的项目 work_flow.campaign_id 为空，旧的交付项目数据和接口不动。
 * 视频二创走四步：商品 → 方向（参考视频）→ 分镜（project_storyboards）→ 出片（每一版 = jobs 一行，出片词在任务快照里）。
 * 框架模式、一键成片（新建的）详情在 DirectionFlowService：同样四步，方向和每个方向的分镜在 V11 的表里，出片复用这里的版本、审片和取消。
 * 旧流程里建的框架模式 / 一键成片作品仍然进旧的制作页。
 */
@Service
public class ProjectFlowService {
    static final Set<String> RESERVED=Set.of("全部项目","未分类");
    static final List<String> RATIOS=List.of("9:16","16:9"),RESOLUTIONS=List.of("480p","720p","1080p");
    static final Map<String,String> MODES=new LinkedHashMap<>(Map.of("REMAKE","视频二创","FRAMEWORK","框架模式","ONE_CLICK","一键成片"));
    static final int MAX_LINES=8,LINE_LENGTH=120,VISUAL_LENGTH=1000,CAMERA_LENGTH=200,PROMPT_LENGTH=5000;
    static final String NOT_CONFIGURED="未配置";
    public record StoryShot(String id,double start,double end,String origCamera,String origVisual,List<String> origLines,String camera,String visual,List<String> lines,String task) {}
    public record Segment(String key,String title,String text) {}
    public record CreateInput(String mode,String productAnchorId,String referenceAssetId,String ratio,String resolution,String folderId,String name,String facts,boolean factsConfirmed) {}
    public record ShotEdit(String id,String camera,String visual,List<String> lines,String task) {}
    public record SettingsInput(int revision,String name,String ratio,String resolution,String personaId,String personaName,String approach) {}
    public record VersionInput(List<Segment> segments,String note,String basedOn,boolean confirmed) {}
    private static final TypeReference<List<StoryShot>> SHOTS=new TypeReference<>(){};
    private static final TypeReference<List<Segment>> SEGMENTS=new TypeReference<>(){};
    private final Store s;private final MediaService media;private final ProductAnalysisService analysis;private final ProductLibraryService products;
    private final ReferenceLibraryService refs;private final ReferenceStoryboardService storyboards;private final ProjectService projects;private final AiService ai;private final VideoApiClient video;
    private final LibraryFolders folderRules;
    public ProjectFlowService(Store s,MediaService media,ProductAnalysisService analysis,ProductLibraryService products,ReferenceLibraryService refs,ReferenceStoryboardService storyboards,ProjectService projects,AiService ai,VideoApiClient video){
        this.s=s;this.media=media;this.analysis=analysis;this.products=products;this.refs=refs;this.storyboards=storyboards;this.projects=projects;this.ai=ai;this.video=video;
        this.folderRules=new LibraryFolders(s,"project_folders","project_profiles","项目",RESERVED);
    }

    // ---------- 识别项目的创作方式 ----------
    static String mode(Project p){
        Object creation=p.config().get("creationMode");
        if("VIDEO_REMAKE".equals(creation)) return "REMAKE";
        if("ECOMMERCE_VIDEO".equals(creation)) return "ONE_CLICK".equals(p.config().get("productionMode"))?"ONE_CLICK":"FRAMEWORK";
        return "OTHER";
    }
    static String referenceId(Project p){
        String direct=str(p.config().get("referenceAssetId"));
        if(!direct.isBlank()) return direct;
        if(p.config().get("referenceLinks") instanceof List<?> links&&!links.isEmpty()&&links.get(0) instanceof Map<?,?> link) return str(link.get("assetId"));
        return "";
    }
    static String anchorOf(Project p){return str(p.config().get("productAnchorId"));}
    /** 能用新版四步详情打开的：视频二创，并且记下了商品和参考视频（包括旧流程出片时建的作品）；
     *  框架模式 / 一键成片只算新版新建的（flowVersion=2），旧流程里建的还在旧制作页。 */
    static boolean flowable(Project p,Map<String,Asset> assets){
        String m=mode(p);Asset product=assets.get(anchorOf(p));
        boolean hasProduct=product!=null&&product.kind().equals("PRODUCT");
        if(m.equals("FRAMEWORK")||m.equals("ONE_CLICK")) return hasProduct&&"2".equals(str(p.config().get("flowVersion")));
        if(!m.equals("REMAKE")) return false;
        Asset ref=assets.get(referenceId(p));
        return hasProduct&&ref!=null&&ref.kind().equals("REFERENCE");
    }
    /** 旧页面地址：框架模式、一键成片和其他作品进制作页；旧二创草稿回到交付项目里的二创页。 */
    static String legacyPath(Project p){
        String m=mode(p),campaign=str(p.config().get("campaignId")),ref=referenceId(p);
        if(m.equals("REMAKE")&&!campaign.isBlank()) return "/projects/"+campaign+"/remake"+(ref.isBlank()?"":"?reference="+ref);
        if(m.equals("FRAMEWORK")&&p.config().get("selectedFramework")==null) return "/studio/"+p.id()+"?framework=1";
        return "/studio/"+p.id();
    }

    // ---------- 列表 ----------
    Map<String,Asset> assets(String client){
        Map<String,Asset> out=new HashMap<>();
        for(Asset a:s.db.query("SELECT * FROM assets WHERE client_id=? AND kind IN ('PRODUCT','REFERENCE') ORDER BY created_at,id",s.assets,client)) out.put(a.id(),a);
        return out;
    }
    record JobRow(String id,String project,String status,int no,boolean output,boolean submitted,String message,int progress,String created,String updated) {}
    List<JobRow> jobRows(String client,String project){
        String sql="SELECT id,project_id,status,revision,output_name,external_task_id,message,progress,created_at,updated_at FROM jobs WHERE client_id=?"+(project==null?"":" AND project_id=?")+" ORDER BY created_at DESC,id DESC";
        Object[] args=project==null?new Object[]{client}:new Object[]{client,project};
        return s.db.query(sql,(r,n)->new JobRow(r.getString(1),r.getString(2),r.getString(3),r.getInt(4),r.getString(5)!=null,r.getString(6)!=null,r.getString(7),r.getInt(8),r.getTimestamp(9).toLocalDateTime().toString(),r.getTimestamp(10).toLocalDateTime().toString()),args);
    }
    Map<String,Map<String,Object>> verdicts(String client){
        Map<String,Map<String,Object>> out=new HashMap<>();
        s.db.query("SELECT job_id,rating,reason,use_state,revision,updated_by,updated_at FROM job_verdicts WHERE client_id=?",rs->{
            Map<String,Object> v=new LinkedHashMap<>();v.put("rating",rs.getString(2));v.put("reason",rs.getString(3));v.put("use",rs.getString(4));v.put("revision",rs.getInt(5));v.put("by",rs.getString(6));v.put("at",rs.getTimestamp(7).toLocalDateTime().toString());
            out.put(rs.getString(1),v);
        },client);
        return out;
    }
    Map<String,Object> productCard(Asset anchor,Map<String,Asset> assets){
        if(anchor==null||!anchor.kind().equals("PRODUCT")) return null;
        String key=MediaService.productKey(anchor);
        List<Asset> members=assets.values().stream().filter(a->a.kind().equals("PRODUCT")&&MediaService.productKey(a).equals(key)).sorted(Comparator.comparing(Asset::createdAt).thenComparing(Asset::id)).toList();
        Asset first=members.get(0);
        String coverId=members.stream().map(a->str(a.metadata().get("coverAssetId"))).filter(x->!x.isBlank()).findFirst().orElse("");
        Asset cover=members.stream().filter(a->a.id().equals(coverId)&&a.mime().startsWith("image/")).findFirst().orElse(members.stream().filter(a->a.mime().startsWith("image/")).findFirst().orElse(null));
        Map<String,Object> m=new LinkedHashMap<>();
        m.put("anchorId",first.id());m.put("groupId",str(first.metadata().get("productGroupId")));
        m.put("name",members.stream().map(a->str(a.metadata().get("productName"))).filter(x->!x.isBlank()).findFirst().orElse(first.sku().isBlank()?"未命名商品":first.sku()));
        m.put("sku",first.sku());m.put("coverId",cover==null?null:cover.id());
        m.put("imageIds",orderedImages(members).stream().map(Asset::id).toList());
        return m;
    }
    static List<Asset> orderedImages(List<Asset> members){
        String cover=members.stream().map(a->str(a.metadata().get("coverAssetId"))).filter(x->!x.isBlank()).findFirst().orElse("");
        List<Asset> images=new ArrayList<>(members.stream().filter(a->a.mime().startsWith("image/")).toList());
        images.sort(Comparator.comparing(a->!a.id().equals(cover)));
        return images;
    }
    private String referenceName(String client,Asset ref){
        String display=s.db.query("SELECT display_name FROM reference_profiles WHERE client_id=? AND asset_id=?",(r,n)->r.getString(1),client,ref.id()).stream().filter(Objects::nonNull).findFirst().orElse("");
        return display.isBlank()?ref.name():display;
    }
    private Map<String,Object> item(String client,Project p,Map<String,Asset> assets,Map<String,String> folders,List<JobRow> jobs,Map<String,Map<String,Object>> verdicts,Map<String,Boolean> boards,Map<String,int[]> plans){
        Map<String,Object> m=new LinkedHashMap<>();
        boolean flow=flowable(p,assets);
        m.put("id",p.id());m.put("name",p.name());m.put("revision",p.revision());m.put("mode",mode(p));m.put("flow",flow);m.put("legacyPath",legacyPath(p));
        m.put("folderId",folders.get(p.id()));
        m.put("product",productCard(assets.get(anchorOf(p)),assets));
        Asset ref=assets.get(referenceId(p));
        m.put("reference",ref==null||!ref.kind().equals("REFERENCE")?null:Map.of("assetId",ref.id(),"name",referenceName(client,ref)));
        m.put("ratio",ratio(p));m.put("resolution",resolution(p));m.put("duration",p.duration());m.put("status",p.status());
        m.put("storyboardConfirmed",Boolean.TRUE.equals(boards.get(p.id())));m.put("storyboardSaved",boards.containsKey(p.id()));
        int[] plan=plans.getOrDefault(p.id(),new int[3]);
        m.put("plan",Map.of("directions",plan[0],"selected",plan[1],"boardsConfirmed",plan[2]));
        List<JobRow> mine=jobs.stream().filter(j->j.project().equals(p.id())).toList();
        long running=mine.stream().filter(j->Set.of("QUEUED","RUNNING").contains(j.status())).count();
        long review=mine.stream().filter(j->j.output()&&!verdicts.containsKey(j.id())).count();
        long usable=mine.stream().filter(j->verdicts.containsKey(j.id())&&"USABLE".equals(verdicts.get(j.id()).get("use"))).count();
        Map<String,Object> v=new LinkedHashMap<>();v.put("count",mine.size());v.put("running",running);v.put("unreviewed",review);v.put("usable",usable);v.put("latestStatus",mine.isEmpty()?null:mine.get(0).status());
        m.put("versions",v);
        String updated=p.updatedAt().toString();for(JobRow j:mine) if(j.updated().compareTo(updated)>0) updated=j.updated();
        m.put("updatedAt",updated);m.put("createdAt",p.createdAt().toString());
        return m;
    }
    private Map<String,String> folderOf(String client){
        Map<String,String> out=new HashMap<>();
        s.db.query("SELECT project_id,folder_id FROM project_profiles WHERE client_id=?",rs->{if(rs.getString(2)!=null) out.put(rs.getString(1),rs.getString(2));},client);
        return out;
    }
    private Map<String,Boolean> boards(String client){
        Map<String,Boolean> out=new HashMap<>();
        s.db.query("SELECT project_id,confirmed FROM project_storyboards WHERE client_id=?",rs->{out.put(rs.getString(1),rs.getBoolean(2));},client);
        return out;
    }
    /** 框架模式 / 一键成片的方向概况：[方向数, 选中的方向数, 选中且分镜已确认的方向数] */
    private Map<String,int[]> plans(String client){
        Map<String,int[]> out=new HashMap<>();
        s.db.query("SELECT d.project_id,d.selected,b.confirmed FROM project_directions d LEFT JOIN project_direction_boards b ON b.direction_id=d.id WHERE d.client_id=?",rs->{
            int[] x=out.computeIfAbsent(rs.getString(1),k->new int[3]);x[0]++;
            if(rs.getBoolean(2)){x[1]++;if(rs.getBoolean(3)) x[2]++;}
        },client);
        return out;
    }
    List<Map<String,Object>> items(String client,List<Project> list){
        Map<String,Asset> assets=assets(client);Map<String,String> folders=folderOf(client);List<JobRow> jobs=jobRows(client,null);
        Map<String,Map<String,Object>> verdicts=verdicts(client);Map<String,Boolean> boards=boards(client);Map<String,int[]> plans=plans(client);
        List<Map<String,Object>> out=new ArrayList<>();
        for(Project p:list) out.add(item(client,p,assets,folders,jobs,verdicts,boards,plans));
        out.sort(Comparator.comparing((Map<String,Object> m)->m.get("updatedAt").toString()).reversed());
        return out;
    }
    public Map<String,Object> library(String client){
        List<Project> all=s.db.query("SELECT * FROM projects WHERE client_id=? ORDER BY updated_at DESC",s.projects,client);
        Map<String,Object> out=new LinkedHashMap<>();
        out.put("folders",folderRules.list(client));out.put("projects",items(client,all));
        out.put("videoEnabled",video.enabled());out.put("aiEnabled",ai.enabled());
        return out;
    }
    /** 用到某个商品（同一组商品图）的项目 */
    public List<Map<String,Object>> productProjects(String client,String anchor){
        Set<String> ids=new HashSet<>(media.productMembers(client,anchor).stream().map(Asset::id).toList());
        List<Project> all=s.db.query("SELECT * FROM projects WHERE client_id=? ORDER BY updated_at DESC",s.projects,client).stream().filter(p->ids.contains(anchorOf(p))).toList();
        return items(client,all);
    }

    // ---------- 文件夹、改名、移动 ----------
    @Transactional public LibraryFolders.Folder createFolder(String client,String user,String name,String parentId){return folderRules.create(client,user,name,parentId);}
    @Transactional public LibraryFolders.Folder renameFolder(String client,String user,String id,String name,int revision){return folderRules.rename(client,user,id,name,revision);}
    @Transactional public void deleteFolder(String client,String user,String id){folderRules.delete(client,user,id);}
    @Transactional public Map<String,Object> move(String client,String user,String id,String folderId){
        Project p=s.project(client,id);String target=folderRules.target(client,folderId);
        if(s.db.update("UPDATE project_profiles SET folder_id=?,updated_at=? WHERE project_id=? AND client_id=?",target,Store.now(),id,client)==0)
            s.db.update("INSERT INTO project_profiles(project_id,client_id,folder_id,updated_at) VALUES(?,?,?,?)",id,client,target,Store.now());
        s.audit(client,user,"移动项目",p.name()+" → "+folderRules.label(client,target));
        return Map.of("id",id,"folderId",Objects.toString(target,""));
    }

    // ---------- 新建 ----------
    @Transactional
    public Map<String,Object> create(String client,String user,CreateInput in){
        String mode=Objects.toString(in.mode(),"");
        if(!MODES.containsKey(mode)) throw Store.bad("创作方式只能选视频二创、框架模式或一键成片");
        String ratio=pick(in.ratio(),RATIOS,"画幅只能选竖屏 9:16 或横屏 16:9"),resolution=pick(in.resolution(),RESOLUTIONS,"分辨率只能选 480p、720p 或 1080p");
        if(str(in.productAnchorId()).isBlank()) throw Store.bad("先选一个商品");
        List<Asset> members=media.productMembers(client,in.productAnchorId());
        List<Asset> images=orderedImages(members);
        if(images.isEmpty()||images.size()>30) throw Store.bad("商品需要 1 到 30 张图片");
        Map<String,Asset> assets=assets(client);
        Map<String,Object> card=productCard(members.get(0),assets);
        String productName=card.get("name").toString();
        String facts=str(in.facts()).trim();
        if(facts.isEmpty()) throw Store.bad("商品事实不能为空");
        if(facts.length()>8000) throw Store.bad("商品事实最多 8000 字");
        if(!in.factsConfirmed()) throw Store.bad("先核对商品事实");
        String folder=folderRules.target(client,in.folderId());
        String name=str(in.name()).trim();if(name.isEmpty()) name=productName+" · "+MODES.get(mode);
        if(name.length()>150) throw Store.bad("项目名称最多 150 个字");
        Map<String,Object> config=new LinkedHashMap<>();
        config.put("flowVersion",2);config.put("productAnchorId",members.get(0).id());config.put("productName",productName);
        config.put("productAssetIds",images.stream().map(Asset::id).toList());config.put("productCoverId",card.get("coverId"));
        Map<String,Object> a=analysis.get(client,members.get(0).id());
        config.put("productAnalysisRevision",a.getOrDefault("revision",0));
        config.put("videoRatio",ratio);config.put("videoResolution",resolution);
        int duration=15;String format="电商短视频";
        if(mode.equals("REMAKE")){
            Asset ref=reference(client,in.referenceAssetId());
            ReferenceStoryboardService.Report report=report(client,ref.id());
            if(report==null) throw Store.bad("参考视频还没拆解完，拆解完才能用来做视频二创");
            duration=Math.max(4,Math.min(60,(int)Math.ceil(report.duration())));format="参考片改编";
            config.put("creationMode","VIDEO_REMAKE");config.put("referenceAssetId",ref.id());
            config.put("referenceLinks",List.of(Map.of("assetId",ref.id(),"name",referenceName(client,ref),"mode","structure")));
        } else {
            config.put("creationMode","ECOMMERCE_VIDEO");config.put("productionMode",mode);
            if(a.get("report") instanceof Map<?,?> r) config.put("productAnalysisSnapshot",Map.of("appearance",str(r.get("appearance")),"material",str(r.get("material"))));
        }
        String category=s.db.queryForObject("SELECT category FROM clients WHERE id=?",String.class,client);
        Project p=projects.create(client,user,new ProjectInput(name,members.get(0).sku(),category,"抖音",format,duration,facts,true,List.of(),config,0));
        s.db.update("INSERT INTO project_profiles(project_id,client_id,folder_id,updated_at) VALUES(?,?,?,?)",p.id(),client,folder,Store.now());
        s.audit(client,user,"新建项目",name+" / "+MODES.get(mode));
        return items(client,List.of(p)).get(0);
    }

    @Transactional
    public Map<String,Object> rename(String client,String user,String id,String raw,int revision){
        String name=str(raw).trim();
        if(name.isEmpty()||name.length()>150) throw Store.bad("项目名称需要 1 到 150 个字");
        if(s.db.update("UPDATE projects SET name=?,revision=revision+1,updated_at=? WHERE client_id=? AND id=? AND revision=?",name,Store.now(),client,id,revision)==0){
            s.project(client,id);throw conflict();
        }
        s.audit(client,user,"重命名项目",name);
        return items(client,List.of(s.project(client,id))).get(0);
    }

    // ---------- 详情（视频二创四步） ----------
    private Asset reference(String client,String id){
        if(str(id).isBlank()) throw Store.bad("视频二创要先选一条参考视频");
        Asset a=s.asset(client,id);
        if(!a.kind().equals("REFERENCE")||!a.mime().startsWith("video/")) throw Store.bad("请选择参考视频");
        return a;
    }
    ReferenceStoryboardService.Report report(String client,String asset){
        return storyboards.get(client,asset).get("report") instanceof ReferenceStoryboardService.Report r?r:null;
    }
    private int boardRevision(String client,String asset){return ((Number)storyboards.get(client,asset).getOrDefault("revision",0)).intValue();}
    /** 视频二创详情专用：别的创作方式走 DirectionFlowService */
    private Project flowProject(String client,String id){
        Project p=anyFlowProject(client,id);
        if(!mode(p).equals("REMAKE")) throw Store.bad("这个项目不是视频二创");
        return p;
    }
    /** 任何能用新版详情打开的项目（出片词改写、审片这类各方式共用的操作） */
    Project anyFlowProject(String client,String id){
        Project p=s.project(client,id);
        if(!flowable(p,assets(client))) throw Store.bad("这个项目还在旧页面里打开："+legacyPath(p));
        return p;
    }
    private record Board(String reference,int sourceRevision,List<StoryShot> shots,boolean confirmed,int revision) {}
    private Board board(String client,String id){
        return s.db.query("SELECT reference_id,source_revision,shots_json,confirmed,revision FROM project_storyboards WHERE client_id=? AND project_id=?",(r,n)->new Board(r.getString(1),r.getInt(2),s.read(r.getString(3),SHOTS),r.getBoolean(4),r.getInt(5)),client,id).stream().findFirst().orElse(null);
    }
    /** 还没保存过分镜时，按参考视频的拆解生成：左边是原视频，右边先带上原机位，画面和台词等人写（旧流程写过的台词会带过来）。 */
    List<StoryShot> initialShots(String client,Project p){
        String refId=referenceId(p);
        ReferenceStoryboardService.Report r=report(client,refId);
        if(r==null) return List.of();
        Map<String,String> tasks=taskMap(refs.detail(client,refId).get("shotTasks"));
        List<double[]> newTimes=new ArrayList<>();List<String> newTexts=new ArrayList<>();
        for(RemakeDraftService.CopyLine l:legacyLines(client,p,refId)) if(!str(l.text()).isBlank()){newTimes.add(new double[]{l.start(),l.end()});newTexts.add(l.text().trim());}
        Map<Integer,String[]> legacyShots=legacyPromptShots(p,r.shots().size());
        List<StoryShot> out=new ArrayList<>();
        for(int i=0;i<r.shots().size();i++){
            ReferenceStoryboardService.Shot shot=r.shots().get(i);boolean last=i==r.shots().size()-1;
            List<String> orig=new ArrayList<>();
            for(ReferenceStoryboardService.Line l:r.dialogue()) if(inShot((l.start()+l.end())/2,shot,last)&&!str(l.text()).isBlank()) orig.add(l.text().trim());
            List<String> lines=new ArrayList<>();
            for(int k=0;k<newTimes.size();k++) if(inShot((newTimes.get(k)[0]+newTimes.get(k)[1])/2,shot,last)&&lines.size()<MAX_LINES) lines.add(clip(newTexts.get(k),LINE_LENGTH));
            String[] legacy=legacyShots.get(i+1);
            out.add(new StoryShot(shot.id(),shot.start(),shot.end(),str(shot.camera()),str(shot.action()),orig,
                clip(legacy!=null?legacy[0]:str(shot.camera()),CAMERA_LENGTH),legacy!=null?clip(legacy[1],VISUAL_LENGTH):"",lines,tasks.getOrDefault(shot.id(),"")));
        }
        return out;
    }
    private static boolean inShot(double at,ReferenceStoryboardService.Shot shot,boolean last){return at>=shot.start()&&(at<shot.end()||last&&at<=shot.end()+0.001);}
    private static Map<String,String> taskMap(Object raw){
        Map<String,String> out=new HashMap<>();
        if(raw instanceof Map<?,?> m) m.forEach((k,v)->{if(v!=null) out.put(String.valueOf(k),String.valueOf(v));});
        return out;
    }
    /** 旧的视频二创流程写过的替换台词（同一条参考视频 + 同一个商品），新项目第一次打开分镜时带过来。 */
    private List<RemakeDraftService.CopyLine> legacyLines(String client,Project p,String refId){
        String draftId=str(p.config().get("remakeDraftId"));
        if(draftId.isBlank()) draftId=str(p.config().get("legacyRemakeDraftId"));
        List<String> drafts;
        if(!draftId.isBlank()) drafts=s.db.queryForList("SELECT draft_json FROM remake_drafts WHERE client_id=? AND id=? AND draft_json IS NOT NULL",String.class,client,draftId);
        else {
            Set<String> members=new HashSet<>();
            try{members.addAll(media.productMembers(client,anchorOf(p)).stream().map(Asset::id).toList());}catch(RuntimeException e){return List.of();}
            drafts=new ArrayList<>();
            s.db.query("SELECT anchor_id,draft_json FROM remake_drafts WHERE client_id=? AND asset_id=? AND draft_json IS NOT NULL ORDER BY updated_at DESC",rs->{if(members.contains(rs.getString(1))) drafts.add(rs.getString(2));},client,refId);
        }
        if(drafts.isEmpty()) return List.of();
        try{return s.json.readValue(drafts.get(0),RemakeDraftService.Draft.class).lines();}catch(Exception e){return List.of();}
    }
    private static final Pattern PROMPT_SHOT=Pattern.compile("第\\s*(\\d+)\\s*镜\\s*[（(]\\s*第?\\s*[0-9.]+\\s*[~～—-]\\s*[0-9.]+\\s*秒\\s*[)）]\\s*[:：]?");
    /** 旧流程出过片的作品：从当时的出片词里取每镜写好的机位和画面。镜数对不上就不取。 */
    static Map<Integer,String[]> legacyPromptShots(Project p,int count){
        Map<Integer,String[]> out=new HashMap<>();
        String prompt=str(p.config().get("generationPrompt"));
        if(prompt.isBlank()||p.config().get("promptSegments")!=null) return out;
        var m=PROMPT_SHOT.matcher(prompt);List<int[]> marks=new ArrayList<>();
        while(m.find()) marks.add(new int[]{Integer.parseInt(m.group(1)),m.start(),m.end()});
        if(marks.size()!=count) return out;
        for(int i=0;i<marks.size();i++){
            int end=i+1<marks.size()?marks.get(i+1)[1]:prompt.length();
            String body=prompt.substring(marks.get(i)[2],end);
            int stop=body.indexOf("画外音");if(stop>=0) body=body.substring(0,stop);
            int blank=body.indexOf("\n\n");if(blank>=0) body=body.substring(0,blank);
            body=body.trim();if(body.isEmpty()) continue;
            int dot=body.indexOf('。');
            String camera=dot>0&&dot<60?body.substring(0,dot):"",visual=dot>0&&dot<60?body.substring(dot+1).trim():body;
            out.put(marks.get(i)[0],new String[]{camera,visual});
        }
        return out;
    }

    public Map<String,Object> flow(String client,String id){
        Project p=flowProject(client,id);Map<String,Asset> assets=assets(client);
        Map<String,Object> out=new LinkedHashMap<>();
        Map<String,Object> item=items(client,List.of(p)).get(0);
        out.put("project",item);out.put("revision",p.revision());
        Map<String,Object> settings=new LinkedHashMap<>();
        settings.put("ratio",ratio(p));settings.put("resolution",resolution(p));settings.put("personaId",str(p.config().get("personaId")));settings.put("personaName",str(p.config().get("personaName")));
        settings.put("approach",str(p.config().get("remakeApproach")));settings.put("facts",p.facts());
        out.put("settings",settings);
        out.put("product",productInfo(client,p,assets));
        // 参考视频
        String refId=referenceId(p);Map<String,Object> ref=new LinkedHashMap<>(refs.detail(client,refId));
        ReferenceStoryboardService.Report report=report(client,refId);
        ref.put("report",report);ref.put("boardRevision",boardRevision(client,refId));
        out.put("reference",ref);
        out.put("legacyApproach",legacyApproach(client,p,refId));
        // 分镜
        Board b=board(client,id);
        Map<String,Object> sb=new LinkedHashMap<>();
        sb.put("saved",b!=null);sb.put("confirmed",b!=null&&b.confirmed());sb.put("revision",b==null?0:b.revision());
        sb.put("shots",b==null?initialShots(client,p):b.shots());
        sb.put("stale",b!=null&&(!b.reference().equals(refId)||b.sourceRevision()!=boardRevision(client,refId)));
        out.put("storyboard",sb);
        out.put("ignores",s.db.queryForList("SELECT item_key FROM project_ad_ignores WHERE project_id=? ORDER BY created_at",String.class,id));
        // 出片
        int target=(int)Math.ceil(report==null?p.duration():report.duration());
        out.put("targetDuration",target);
        out.put("draftSegments",b!=null&&b.confirmed()?compose(b.shots(),ratio(p),target,str(p.config().get("productName")),productImages(p).size(),report==null?"":report.music(),carried(client,id)):List.of());
        out.put("versions",versions(client,id));
        out.put("videoEnabled",video.enabled());out.put("aiEnabled",ai.enabled());
        return out;
    }
    /** 详情里的商品：卡片 + 分析概况（广告用语检查用）+ 商品库里的人群 */
    Map<String,Object> productInfo(String client,Project p,Map<String,Asset> assets){
        String anchor=anchorOf(p);Map<String,Object> product=new LinkedHashMap<>(productCard(assets.get(anchor),assets));
        Map<String,Object> a=analysis.get(client,anchor);
        Map<String,Object> pa=new LinkedHashMap<>();pa.put("status",a.get("status"));pa.put("revision",a.getOrDefault("revision",0));pa.put("stale",a.getOrDefault("stale",false));
        if(a.get("report") instanceof Map<?,?> r){
            pa.put("hasReport",true);pa.put("category",str(r.get("category")));pa.put("appearance",str(r.get("appearance")));
            pa.put("risks",r.get("exaggeration_risks") instanceof List<?> l?l:List.of());
            pa.put("hasPrice",hasPrice(s.write(r)));
        } else {pa.put("hasReport",false);pa.put("risks",List.of());pa.put("hasPrice",false);}
        product.put("analysis",pa);
        product.put("personas",products.understanding(client,anchor).get("personas"));
        return product;
    }
    private Map<String,Object> legacyApproach(String client,Project p,String refId){
        String draftId=str(p.config().get("remakeDraftId"));if(draftId.isBlank()) draftId=str(p.config().get("legacyRemakeDraftId"));
        Set<String> members=new HashSet<>(media.productMembers(client,anchorOf(p)).stream().map(Asset::id).toList());
        String finalId=draftId;
        List<String> rows=new ArrayList<>();
        s.db.query("SELECT id,anchor_id,draft_json FROM remake_drafts WHERE client_id=? AND asset_id=? AND draft_json IS NOT NULL ORDER BY updated_at DESC",rs->{if(finalId.isBlank()?members.contains(rs.getString(2)):finalId.equals(rs.getString(1))) rows.add(rs.getString(3));},client,refId);
        if(rows.isEmpty()) return null;
        try{RemakeDraftService.Draft d=s.json.readValue(rows.get(0),RemakeDraftService.Draft.class);return Map.of("relation",str(d.relation()),"reason",str(d.reason()),"approach",str(d.approach()));}catch(Exception e){return null;}
    }
    static List<String> productImages(Project p){
        if(p.config().get("productAssetIds") instanceof List<?> ids) return ids.stream().map(Object::toString).toList();
        return List.of();
    }
    static boolean hasPrice(String text){return Pattern.compile("[¥￥]\\s*\\d|\\d+(\\.\\d+)?\\s*(元|块)|(售价|价格|到手价|活动价)\\s*[:：]?\\s*\\d").matcher(Objects.toString(text,"")).find();}

    // ---------- 设置、换商品、换参考视频 ----------
    @Transactional
    public Map<String,Object> settings(String client,String user,String id,SettingsInput in){
        Project p=flowProject(client,id);
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
        if(in.approach()!=null){String approach=in.approach().trim();if(approach.length()>1500) throw Store.bad("改编思路最多 1500 字");config.put("remakeApproach",approach);}
        if(in.name()!=null){name=in.name().trim();if(name.isEmpty()||name.length()>150) throw Store.bad("项目名称需要 1 到 150 个字");}
        writeConfig(client,p,name,config);
        s.audit(client,user,"修改项目设置",name);
        return flow(client,id);
    }
    void writeConfig(String client,Project p,String name,Map<String,Object> config){
        if(s.write(config).length()>20000) throw Store.bad("项目配置过长");
        if(s.db.update("UPDATE projects SET name=?,config=?,revision=revision+1,updated_at=? WHERE client_id=? AND id=? AND revision=?",name,s.write(config),Store.now(),client,p.id(),p.revision())==0) throw conflict();
    }
    @Transactional
    public Map<String,Object> changeProduct(String client,String user,String id,String anchor,int revision){
        Project p=flowProject(client,id);if(p.revision()!=revision) throw conflict();
        List<Asset> members=media.productMembers(client,anchor);List<Asset> images=orderedImages(members);
        if(images.isEmpty()||images.size()>30) throw Store.bad("商品需要 1 到 30 张图片");
        Map<String,Object> card=productCard(members.get(0),assets(client));
        Map<String,Object> config=new LinkedHashMap<>(p.config());
        config.put("productAnchorId",members.get(0).id());config.put("productName",card.get("name"));config.put("productAssetIds",images.stream().map(Asset::id).toList());config.put("productCoverId",card.get("coverId"));
        config.remove("personaId");config.remove("personaName");
        writeConfig(client,p,p.name(),config);
        s.db.update("UPDATE projects SET sku=? WHERE id=?",members.get(0).sku(),id);
        s.db.update("UPDATE project_storyboards SET confirmed=FALSE,revision=revision+1,updated_at=? WHERE project_id=?",Store.now(),id);
        s.audit(client,user,"项目换商品",p.name()+" → "+card.get("name"));
        return flow(client,id);
    }
    @Transactional
    public Map<String,Object> changeReference(String client,String user,String id,String asset,int revision){
        Project p=flowProject(client,id);if(p.revision()!=revision) throw conflict();
        Asset ref=reference(client,asset);ReferenceStoryboardService.Report report=report(client,ref.id());
        if(report==null) throw Store.bad("这条参考视频还没拆解完，拆解完才能换上");
        Map<String,Object> config=new LinkedHashMap<>(p.config());
        config.put("referenceAssetId",ref.id());config.put("referenceLinks",List.of(Map.of("assetId",ref.id(),"name",referenceName(client,ref),"mode","structure")));
        config.remove("remakeApproach");
        if(config.containsKey("remakeDraftId")) config.put("legacyRemakeDraftId",config.remove("remakeDraftId"));
        writeConfig(client,p,p.name(),config);
        s.db.update("UPDATE projects SET duration=? WHERE id=?",Math.max(4,Math.min(60,(int)Math.ceil(report.duration()))),id);
        s.db.update("DELETE FROM project_storyboards WHERE project_id=?",id);
        s.db.update("DELETE FROM project_ad_ignores WHERE project_id=?",id);
        s.audit(client,user,"项目换参考视频",p.name()+" → "+referenceName(client,ref));
        return flow(client,id);
    }

    // ---------- 分镜 ----------
    @Transactional
    public Map<String,Object> saveStoryboard(String client,String user,String id,int revision,List<ShotEdit> edits,boolean confirmed){
        Project p=flowProject(client,id);Board b=board(client,id);
        List<StoryShot> base=b!=null?b.shots():initialShots(client,p);
        if((b==null?0:b.revision())!=revision) throw new ResponseStatusException(HttpStatus.CONFLICT,"分镜刚被改过，请刷新后再改");
        if(edits==null||edits.size()!=base.size()) throw new ResponseStatusException(HttpStatus.CONFLICT,"镜头数和参考视频的拆解对不上，请刷新后再改");
        List<StoryShot> next=new ArrayList<>();
        for(int i=0;i<base.size();i++){
            StoryShot o=base.get(i);ShotEdit e=edits.get(i);
            if(e==null||!o.id().equals(e.id())) throw new ResponseStatusException(HttpStatus.CONFLICT,"镜头顺序变了，请刷新后再改");
            String camera=str(e.camera()).trim(),visual=str(e.visual()).trim(),task=str(e.task()).trim();
            if(camera.length()>CAMERA_LENGTH) throw Store.bad("第 "+(i+1)+" 镜的机位最多 "+CAMERA_LENGTH+" 字");
            if(visual.length()>VISUAL_LENGTH) throw Store.bad("第 "+(i+1)+" 镜的画面最多 "+VISUAL_LENGTH+" 字");
            if(!task.isEmpty()&&!ReferenceLibraryService.TASKS.contains(task)) throw Store.bad("这一镜的任务只能从 7 种里选");
            List<String> lines=new ArrayList<>();
            for(String l:e.lines()==null?List.<String>of():e.lines()){String t=str(l).trim();if(t.isEmpty()) continue;if(t.length()>LINE_LENGTH) throw Store.bad("每句台词最多 "+LINE_LENGTH+" 字");lines.add(t);}
            if(lines.size()>MAX_LINES) throw Store.bad("一镜最多 "+MAX_LINES+" 句台词");
            if(confirmed&&visual.isEmpty()) throw Store.bad("第 "+(i+1)+" 镜还没写改成什么画面");
            next.add(new StoryShot(o.id(),o.start(),o.end(),o.origCamera(),o.origVisual(),o.origLines(),camera,visual,lines,task));
        }
        String refId=referenceId(p);int source=b!=null?b.sourceRevision():boardRevision(client,refId);
        if(b==null) s.db.update("INSERT INTO project_storyboards(project_id,client_id,reference_id,source_revision,shots_json,confirmed,revision,updated_at) VALUES(?,?,?,?,?,?,1,?)",id,client,refId,source,s.write(next),confirmed,Store.now());
        else if(s.db.update("UPDATE project_storyboards SET shots_json=?,confirmed=?,revision=revision+1,updated_at=? WHERE project_id=? AND revision=?",s.write(next),confirmed,Store.now(),id,revision)==0)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"分镜刚被改过，请刷新后再改");
        s.db.update("UPDATE projects SET updated_at=? WHERE id=?",Store.now(),id);
        if(confirmed) s.db.update("UPDATE work_flow SET phase='PRODUCTION',revision=revision+1,updated_at=? WHERE project_id=? AND phase='PLAN'",Store.now(),id);
        s.audit(client,user,confirmed?"确认分镜":"保存分镜",p.name());
        return flow(client,id);
    }
    /** 参考视频重新拆解过以后，按新的拆解重做分镜（写过的会丢掉，页面上先提示）。 */
    @Transactional
    public Map<String,Object> resetStoryboard(String client,String user,String id,int revision){
        flowProject(client,id);Board b=board(client,id);
        if(b!=null&&b.revision()!=revision) throw new ResponseStatusException(HttpStatus.CONFLICT,"分镜刚被改过，请刷新后再改");
        s.db.update("DELETE FROM project_storyboards WHERE project_id=?",id);
        s.audit(client,user,"按新拆解重做分镜",id);
        return flow(client,id);
    }
    /** 让 AI 按商品写每一镜「改成」的机位、画面和台词；文字模型没配置时直接说明，不写假内容。 */
    @Transactional
    public Map<String,Object> draftStoryboard(String client,String user,String id,int revision){
        Project p=flowProject(client,id);Board b=board(client,id);
        if((b==null?0:b.revision())!=revision) throw new ResponseStatusException(HttpStatus.CONFLICT,"分镜刚被改过，请刷新后再改");
        if(!ai.enabled()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"文字模型没配置，AI 写不了；分镜没有改动，可以逐镜手动写");
        List<StoryShot> base=b!=null?b.shots():initialShots(client,p);
        Map<String,Object> a=analysis.get(client,anchorOf(p));
        AiService.StoryboardDraft d=ai.remakeStoryboard(str(p.config().get("productName")),p.facts(),a.getOrDefault("report",Map.of()),base);
        Map<String,AiService.StoryboardDraftShot> byId=new HashMap<>();
        for(AiService.StoryboardDraftShot x:d.shots()==null?List.<AiService.StoryboardDraftShot>of():d.shots()) if(x!=null&&x.id()!=null) byId.put(x.id(),x);
        if(byId.size()!=base.size()||!byId.keySet().containsAll(base.stream().map(StoryShot::id).toList())) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"AI 返回的镜头和参考视频对不上，分镜没有改动，请再试一次");
        List<ShotEdit> edits=base.stream().map(o->{var x=byId.get(o.id());return new ShotEdit(o.id(),clip(str(x.camera()),CAMERA_LENGTH),clip(str(x.visual()),VISUAL_LENGTH),x.lines()==null?List.of():x.lines().stream().filter(Objects::nonNull).map(l->clip(l,LINE_LENGTH)).limit(MAX_LINES).toList(),o.task());}).toList();
        if(d.approach()!=null&&!d.approach().isBlank()){
            Map<String,Object> config=new LinkedHashMap<>(p.config());config.put("remakeApproach",clip(d.approach().trim(),1500));writeConfig(client,p,p.name(),config);
        }
        return saveStoryboard(client,user,id,revision,edits,false);
    }
    @Transactional
    public List<String> ignore(String client,String user,String id,String key){
        s.project(client,id);
        String k=str(key).trim();if(k.isEmpty()||k.length()>300) throw Store.bad("忽略记录格式不对");
        if(s.db.queryForObject("SELECT COUNT(*) FROM project_ad_ignores WHERE project_id=? AND item_key=?",Integer.class,id,k)==0)
            s.db.update("INSERT INTO project_ad_ignores(project_id,item_key,created_by,created_at) VALUES(?,?,?,?)",id,k,user,Store.now());
        if(s.db.queryForObject("SELECT COUNT(*) FROM project_ad_ignores WHERE project_id=?",Integer.class,id)>500) throw Store.bad("忽略的太多了");
        return s.db.queryForList("SELECT item_key FROM project_ad_ignores WHERE project_id=? ORDER BY created_at",String.class,id);
    }

    // ---------- 出片词 ----------
    static String ratioText(String ratio){return "16:9".equals(ratio)?"横屏 16:9":"竖屏 9:16";}
    /** 按已确认的分镜拼出分段的出片词：画面和商品图、每一镜、声音，以及之前审片说「差」的原因。 */
    static List<Segment> compose(List<StoryShot> shots,String ratio,int duration,String productName,int images,String music,List<String> avoid){
        List<Segment> out=new ArrayList<>();
        out.add(new Segment("style","画面和商品图","制作"+ratioText(ratio)+"商品短视频，时长 "+duration+" 秒，按"+ratioText(ratio)+"构图。商品「"+productName+"」的参考图按提交顺序是图1至图"+Math.max(1,images)+"，都是同一件商品；每一镜里商品的外形、颜色、材质和标识位置都要和参考图一致。不要把商品上的印字放大成字幕或花字。"));
        double total=shots.isEmpty()?duration:shots.get(shots.size()-1).end();double scale=total>0?duration/total:1;
        for(int i=0;i<shots.size();i++){
            StoryShot x=shots.get(i);
            StringBuilder t=new StringBuilder(String.format(Locale.ROOT,"第 %d 镜（第 %.1f~%.1f 秒）：",i+1,x.start()*scale,x.end()*scale));
            if(!str(x.camera()).isBlank()) t.append(x.camera().trim().replaceAll("[。；;]+$","")).append("。");
            t.append(str(x.visual()).trim());
            if(x.lines()!=null&&!x.lines().isEmpty()){t.append("\n画外音（声音来自画面之外，不生成字幕）：");for(String l:x.lines()) t.append("「").append(l).append("」");}
            out.add(new Segment("shot-"+(i+1),"镜头 "+(i+1),t.toString()));
        }
        out.add(new Segment("sound","声音","画外音只作为声音，语气自然、吐字清楚，不生成对白字幕。"+(str(music).isBlank()?"":"背景声音参考原视频："+music.trim())));
        if(avoid!=null&&!avoid.isEmpty()) out.add(new Segment("avoid","要避开的问题","之前审片说差的地方，这一版要避开："+String.join("；",avoid)));
        return out;
    }
    /** 每一版的出片词：新流程按段保存；旧流程出的片只有整段文字，按空行切开再起名。 */
    static List<Segment> segmentsOf(Project snapshot,Store s){
        Object raw=snapshot.config().get("promptSegments");
        if(raw instanceof List<?>) try{return s.json.convertValue(raw,SEGMENTS);}catch(Exception ignored){/* 旧格式按整段处理 */}
        String prompt=str(snapshot.config().get("generationPrompt"));
        List<Segment> out=new ArrayList<>();if(prompt.isBlank()) return out;
        String[] parts=prompt.trim().split("\\n\\s*\\n+");int other=0;
        for(int i=0;i<parts.length;i++){
            String t=parts[i].trim();if(t.isEmpty()) continue;
            var m=Pattern.compile("^第\\s*(\\d+)\\s*镜").matcher(t);
            String key,title;
            if(m.find()){key="shot-"+m.group(1);title="镜头 "+m.group(1);}
            else if(t.contains("背景音乐")||t.startsWith("声音")){key="sound";title="声音";}
            else if(t.contains("图1至图")||t.contains("图1是")){key="images";title="商品图怎么用";}
            else if(i==0){key="style";title="画面风格";}
            else if(i==1){key="people";title="出镜人物";}
            else {key="other-"+(++other);title="其他";}
            String k=key;int n=2;while(out.stream().anyMatch(x->x.key().equals(k))) key=k+"-"+(n++);
            out.add(new Segment(key,title,t));
        }
        return out;
    }
    private List<String> carried(String client,String project){
        List<String> out=new ArrayList<>();
        s.db.query("SELECT v.reason FROM job_verdicts v JOIN jobs j ON j.id=v.job_id WHERE j.client_id=? AND j.project_id=? AND v.rating='BAD' ORDER BY j.created_at",rs->{String r=str(rs.getString(1)).trim();if(!r.isEmpty()&&!out.contains(r)) out.add(r);},client,project);
        return out;
    }

    // ---------- 版本 ----------
    List<Map<String,Object>> versions(String client,String project){
        Map<String,Map<String,Object>> verdicts=verdicts(client);
        List<Map<String,Object>> out=new ArrayList<>();
        for(JobRow j:jobRows(client,project)){
            Project snap=s.snapshot(s.db.queryForObject("SELECT snapshot FROM jobs WHERE id=?",String.class,j.id()));
            Map<String,Object> v=new LinkedHashMap<>();
            v.put("id",j.id());v.put("no",j.no());v.put("status",j.status());v.put("message",j.message());v.put("progress",j.progress());v.put("submitted",j.submitted());
            v.put("hasOutput",j.output());v.put("createdAt",j.created());v.put("updatedAt",j.updated());
            v.put("ratio",ratio(snap));v.put("resolution",resolution(snap));v.put("duration",snap.duration());
            v.put("note",str(snap.config().get("changeNote")));v.put("basedOn",snap.config().get("basedOnJobId"));
            v.put("carriedReasons",snap.config().get("carriedReasons") instanceof List<?> l?l:List.of());
            v.put("segments",segmentsOf(snap,s));
            v.put("directionId",snap.config().get("directionId"));
            v.put("oneClick",snap.config().get("oneClickSnapshot"));
            v.put("verdict",verdicts.get(j.id()));
            out.add(v);
        }
        return out;
    }
    /** 用户提交的出片词分段：去掉“要避开的问题”（出片时按审片记录重新加）、空段，检查长度 */
    static List<Segment> cleanSegments(List<Segment> raw){
        List<Segment> segments=new ArrayList<>();
        for(Segment x:raw==null?List.<Segment>of():raw){
            if(x==null) continue;String key=str(x.key()).trim(),title=str(x.title()).trim(),text=str(x.text()).trim();
            if(key.equals("avoid")) continue;
            if(key.isEmpty()||key.length()>40||title.length()>40) throw Store.bad("出片词的分段格式不对");
            if(text.isEmpty()) continue;
            if(text.length()>3000) throw Store.bad("「"+title+"」这一段太长了");
            segments.add(new Segment(key,title.isEmpty()?key:title,text));
        }
        if(segments.isEmpty()||segments.size()>60) throw Store.bad("出片词不能为空");
        return segments;
    }
    static boolean uncertain(JobRow j){return j.status().equals("BLOCKED")&&!str(j.message()).contains(NOT_CONFIGURED);}
    @Transactional
    public Map<String,Object> createVersion(String client,String user,String id,VersionInput in){
        if(!in.confirmed()) throw Store.bad("先确认出片");
        Project p=flowProject(client,id);Board b=board(client,id);
        if(b==null||!b.confirmed()) throw Store.bad("先确认分镜再出片");
        s.db.queryForObject("SELECT id FROM clients WHERE id=? FOR UPDATE",String.class,client);
        List<JobRow> jobs=jobRows(client,id);
        if(jobs.stream().anyMatch(j->Set.of("QUEUED","RUNNING").contains(j.status()))) throw new ResponseStatusException(HttpStatus.CONFLICT,"有一版正在出片，等它出好或先取消");
        if(jobs.stream().anyMatch(ProjectFlowService::uncertain)) throw new ResponseStatusException(HttpStatus.CONFLICT,"有一版的提交结果还不确定，先去核对那一版（核对完可以点“取消这一版”）再出新的");
        ReferenceStoryboardService.Report report=report(client,referenceId(p));
        int duration=(int)Math.ceil(report==null?p.duration():report.duration());
        if(duration<4||duration>30) throw Store.bad("视频接口一次只能出 4 到 30 秒，这条参考视频按整秒算是 "+duration+" 秒");
        List<Segment> segments=cleanSegments(in.segments());
        List<String> avoid=carried(client,id);
        if(!avoid.isEmpty()) segments.add(new Segment("avoid","要避开的问题","之前审片说差的地方，这一版要避开："+String.join("；",avoid)));
        String prompt=String.join("\n\n",segments.stream().map(Segment::text).toList());
        if(prompt.length()>PROMPT_LENGTH) throw Store.bad("出片词超过 "+PROMPT_LENGTH+" 字，删掉一些再出");
        String basedOn=str(in.basedOn()).trim();
        if(!basedOn.isEmpty()&&jobs.stream().noneMatch(j->j.id().equals(basedOn))) throw Store.bad("要改的那一版不在这个项目里");
        String note=str(in.note()).trim();
        if(note.isEmpty()) note=jobs.isEmpty()?"首版：按已确认的分镜出片":"";
        if(note.isEmpty()) throw Store.bad("写一句这一版改了什么");
        if(note.length()>200) throw Store.bad("改动说明最多 200 字");
        List<Asset> members=media.productMembers(client,anchorOf(p));List<String> images=orderedImages(members).stream().map(Asset::id).toList();
        if(images.isEmpty()||images.size()>30) throw Store.bad("商品需要 1 到 30 张图片");
        Map<String,Object> config=new LinkedHashMap<>(p.config());
        if(config.containsKey("remakeDraftId")) config.put("legacyRemakeDraftId",config.remove("remakeDraftId"));
        config.remove("promptBasis");config.remove("confirmedDialogue");config.remove("campaignId");
        config.put("productAssetIds",images);config.put("generationPrompt",prompt);config.put("promptSegments",segments);
        config.put("changeNote",note);config.put("carriedReasons",avoid);
        if(basedOn.isEmpty()) config.remove("basedOnJobId"); else config.put("basedOnJobId",basedOn);
        config.put("videoRatio",ratio(p));config.put("videoResolution",resolution(p));
        config.put("confirmedDialogue",dialogue(b.shots(),duration));
        List<Shot> shots=List.of(new Shot(duration,"按已确认的分镜和出片词生成；完整时间轴见出片词","",images.get(0),0,true));
        if(s.write(config).length()>20000) throw Store.bad("出片词和项目配置太长了");
        if(s.db.update("UPDATE projects SET shots=?,config=?,duration=?,facts_confirmed=TRUE,status='SCRIPT_READY',revision=revision+1,updated_at=? WHERE client_id=? AND id=? AND revision=?",s.write(shots),s.write(config),duration,Store.now(),client,id,p.revision())==0) throw conflict();
        Job job=projects.submit(client,user,new Submit(List.of(id),"VIDEO_API")).get(0);
        s.audit(client,user,"出片",p.name()+" 第 "+job.revision()+" 版 / "+note);
        return versions(client,id).stream().filter(v->v.get("id").equals(job.id())).findFirst().orElseThrow();
    }
    /** 每镜台词按分镜时间写进字幕，和旧流程一样单独出 SRT。 */
    static List<Map<String,Object>> dialogue(List<StoryShot> shots,int duration){
        List<Map<String,Object>> out=new ArrayList<>();
        double total=shots.isEmpty()?duration:shots.get(shots.size()-1).end();double scale=total>0?duration/total:1;
        for(StoryShot x:shots){
            if(x.lines()==null||x.lines().isEmpty()) continue;
            double a=x.start()*scale,step=(x.end()-x.start())*scale/x.lines().size();
            for(int i=0;i<x.lines().size();i++) out.add(Map.of("start",a+i*step,"end",a+(i+1)*step,"text",x.lines().get(i)));
        }
        return out;
    }
    /** 一句话让 AI 改出片词：只返回改好的段落给用户看，不直接出片。各创作方式共用。 */
    public Map<String,Object> rewrite(String client,String id,String basedOn,String instruction){
        Project p=anyFlowProject(client,id);
        String ask=str(instruction).trim();if(ask.isEmpty()||ask.length()>300) throw Store.bad("写一句要怎么改（最多 300 字）");
        Job job=s.job(client,basedOn);if(!job.projectId().equals(id)) throw Store.bad("要改的那一版不在这个项目里");
        List<Segment> segments=segmentsOf(s.snapshot(s.db.queryForObject("SELECT snapshot FROM jobs WHERE id=?",String.class,basedOn)),s).stream().filter(x->!x.key().equals("avoid")).toList();
        if(!ai.enabled()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"文字模型没配置，AI 改不了；出片词没有动，可以展开下面的段落直接改");
        Map<String,Object> a=analysis.get(client,anchorOf(p));
        AiService.SegmentsDraft d=ai.rewriteSegments(str(p.config().get("productName")),p.facts(),a.getOrDefault("report",Map.of()),segments,ask);
        Map<String,String> byKey=new HashMap<>();
        for(AiService.SegmentDraft x:d.segments()==null?List.<AiService.SegmentDraft>of():d.segments()) if(x!=null&&x.key()!=null&&x.text()!=null) byKey.put(x.key(),x.text().trim());
        List<Segment> out=new ArrayList<>();
        for(Segment x:segments){String t=byKey.getOrDefault(x.key(),x.text());out.add(new Segment(x.key(),x.title(),t.isBlank()?x.text():clip(t,3000)));}
        return Map.of("segments",out,"note",clip("按“"+ask+"”改写",200));
    }
    @Transactional
    public Map<String,Object> verdict(String client,String user,String jobId,String rawRating,String rawReason,String rawUse,int revision){
        Job job=s.job(client,jobId);
        if(!job.hasOutput()) throw Store.bad("这一版还没出好，出好了再审");
        String rating=rawRating==null||rawRating.isBlank()?null:rawRating.trim(),use=rawUse==null||rawUse.isBlank()?null:rawUse.trim(),reason=str(rawReason).trim();
        if(rating!=null&&!Set.of("GOOD","BAD").contains(rating)) throw Store.bad("评价只能是好或差");
        if(use!=null&&!Set.of("USABLE","DISCARDED").contains(use)) throw Store.bad("只能标可投放或不用了");
        if("BAD".equals(rating)&&reason.isEmpty()) throw Store.bad("评价为差时要写差在哪");
        if(reason.length()>300) throw Store.bad("原因最多 300 字");
        if(!"BAD".equals(rating)) reason="";
        int current=s.db.queryForList("SELECT revision FROM job_verdicts WHERE job_id=?",Integer.class,jobId).stream().findFirst().orElse(0);
        if(current!=revision) throw new ResponseStatusException(HttpStatus.CONFLICT,"这一版的审片结果刚被别人改过，请刷新后再改");
        if(current==0) s.db.update("INSERT INTO job_verdicts(job_id,client_id,rating,reason,use_state,revision,updated_by,updated_at) VALUES(?,?,?,?,?,1,?,?)",jobId,client,rating,reason,use,user,Store.now());
        else if(s.db.update("UPDATE job_verdicts SET rating=?,reason=?,use_state=?,revision=revision+1,updated_by=?,updated_at=? WHERE job_id=? AND revision=?",rating,reason,use,user,Store.now(),jobId,revision)==0)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"这一版的审片结果刚被别人改过，请刷新后再改");
        s.audit(client,user,"审片",job.name()+" 第 "+job.revision()+" 版 / "+Objects.toString(rating,"未评价")+" / "+Objects.toString(use,"未标记"));
        return verdicts(client).get(jobId);
    }
    /** 取消：还没发出的直接不发；已经交给视频接口的只能停止等待，结果以供应商记录为准。 */
    @Transactional
    public Job cancel(String client,String user,String jobId){
        Job job=s.job(client,jobId);
        String message=switch(job.status()){
            case "QUEUED"->"已取消，没有发出视频请求";
            case "BLOCKED"->"已取消这一版；之前没有成功发出或结果不确定，以供应商记录为准";
            case "RUNNING"->{if(!job.provider().equals("VIDEO_API")) throw Store.bad("本地粗剪正在处理，不能取消");yield "已停止等待；如果视频接口已经收到任务，可能仍会在供应商那边生成，以供应商记录为准";}
            default->throw Store.bad("这一版已经结束，不用取消");
        };
        if(s.db.update("UPDATE jobs SET status='CANCELLED',message=?,updated_at=? WHERE client_id=? AND id=? AND status=?",message,Store.now(),client,jobId,job.status())==0) throw conflict();
        s.audit(client,user,"取消出片",job.name()+" 第 "+job.revision()+" 版");
        return s.job(client,jobId);
    }

    // ---------- 小工具 ----------
    static String ratio(Project p){String r=str(p.config().get("videoRatio"));return RATIOS.contains(r)?r:"9:16";}
    static String resolution(Project p){String r=str(p.config().get("videoResolution"));return RESOLUTIONS.contains(r)?r:"480p";}
    static String pick(String raw,List<String> allowed,String message){String v=str(raw).trim();if(!allowed.contains(v)) throw Store.bad(message);return v;}
    static String str(Object v){return Objects.toString(v,"");}
    static String clip(String t,int max){String v=str(t);return v.length()>max?v.substring(0,max):v;}
    static ResponseStatusException conflict(){return new ResponseStatusException(HttpStatus.CONFLICT,"项目刚被改过，请刷新后再操作");}
}
