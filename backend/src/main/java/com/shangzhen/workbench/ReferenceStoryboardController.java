package com.shangzhen.workbench;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import java.security.Principal;

@RestController
@RequestMapping("/api/clients/{client}/assets/{asset}/storyboard")
public class ReferenceStoryboardController {
    private final Store store; private final ReferenceStoryboardService service; private final MediaService media;
    public ReferenceStoryboardController(Store store,ReferenceStoryboardService service,MediaService media){this.store=store;this.service=service;this.media=media;}
    public record Start(@Min(0) int revision,boolean confirmed,String shotId,boolean slow) {}
    public record Edit(@Min(0) int revision,@NotNull ReferenceStoryboardService.Report report) {}
    @GetMapping Object get(Principal user,@PathVariable String client,@PathVariable String asset){store.access(client,user.getName());return service.get(client,asset);}
    @PostMapping Object start(Principal user,@PathVariable String client,@PathVariable String asset,@Valid @RequestBody Start input){store.access(client,user.getName());return service.start(client,asset,input);}
    @PutMapping Object edit(Principal user,@PathVariable String client,@PathVariable String asset,@Valid @RequestBody Edit input){store.access(client,user.getName());return service.edit(client,asset,input.revision(),input.report());}
    @GetMapping("/thumbnail") ResponseEntity<Resource> thumbnail(Principal user,@PathVariable String client,@PathVariable String asset,@RequestParam double at) throws Exception {
        store.access(client,user.getName());return media.file(service.thumbnail(client,asset,at),"image/jpeg","thumbnail.jpg",false);
    }
}
