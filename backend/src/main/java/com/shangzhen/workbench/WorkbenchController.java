package com.shangzhen.workbench;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.*;
import java.io.IOException;
import static com.shangzhen.workbench.Models.*;

@RestController
@RequestMapping("/api")
public class WorkbenchController {
    private final Store s; private final ProjectService projects; private final MediaService media; private final AiService ai; private final MetricsService metrics;
    public WorkbenchController(Store s,ProjectService projects,MediaService media,AiService ai,MetricsService metrics) {this.s=s;this.projects=projects;this.media=media;this.ai=ai;this.metrics=metrics;}
    @GetMapping("/system") Map<String,Object> system() {return Map.of("aiMode",ai.mode,"videoProviderConnected",false,"localExport","FFmpeg / MP4 + SRT","version","0.1.0");}
    @GetMapping("/clients") List<Client> clients(Principal u) {return s.db.query("SELECT * FROM clients WHERE owner=? ORDER BY created_at",s.clients,u.getName());}
    @PostMapping("/clients") Client createClient(Principal u,@Valid @RequestBody ClientInput p) {
        String id=Store.id();s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",id,u.getName(),p.name(),p.category(),Store.now());return s.db.queryForObject("SELECT * FROM clients WHERE id=?",s.clients,id);
    }
    @GetMapping("/clients/{c}/overview") Map<String,Object> overview(Principal u,@PathVariable String c) {
        s.access(c,u.getName());
        return Map.of("projects",s.db.queryForObject("SELECT COUNT(*) FROM projects WHERE client_id=?",Integer.class,c),"assets",s.db.queryForObject("SELECT COUNT(*) FROM assets WHERE client_id=?",Integer.class,c),"activeJobs",s.db.queryForObject("SELECT COUNT(*) FROM jobs WHERE client_id=? AND status IN ('QUEUED','RUNNING')",Integer.class,c),"reviews",s.db.queryForObject("SELECT COUNT(*) FROM jobs WHERE client_id=? AND status='REVIEW'",Integer.class,c),"events",s.db.query("SELECT actor,action,detail,created_at FROM audit_events WHERE client_id=? ORDER BY created_at DESC LIMIT 12",(r,n)->Map.of("actor",r.getString("actor"),"action",r.getString("action"),"detail",r.getString("detail"),"createdAt",r.getTimestamp("created_at").toLocalDateTime()),c));
    }
    @GetMapping("/clients/{c}/projects") List<Project> projects(Principal u,@PathVariable String c) {s.access(c,u.getName());return s.db.query("SELECT * FROM projects WHERE client_id=? ORDER BY updated_at DESC",s.projects,c);}
    @PostMapping("/clients/{c}/projects") Project create(Principal u,@PathVariable String c,@Valid @RequestBody ProjectInput p) {s.access(c,u.getName());return projects.create(c,u.getName(),p);}
    @GetMapping("/clients/{c}/projects/{id}") Project project(Principal u,@PathVariable String c,@PathVariable String id) {s.access(c,u.getName());return s.project(c,id);}
    @PutMapping("/clients/{c}/projects/{id}") Project update(Principal u,@PathVariable String c,@PathVariable String id,@Valid @RequestBody ProjectInput p) {s.access(c,u.getName());return projects.update(c,id,u.getName(),p);}
    @PostMapping("/clients/{c}/projects/{id}/draft") Map<String,Object> draft(Principal u,@PathVariable String c,@PathVariable String id) {s.access(c,u.getName());return ai.draft(c,id);}
    @GetMapping("/clients/{c}/projects/{id}/export") ResponseEntity<String> export(Principal u,@PathVariable String c,@PathVariable String id) {
        s.access(c,u.getName());return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=script.json").contentType(MediaType.APPLICATION_JSON).body(s.write(s.project(c,id)));
    }
    @PostMapping("/clients/{c}/batch") List<Project> batch(Principal u,@PathVariable String c,@Valid @RequestBody Batch p) {s.access(c,u.getName());return projects.batch(c,u.getName(),p.projects());}
    public record Variants(@jakarta.validation.constraints.NotEmpty @jakarta.validation.constraints.Size(max=3) List<@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max=80) String> scenes) {}
    @PostMapping("/clients/{c}/projects/{id}/variants") List<Project> variants(Principal u,@PathVariable String c,@PathVariable String id,@Valid @RequestBody Variants p) {s.access(c,u.getName());return projects.variants(c,id,u.getName(),p.scenes());}
    @GetMapping("/clients/{c}/assets") List<Asset> assets(Principal u,@PathVariable String c) {s.access(c,u.getName());return s.db.query("SELECT * FROM assets WHERE client_id=? ORDER BY created_at DESC",s.assets,c);}
    @PostMapping("/clients/{c}/assets") Asset upload(Principal u,@PathVariable String c,@RequestParam(defaultValue="PRODUCT") String kind,@RequestParam(defaultValue="") String sku,@RequestParam(defaultValue="") String tags,@RequestParam MultipartFile file) throws IOException {
        s.access(c,u.getName());return media.upload(c,u.getName(),kind,sku,tags,file);
    }
    @PutMapping("/clients/{c}/assets/{id}") Asset editAsset(Principal u,@PathVariable String c,@PathVariable String id,@Valid @RequestBody AssetInput p) {
        s.access(c,u.getName());s.asset(c,id);if(!MediaService.KINDS.contains(p.kind())||s.write(p.metadata()).length()>20000)throw Store.bad("素材分类或元数据无效");
        s.db.update("UPDATE assets SET name=?,kind=?,sku=?,tags=?,metadata=? WHERE id=?",p.name(),p.kind(),Objects.toString(p.sku(),""),Objects.toString(p.tags(),""),s.write(p.metadata()),id);return s.asset(c,id);
    }
    @GetMapping("/clients/{c}/assets/{id}/file") ResponseEntity<Resource> assetFile(Principal u,@PathVariable String c,@PathVariable String id,@RequestParam(defaultValue="false") boolean download) throws IOException {
        s.access(c,u.getName());Asset asset=s.asset(c,id);return media.file(media.assetPath(c,id),asset.mime(),asset.name(),download);
    }
    @GetMapping("/clients/{c}/jobs") List<Job> jobs(Principal u,@PathVariable String c) {s.access(c,u.getName());return s.db.query("SELECT * FROM jobs WHERE client_id=? ORDER BY created_at DESC",s.jobs,c);}
    @PostMapping("/clients/{c}/jobs") List<Job> submit(Principal u,@PathVariable String c,@Valid @RequestBody Submit p) {s.access(c,u.getName());return projects.submit(c,u.getName(),p);}
    @GetMapping("/clients/{c}/jobs/{id}/file") ResponseEntity<Resource> jobFile(Principal u,@PathVariable String c,@PathVariable String id,@RequestParam(defaultValue="mp4") String type,@RequestParam(defaultValue="false") boolean download) throws IOException {
        s.access(c,u.getName());Job job=s.job(c,id);if(!job.hasOutput())throw Store.bad("产单尚无可交付文件");
        if(!Set.of("mp4","srt").contains(type))throw Store.bad("导出类型无效");return media.file(media.resolve(id+"."+type),type.equals("mp4")?"video/mp4":"application/x-subrip",id+"."+type,download);
    }
    @GetMapping("/clients/{c}/jobs/{id}/script") Project jobScript(Principal u,@PathVariable String c,@PathVariable String id) {s.access(c,u.getName());s.job(c,id);return s.snapshot(s.db.queryForObject("SELECT snapshot FROM jobs WHERE id=?",String.class,id));}
    @GetMapping("/clients/{c}/jobs/{id}/reviews") List<Map<String,Object>> reviews(Principal u,@PathVariable String c,@PathVariable String id) {s.access(c,u.getName());s.job(c,id);return s.db.query("SELECT author,timecode,decision,comment,created_at FROM reviews WHERE job_id=? ORDER BY created_at DESC",(r,n)->Map.<String,Object>of("author",r.getString("author"),"timecode",r.getInt("timecode"),"decision",r.getString("decision"),"comment",r.getString("comment"),"createdAt",r.getTimestamp("created_at").toLocalDateTime()),id);}
    @PostMapping("/clients/{c}/jobs/{id}/reviews") Map<String,String> review(Principal u,@PathVariable String c,@PathVariable String id,@Valid @RequestBody ReviewInput p) {s.access(c,u.getName());projects.review(c,id,u.getName(),p);return Map.of("status","ok");}
    @GetMapping("/clients/{c}/presets") List<Preset> presets(Principal u,@PathVariable String c) {s.access(c,u.getName());return s.db.query("SELECT * FROM presets WHERE client_id=? ORDER BY created_at DESC",(r,n)->new Preset(r.getString("id"),r.getString("name"),r.getString("kind"),r.getString("content"),r.getBoolean("enabled")),c);}
    @PostMapping("/clients/{c}/presets") Preset preset(Principal u,@PathVariable String c,@Valid @RequestBody PresetInput p) {
        s.access(c,u.getName());if(!Set.of("RULE","RECIPE","LOOK","FAVORITE").contains(p.kind()))throw Store.bad("预设类型无效");
        String id=Store.id();s.db.update("INSERT INTO presets VALUES(?,?,?,?,?,?,?)",id,c,p.name(),p.kind(),p.content(),p.enabled(),Store.now());s.audit(c,u.getName(),"保存客户预设",p.name());return new Preset(id,p.name(),p.kind(),p.content(),p.enabled());
    }
    @PutMapping("/clients/{c}/presets/{id}") Preset updatePreset(Principal u,@PathVariable String c,@PathVariable String id,@Valid @RequestBody PresetInput p) {
        s.access(c,u.getName());if(!Set.of("RULE","RECIPE","LOOK","FAVORITE").contains(p.kind()))throw Store.bad("预设类型无效");
        if(s.db.update("UPDATE presets SET name=?,kind=?,content=?,enabled=? WHERE client_id=? AND id=?",p.name(),p.kind(),p.content(),p.enabled(),c,id)==0)throw new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND,"预设不存在");return new Preset(id,p.name(),p.kind(),p.content(),p.enabled());
    }
    @GetMapping("/clients/{c}/metrics") Map<String,Object> metrics(Principal u,@PathVariable String c) {s.access(c,u.getName());return metrics.report(c);}
    @PostMapping("/clients/{c}/metrics/import") Map<String,Integer> importCsv(Principal u,@PathVariable String c,@RequestParam MultipartFile file) throws IOException {s.access(c,u.getName());return Map.of("imported",metrics.importCsv(c,u.getName(),file));}
}
