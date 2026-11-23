package com.shangzhen.workbench;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
import java.util.*;

@RestController
@RequestMapping("/api/clients/{client}")
public class ReferenceLibraryController {
    private final Store s;private final ReferenceLibraryService library;
    public ReferenceLibraryController(Store s,ReferenceLibraryService library){this.s=s;this.library=library;}
    public record FolderInput(@NotNull @Size(max=60) String name,@Size(max=36) String parentId) {}
    public record FolderRename(@NotNull @Size(max=60) String name,@Min(0) int revision) {}
    public record Placement(@Size(max=36) String folderId) {}
    public record Rename(@NotNull @Size(max=200) String name,@Min(0) int revision) {}
    public record Labels(@Size(max=20) String hook,@Size(max=40) Map<@Size(max=60) String,@Size(max=20) String> shotTasks,@Min(0) int revision) {}

    @GetMapping("/reference-library") Map<String,Object> library(Principal u,@PathVariable String client){s.access(client,u.getName());return library.library(client);}
    @PostMapping("/reference-folders") LibraryFolders.Folder createFolder(Principal u,@PathVariable String client,@Valid @RequestBody FolderInput body){s.access(client,u.getName());return library.createFolder(client,u.getName(),body.name(),body.parentId());}
    @PutMapping("/reference-folders/{id}") LibraryFolders.Folder renameFolder(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody FolderRename body){s.access(client,u.getName());return library.renameFolder(client,u.getName(),id,body.name(),body.revision());}
    @DeleteMapping("/reference-folders/{id}") ResponseEntity<Void> deleteFolder(Principal u,@PathVariable String client,@PathVariable String id){s.access(client,u.getName());library.deleteFolder(client,u.getName(),id);return ResponseEntity.noContent().build();}
    @GetMapping("/references/{asset}") Map<String,Object> detail(Principal u,@PathVariable String client,@PathVariable String asset){s.access(client,u.getName());return library.detail(client,asset);}
    @PutMapping("/references/{asset}/folder") Map<String,Object> move(Principal u,@PathVariable String client,@PathVariable String asset,@Valid @RequestBody Placement body){s.access(client,u.getName());return library.move(client,u.getName(),asset,body.folderId());}
    @PutMapping("/references/{asset}/name") Map<String,Object> rename(Principal u,@PathVariable String client,@PathVariable String asset,@Valid @RequestBody Rename body){s.access(client,u.getName());return library.rename(client,u.getName(),asset,body.name(),body.revision());}
    @PutMapping("/references/{asset}/labels") Map<String,Object> labels(Principal u,@PathVariable String client,@PathVariable String asset,@Valid @RequestBody Labels body){s.access(client,u.getName());return library.labels(client,u.getName(),asset,body.hook(),body.shotTasks(),body.revision());}
}
