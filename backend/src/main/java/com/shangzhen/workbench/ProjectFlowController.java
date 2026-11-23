package com.shangzhen.workbench;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
import java.util.*;

/** 新版项目：列表和文件夹、新建、四步详情（视频二创 / 框架模式 / 一键成片）、多版本出片和审片。说明见 backend/API.md「项目（新版）」。 */
@RestController
@RequestMapping("/api/clients/{client}")
public class ProjectFlowController {
    private final Store s;private final ProjectFlowService flow;private final DirectionFlowService dirs;
    public ProjectFlowController(Store s,ProjectFlowService flow,DirectionFlowService dirs){this.s=s;this.flow=flow;this.dirs=dirs;}
    /** 视频二创走 ProjectFlowService，框架模式 / 一键成片走 DirectionFlowService */
    private boolean remake(String client,String id){return ProjectFlowService.mode(s.project(client,id)).equals("REMAKE");}
    public record FolderInput(@NotNull @Size(max=60) String name,@Size(max=36) String parentId) {}
    public record FolderRename(@NotNull @Size(max=60) String name,@Min(0) int revision) {}
    public record Placement(@Size(max=36) String folderId) {}
    public record Rename(@NotNull @Size(max=200) String name,@Min(0) int revision) {}
    public record Create(@NotBlank @Size(max=20) String mode,@NotBlank @Size(max=36) String productAnchorId,@Size(max=36) String referenceAssetId,
        @NotBlank @Size(max=10) String ratio,@NotBlank @Size(max=10) String resolution,@Size(max=36) String folderId,@Size(max=200) String name,
        @NotNull @Size(max=8000) String facts,boolean factsConfirmed) {}
    public record Settings(@Min(0) int revision,@Size(max=200) String name,@Size(max=10) String ratio,@Size(max=10) String resolution,
        @Size(max=36) String personaId,@Size(max=60) String personaName,@Size(max=2000) String approach,Integer duration,@Size(max=12) Map<String,Object> oneClick) {}
    public record ProductChange(@NotBlank @Size(max=36) String anchorId,@Min(0) int revision) {}
    public record ReferenceChange(@NotBlank @Size(max=36) String assetId,@Min(0) int revision) {}
    public record ShotInput(@NotBlank @Size(max=60) String id,@Size(max=400) String camera,@Size(max=2000) String visual,@Size(max=20) List<@Size(max=300) String> lines,@Size(max=20) String task) {}
    public record Storyboard(@Min(0) int revision,@NotNull @Size(max=40) List<@Valid ShotInput> shots,boolean confirmed) {}
    public record Revision(@Min(0) int revision) {}
    public record Ignore(@NotBlank @Size(max=300) String key) {}
    public record SegmentInput(@NotNull @Size(max=40) String key,@Size(max=40) String title,@NotNull @Size(max=3000) String text) {}
    public record Version(@NotNull @Size(max=60) List<@Valid SegmentInput> segments,@Size(max=200) String note,@Size(max=36) String basedOn,boolean confirmed,@Size(max=36) String directionId) {}
    public record Generate(@Min(0) int revision,@Size(max=60) String personaName,Integer duration) {}
    public record Pick(@Min(0) int revision,@NotNull @Size(max=12) List<@NotBlank @Size(max=36) String> ids) {}
    public record DirectionEdit(@Min(0) int revision,@NotNull @Size(max=20) Map<String,Object> direction) {}
    public record DirShotInput(@NotBlank @Size(max=60) String id,@Size(max=2000) String visual,@Size(max=20) List<@Size(max=300) String> lines,@Size(max=20) String task) {}
    public record DirBoard(@Min(0) int revision,@NotNull @Size(max=40) List<@Valid DirShotInput> shots,boolean confirmed) {}
    public record Run(@Min(0) int revision,@NotNull @Size(max=12) Map<String,Object> settings,@Size(max=200) String note) {}
    public record Rewrite(@NotBlank @Size(max=36) String basedOn,@NotBlank @Size(max=300) String instruction) {}
    public record Verdict(@Size(max=10) String rating,@Size(max=300) String reason,@Size(max=12) String use,@Min(0) int revision) {}

    @GetMapping("/project-library") Map<String,Object> library(Principal u,@PathVariable String client){s.access(client,u.getName());return flow.library(client);}
    @PostMapping("/project-library/projects") Map<String,Object> create(Principal u,@PathVariable String client,@Valid @RequestBody Create b){
        s.access(client,u.getName());
        return flow.create(client,u.getName(),new ProjectFlowService.CreateInput(b.mode(),b.productAnchorId(),b.referenceAssetId(),b.ratio(),b.resolution(),b.folderId(),b.name(),b.facts(),b.factsConfirmed()));
    }
    @PostMapping("/project-folders") LibraryFolders.Folder createFolder(Principal u,@PathVariable String client,@Valid @RequestBody FolderInput b){s.access(client,u.getName());return flow.createFolder(client,u.getName(),b.name(),b.parentId());}
    @PutMapping("/project-folders/{id}") LibraryFolders.Folder renameFolder(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody FolderRename b){s.access(client,u.getName());return flow.renameFolder(client,u.getName(),id,b.name(),b.revision());}
    @DeleteMapping("/project-folders/{id}") ResponseEntity<Void> deleteFolder(Principal u,@PathVariable String client,@PathVariable String id){s.access(client,u.getName());flow.deleteFolder(client,u.getName(),id);return ResponseEntity.noContent().build();}
    @PutMapping("/projects/{id}/folder") Map<String,Object> move(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody Placement b){s.access(client,u.getName());return flow.move(client,u.getName(),id,b.folderId());}
    @PutMapping("/projects/{id}/name") Map<String,Object> rename(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody Rename b){s.access(client,u.getName());return flow.rename(client,u.getName(),id,b.name(),b.revision());}
    @GetMapping("/product-groups/{anchor}/projects") List<Map<String,Object>> productProjects(Principal u,@PathVariable String client,@PathVariable String anchor){s.access(client,u.getName());return flow.productProjects(client,anchor);}

    @GetMapping("/projects/{id}/flow") Map<String,Object> detail(Principal u,@PathVariable String client,@PathVariable String id){s.access(client,u.getName());return remake(client,id)?flow.flow(client,id):dirs.flow(client,id);}
    @PutMapping("/projects/{id}/settings") Map<String,Object> settings(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody Settings b){
        s.access(client,u.getName());
        var in=new ProjectFlowService.SettingsInput(b.revision(),b.name(),b.ratio(),b.resolution(),b.personaId(),b.personaName(),b.approach());
        return remake(client,id)?flow.settings(client,u.getName(),id,in):dirs.settings(client,u.getName(),id,in,b.duration(),b.oneClick());
    }
    @PutMapping("/projects/{id}/product") Map<String,Object> product(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody ProductChange b){
        s.access(client,u.getName());return remake(client,id)?flow.changeProduct(client,u.getName(),id,b.anchorId(),b.revision()):dirs.changeProduct(client,u.getName(),id,b.anchorId(),b.revision());
    }
    // ---------- 框架模式 / 一键成片：方向、每个方向的分镜、一键出片 ----------
    @PostMapping("/projects/{id}/directions/generate") Map<String,Object> generate(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody Generate b){s.access(client,u.getName());return dirs.generate(client,u.getName(),id,b.revision(),b.personaName(),b.duration());}
    @PostMapping("/projects/{id}/directions/confirm") Map<String,Object> pick(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody Pick b){s.access(client,u.getName());return dirs.confirm(client,u.getName(),id,b.revision(),b.ids());}
    @PostMapping("/projects/{id}/directions/{dir}/regenerate") Map<String,Object> regenerate(Principal u,@PathVariable String client,@PathVariable String id,@PathVariable String dir,@Valid @RequestBody Revision b){s.access(client,u.getName());return dirs.regenerate(client,u.getName(),id,dir,b.revision());}
    @PutMapping("/projects/{id}/directions/{dir}") Map<String,Object> editDirection(Principal u,@PathVariable String client,@PathVariable String id,@PathVariable String dir,@Valid @RequestBody DirectionEdit b){s.access(client,u.getName());return dirs.edit(client,u.getName(),id,dir,b.revision(),b.direction());}
    @PutMapping("/projects/{id}/directions/{dir}/storyboard") Map<String,Object> dirBoard(Principal u,@PathVariable String client,@PathVariable String id,@PathVariable String dir,@Valid @RequestBody DirBoard b){
        s.access(client,u.getName());
        return dirs.saveBoard(client,u.getName(),id,dir,b.revision(),b.shots().stream().map(x->new DirectionFlowService.ShotEdit(x.id(),x.visual(),x.lines(),x.task())).toList(),b.confirmed());
    }
    @PostMapping("/projects/{id}/directions/{dir}/storyboard/rewrite") Map<String,Object> dirBoardRewrite(Principal u,@PathVariable String client,@PathVariable String id,@PathVariable String dir,@Valid @RequestBody Revision b){s.access(client,u.getName());return dirs.rewriteBoard(client,u.getName(),id,dir,b.revision());}
    @PostMapping("/projects/{id}/one-click/run") Map<String,Object> run(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody Run b){s.access(client,u.getName());return dirs.run(client,u.getName(),id,b.revision(),b.settings(),b.note());}
    @PutMapping("/projects/{id}/reference") Map<String,Object> reference(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody ReferenceChange b){s.access(client,u.getName());return flow.changeReference(client,u.getName(),id,b.assetId(),b.revision());}
    @PutMapping("/projects/{id}/storyboard") Map<String,Object> storyboard(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody Storyboard b){
        s.access(client,u.getName());
        return flow.saveStoryboard(client,u.getName(),id,b.revision(),b.shots().stream().map(x->new ProjectFlowService.ShotEdit(x.id(),x.camera(),x.visual(),x.lines(),x.task())).toList(),b.confirmed());
    }
    @PostMapping("/projects/{id}/storyboard/reset") Map<String,Object> reset(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody Revision b){s.access(client,u.getName());return flow.resetStoryboard(client,u.getName(),id,b.revision());}
    @PostMapping("/projects/{id}/storyboard/draft") Map<String,Object> draft(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody Revision b){s.access(client,u.getName());return flow.draftStoryboard(client,u.getName(),id,b.revision());}
    @PostMapping("/projects/{id}/ad-ignores") List<String> ignore(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody Ignore b){s.access(client,u.getName());return flow.ignore(client,u.getName(),id,b.key());}
    @PostMapping("/projects/{id}/versions") Map<String,Object> version(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody Version b){
        s.access(client,u.getName());
        var in=new ProjectFlowService.VersionInput(b.segments().stream().map(x->new ProjectFlowService.Segment(x.key(),x.title(),x.text())).toList(),b.note(),b.basedOn(),b.confirmed());
        return remake(client,id)?flow.createVersion(client,u.getName(),id,in):dirs.createVersion(client,u.getName(),id,in,b.directionId());
    }
    @PostMapping("/projects/{id}/versions/rewrite") Map<String,Object> rewrite(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody Rewrite b){s.access(client,u.getName());return flow.rewrite(client,id,b.basedOn(),b.instruction());}
    @PutMapping("/jobs/{id}/verdict") Map<String,Object> verdict(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody Verdict b){s.access(client,u.getName());return flow.verdict(client,u.getName(),id,b.rating(),b.reason(),b.use(),b.revision());}
    @PostMapping("/jobs/{id}/cancel") Models.Job cancel(Principal u,@PathVariable String client,@PathVariable String id){s.access(client,u.getName());return flow.cancel(client,u.getName(),id);}
}
