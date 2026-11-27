package com.shangzhen.workbench;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static com.shangzhen.workbench.Models.*;

@Service
public class ProjectService {
    private final Store s;
    private final VideoApiClient video;
    private final AiService ai;
    private final OssReferenceService oss;
    public ProjectService(Store s, VideoApiClient video, AiService ai, OssReferenceService oss) {this.s=s;this.video=video;this.ai=ai;this.oss=oss;}
    void validate(String client,ProjectInput p) {
        if(p.shots().size()>0 && p.shots().stream().mapToInt(Shot::duration).sum()!=p.duration()) throw Store.bad("镜头总时长必须等于成片时长");
        if(s.write(p.config()).length()>10000) throw Store.bad("制作配置过长");
        Object campaign=p.config().get("campaignId");
        if(campaign instanceof String campaignId&&!campaignId.isBlank()&&s.db.queryForObject("SELECT COUNT(*) FROM campaigns WHERE id=? AND client_id=?",Integer.class,campaignId,client)==0)throw Store.bad("交付项目不属于当前客户");
        for(Shot shot:p.shots()) if(shot.assetId()!=null&&!shot.assetId().isBlank()) {
            Asset a=s.asset(client,shot.assetId());
            if(!a.mime().startsWith("image/")&&!a.mime().startsWith("video/")) throw Store.bad("分镜只能引用图片或视频");
        }
    }
    @Transactional public Project create(String client,String user,ProjectInput p) {
        validate(client,p); String id=Store.id(); var now=Store.now();
        s.db.update("INSERT INTO projects VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",id,client,p.name(),Objects.toString(p.sku(),""),p.category(),p.platform(),p.format(),p.duration(),p.facts(),p.factsConfirmed(),s.write(p.shots()),s.write(p.config()),p.shots().isEmpty()?"DRAFT":"SCRIPT_READY",0,now,now);
        Object campaign=p.config().get("campaignId");
        String campaignId=campaign instanceof String text&&!text.isBlank()?text:null;
        if(campaignId!=null&&s.db.queryForObject("SELECT COUNT(*) FROM campaigns WHERE client_id=? AND id=? AND archived=FALSE",Integer.class,client,campaignId)==0)throw Store.bad("交付项目不存在或已归档");
        s.db.update("INSERT INTO work_flow VALUES(?,?,?,?,?,?,?,?)",id,campaignId,user,p.shots().isEmpty()?"PLAN":"PRODUCTION",null,"",0,now);
        s.audit(client,user,"创建作品",p.name()); return s.project(client,id);
    }
    @Transactional public Map<String,Object> startOneClick(String client,String user,ProjectInput input){
        if(!input.factsConfirmed()||input.facts().isBlank())throw Store.bad("请先确认商品事实");
        if(input.duration()<4||input.duration()>30)throw Store.bad("一键成片时长须为4至30秒");
        if(!ai.enabled())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"文字模型未配置；尚未创建任务");
        if(!video.enabled())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"视频供应商未启用；尚未创建任务");
        if(!oss.enabled())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"商品图片存储未配置；尚未创建任务");
        if(!"ECOMMERCE_VIDEO".equals(input.config().get("creationMode"))||!"ONE_CLICK".equals(input.config().get("productionMode")))throw Store.bad("一键成片模式标记无效");
        if(!input.shots().isEmpty())throw Store.bad("一键成片必须从空分镜草稿开始");
        List<String> imageIds=productImages(input.config());if(imageIds.isEmpty()||imageIds.size()>30)throw Store.bad("一键成片需要1至30张商品图片");
        String campaign=Objects.toString(input.config().get("campaignId"),""),anchor=Objects.toString(input.config().get("productAnchorId"),"");
        if(s.db.queryForObject("SELECT COUNT(*) FROM campaign_products WHERE campaign_id=? AND anchor_id=?",Integer.class,campaign,anchor)==0)throw Store.bad("请先在项目绑定所选商品");
        for(String id:imageIds)if(!s.asset(client,id).mime().startsWith("image/"))throw Store.bad("一键成片参考素材必须是图片");
        Project project=create(client,user,input);
        s.db.queryForObject("SELECT id FROM clients WHERE id=? FOR UPDATE",String.class,client);
        String id=Store.id();var now=Store.now();
        s.db.update("INSERT INTO jobs(id,client_id,project_id,name,provider,status,progress,snapshot,message,output_name,revision,created_at,updated_at,created_by) VALUES(?,?,?,?,?,'QUEUED',0,?,?,NULL,1,?,?,?)",id,client,project.id(),project.name(),"VIDEO_API",s.write(project),"已确认费用，等待自动生成框架与分镜",now,now,user);
        s.audit(client,user,"提交一键成片",project.name()+" / AI方案 + 视频生成");
        return Map.of("project",project,"job",s.job(client,id));
    }
    private List<String> productImages(Map<String,Object> config){Object raw=config.get("productAssetIds");if(!(raw instanceof List<?> ids))return List.of();return ids.stream().map(Object::toString).distinct().toList();}
    @Transactional public Project prepareOneClick(String jobId,Project snapshot){
        Project current=s.project(snapshot.clientId(),snapshot.id());if(current.revision()!=snapshot.revision())throw new ResponseStatusException(HttpStatus.CONFLICT,"作品已修改；一键任务未覆盖用户修改");
        AiService.OneClickDraft generated=ai.oneClickDraft(current);
        List<String> images=productImages(current.config());List<Shot> shots=new ArrayList<>();
        for(int i=0;i<generated.shots().size();i++){AiService.DraftShot shot=generated.shots().get(i);shots.add(new Shot(shot.duration(),shot.visual(),shot.narration(),images.get(i%images.size()),0,false));}
        Map<String,Object> config=new LinkedHashMap<>(current.config());config.put("creativeFramework",Map.of("title",generated.frameworkTitle(),"summary",generated.frameworkSummary()));
        var now=Store.now();
        int updated=s.db.update("UPDATE projects SET shots=?,config=?,status='SCRIPT_READY',revision=revision+1,updated_at=? WHERE client_id=? AND id=? AND revision=?",s.write(shots),s.write(config),now,current.clientId(),current.id(),current.revision());
        if(updated!=1)throw new ResponseStatusException(HttpStatus.CONFLICT,"作品已修改；自动生成未覆盖用户修改");
        s.db.update("UPDATE work_flow SET phase='PRODUCTION',revision=revision+1,updated_at=? WHERE project_id=?",now,current.id());
        Project ready=s.project(current.clientId(),current.id());
        s.db.update("UPDATE jobs SET snapshot=?,progress=35,message=?,updated_at=? WHERE id=? AND status='RUNNING'",s.write(ready),"创作框架与"+shots.size()+"镜分镜已完成；正在准备商品图片",Store.now(),jobId);
        return ready;
    }
    @Transactional public Project update(String client,String id,String user,ProjectInput p) {
        validate(client,p);
        int count=s.db.update("UPDATE projects SET name=?,sku=?,category=?,platform=?,format=?,duration=?,facts=?,facts_confirmed=?,shots=?,config=?,status=?,revision=revision+1,updated_at=? WHERE client_id=? AND id=? AND revision=?",p.name(),Objects.toString(p.sku(),""),p.category(),p.platform(),p.format(),p.duration(),p.facts(),p.factsConfirmed(),s.write(p.shots()),s.write(p.config()),p.shots().isEmpty()?"DRAFT":"SCRIPT_READY",Store.now(),client,id,p.revision());
        if(count==0) throw new ResponseStatusException(HttpStatus.CONFLICT,"项目已更新，请重新打开后再保存");
        String campaignId=p.config().get("campaignId") instanceof String value&&!value.isBlank()?value:null;
        var linked=s.db.queryForObject("SELECT COALESCE(campaign_id,'') FROM work_flow WHERE project_id=?",String.class,id);
        if(!Objects.equals(linked,Objects.toString(campaignId,"")))s.db.update("UPDATE work_flow SET campaign_id=?,revision=revision+1,updated_at=? WHERE project_id=?",campaignId,Store.now(),id);
        s.audit(client,user,"保存脚本",p.name()); return s.project(client,id);
    }
    @Transactional public List<Project> batch(String client,String user,List<ProjectInput> inputs) {return inputs.stream().map(p->create(client,user,p)).toList();}
    @Transactional public List<Job> submit(String client,String user,Submit input) {
        if(!Set.of("LOCAL","VIDEO_API").contains(input.provider())) throw Store.bad("不支持的制作方式");
        // Serialize submissions within a client to prevent duplicate active jobs.
        s.db.queryForObject("SELECT id FROM clients WHERE id=? FOR UPDATE",String.class,client);
        List<Job> jobs=new ArrayList<>();
        for(String id:new LinkedHashSet<>(input.projectIds())) {
            Project p=s.project(client,id);
            if(input.provider().equals("VIDEO_API")&&video.enabled()){
                if(p.duration()<4||p.duration()>30)throw Store.bad("视频生成时长须为4至30秒");
                for(String image:JobWorker.referenceIds(p))if(!s.asset(client,image).mime().startsWith("image/"))throw Store.bad("视频参考素材必须是图片");
                if(JobWorker.referenceIds(p).isEmpty()||JobWorker.referenceIds(p).size()>30)throw Store.bad("请选择1至30张商品参考图");
                if(p.config().containsKey("remakeDraftId"))RemakeDraftService.verifyProject(s,p);
            }
            if(!p.factsConfirmed()||p.shots().isEmpty()) throw Store.bad(p.name()+"：请先确认商品事实并完成分镜");
            if(s.db.queryForObject("SELECT COUNT(*) FROM jobs WHERE project_id=? AND status IN ('QUEUED','RUNNING')",Integer.class,id)>0) throw new ResponseStatusException(HttpStatus.CONFLICT,p.name()+"已有制作中的产单");
            if(input.provider().equals("LOCAL")&&p.shots().stream().anyMatch(x->x.assetId()==null||x.assetId().isBlank())) throw Store.bad(p.name()+"：本地粗剪需要为每个镜头选择真实素材");
            String jobId=Store.id(); var now=Store.now();
            int version=s.db.queryForObject("SELECT COALESCE(MAX(revision),0)+1 FROM jobs WHERE project_id=?",Integer.class,id);
            boolean external=input.provider().equals("VIDEO_API");
            String status=external&&!video.enabled()?"BLOCKED":"QUEUED";
            String message=status.equals("BLOCKED")?"视频供应商未配置；未发出请求、未产生费用":external?"已排队：提交后将调用 "+video.model()+"，可能产生供应商费用":"已排队：将使用上传素材进行 FFmpeg 粗剪";
            s.db.update("INSERT INTO jobs(id,client_id,project_id,name,provider,status,progress,snapshot,message,output_name,revision,created_at,updated_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",jobId,client,id,p.name(),input.provider(),status,0,s.write(p),message,null,version,now,now,user);
            jobs.add(s.job(client,jobId));
        }
        s.audit(client,user,"提交制作",jobs.size()+" 条产单 / "+input.provider()); return jobs;
    }
    @Transactional public List<Project> variants(String client,String id,String user,List<String> scenes) {
        if(scenes.isEmpty()||scenes.size()>3)throw Store.bad("场景变体限 1–3 条");
        Project source=s.project(client,id);List<Project> results=new ArrayList<>();
        for(String scene:new LinkedHashSet<>(scenes)) {
            if(scene.isBlank()||scene.length()>80)throw Store.bad("场景名称不合法");
            Map<String,Object> config=new LinkedHashMap<>(source.config());config.put("sourceWorkId",id);config.put("sourceRevision",source.revision());config.put("scene",scene);
            var shots=source.shots().stream().map(shot->new Shot(shot.duration(),shot.visual().substring(0,Math.min(1850,shot.visual().length()))+"。新场景："+scene+"，请人工核对动作与商品。",shot.narration(),shot.assetId(),shot.startAt(),false)).toList();
            String name=source.name()+" · "+scene;if(name.length()>150)name=name.substring(0,150);
            results.add(create(client,user,new ProjectInput(name,source.sku(),source.category(),source.platform(),source.format(),source.duration(),source.facts(),false,shots,config,0)));
        }
        return results;
    }
    @Transactional public void review(String client,String id,String user,ReviewInput input) {
        s.job(client,id);
        s.db.queryForObject("SELECT id FROM jobs WHERE client_id=? AND id=? FOR UPDATE",String.class,client,id);
        Job job=s.job(client,id);
        if(!Set.of("COMMENT","CHANGES_REQUESTED","DELIVERED").contains(input.decision())) throw Store.bad("审核决定无效");
        if(input.decision().equals("DELIVERED")&&(!job.hasOutput()||!Set.of("REVIEW","CHANGES_REQUESTED").contains(job.status()))) throw Store.bad("只有生成了真实文件的待审核产单才能交付");
        if(input.decision().equals("CHANGES_REQUESTED")&&!Set.of("REVIEW","DELIVERED","CHANGES_REQUESTED").contains(job.status())) throw Store.bad("此产单尚不能退回修改");
        s.db.update("INSERT INTO reviews VALUES(?,?,?,?,?,?,?)",Store.id(),id,user,input.timecode(),input.decision(),input.comment(),Store.now());
        if(!input.decision().equals("COMMENT")) s.db.update("UPDATE jobs SET status=?,updated_at=? WHERE id=?",input.decision(),Store.now(),id);
        s.audit(client,user,"审核产单",job.name()+" / "+input.decision());
    }
}
