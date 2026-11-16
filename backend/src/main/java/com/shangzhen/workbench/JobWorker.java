package com.shangzhen.workbench;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.TimeUnit;
import static com.shangzhen.workbench.Models.*;

@Component
public class JobWorker {
    private final Store s; private final MediaService media; private final VideoApiClient video; private final ProjectService projects; private final String ffmpeg;
    private final ProductAnalysisService images;
    private final OssReferenceService oss;
    private volatile boolean ready;
    public JobWorker(Store s,MediaService media,VideoApiClient video,ProjectService projects,ProductAnalysisService images,OssReferenceService oss,@Value("${app.ffmpeg}") String ffmpeg) {this.s=s;this.media=media;this.video=video;this.projects=projects;this.images=images;this.oss=oss;this.ffmpeg=ffmpeg;}
    @EventListener(ApplicationReadyEvent.class) public void recover() {
        s.db.update("UPDATE jobs SET status='FAILED',message='服务重启中断了本地制作，请重新提交',updated_at=? WHERE status='RUNNING' AND provider<>'VIDEO_API'",Store.now());
        s.db.update("UPDATE jobs SET status='BLOCKED',message='服务重启时供应商任务编号尚未保存，状态未知；请先核对供应商控制台，不会自动重发',updated_at=? WHERE status='RUNNING' AND provider='VIDEO_API' AND external_task_id IS NULL",Store.now());
        ready=true;
    }
    @Scheduled(fixedDelayString="${app.worker-delay:3000}") public void tick() {
        if(!ready) return;
        var pending=s.db.query("SELECT id,provider,COALESCE(external_task_id,''),status FROM jobs WHERE status='QUEUED' OR (provider='VIDEO_API' AND status='RUNNING' AND external_task_id IS NOT NULL) ORDER BY CASE WHEN status='QUEUED' THEN 0 ELSE 1 END,created_at LIMIT 1",(r,n)->new Pending(r.getString(1),r.getString(2),r.getString(3),r.getString(4)));
        if(pending.isEmpty()) return;Pending task=pending.get(0);String id=task.id();
        if(task.status().equals("QUEUED")&&s.db.update("UPDATE jobs SET status='RUNNING',progress=5,message=?,updated_at=? WHERE id=? AND status='QUEUED'",task.provider().equals("VIDEO_API")?"正在向视频供应商提交任务": "正在处理真实素材",Store.now(),id)==0)return;
        try {
            Project p=s.snapshot(s.db.queryForObject("SELECT snapshot FROM jobs WHERE id=?",String.class,id));
            if(task.provider().equals("VIDEO_API")&&task.externalTaskId().isBlank()&&p.shots().isEmpty()&&"ONE_CLICK".equals(p.config().get("productionMode"))){
                try{p=projects.prepareOneClick(id,p);}catch(Exception e){s.db.update("UPDATE jobs SET status='FAILED',message=?,updated_at=? WHERE id=?","自动生成框架或分镜失败；视频供应商尚未收到请求。项目与商品资料已保留，可检查后重新创建一键任务",Store.now(),id);return;}
            }
            if(task.provider().equals("VIDEO_API")) { processVideo(task,p); return; }
            render(id,p);
            s.db.update("UPDATE jobs SET status='REVIEW',progress=100,message='本地粗剪已完成，画面来自上传素材，并非 AI 生成',output_name=?,updated_at=? WHERE id=?",id+".mp4",Store.now(),id);
        } catch(Exception e) {
            if(task.provider().equals("VIDEO_API")) {
                if(task.externalTaskId().isBlank() && e instanceof org.springframework.web.client.RestClientResponseException response && response.getStatusCode().is4xxClientError())
                    s.db.update("UPDATE jobs SET status='FAILED',message=?,updated_at=? WHERE id=?","供应商明确拒绝了请求（HTTP "+response.getStatusCode().value()+"）；未生成视频，请核对图片链接和请求参数",Store.now(),id);
                else if(task.externalTaskId().isBlank()) s.db.update("UPDATE jobs SET status='BLOCKED',message='供应商提交结果不确定；请核对供应商控制台后再决定是否重试，系统不会自动重复提交',updated_at=? WHERE id=?",Store.now(),id);
                else s.db.update("UPDATE jobs SET message='暂时无法查询供应商任务状态；保留原任务编号并继续查询，不会重新提交',updated_at=? WHERE id=?",Store.now(),id);
                return;
            }
            try {Files.deleteIfExists(media.resolve(id+".mp4"));Files.deleteIfExists(media.resolve(id+".srt"));} catch(java.io.IOException ignored) { /* retry can be handled by storage maintenance */ }
            s.db.update("UPDATE jobs SET status='FAILED',message=?,updated_at=? WHERE id=?",e instanceof java.io.IOException?"无法读取素材或启动 FFmpeg，请检查文件和 FFMPEG_PATH":"粗剪失败：素材格式不支持、文件损坏或处理超时；请检查素材后重试",Store.now(),id);
        }
    }
    private void processVideo(Pending task,Project p) throws Exception {
        String externalId=task.externalTaskId();
        if(externalId.isBlank()) {
            String prompt=videoPrompt(p);
            List<String> references=new ArrayList<>();
            try {
                List<String> ids=referenceIds(p);
                if(ids.isEmpty()||ids.size()>30)throw Store.bad("需要1至30张商品参考图");
                long total=0;
                for(String id:ids){Asset a=s.asset(p.clientId(),id);if(!a.mime().startsWith("image/"))throw Store.bad("仅支持图片参考，请重新选择商品图片");byte[] bytes=images.readImage(media.assetPath(p.clientId(),id));total+=bytes.length;if(total>20*1024*1024)throw Store.bad("商品参考图总量超过20MB，请减少图片");references.add(oss.publish(p.clientId(),bytes));}
            }catch(Exception e){String message=e instanceof IllegalStateException&&e.getMessage().startsWith("OSS")?e.getMessage():"商品参考图准备失败；请核对图片和OSS配置，未向视频供应商提交";s.db.update("UPDATE jobs SET status='FAILED',message=?,updated_at=? WHERE id=?",message,Store.now(),task.id());return;}
            externalId=video.submit(prompt,p.duration(),references,Objects.toString(p.config().get("videoResolution"),video.defaultResolution()));
            s.db.update("UPDATE jobs SET external_task_id=?,progress=10,message='供应商已受理任务，等待生成；不会重复提交',updated_at=? WHERE id=?",externalId,Store.now(),task.id());
            return;
        }
        VideoApiClient.VideoStatus state=video.status(externalId);
        if(Set.of("queued","pending","in_progress","processing").contains(state.status())) {
            s.db.update("UPDATE jobs SET progress=?,message=?,updated_at=? WHERE id=?",Math.min(95,Math.max(10,state.progress())),"Seedance 正在生成（供应商任务已保存）",Store.now(),task.id());
        } else if(state.status().equals("completed")) {
            byte[] bytes=video.download(externalId);
            Files.write(media.resolve(task.id()+".mp4"),bytes,StandardOpenOption.CREATE,StandardOpenOption.TRUNCATE_EXISTING);
            Files.writeString(media.resolve(task.id()+".srt"),subtitles(p),StandardCharsets.UTF_8);
            s.db.update("UPDATE jobs SET status='REVIEW',progress=100,message='Seedance 视频已生成，请人工审片；字幕为独立 SRT',output_name=?,updated_at=? WHERE id=?",task.id()+".mp4",Store.now(),task.id());
        } else if(Set.of("failed","cancelled","canceled").contains(state.status())) {
            s.db.update("UPDATE jobs SET status='FAILED',message=?,updated_at=? WHERE id=?","视频生成失败；请检查供应商任务详情。系统未降级为纯文字生成",Store.now(),task.id());
        } else {
            s.db.update("UPDATE jobs SET message='供应商返回未知状态；保留任务编号等待核对，不会重新提交',updated_at=? WHERE id=?",Store.now(),task.id());
        }
    }
    private String videoPrompt(Project p) {
        if(p.config().get("generationPrompt") instanceof String prompt&&!prompt.isBlank())return prompt;
        StringBuilder prompt=new StringBuilder("制作一条电商商品短视频。平台：").append(p.platform()).append("；类目：").append(p.category())
                .append("；商品：").append(p.name()).append("；已确认事实：").append(p.facts()).append("。不得添加未确认的功效、价格或规格。分镜：");
        if(p.config().get("creativeFramework") instanceof Map<?,?> framework)prompt.append("创作框架：").append(Objects.toString(framework.get("title"),"")).append("；").append(Objects.toString(framework.get("summary"),"")).append("。\n");
        for(int i=0;i<p.shots().size();i++) prompt.append(i+1).append(". ").append(p.shots().get(i).visual()).append("；");
        if(prompt.length()>5000)throw Store.bad("视频提示词超过5000字，请精简");return prompt.toString();
    }
    static List<String> referenceIds(Project p){
        if(p.config().get("productAssetIds") instanceof List<?> ids)return ids.stream().map(Object::toString).distinct().toList();
        return p.shots().stream().map(Shot::assetId).filter(id->id!=null&&!id.isBlank()).distinct().toList();
    }
    private record Pending(String id,String provider,String externalTaskId,String status) {}
    void render(String id,Project p) throws Exception {
        Path dir=Files.createTempDirectory(media.resolve("."),"render-");
        try {
            List<String> segments=new ArrayList<>(); int index=0;
            for(Shot shot:p.shots()) {
                Asset asset=s.asset(p.clientId(),shot.assetId());
                List<String> args=new ArrayList<>(List.of(ffmpeg,"-hide_banner","-loglevel","error","-y"));
                if(asset.mime().startsWith("image/")) args.addAll(List.of("-loop","1"));
                else args.addAll(List.of("-stream_loop","-1","-ss",String.valueOf(shot.startAt())));
                args.addAll(List.of("-i",media.assetPath(p.clientId(),shot.assetId()).toString(),"-t",String.valueOf(shot.duration()),"-an","-vf","scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=25","-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p","-threads","2",dir.resolve("part"+index+".mp4").toString()));
                run(args,dir);segments.add("file 'part"+index+".mp4'");index++;
                s.db.update("UPDATE jobs SET progress=? WHERE id=?",5+index*70/p.shots().size(),id);
            }
            Files.write(dir.resolve("concat.txt"),segments,StandardCharsets.UTF_8);
            run(List.of(ffmpeg,"-hide_banner","-loglevel","error","-y","-f","concat","-safe","1","-i",dir.resolve("concat.txt").toString(),"-c","copy","-movflags","+faststart",media.resolve(id+".mp4").toString()),dir);
            // Captions are delivered as a sidecar SRT to avoid inventing TTS/audio capabilities.
            Files.writeString(media.resolve(id+".srt"),subtitles(p),StandardCharsets.UTF_8);
        } finally {
            try(var files=Files.walk(dir)) {for(Path path:files.sorted(Comparator.reverseOrder()).toList())Files.deleteIfExists(path);}
        }
    }
    static String subtitles(Project p) {
        StringBuilder out=new StringBuilder();int elapsed=0,index=1;
        if(p.config().get("confirmedDialogue") instanceof List<?> lines){for(Object raw:lines)if(raw instanceof Map<?,?> line&&line.get("start") instanceof Number start&&line.get("end") instanceof Number end){out.append(index++).append('\n').append(timeMs(start.doubleValue())).append(" --> ").append(timeMs(end.doubleValue())).append('\n').append(Objects.toString(line.get("text"),"").replace("\r","").replace("\n\n","\n")).append("\n\n");}return out.toString();}
        for(Shot shot:p.shots()) {out.append(index++).append('\n').append(time(elapsed)).append(" --> ").append(time(elapsed+shot.duration())).append('\n').append(Objects.toString(shot.narration(),"").replace("\r","").replace("\n\n","\n")).append("\n\n");elapsed+=shot.duration();}return out.toString();
    }
    static String timeMs(double seconds){long ms=Math.round(seconds*1000);return String.format(Locale.ROOT,"%02d:%02d:%02d,%03d",ms/3600000,ms/60000%60,ms/1000%60,ms%1000);}
    static String time(int seconds) {return String.format("%02d:%02d:%02d,000",seconds/3600,seconds/60%60,seconds%60);}
    private void run(List<String> args,Path dir) throws Exception {
        Process process=new ProcessBuilder(args).redirectErrorStream(true).redirectOutput(dir.resolve("ffmpeg.log").toFile()).start();
        try {if(!process.waitFor(180,TimeUnit.SECONDS)) throw new IllegalStateException("timeout");if(process.exitValue()!=0)throw new IllegalStateException("ffmpeg failed");}
        finally {if(process.isAlive()){process.destroyForcibly();process.waitFor(5,TimeUnit.SECONDS);}}
    }
}
