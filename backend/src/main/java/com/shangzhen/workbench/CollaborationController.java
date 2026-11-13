package com.shangzhen.workbench;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.security.Principal;
import java.time.LocalDate;
import java.util.*;

@RestController
@RequestMapping("/api/clients/{c}")
public class CollaborationController {
    private final CollaborationService service;
    private final Store s;
    CollaborationController(CollaborationService service,Store s){this.service=service;this.s=s;}
    public record CampaignInput(@NotBlank @Size(max=150) String name,@NotBlank @Size(max=100) String ownerName,
        LocalDate dueDate,@Min(1) @Max(10000) int targetCount,@NotNull @Size(max=8000) String brief,boolean archived,@Min(0) int revision) {}
    public record FlowInput(String campaignId,@NotBlank @Size(max=100) String assignee,@NotBlank String phase,
        LocalDate dueDate,@NotNull @Size(max=2000) String note,@Min(0) int revision) {}
    public record BulkItem(@NotBlank String projectId,@Valid @NotNull FlowInput flow) {}
    public record BulkInput(@NotEmpty @Size(max=100) List<@Valid BulkItem> items) {}
    public record ContactInput(@NotBlank @Size(max=100) String name,@NotBlank @Size(max=40) String responsibility) {}
    @GetMapping("/campaigns") List<Map<String,Object>> campaigns(Principal u,@PathVariable String c){s.access(c,u.getName());return service.campaigns(c);}
    @PostMapping("/campaigns") Map<String,Object> create(Principal u,@PathVariable String c,@Valid @RequestBody CampaignInput p){s.access(c,u.getName());return service.saveCampaign(c,null,u.getName(),p);}
    @PutMapping("/campaigns/{id}") Map<String,Object> update(Principal u,@PathVariable String c,@PathVariable String id,@Valid @RequestBody CampaignInput p){s.access(c,u.getName());return service.saveCampaign(c,id,u.getName(),p);}
    @GetMapping("/works") List<Map<String,Object>> works(Principal u,@PathVariable String c){s.access(c,u.getName());return service.works(c);}
    @PutMapping("/works/{id}/flow") Map<String,String> flow(Principal u,@PathVariable String c,@PathVariable String id,@Valid @RequestBody FlowInput p){s.access(c,u.getName());service.flow(c,id,u.getName(),p);return Map.of("status","ok");}
    @PostMapping("/works/bulk-flow") Map<String,String> bulk(Principal u,@PathVariable String c,@Valid @RequestBody BulkInput p){s.access(c,u.getName());service.bulk(c,u.getName(),p);return Map.of("status","ok");}
    @GetMapping("/team") List<Map<String,Object>> team(Principal u,@PathVariable String c){s.access(c,u.getName());return s.db.query("SELECT * FROM team_contacts WHERE client_id=? ORDER BY created_at",(r,n)->Map.<String,Object>of("id",r.getString("id"),"name",r.getString("name"),"responsibility",r.getString("responsibility")),c);}
    @PostMapping("/team") Map<String,String> contact(Principal u,@PathVariable String c,@Valid @RequestBody ContactInput p){s.access(c,u.getName());String id=Store.id();s.db.update("INSERT INTO team_contacts VALUES(?,?,?,?,?)",id,c,p.name(),p.responsibility(),Store.now());return Map.of("id",id,"name",p.name(),"responsibility",p.responsibility());}
}

@Service
class CollaborationService {
    private final Store s;
    CollaborationService(Store s){this.s=s;}
    void campaignAccess(String client,String id){if(id!=null&&!id.isBlank()&&s.db.queryForObject("SELECT COUNT(*) FROM campaigns WHERE client_id=? AND id=?",Integer.class,client,id)==0)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"交付项目不存在");}
    List<Map<String,Object>> campaigns(String client){
        var works=works(client);
        return s.db.query("SELECT * FROM campaigns WHERE client_id=? ORDER BY archived,created_at DESC",(r,n)->{
            String id=r.getString("id");var linked=works.stream().filter(w->id.equals(w.get("campaignId"))).toList();
            Map<String,Object> m=new LinkedHashMap<>();m.put("id",id);m.put("name",r.getString("name"));m.put("ownerName",r.getString("owner_name"));m.put("dueDate",r.getDate("due_date"));m.put("targetCount",r.getInt("target_count"));m.put("brief",r.getString("brief"));m.put("archived",r.getBoolean("archived"));m.put("revision",r.getInt("revision"));m.put("workCount",linked.size());m.put("deliveredCount",s.db.queryForObject("SELECT COUNT(DISTINCT j.project_id) FROM jobs j JOIN work_flow f ON f.project_id=j.project_id WHERE f.campaign_id=? AND j.status='DELIVERED'",Integer.class,id));m.put("reviewCount",linked.stream().filter(w->"REVIEW".equals(w.get("phase"))).count());m.put("blockedCount",linked.stream().filter(w->Set.of("CHANGES","MATERIALS").contains(w.get("phase"))).count());return m;
        },client);
    }
    List<Map<String,Object>> works(String client){
        return s.db.query("SELECT p.*, f.campaign_id,f.assignee,f.phase,f.due_date,f.note,f.revision AS flow_revision, f.updated_at AS flow_updated, (SELECT j.status FROM jobs j WHERE j.project_id=p.id ORDER BY j.created_at DESC,j.id DESC LIMIT 1) AS job_status,(SELECT j.updated_at FROM jobs j WHERE j.project_id=p.id ORDER BY j.created_at DESC,j.id DESC LIMIT 1) AS job_updated FROM projects p JOIN work_flow f ON f.project_id=p.id WHERE p.client_id=? ORDER BY p.updated_at DESC",(r,n)->{
            Map<String,Object> m=new LinkedHashMap<>();String phase=r.getString("phase"),job=r.getString("job_status");
            if(Set.of("QUEUED","RUNNING").contains(Objects.toString(job,"")))phase="WAITING_SYSTEM";
            else if(job!=null&&r.getTimestamp("job_updated").compareTo(r.getTimestamp("flow_updated"))>=0){phase=switch(job){case "REVIEW"->"REVIEW";case "DELIVERED"->"DELIVERED";case "CHANGES_REQUESTED","FAILED"->"CHANGES";default->phase;};}
            m.put("id",r.getString("id"));m.put("name",r.getString("name"));m.put("sku",r.getString("sku"));m.put("format",r.getString("format"));m.put("duration",r.getInt("duration"));m.put("campaignId",r.getString("campaign_id"));m.put("assignee",r.getString("assignee"));m.put("phase",phase);m.put("dueDate",r.getDate("due_date"));m.put("note",r.getString("note"));m.put("revision",r.getInt("flow_revision"));m.put("jobStatus",job);return m;
        },client);
    }
    @Transactional public Map<String,Object> saveCampaign(String client,String id,String user,CollaborationController.CampaignInput p){
        if(id==null){id=Store.id();s.db.update("INSERT INTO campaigns VALUES(?,?,?,?,?,?,?,?,?,?,?)",id,client,p.name(),p.ownerName(),p.dueDate(),p.targetCount(),p.brief(),p.archived(),0,Store.now(),Store.now());}
        else {campaignAccess(client,id);if(s.db.update("UPDATE campaigns SET name=?,owner_name=?,due_date=?,target_count=?,brief=?,archived=?,revision=revision+1,updated_at=? WHERE id=? AND client_id=? AND revision=?",p.name(),p.ownerName(),p.dueDate(),p.targetCount(),p.brief(),p.archived(),Store.now(),id,client,p.revision())==0)throw new ResponseStatusException(HttpStatus.CONFLICT,"交付项目已修改，请刷新后重试");}
        s.audit(client,user,"保存交付项目",p.name());String saved=id;return campaigns(client).stream().filter(c->saved.equals(c.get("id"))).findFirst().orElseThrow();
    }
    @Transactional public void flow(String client,String project,String user,CollaborationController.FlowInput p){
        s.project(client,project);campaignAccess(client,p.campaignId());
        if(!Set.of("PLAN","MATERIALS","PRODUCTION","EDIT","REVIEW","CHANGES").contains(p.phase()))throw Store.bad("不能手动设置系统等待或已交付状态；交付需要真实文件及审核");
        if(s.db.update("UPDATE work_flow SET campaign_id=?,assignee=?,phase=?,due_date=?,note=?,revision=revision+1,updated_at=? WHERE project_id=? AND revision=?",p.campaignId()==null||p.campaignId().isBlank()?null:p.campaignId(),p.assignee(),p.phase(),p.dueDate(),p.note(),Store.now(),project,p.revision())==0)throw new ResponseStatusException(HttpStatus.CONFLICT,"接力状态已变更，请读取最新版本后重试");
        var work=s.project(client,project);var config=new LinkedHashMap<>(work.config());config.put("campaignId",p.campaignId());
        s.db.update("UPDATE projects SET config=?,revision=revision+1,updated_at=? WHERE id=?",s.write(config),Store.now(),project);
        s.audit(client,user,"更新作品接力",s.project(client,project).name()+" / "+p.assignee()+" / "+p.phase());
    }
    @Transactional public void bulk(String client,String user,CollaborationController.BulkInput input){for(var item:input.items())flow(client,item.projectId(),user,item.flow());}
}
