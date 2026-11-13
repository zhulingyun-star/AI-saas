package com.shangzhen.workbench;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.security.Principal;
import java.util.*;
import static com.shangzhen.workbench.Models.Asset;

@RestController
@RequestMapping("/api/clients/{client}/campaigns/{campaign}/products")
public class CampaignProductController {
    private final Store s; private final CampaignProductService service;
    public CampaignProductController(Store s,CampaignProductService service) {this.s=s;this.service=service;}
    public record Selection(@NotNull @Size(max=100) List<@NotBlank String> anchorIds,@Min(0) int revision) {}
    @GetMapping public Map<String,Object> get(Principal u,@PathVariable String client,@PathVariable String campaign) {
        s.access(client,u.getName());return service.get(client,campaign);
    }
    @PutMapping public Map<String,Object> save(Principal u,@PathVariable String client,@PathVariable String campaign,@Valid @RequestBody Selection input) {
        s.access(client,u.getName());return service.save(client,campaign,input);
    }
}

@Service
class CampaignProductService {
    private final Store s;private final MediaService media;private final ProductAnalysisService analysis;
    CampaignProductService(Store s,MediaService media,ProductAnalysisService analysis) {this.s=s;this.media=media;this.analysis=analysis;}
    private Map<String,Object> campaign(String client,String id) {
        return s.db.query("SELECT revision,archived FROM campaigns WHERE client_id=? AND id=?",(r,n)->Map.<String,Object>of("revision",r.getInt("revision"),"archived",r.getBoolean("archived")),client,id).stream().findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"项目不存在"));
    }
    Map<String,Object> get(String client,String id) {
        var campaign=campaign(client,id);
        List<Map<String,Object>> products=new ArrayList<>();Set<String> seen=new HashSet<>();
        for(String anchor:s.db.queryForList("SELECT anchor_id FROM campaign_products WHERE campaign_id=? ORDER BY sort_order",String.class,id)) {
            List<Asset> members=media.productMembers(client,anchor);
            if(!seen.add(MediaService.productKey(members.get(0))))continue;
            products.add(Map.of("anchorId",anchor,"assets",members,"analysis",analysis.get(client,anchor)));
        }
        return Map.of("revision",campaign.get("revision"),"products",products);
    }
    @Transactional public Map<String,Object> save(String client,String id,CampaignProductController.Selection input) {
        var campaign=campaign(client,id);
        if(Boolean.TRUE.equals(campaign.get("archived")))throw Store.bad("项目已归档，请恢复后选择商品");
        List<String> anchors=new ArrayList<>();Set<String> groups=new HashSet<>();
        for(String anchor:input.anchorIds()) {
            List<Asset> members=media.productMembers(client,anchor);
            if(groups.add(MediaService.productKey(members.get(0))))anchors.add(anchor);
        }
        if(s.db.update("UPDATE campaigns SET revision=revision+1,updated_at=? WHERE client_id=? AND id=? AND revision=?",Store.now(),client,id,input.revision())!=1)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"项目已修改，请重新打开商品选择后保存");
        s.db.update("DELETE FROM campaign_products WHERE campaign_id=?",id);
        for(int i=0;i<anchors.size();i++)s.db.update("INSERT INTO campaign_products(campaign_id,anchor_id,sort_order) VALUES(?,?,?)",id,anchors.get(i),i);
        return get(client,id);
    }
}
