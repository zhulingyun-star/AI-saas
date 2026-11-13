package com.shangzhen.workbench;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.sql.*;
import java.time.LocalDateTime;
import java.util.*;
import static com.shangzhen.workbench.Models.*;

@Component
public class Store {
    final JdbcTemplate db;
    final ObjectMapper json;
    public Store(JdbcTemplate db, ObjectMapper json) { this.db=db; this.json=json; }
    static String id() { return UUID.randomUUID().toString(); }
    static LocalDateTime now() { return LocalDateTime.now(java.time.Clock.systemUTC()); }
    String write(Object value) {
        try { return json.writeValueAsString(value); } catch(Exception e) { throw new IllegalArgumentException("无法序列化数据", e); }
    }
    <T> T read(String text, TypeReference<T> type) {
        try { return json.readValue(text,type); } catch(Exception e) { throw new IllegalStateException("存储数据格式错误",e); }
    }
    Project snapshot(String text) {
        try { return json.readValue(text,Project.class); } catch(Exception e) { throw new IllegalStateException("任务快照格式错误",e); }
    }
    void access(String client, String user) {
        if (db.queryForObject("SELECT COUNT(*) FROM clients WHERE id=? AND owner=?",Integer.class,client,user)==0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,"客户不存在或无权访问");
    }
    void audit(String client, String user, String action, String detail) {
        db.update("INSERT INTO audit_events VALUES(?,?,?,?,?,?)",id(),client,user,action,detail.substring(0,Math.min(500,detail.length())),now());
    }
    final RowMapper<Client> clients=(r,n)->new Client(r.getString("id"),r.getString("name"),r.getString("category"),r.getTimestamp("created_at").toLocalDateTime());
    final RowMapper<Project> projects=(r,n)->new Project(r.getString("id"),r.getString("client_id"),r.getString("name"),r.getString("sku"),r.getString("category"),r.getString("platform"),r.getString("format"),r.getInt("duration"),r.getString("facts"),r.getBoolean("facts_confirmed"),read(r.getString("shots"),new TypeReference<List<Shot>>(){}),read(r.getString("config"),new TypeReference<Map<String,Object>>(){}),r.getString("status"),r.getInt("revision"),r.getTimestamp("created_at").toLocalDateTime(),r.getTimestamp("updated_at").toLocalDateTime());
    final RowMapper<Asset> assets=(r,n)->new Asset(r.getString("id"),r.getString("client_id"),r.getString("name"),r.getString("kind"),r.getString("sku"),r.getString("tags"),r.getString("mime"),r.getLong("size_bytes"),read(r.getString("metadata"),new TypeReference<Map<String,Object>>(){}),r.getTimestamp("created_at").toLocalDateTime());
    final RowMapper<Job> jobs=(r,n)->new Job(r.getString("id"),r.getString("client_id"),r.getString("project_id"),r.getString("name"),r.getString("provider"),r.getString("status"),r.getInt("progress"),r.getString("message"),r.getString("output_name")!=null,r.getInt("revision"),r.getTimestamp("created_at").toLocalDateTime(),r.getTimestamp("updated_at").toLocalDateTime());
    Project project(String client,String id) {
        return db.query("SELECT * FROM projects WHERE client_id=? AND id=?",projects,client,id).stream().findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"项目不存在"));
    }
    Job job(String client,String id) {
        return db.query("SELECT * FROM jobs WHERE client_id=? AND id=?",jobs,client,id).stream().findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"产单不存在"));
    }
    Asset asset(String client,String id) {
        return db.query("SELECT * FROM assets WHERE client_id=? AND id=?",assets,client,id).stream().findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"素材不存在"));
    }
    static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST,message); }
}
