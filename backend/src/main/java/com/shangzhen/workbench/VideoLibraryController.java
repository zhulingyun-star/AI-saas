package com.shangzhen.workbench;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
import java.util.*;

/** 资产库（成片）和投放数据：列表、详情、手填 / 改 / 删投放记录、CSV 表格导入。说明见 backend/API.md「资产库与投放数据」。 */
@RestController
@RequestMapping("/api/clients/{client}")
public class VideoLibraryController {
    private final Store s;private final VideoLibraryService library;private final PerformanceService perf;
    public VideoLibraryController(Store s,VideoLibraryService library,PerformanceService perf){this.s=s;this.library=library;this.perf=perf;}
    public record PerfInput(@NotBlank @Size(max=10) String dateFrom,@Size(max=10) String dateTo,Long impressions,Long clicks,Double retain3s,Double finishRate,
        Long productClicks,Long orders,Double gpm,Double roi,Double negativeRate,@Size(max=300) String note,@Min(0) Integer revision) {
        PerformanceService.Values values(){return new PerformanceService.Values(dateFrom,dateTo,impressions,clicks,retain3s,finishRate,productClicks,orders,gpm,roi,negativeRate,note);}
    }
    public record ImportBody(@Size(max=200) String fileName,@NotNull @Size(max=PerformanceService.MAX_TEXT) String text,@Size(max=20) Map<@Size(max=20) String,Integer> mapping,
        @Size(max=PerformanceService.MAX_ROWS) Map<@Size(max=10) String,@Size(max=36) String> assign,boolean confirmed) {
        PerformanceService.ImportInput input(){return new PerformanceService.ImportInput(fileName,text,mapping,assign);}
    }

    @GetMapping("/video-library") Map<String,Object> list(Principal u,@PathVariable String client){s.access(client,u.getName());return library.library(client);}
    @GetMapping("/video-library/{job}") Map<String,Object> detail(Principal u,@PathVariable String client,@PathVariable String job){s.access(client,u.getName());return library.detail(client,job);}
    @PostMapping("/jobs/{job}/performance") Map<String,Object> create(Principal u,@PathVariable String client,@PathVariable String job,@Valid @RequestBody PerfInput b){
        s.access(client,u.getName());return perf.create(client,u.getName(),job,b.values());
    }
    @PutMapping("/jobs/{job}/performance/{id}") Map<String,Object> update(Principal u,@PathVariable String client,@PathVariable String job,@PathVariable String id,@Valid @RequestBody PerfInput b){
        s.access(client,u.getName());
        if(b.revision()==null) throw Store.bad("缺少 revision");
        return perf.update(client,u.getName(),job,id,b.revision(),b.values());
    }
    @DeleteMapping("/jobs/{job}/performance/{id}") Map<String,Object> delete(Principal u,@PathVariable String client,@PathVariable String job,@PathVariable String id,@RequestParam int revision){
        s.access(client,u.getName());return perf.delete(client,u.getName(),job,id,revision);
    }
    @PostMapping("/performance-imports/preview") Map<String,Object> preview(Principal u,@PathVariable String client,@Valid @RequestBody ImportBody b){
        s.access(client,u.getName());return perf.preview(client,b.input());
    }
    @PostMapping("/performance-imports") Map<String,Object> importRows(Principal u,@PathVariable String client,@Valid @RequestBody ImportBody b){
        s.access(client,u.getName());
        if(!b.confirmed()) throw Store.bad("先看过预览再确认导入");
        return perf.importRows(client,u.getName(),b.input());
    }
    @GetMapping("/performance-imports") List<Map<String,Object>> imports(Principal u,@PathVariable String client){s.access(client,u.getName());return perf.imports(client);}
}
