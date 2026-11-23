package com.shangzhen.workbench;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
import java.util.*;

@RestController
@RequestMapping("/api/clients/{client}")
public class ProductLibraryController {
    private final Store s;private final ProductLibraryService library;
    public ProductLibraryController(Store s,ProductLibraryService library){this.s=s;this.library=library;}
    public record FolderInput(@NotNull @Size(max=60) String name,@Size(max=36) String parentId) {}
    public record FolderRename(@NotNull @Size(max=60) String name,@Min(0) int revision) {}
    public record Placement(@Size(max=36) String folderId) {}
    public record Review(@NotNull @Size(max=300) List<String> confirmed,boolean reviewed) {}
    public record UnderstandingInput(@NotNull Map<String,Object> understanding,@Min(0) int revision) {}
    public record Extract(@Min(0) int revision) {}
    public record PersonaEdit(@NotNull @Valid ProductLibraryService.PersonaInput persona,@Min(0) int revision) {}

    @GetMapping("/product-library") Map<String,Object> library(Principal u,@PathVariable String client){s.access(client,u.getName());return library.library(client);}
    @PostMapping("/product-folders") LibraryFolders.Folder createFolder(Principal u,@PathVariable String client,@Valid @RequestBody FolderInput body){s.access(client,u.getName());return library.createFolder(client,u.getName(),body.name(),body.parentId());}
    @PutMapping("/product-folders/{id}") LibraryFolders.Folder renameFolder(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody FolderRename body){s.access(client,u.getName());return library.renameFolder(client,u.getName(),id,body.name(),body.revision());}
    @DeleteMapping("/product-folders/{id}") ResponseEntity<Void> deleteFolder(Principal u,@PathVariable String client,@PathVariable String id){s.access(client,u.getName());library.deleteFolder(client,u.getName(),id);return ResponseEntity.noContent().build();}
    @PutMapping("/product-groups/{anchor}/folder") Map<String,Object> move(Principal u,@PathVariable String client,@PathVariable String anchor,@Valid @RequestBody Placement body){s.access(client,u.getName());return library.move(client,u.getName(),anchor,body.folderId());}
    @PutMapping("/product-groups/{anchor}/review") Map<String,Object> review(Principal u,@PathVariable String client,@PathVariable String anchor,@Valid @RequestBody Review body){s.access(client,u.getName());return library.review(client,anchor,body.confirmed(),body.reviewed());}
    @GetMapping("/product-groups/{anchor}/understanding") Map<String,Object> understanding(Principal u,@PathVariable String client,@PathVariable String anchor){s.access(client,u.getName());return library.understanding(client,anchor);}
    @PutMapping("/product-groups/{anchor}/understanding") Map<String,Object> saveUnderstanding(Principal u,@PathVariable String client,@PathVariable String anchor,@Valid @RequestBody UnderstandingInput body){s.access(client,u.getName());return library.saveUnderstanding(client,anchor,body.understanding(),body.revision());}
    @PostMapping("/product-groups/{anchor}/understanding/extract") Map<String,Object> extract(Principal u,@PathVariable String client,@PathVariable String anchor,@Valid @RequestBody Extract body){s.access(client,u.getName());return library.extract(client,anchor,body.revision());}
    @PostMapping("/product-groups/{anchor}/personas/adopt") Map<String,Object> adopt(Principal u,@PathVariable String client,@PathVariable String anchor){s.access(client,u.getName());return library.adoptPersonas(client,anchor);}
    @PostMapping("/product-groups/{anchor}/personas") Map<String,Object> createPersona(Principal u,@PathVariable String client,@PathVariable String anchor,@Valid @RequestBody ProductLibraryService.PersonaInput body){s.access(client,u.getName());return library.createPersona(client,anchor,body);}
    @PutMapping("/product-groups/{anchor}/personas/{id}") Map<String,Object> updatePersona(Principal u,@PathVariable String client,@PathVariable String anchor,@PathVariable String id,@Valid @RequestBody PersonaEdit body){s.access(client,u.getName());return library.updatePersona(client,anchor,id,body.persona(),body.revision());}
    @DeleteMapping("/product-groups/{anchor}/personas/{id}") Map<String,Object> deletePersona(Principal u,@PathVariable String client,@PathVariable String anchor,@PathVariable String id){s.access(client,u.getName());return library.deletePersona(client,anchor,id);}
}
