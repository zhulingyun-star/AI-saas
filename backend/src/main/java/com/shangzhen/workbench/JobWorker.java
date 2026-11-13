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
    private final Store s; private final MediaService media; private final String ffmpeg;
    private volatile boolean ready;
    public JobWorker(Store s,MediaService media,@Value("${app.ffmpeg}") String ffmpeg) {this.s=s;this.media=media;this.ffmpeg=ffmpeg;}
    @EventListener(ApplicationReadyEvent.class) public void recover() {
        s.db.update("UPDATE jobs SET status='FAILED',message='服务重启中断了制作，请重新提交',updated_at=? WHERE status='RUNNING'",Store.now());
        ready=true;
    }
    @Scheduled(fixedDelayString="${app.worker-delay:3000}") public void tick() {
        if(!ready) return;
        var pending=s.db.query("SELECT id FROM jobs WHERE status='QUEUED' ORDER BY created_at LIMIT 1",(r,n)->r.getString(1));
        if(pending.isEmpty()) return;String id=pending.get(0);
        if(s.db.update("UPDATE jobs SET status='RUNNING',progress=5,message='正在处理真实素材',updated_at=? WHERE id=? AND status='QUEUED'",Store.now(),id)==0)return;
        try {
            Project p=s.snapshot(s.db.queryForObject("SELECT snapshot FROM jobs WHERE id=?",String.class,id));
            render(id,p);
            s.db.update("UPDATE jobs SET status='REVIEW',progress=100,message='本地粗剪已完成，画面来自上传素材，并非 AI 生成',output_name=?,updated_at=? WHERE id=?",id+".mp4",Store.now(),id);
        } catch(Exception e) {
            try {Files.deleteIfExists(media.resolve(id+".mp4"));Files.deleteIfExists(media.resolve(id+".srt"));} catch(java.io.IOException ignored) { /* retry can be handled by storage maintenance */ }
            s.db.update("UPDATE jobs SET status='FAILED',message=?,updated_at=? WHERE id=?",e instanceof java.io.IOException?"无法读取素材或启动 FFmpeg，请检查文件和 FFMPEG_PATH":"粗剪失败：素材格式不支持、文件损坏或处理超时；请检查素材后重试",Store.now(),id);
        }
    }
    void render(String id,Project p) throws Exception {
        Path dir=Files.createTempDirectory(media.root,"render-");
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
        for(Shot shot:p.shots()) {out.append(index++).append('\n').append(time(elapsed)).append(" --> ").append(time(elapsed+shot.duration())).append('\n').append(Objects.toString(shot.narration(),"").replace("\r","").replace("\n\n","\n")).append("\n\n");elapsed+=shot.duration();}return out.toString();
    }
    static String time(int seconds) {return String.format("%02d:%02d:%02d,000",seconds/3600,seconds/60%60,seconds%60);}
    private void run(List<String> args,Path dir) throws Exception {
        Process process=new ProcessBuilder(args).redirectErrorStream(true).redirectOutput(dir.resolve("ffmpeg.log").toFile()).start();
        try {if(!process.waitFor(180,TimeUnit.SECONDS)) throw new IllegalStateException("timeout");if(process.exitValue()!=0)throw new IllegalStateException("ffmpeg failed");}
        finally {if(process.isAlive()){process.destroyForcibly();process.waitFor(5,TimeUnit.SECONDS);}}
    }
}
