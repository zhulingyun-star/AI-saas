package com.shangzhen.workbench;

import org.springframework.boot.CommandLineRunner;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.password.PasswordEncoder;

@Component
public class Bootstrap implements CommandLineRunner {
    private final Store s; private final PasswordEncoder encoder; private final String username,password;
    public Bootstrap(Store s,PasswordEncoder encoder,@Value("${app.bootstrap.username}") String username,@Value("${app.bootstrap.password}") String password) {this.s=s;this.encoder=encoder;this.username=username;this.password=password;}
    @Override @Transactional public void run(String... args) {
        if(password.length()<12)throw new IllegalArgumentException("ADMIN_PASSWORD 至少需要 12 位");
        if(s.db.queryForObject("SELECT COUNT(*) FROM app_users WHERE username=?",Integer.class,username)>0)return;
        s.db.update("INSERT INTO app_users VALUES(?,?)",username,encoder.encode(password));
        for(String[] c:new String[][]{{"轻羽 · 服饰内容组","服饰鞋包"},{"露米 · 美妆内容组","美妆个护"}}) {
            String id=Store.id();s.db.update("INSERT INTO clients VALUES(?,?,?,?,?)",id,username,c[0],c[1],Store.now());
            s.db.update("INSERT INTO presets VALUES(?,?,?,?,?,?,?)",Store.id(),id,"商品事实优先","RULE","未提供的价格、材质、性能和功效必须标注待确认，不得编造。",true,Store.now());
            s.audit(id,username,"创建工作空间","请上传真实商品素材，开始第一条内容制作");
        }
    }
}
