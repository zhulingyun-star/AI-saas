package com.shangzhen.workbench;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Pattern;
import static com.shangzhen.workbench.ProjectFlowService.str;

/**
 * 千川账户（PRD F2）：手动录入名称 + 广告主 ID，属于一个客户空间（clients）。本期不对接千川接口、不做授权，也不会用这个账户做任何操作。
 * 同一团队里一个广告主 ID 只能挂在一个客户下；停用的账户不能再导入；有数据的账户删除时只标记 DELETED（数据保留、列表里不再显示）。
 */
@Service
public class AccountService {
    static final Pattern ADVERTISER=Pattern.compile("\\d{6,30}");
    private final Store s;
    public AccountService(Store s){this.s=s;}
    public record Account(String id,String clientId,String name,String advertiserId,String status,int revision,String createdBy,LocalDateTime createdAt) {}
    private final org.springframework.jdbc.core.RowMapper<Account> rows=(r,n)->new Account(r.getString("id"),r.getString("client_id"),r.getString("name"),r.getString("advertiser_id"),
        r.getString("status"),r.getInt("revision"),r.getString("created_by"),r.getTimestamp("created_at").toLocalDateTime());
    Account find(String client,String id){
        return s.db.query("SELECT * FROM qianchuan_accounts WHERE client_id=? AND id=?",rows,client,id).stream().findFirst().orElse(null);
    }
    List<Account> list(String client){
        return s.db.query("SELECT * FROM qianchuan_accounts WHERE client_id=? AND status<>'DELETED' ORDER BY created_at,id",rows,client);
    }
    private Account require(String client,String id){
        Account a=find(client,id);
        if(a==null||a.status().equals("DELETED")) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"这个千川账户不存在，可能已经删了");
        return a;
    }
    static Map<String,Object> view(Account a,String clientName,long records){
        Map<String,Object> m=new LinkedHashMap<>();
        m.put("id",a.id());m.put("name",a.name());m.put("advertiserId",a.advertiserId());m.put("status",a.status());
        m.put("clientId",a.clientId());m.put("clientName",clientName);m.put("createdAt",a.createdAt().toString());m.put("createdBy",a.createdBy());
        m.put("revision",a.revision());m.put("records",records);
        return m;
    }
    private static String cleanName(String raw){
        String n=str(raw).trim();
        if(n.isEmpty()) throw Store.bad("请填账户名称");
        if(n.length()>100) throw Store.bad("账户名称最多 100 个字");
        return n;
    }
    private static String cleanId(String raw){
        String id=str(raw).trim().replaceAll("\\s","");
        if(!ADVERTISER.matcher(id).matches()) throw Store.bad("广告主 ID 是 6 到 30 位数字，在千川后台右上角能看到");
        return id;
    }
    /** 同一团队（同一个主账号名下）别的客户已经挂了这个广告主 ID */
    private void uniqueInTeam(String client,String advertiser,String except){
        List<String> other=s.db.queryForList("SELECT c.name FROM qianchuan_accounts a JOIN clients c ON c.id=a.client_id WHERE a.advertiser_id=? AND a.status<>'DELETED' AND a.id<>? "
            +"AND (a.client_id=? OR c.owner=(SELECT owner FROM clients WHERE id=?))",String.class,advertiser,except==null?"":except,client,client);
        if(!other.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT,"广告主 ID "+advertiser+" 已经在客户「"+other.get(0)+"」里了");
    }
    private long records(String id){
        Long n=s.db.queryForObject("SELECT COUNT(*) FROM job_performance WHERE account_id=?",Long.class,id);
        return n==null?0:n;
    }

    @Transactional
    public Account create(String client,String user,String rawName,String rawId){
        String name=cleanName(rawName),advertiser=cleanId(rawId);
        s.db.queryForObject("SELECT id FROM clients WHERE id=? FOR UPDATE",String.class,client);
        uniqueInTeam(client,advertiser,null);
        // 同一个客户里删过的同一个广告主 ID：恢复那一条（以前的数据还挂在上面）
        Account old=s.db.query("SELECT * FROM qianchuan_accounts WHERE client_id=? AND advertiser_id=?",rows,client,advertiser).stream().findFirst().orElse(null);
        var now=Store.now();String id;
        if(old!=null){
            id=old.id();
            s.db.update("UPDATE qianchuan_accounts SET name=?,status='ACTIVE',revision=revision+1,updated_at=? WHERE id=?",name,now,id);
        } else {
            id=Store.id();
            s.db.update("INSERT INTO qianchuan_accounts(id,client_id,name,advertiser_id,status,revision,created_by,created_at,updated_at) VALUES(?,?,?,?,'ACTIVE',0,?,?,?)",id,client,name,advertiser,user,now,now);
        }
        s.audit(client,user,"添加千川账户",name+" / "+advertiser);
        return find(client,id);
    }
    @Transactional
    public Account update(String client,String user,String id,String rawName,String rawId,String rawStatus,int revision){
        Account a=require(client,id);
        if(a.revision()!=revision) throw new ResponseStatusException(HttpStatus.CONFLICT,"这个账户刚被别人改过，请刷新后再改");
        String name=cleanName(rawName),advertiser=cleanId(rawId);
        String status=str(rawStatus).trim().isEmpty()?a.status():str(rawStatus).trim().toUpperCase(Locale.ROOT);
        if(!status.equals("ACTIVE")&&!status.equals("PAUSED")) throw Store.bad("状态只能是启用或停用");
        if(!advertiser.equals(a.advertiserId())){
            if(records(id)>0) throw Store.bad("这个账户已经导入过数据，广告主 ID 不能改；要换就新建一个账户");
            uniqueInTeam(client,advertiser,id);
            if(s.db.queryForObject("SELECT COUNT(*) FROM qianchuan_accounts WHERE client_id=? AND advertiser_id=? AND id<>?",Integer.class,client,advertiser,id)>0)
                throw new ResponseStatusException(HttpStatus.CONFLICT,"这个客户里已经有（或删过）广告主 ID "+advertiser+" 的账户");
        }
        if(s.db.update("UPDATE qianchuan_accounts SET name=?,advertiser_id=?,status=?,revision=revision+1,updated_at=? WHERE id=? AND client_id=? AND revision=?",name,advertiser,status,Store.now(),id,client,revision)==0)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"这个账户刚被别人改过，请刷新后再改");
        s.audit(client,user,"改千川账户",name+" / "+advertiser+" / "+(status.equals("ACTIVE")?"启用":"停用"));
        return find(client,id);
    }
    /** 删除：没数据就真删；导入过数据就只标记删除（数据还在，看板里按「已删除的账户」显示） */
    @Transactional
    public Map<String,Object> delete(String client,String user,String id,int revision){
        Account a=require(client,id);
        if(a.revision()!=revision) throw new ResponseStatusException(HttpStatus.CONFLICT,"这个账户刚被别人改过，请刷新后再改");
        long n=records(id);
        int changed=n>0
            ?s.db.update("UPDATE qianchuan_accounts SET status='DELETED',revision=revision+1,updated_at=? WHERE id=? AND client_id=? AND revision=?",Store.now(),id,client,revision)
            :s.db.update("DELETE FROM qianchuan_accounts WHERE id=? AND client_id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM performance_imports WHERE account_id=?)",id,client,revision,id);
        if(changed==0&&n==0) changed=s.db.update("UPDATE qianchuan_accounts SET status='DELETED',revision=revision+1,updated_at=? WHERE id=? AND client_id=? AND revision=?",Store.now(),id,client,revision);
        if(changed==0) throw new ResponseStatusException(HttpStatus.CONFLICT,"这个账户刚被别人改过，请刷新后再改");
        s.audit(client,user,"删除千川账户",a.name()+" / "+a.advertiserId()+(n>0?" / 保留 "+n+" 条数据":""));
        return Map.of("id",id,"kept",n);
    }
}
