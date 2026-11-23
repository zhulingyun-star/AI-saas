package com.shangzhen.workbench;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static com.shangzhen.workbench.Models.Asset;

/**
 * 参考视频库：文件夹、每条参考视频所在的文件夹、显示名、开头类型和每镜任务。
 * 拆解本身（上传、读片、状态机、删除）仍由 ReferenceStoryboardService 负责，这里只读它的结果。
 */
@Service
public class ReferenceLibraryService {
    static final Set<String> RESERVED=Set.of("全部参考视频","未分类");
    static final List<String> HOOKS=ProductLibraryService.HOOKS;
    static final List<String> TASKS=List.of("抓住注意力","建立需求","给出方案","建立信任","打消顾虑","促进决定","推动下单");
    static final int NAME_LENGTH=60;
    /** 每镜任务按镜头 id 保存，同时记下当时的起止时间；镜头被重新拆解或改过区间后，旧任务不再显示。 */
    record ShotTask(String task,double start,double end) {}
    private static final TypeReference<Map<String,ShotTask>> TASK_MAP=new TypeReference<>(){};
    private final Store s;private final ReferenceStoryboardService storyboards;private final LibraryFolders folderRules;
    public ReferenceLibraryService(Store s,ReferenceStoryboardService storyboards){
        this.s=s;this.storyboards=storyboards;this.folderRules=new LibraryFolders(s,"reference_folders","reference_profiles","参考视频",RESERVED);
    }
    record Profile(String folderId,String displayName,String hook,String tasks,int revision) {}
    private static Profile profileOf(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Profile(rs.getString("folder_id"),rs.getString("display_name"),rs.getString("hook"),rs.getString("shot_tasks_json"),rs.getInt("revision"));
    }
    private Profile profile(String client,String asset){
        return s.db.query("SELECT * FROM reference_profiles WHERE client_id=? AND asset_id=?",(r,n)->profileOf(r),client,asset).stream().findFirst().orElse(null);
    }
    private void ensureProfile(String client,String asset){
        if(profile(client,asset)==null) s.db.update("INSERT INTO reference_profiles(client_id,asset_id,shot_tasks_json,revision,updated_at) VALUES(?,?,'{}',0,?)",client,asset,Store.now());
    }
    private Asset reference(String client,String id){
        Asset a=s.asset(client,id);
        if(!a.kind().equals("REFERENCE")||!a.mime().startsWith("video/")) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"参考视频不存在");
        return a;
    }
    private ReferenceStoryboardService.Report report(String json){
        if(json==null) return null;
        try{return s.json.readValue(json,ReferenceStoryboardService.Report.class);}catch(Exception e){return null;}
    }
    private record Board(String status,int revision,String report,String error) {}
    private Board boardRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Board(rs.getString("status"),rs.getInt("revision"),rs.getString("report_json"),rs.getString("error"));
    }

    // ---------- 列表和详情 ----------
    public Map<String,Object> library(String client){
        List<Asset> refs=s.db.query("SELECT * FROM assets WHERE client_id=? AND kind='REFERENCE' ORDER BY created_at DESC,id",s.assets,client).stream().filter(a->a.mime().startsWith("video/")).toList();
        Map<String,Profile> profiles=new HashMap<>();
        s.db.query("SELECT * FROM reference_profiles WHERE client_id=?",rs->{profiles.put(rs.getString("asset_id"),profileOf(rs));},client);
        Map<String,Map<String,Object>> boards=new HashMap<>();
        s.db.query("SELECT asset_id,status,revision,report_json,error FROM reference_storyboards WHERE client_id=?",rs->{Board b=boardRow(rs);boards.put(rs.getString("asset_id"),board(b.status(),b.revision(),report(b.report()),b.error()));},client);
        Map<String,List<Map<String,String>>> usage=usage(client);
        List<Map<String,Object>> items=new ArrayList<>();
        for(Asset a:refs) items.add(item(a,profiles.get(a.id()),boards.get(a.id()),usage.getOrDefault(a.id(),List.of())));
        Map<String,Object> out=new LinkedHashMap<>();
        out.put("folders",folderRules.list(client));out.put("references",items);out.put("analysisEnabled",storyboards.enabled());
        return out;
    }
    public Map<String,Object> detail(String client,String id){
        Asset a=reference(client,id);Profile p=profile(client,id);
        Board row=s.db.query("SELECT status,revision,report_json,error FROM reference_storyboards WHERE client_id=? AND asset_id=?",(rs,n)->boardRow(rs),client,id).stream().findFirst().orElse(null);
        ReferenceStoryboardService.Report report=row==null?null:report(row.report());
        Map<String,Object> out=item(a,p,row==null?null:board(row.status(),row.revision(),report,row.error()),usage(client).getOrDefault(id,List.of()));
        out.put("shotTasks",currentTasks(p,report));out.put("labelRevision",p==null?0:p.revision());out.put("analysisEnabled",storyboards.enabled());
        return out;
    }
    private static Map<String,Object> board(String status,int revision,ReferenceStoryboardService.Report r,String error){
        Map<String,Object> m=new LinkedHashMap<>();
        m.put("status",status);m.put("revision",revision);m.put("hasReport",r!=null);m.put("error",Objects.toString(error,""));
        if(r!=null){m.put("duration",r.duration());m.put("shotCount",r.shots().size());m.put("lineCount",r.dialogue().size());}
        return m;
    }
    private Map<String,Object> item(Asset a,Profile p,Map<String,Object> board,List<Map<String,String>> usedBy){
        Map<String,Object> m=new LinkedHashMap<>();
        String display=p==null||p.displayName()==null||p.displayName().isBlank()?a.name():p.displayName();
        m.put("assetId",a.id());m.put("name",display);m.put("fileName",a.name());m.put("mime",a.mime());m.put("sizeBytes",a.sizeBytes());m.put("createdAt",a.createdAt());
        m.put("folderId",p==null?null:p.folderId());m.put("hook",p==null?null:p.hook());
        m.put("storyboard",board==null?board("EMPTY",0,null,""):board);
        m.put("usedBy",usedBy);
        return m;
    }
    private Map<String,String> currentTasks(Profile p,ReferenceStoryboardService.Report r){
        Map<String,String> out=new LinkedHashMap<>();
        if(p==null||r==null) return out;
        Map<String,ShotTask> saved=s.read(Objects.toString(p.tasks(),"{}"),TASK_MAP);
        for(ReferenceStoryboardService.Shot shot:r.shots()){
            ShotTask t=saved.get(shot.id());
            if(t!=null&&Math.abs(t.start()-shot.start())<.002&&Math.abs(t.end()-shot.end())<.002) out.put(shot.id(),t.task());
        }
        return out;
    }
    /**
     * 哪些项目用过这条参考视频：视频二创改编稿（remake_drafts）所属的项目，加上作品配置 referenceLinks 里写了这条视频的作品
     * （作品挂在项目下时算那个项目，没挂项目的作品单独算）。只按真实记录算，不估计。
     */
    Map<String,List<Map<String,String>>> usage(String client){
        Map<String,String> campaigns=new HashMap<>();
        s.db.query("SELECT id,name FROM campaigns WHERE client_id=?",rs->{campaigns.put(rs.getString("id"),rs.getString("name"));},client);
        Map<String,LinkedHashMap<String,Map<String,String>>> used=new HashMap<>();
        s.db.query("SELECT DISTINCT asset_id,campaign_id FROM remake_drafts WHERE client_id=?",rs->{
            String c=rs.getString("campaign_id");
            if(campaigns.containsKey(c)) used.computeIfAbsent(rs.getString("asset_id"),k->new LinkedHashMap<>()).put("campaign:"+c,Map.of("id",c,"name",campaigns.get(c),"kind","campaign"));
        },client);
        s.db.query("SELECT p.id,p.name,p.config,w.campaign_id FROM projects p LEFT JOIN work_flow w ON w.project_id=p.id WHERE p.client_id=?",rs->{
            JsonNode links;
            try{links=s.json.readTree(rs.getString("config")).path("referenceLinks");}catch(Exception e){return;}
            if(!links.isArray()) return;
            String c=rs.getString("campaign_id");
            for(JsonNode link:links){
                String asset=link.path("assetId").asText("");
                if(asset.isBlank()) continue;
                if(c!=null&&campaigns.containsKey(c)) used.computeIfAbsent(asset,k->new LinkedHashMap<>()).put("campaign:"+c,Map.of("id",c,"name",campaigns.get(c),"kind","campaign"));
                else used.computeIfAbsent(asset,k->new LinkedHashMap<>()).put("work:"+rs.getString("id"),Map.of("id",rs.getString("id"),"name",rs.getString("name"),"kind","work"));
            }
        },client);
        Map<String,List<Map<String,String>>> out=new HashMap<>();
        used.forEach((k,v)->out.put(k,new ArrayList<>(v.values())));
        return out;
    }

    // ---------- 文件夹（规则在 LibraryFolders，和商品库共用） ----------
    @Transactional public LibraryFolders.Folder createFolder(String client,String user,String name,String parentId){return folderRules.create(client,user,name,parentId);}
    @Transactional public LibraryFolders.Folder renameFolder(String client,String user,String id,String name,int revision){return folderRules.rename(client,user,id,name,revision);}
    @Transactional public void deleteFolder(String client,String user,String id){folderRules.delete(client,user,id);}

    // ---------- 单条参考视频 ----------
    @Transactional
    public Map<String,Object> move(String client,String user,String id,String folderId){
        Asset a=reference(client,id);String target=folderRules.target(client,folderId);ensureProfile(client,id);
        s.db.update("UPDATE reference_profiles SET folder_id=?,updated_at=? WHERE client_id=? AND asset_id=?",target,Store.now(),client,id);
        s.audit(client,user,"移动参考视频",a.name()+" → "+folderRules.label(client,target));
        return detail(client,id);
    }
    /** 名称、开头类型、每镜任务共用一个 revision：带着旧 revision 来改会得到 409，不会互相覆盖。 */
    private void bump(String client,String id,int revision,String sql,Object... args){
        Profile p=profile(client,id);
        if((p==null?0:p.revision())!=revision) throw new ResponseStatusException(HttpStatus.CONFLICT,"这条参考视频刚被别人改过，请刷新后再改");
        ensureProfile(client,id);
        List<Object> params=new ArrayList<>(Arrays.asList(args));params.addAll(List.of(Store.now(),client,id,revision));
        if(s.db.update("UPDATE reference_profiles SET "+sql+",revision=revision+1,updated_at=? WHERE client_id=? AND asset_id=? AND revision=?",params.toArray())!=1)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"这条参考视频刚被别人改过，请刷新后再改");
    }
    @Transactional
    public Map<String,Object> rename(String client,String user,String id,String rawName,int revision){
        reference(client,id);
        String name=Objects.toString(rawName,"").trim();
        if(name.isEmpty()||name.length()>NAME_LENGTH) throw Store.bad("名称需要 1 到 "+NAME_LENGTH+" 个字");
        bump(client,id,revision,"display_name=?",name);
        s.audit(client,user,"重命名参考视频",name);
        return detail(client,id);
    }
    @Transactional
    public Map<String,Object> labels(String client,String user,String id,String rawHook,Map<String,String> tasks,int revision){
        reference(client,id);
        String hook=rawHook==null||rawHook.isBlank()?null:rawHook.trim();
        if(hook!=null&&!HOOKS.contains(hook)) throw Store.bad("开头类型只能从 8 种里选");
        Map<String,ShotTask> saved=new LinkedHashMap<>();
        Map<String,String> wanted=tasks==null?Map.of():tasks;
        if(wanted.values().stream().anyMatch(t->t!=null&&!t.isBlank())){
            ReferenceStoryboardService.Report r=report(s.db.query("SELECT report_json FROM reference_storyboards WHERE client_id=? AND asset_id=?",(rs,n)->rs.getString(1),client,id).stream().findFirst().orElse(null));
            if(r==null) throw Store.bad("还没有拆解结果，先拆解再标每镜任务");
            Map<String,ReferenceStoryboardService.Shot> shots=new HashMap<>();
            for(var shot:r.shots()) shots.put(shot.id(),shot);
            for(var e:wanted.entrySet()){
                if(e.getValue()==null||e.getValue().isBlank()) continue;
                var shot=shots.get(e.getKey());
                if(shot==null) throw new ResponseStatusException(HttpStatus.CONFLICT,"镜头拆解刚更新过，请刷新后再标");
                if(!TASKS.contains(e.getValue())) throw Store.bad("每镜任务只能从 7 种里选");
                saved.put(e.getKey(),new ShotTask(e.getValue(),shot.start(),shot.end()));
            }
        }
        bump(client,id,revision,"hook=?,shot_tasks_json=?",hook,s.write(saved));
        s.audit(client,user,"标注参考视频",(hook==null?"开头还没标":"开头 "+hook)+" · "+saved.size()+" 镜任务");
        return detail(client,id);
    }
}
