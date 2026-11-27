package com.shangzhen.workbench;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.util.*;

/**
 * 投流数据回流（PRD《投流数据回流模块 v1.0》）：千川账户、CSV 导入、素材 / 商品 / 账户看板、导出、投放建议。
 * 都在客户空间下（/api/clients/{client}/analytics），先过 Store.access（进不去 404），修改操作再过 RoleGuard（只读、内容制作 403）。
 * 说明见 backend/API.md「投流数据回流（V14）」。
 */
@RestController
@RequestMapping("/api/clients/{client}/analytics")
public class AnalyticsController {
    private final Store s;private final AccountService accounts;private final AnalyticsService analytics;private final PerformanceService perf;private final SuggestionService suggestions;
    public AnalyticsController(Store s,AccountService accounts,AnalyticsService analytics,PerformanceService perf,SuggestionService suggestions){
        this.s=s;this.accounts=accounts;this.analytics=analytics;this.perf=perf;this.suggestions=suggestions;
    }
    public record AccountInput(@NotBlank @Size(max=100) String name,@NotBlank @Size(max=50) String advertiserId,@Size(max=20) String status,@Min(0) Integer revision) {}
    public record DecideInput(@NotBlank @Size(max=20) String action,@Min(0) int revision) {}
    public record RuleInput(boolean enabled,@Size(max=10) Map<@Size(max=30) String,Double> params,@Min(0) int revision) {}

    private AnalyticsService.Filter filter(String start,String end,String accountId,String product,String creator,String job){
        return AnalyticsService.Filter.of(start,end,accountId,product,creator,job);
    }
    private static ResponseEntity<byte[]> csv(String name,String body){
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(name,StandardCharsets.UTF_8).build().toString())
            .contentType(new MediaType("text","csv",StandardCharsets.UTF_8))
            .body(body.getBytes(StandardCharsets.UTF_8));
    }
    private static String stamp(){return VideoLibraryService.today().toString();}

    // ---------- 概览（左栏角标） ----------
    @GetMapping("/overview") Map<String,Object> overview(Principal u,@PathVariable String client){
        s.access(client,u.getName());
        Map<String,Object> sum=analytics.summary(client,AnalyticsService.Filter.of(null,null,null,null,null,null));
        Map<String,Object> m=new LinkedHashMap<>();
        m.put("pendingSuggestions",suggestions.pending(client));m.put("accounts",accounts.list(client).size());
        m.put("hasData",sum.get("materialCount")!=null&&((Long)sum.get("materialCount"))>0);m.put("from",sum.get("from"));m.put("to",sum.get("to"));
        return m;
    }

    // ---------- 千川账户 ----------
    @GetMapping("/accounts") Map<String,Object> accounts(Principal u,@PathVariable String client,@RequestParam(required=false) String start,@RequestParam(required=false) String end){
        s.access(client,u.getName());return analytics.accounts(client,filter(start,end,null,null,null,null));
    }
    @GetMapping("/accounts/export") ResponseEntity<byte[]> exportAccounts(Principal u,@PathVariable String client,@RequestParam(required=false) String start,@RequestParam(required=false) String end){
        s.access(client,u.getName());return csv("千川账户_"+stamp()+".csv",analytics.exportAccounts(client,filter(start,end,null,null,null,null)));
    }
    @PostMapping("/accounts") Map<String,Object> create(Principal u,@PathVariable String client,@Valid @RequestBody AccountInput b){
        s.access(client,u.getName());
        return AccountService.view(accounts.create(client,u.getName(),b.name(),b.advertiserId()),null,0);
    }
    @PutMapping("/accounts/{id}") Map<String,Object> update(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody AccountInput b){
        s.access(client,u.getName());
        if(b.revision()==null) throw Store.bad("缺少 revision");
        return AccountService.view(accounts.update(client,u.getName(),id,b.name(),b.advertiserId(),b.status(),b.revision()),null,0);
    }
    @DeleteMapping("/accounts/{id}") Map<String,Object> delete(Principal u,@PathVariable String client,@PathVariable String id,@RequestParam int revision){
        s.access(client,u.getName());return accounts.delete(client,u.getName(),id,revision);
    }

    // ---------- 导入（和 /performance-imports 是同一套，多了账户和日期范围） ----------
    @PostMapping("/import/preview") Map<String,Object> preview(Principal u,@PathVariable String client,@Valid @RequestBody VideoLibraryController.ImportBody b){
        s.access(client,u.getName());return perf.preview(client,b.input());
    }
    @PostMapping("/import/confirm") Map<String,Object> confirm(Principal u,@PathVariable String client,@Valid @RequestBody VideoLibraryController.ImportBody b){
        s.access(client,u.getName());
        if(!b.confirmed()) throw Store.bad("先看过预览再确认导入");
        return perf.importRows(client,u.getName(),b.input());
    }

    // ---------- 看板 ----------
    @GetMapping("/materials") Map<String,Object> materials(Principal u,@PathVariable String client,@RequestParam(required=false) String start,@RequestParam(required=false) String end,
        @RequestParam(required=false) String accountId,@RequestParam(required=false) String product,@RequestParam(required=false) String creator,@RequestParam(required=false) String job,
        @RequestParam(required=false) String sort,@RequestParam(required=false) String order,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="50") int size){
        s.access(client,u.getName());return analytics.materials(client,filter(start,end,accountId,product,creator,job),sort,order,page,size);
    }
    @GetMapping("/materials/export") ResponseEntity<byte[]> exportMaterials(Principal u,@PathVariable String client,@RequestParam(required=false) String start,@RequestParam(required=false) String end,
        @RequestParam(required=false) String accountId,@RequestParam(required=false) String product,@RequestParam(required=false) String creator,@RequestParam(required=false) String job,
        @RequestParam(required=false) String sort,@RequestParam(required=false) String order){
        s.access(client,u.getName());return csv("素材投放数据_"+stamp()+".csv",analytics.exportMaterials(client,filter(start,end,accountId,product,creator,job),sort,order));
    }
    @GetMapping("/summary") Map<String,Object> summary(Principal u,@PathVariable String client,@RequestParam(required=false) String start,@RequestParam(required=false) String end,
        @RequestParam(required=false) String accountId,@RequestParam(required=false) String product,@RequestParam(required=false) String creator,@RequestParam(required=false) String job){
        s.access(client,u.getName());return analytics.summary(client,filter(start,end,accountId,product,creator,job));
    }
    @GetMapping("/products") Map<String,Object> products(Principal u,@PathVariable String client,@RequestParam(required=false) String start,@RequestParam(required=false) String end,
        @RequestParam(required=false) String accountId,@RequestParam(required=false) String creator){
        s.access(client,u.getName());return analytics.products(client,filter(start,end,accountId,null,creator,null));
    }
    @GetMapping("/products/export") ResponseEntity<byte[]> exportProducts(Principal u,@PathVariable String client,@RequestParam(required=false) String start,@RequestParam(required=false) String end,
        @RequestParam(required=false) String accountId,@RequestParam(required=false) String creator){
        s.access(client,u.getName());return csv("商品投放数据_"+stamp()+".csv",analytics.exportProducts(client,filter(start,end,accountId,null,creator,null)));
    }

    // ---------- 投放建议 ----------
    @GetMapping("/suggestions") Map<String,Object> suggestions(Principal u,@PathVariable String client,@RequestParam(required=false) String status){
        s.access(client,u.getName());return suggestions.list(client,status);
    }
    @PostMapping("/suggestions/{id}/decide") Map<String,Object> decide(Principal u,@PathVariable String client,@PathVariable String id,@Valid @RequestBody DecideInput b){
        s.access(client,u.getName());return suggestions.decide(client,u.getName(),id,b.action(),b.revision());
    }
    @PostMapping("/suggestions/scan") Map<String,Object> scan(Principal u,@PathVariable String client){
        s.access(client,u.getName());return Map.of("created",suggestions.scan(client));
    }
    @GetMapping("/suggestion-rules") List<Map<String,Object>> rules(Principal u,@PathVariable String client){
        s.access(client,u.getName());return suggestions.rules(client);
    }
    @PutMapping("/suggestion-rules/{key}") Map<String,Object> rule(Principal u,@PathVariable String client,@PathVariable String key,@Valid @RequestBody RuleInput b){
        s.access(client,u.getName());return suggestions.updateRule(client,u.getName(),key,b.enabled(),b.params(),b.revision());
    }
}
