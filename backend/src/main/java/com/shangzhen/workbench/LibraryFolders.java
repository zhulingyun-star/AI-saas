package com.shangzhen.workbench;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

/**
 * 库文件夹的共用规则（商品库、参考视频库）：最多两层、同一客户下名字不重复、固定分类名不能用、
 * 改名带 revision、只能删空文件夹。每个库有自己的文件夹表和「东西放在哪个文件夹」的表。
 */
public final class LibraryFolders {
    static final int MAX_FOLDERS=200;
    public record Folder(String id,String parentId,String name,int sortOrder,int revision) {}
    private static final RowMapper<Folder> ROWS=(r,n)->new Folder(r.getString("id"),r.getString("parent_id"),r.getString("name"),r.getInt("sort_order"),r.getInt("revision"));
    private final Store s;private final String table,members,noun;private final Set<String> reserved;

    /** table：文件夹表；members：带 folder_id 列的条目表；noun：条目叫什么（商品 / 参考视频），用在提示和操作记录里。 */
    LibraryFolders(Store s,String table,String members,String noun,Set<String> reserved){this.s=s;this.table=table;this.members=members;this.noun=noun;this.reserved=reserved;}

    List<Folder> list(String client){return s.db.query("SELECT * FROM "+table+" WHERE client_id=? ORDER BY sort_order,created_at,id",ROWS,client);}
    Folder get(String client,String id){
        return s.db.query("SELECT * FROM "+table+" WHERE client_id=? AND id=?",ROWS,client,id).stream().findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"文件夹不存在"));
    }
    /** 空值表示未分类；其他值必须是本客户的文件夹。 */
    String target(String client,String folderId){return folderId==null||folderId.isBlank()?null:get(client,folderId).id();}
    String label(String client,String folderId){return folderId==null?"未分类":get(client,folderId).name();}
    private String name(String raw){
        String name=Objects.toString(raw,"").trim();
        if(name.isEmpty()||name.length()>30) throw Store.bad("文件夹名称需要 1 到 30 个字");
        if(reserved.contains(name)) throw Store.bad("「"+name+"」是固定的分类名，换一个名字吧");
        return name;
    }
    private void unique(String client,String name,String except){
        if(s.db.queryForObject("SELECT COUNT(*) FROM "+table+" WHERE client_id=? AND name=? AND id<>?",Integer.class,client,name,Objects.toString(except,""))>0)
            throw Store.bad("已经有叫「"+name+"」的文件夹");
    }
    Folder create(String client,String user,String rawName,String parentId){
        String name=name(rawName);
        if(s.db.queryForObject("SELECT COUNT(*) FROM "+table+" WHERE client_id=?",Integer.class,client)>=MAX_FOLDERS) throw Store.bad("文件夹太多了，先整理一下再新建");
        String parent=parentId==null||parentId.isBlank()?null:parentId;
        if(parent!=null&&get(client,parent).parentId()!=null) throw Store.bad("文件夹最多两层");
        unique(client,name,null);
        Integer max=s.db.queryForObject("SELECT MAX(sort_order) FROM "+table+" WHERE client_id=?",Integer.class,client);
        String id=Store.id();
        s.db.update("INSERT INTO "+table+"(id,client_id,parent_id,name,sort_order,revision,created_at) VALUES(?,?,?,?,?,0,?)",id,client,parent,name,max==null?0:max+1,Store.now());
        s.audit(client,user,"新建"+noun+"文件夹",name);
        return get(client,id);
    }
    Folder rename(String client,String user,String id,String rawName,int revision){
        get(client,id);String name=name(rawName);unique(client,name,id);
        if(s.db.update("UPDATE "+table+" SET name=?,revision=revision+1 WHERE client_id=? AND id=? AND revision=?",name,client,id,revision)==0)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"文件夹刚被别人改过，请刷新后再改");
        s.audit(client,user,"重命名"+noun+"文件夹",name);
        return get(client,id);
    }
    void delete(String client,String user,String id){
        Folder f=get(client,id);
        if(s.db.queryForObject("SELECT COUNT(*) FROM "+table+" WHERE client_id=? AND parent_id=?",Integer.class,client,id)>0) throw Store.bad("先移走或删除里面的子文件夹");
        if(s.db.queryForObject("SELECT COUNT(*) FROM "+members+" WHERE client_id=? AND folder_id=?",Integer.class,client,id)>0) throw Store.bad("文件夹里还有"+noun+"，先把"+noun+"移走");
        s.db.update("DELETE FROM "+table+" WHERE client_id=? AND id=?",client,id);
        s.audit(client,user,"删除"+noun+"文件夹",f.name());
    }
}
