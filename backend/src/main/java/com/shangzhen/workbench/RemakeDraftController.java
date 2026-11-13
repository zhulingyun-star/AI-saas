package com.shangzhen.workbench;

import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;

@RestController
@RequestMapping("/api/clients/{client}/campaigns/{campaign}/remake/{asset}/{anchor}")
public class RemakeDraftController {
    private final Store s;private final RemakeDraftService service;
    public RemakeDraftController(Store s,RemakeDraftService service){this.s=s;this.service=service;}
    public record Start(@Min(0) int revision,boolean confirmed,boolean overlays,@Min(4) @Max(30) int duration) {}
    public record Edit(@Min(0) int revision,@NotNull RemakeDraftService.Draft draft) {}
    public record Render(@Min(0) int revision,boolean confirmed,@NotNull String resolution) {}
    @GetMapping Object get(Principal u,@PathVariable String client,@PathVariable String campaign,@PathVariable String asset,@PathVariable String anchor){s.access(client,u.getName());return service.get(client,campaign,asset,anchor);}
    @PostMapping("/copy") Object copy(Principal u,@PathVariable String client,@PathVariable String campaign,@PathVariable String asset,@PathVariable String anchor,@Valid @RequestBody Start body){s.access(client,u.getName());return service.start(client,campaign,asset,anchor,body,false);}
    @PostMapping("/prompt") Object prompt(Principal u,@PathVariable String client,@PathVariable String campaign,@PathVariable String asset,@PathVariable String anchor,@Valid @RequestBody Start body){s.access(client,u.getName());return service.start(client,campaign,asset,anchor,body,true);}
    @PutMapping Object edit(Principal u,@PathVariable String client,@PathVariable String campaign,@PathVariable String asset,@PathVariable String anchor,@Valid @RequestBody Edit body){s.access(client,u.getName());return service.edit(client,campaign,asset,anchor,body);}
    @PostMapping("/render") Object render(Principal u,@PathVariable String client,@PathVariable String campaign,@PathVariable String asset,@PathVariable String anchor,@Valid @RequestBody Render body){s.access(client,u.getName());return service.render(client,campaign,asset,anchor,u.getName(),body);}
}
