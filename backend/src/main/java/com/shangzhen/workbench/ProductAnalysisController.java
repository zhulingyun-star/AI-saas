package com.shangzhen.workbench;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
import java.util.Map;

@RestController
@RequestMapping("/api/clients/{client}/product-groups/{anchor}/analysis")
public class ProductAnalysisController {
    private final Store s;
    private final ProductAnalysisService analysis;
    public ProductAnalysisController(Store s,ProductAnalysisService analysis) {this.s=s;this.analysis=analysis;}
    public record Start(@NotNull @Size(max=3000) String brief) {}
    public record Edit(@Min(0) int revision,@NotNull Map<String,Object> report,@NotNull @Size(max=3000) String brief) {}
    @GetMapping public Map<String,Object> get(Principal user,@PathVariable String client,@PathVariable String anchor) {
        s.access(client,user.getName());return analysis.get(client,anchor);
    }
    @PostMapping public Map<String,Object> start(Principal user,@PathVariable String client,@PathVariable String anchor,@Valid @RequestBody Start request) {
        s.access(client,user.getName());return analysis.start(client,anchor,request.brief());
    }
    @PutMapping public Map<String,Object> edit(Principal user,@PathVariable String client,@PathVariable String anchor,@Valid @RequestBody Edit request) {
        s.access(client,user.getName());return analysis.edit(client,anchor,request.revision(),request.report(),request.brief());
    }
}
