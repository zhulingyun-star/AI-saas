package com.shangzhen.workbench;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/**
 * V14 迁移：先迁到 V13、按 V12 的样子写几条旧投放数据，再迁到最新，检查旧数据原样保留、新列为空、约束生效。
 * 默认在 H2（PostgreSQL 兼容模式）上跑；设了 PG_MIGRATION_URL（以及 PG_USER / PG_PASSWORD）时再在那个 PostgreSQL 库上跑一遍（会清空那个库）。
 */
class MigrationV14Test {
    @Test void h2() {run("jdbc:h2:mem:migv14;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1","sa","");}
    @Test void postgres() {
        String url=System.getenv("PG_MIGRATION_URL");
        org.junit.jupiter.api.Assumptions.assumeTrue(url!=null&&!url.isBlank(),"没设 PG_MIGRATION_URL，跳过 PostgreSQL");
        run(url,System.getenv("PG_USER"),System.getenv("PG_PASSWORD"));
    }

    void run(String url,String user,String pass){
        DriverManagerDataSource ds=new DriverManagerDataSource(url,user,pass);
        Flyway.configure().dataSource(ds).cleanDisabled(false).load().clean();
        Flyway.configure().dataSource(ds).target("13").load().migrate();
        JdbcTemplate db=new JdbcTemplate(ds);
        Timestamp now=Timestamp.valueOf(LocalDateTime.of(2026,11,1,2,0));
        db.update("INSERT INTO app_users(username,password,display_name,role,status,team_owner,created_at,revision) VALUES('owner','x','','ADMIN','ACTIVE','owner',?,0)",now);
        db.update("INSERT INTO clients VALUES('c1','owner','旧客户','鞋子',?)",now);
        db.update("INSERT INTO projects VALUES('p1','c1','旧项目','SKU','鞋子','抖音','竖屏',15,'',TRUE,'[]','{}','DRAFT',0,?,?)",now,now);
        for(String j:List.of("j1","j2")) db.update("INSERT INTO jobs(id,client_id,project_id,name,provider,status,progress,snapshot,message,output_name,revision,created_at,updated_at) VALUES(?,'c1','p1','旧项目','VIDEO_API','REVIEW',100,'{}','已生成',?,1,?,?)",j,j+".mp4",now,now);
        db.update("INSERT INTO performance_imports VALUES('i1','c1','旧表.csv',2,1,1,0,'owner',?)",now);
        db.update("INSERT INTO job_performance(id,job_id,client_id,date_from,date_to,impressions,clicks,retain_3s,finish_rate,product_clicks,orders,gpm,roi,negative_rate,note,source,import_id,revision,created_by,created_at,updated_by,updated_at) "
            +"VALUES('r1','j1','c1',?,?,10000,300,41.5,22.0,80,6,12.3,2.10,0.40,'加了预算','MANUAL',NULL,2,'owner',?,'owner',?)",Date.valueOf(LocalDate.of(2026,11,2)),Date.valueOf(LocalDate.of(2026,11,2)),now,now);
        db.update("INSERT INTO job_performance(id,job_id,client_id,date_from,date_to,impressions,clicks,source,import_id,revision,created_by,created_at,updated_by,updated_at) "
            +"VALUES('r2','j1','c1',?,?,30000,600,'IMPORT','i1',0,'owner',?,'owner',?)",Date.valueOf(LocalDate.of(2026,11,3)),Date.valueOf(LocalDate.of(2026,11,9)),now,now);
        db.update("INSERT INTO job_performance(id,job_id,client_id,date_from,date_to,impressions,clicks,source,revision,created_by,created_at,updated_by,updated_at) "
            +"VALUES('r3','j2','c1',?,?,0,0,'MANUAL',0,'owner',?,'owner',?)",Date.valueOf(LocalDate.of(2026,11,2)),Date.valueOf(LocalDate.of(2026,11,2)),now,now);

        var result=Flyway.configure().dataSource(ds).load().migrate();
        assertThat(result.targetSchemaVersion).isEqualTo("14");
        // 旧数据原样保留
        assertThat(db.queryForObject("SELECT COUNT(*) FROM job_performance",Integer.class)).isEqualTo(3);
        Map<String,Object> r1=db.queryForMap("SELECT * FROM job_performance WHERE id='r1'");
        assertThat(((Number)r1.get("impressions")).longValue()).isEqualTo(10000);assertThat(((Number)r1.get("clicks")).longValue()).isEqualTo(300);
        assertThat(((Number)r1.get("retain_3s")).doubleValue()).isEqualTo(41.5);assertThat(((Number)r1.get("roi")).doubleValue()).isEqualTo(2.1);
        assertThat(((Number)r1.get("orders")).longValue()).isEqualTo(6);assertThat(r1.get("note")).isEqualTo("加了预算");assertThat(((Number)r1.get("revision")).intValue()).isEqualTo(2);
        assertThat(r1.get("source")).isEqualTo("MANUAL");
        // 新列都是空的，没有补数字
        for(String c:List.of("account_id","material_id","material_name","cost","gmv","refund_gmv","refund_orders","net_gmv","net_orders","refund_rate_1h","coupon")) assertThat(r1.get(c)).as(c).isNull();
        Map<String,Object> r2=db.queryForMap("SELECT * FROM job_performance WHERE id='r2'");
        assertThat(r2.get("import_id")).isEqualTo("i1");assertThat(r2.get("date_to").toString()).isEqualTo("2026-11-09");
        Map<String,Object> imp=db.queryForMap("SELECT * FROM performance_imports WHERE id='i1'");
        assertThat(((Number)imp.get("updated_rows")).intValue()).isZero();assertThat(imp.get("account_id")).isNull();
        // jobs.created_by 新列为空，命名表是空的（第一次打开资产库时再补）
        assertThat(db.queryForObject("SELECT COUNT(*) FROM jobs WHERE created_by IS NULL",Integer.class)).isEqualTo(2);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM job_names",Integer.class)).isZero();
        // 曝光、点击可以不填（千川报表）
        db.update("INSERT INTO qianchuan_accounts VALUES('a1','c1','主账户','1234567890','ACTIVE',0,'owner',?,?)",now,now);
        db.update("INSERT INTO job_performance(id,job_id,client_id,date_from,date_to,impressions,clicks,source,revision,created_by,created_at,updated_by,updated_at,account_id,material_id,cost,gmv,net_gmv) "
            +"VALUES('r4','j2','c1',?,?,NULL,NULL,'IMPORT',0,'owner',?,'owner',?,'a1','m1',100,300,280)",Date.valueOf(LocalDate.of(2026,11,4)),Date.valueOf(LocalDate.of(2026,11,4)),now,now);
        // 同一账户同一素材同一天只能有一条
        assertThatThrownBy(()->db.update("INSERT INTO job_performance(id,job_id,client_id,date_from,date_to,source,revision,created_by,created_at,updated_by,updated_at,account_id,material_id) "
            +"VALUES('r5','j1','c1',?,?,'IMPORT',0,'owner',?,'owner',?,'a1','m1')",Date.valueOf(LocalDate.of(2026,11,4)),Date.valueOf(LocalDate.of(2026,11,4)),now,now)).isInstanceOf(DataIntegrityViolationException.class);
        // 没有账户 / 素材 ID 的记录不受这条约束（手填和旧模板仍由程序检查日期重叠）
        db.update("INSERT INTO job_performance(id,job_id,client_id,date_from,date_to,impressions,clicks,source,revision,created_by,created_at,updated_by,updated_at) VALUES('r6','j2','c1',?,?,1,1,'MANUAL',0,'owner',?,'owner',?)",
            Date.valueOf(LocalDate.of(2026,11,2)),Date.valueOf(LocalDate.of(2026,11,2)),now,now);
        // 账户外键
        assertThatThrownBy(()->db.update("UPDATE job_performance SET account_id='nope' WHERE id='r6'")).isInstanceOf(DataIntegrityViolationException.class);
        // 看板用的聚合 SQL 在这个库上能跑，旧记录（只有曝光点击）不进看板
        List<Map<String,Object>> agg=db.queryForList("SELECT a.*,"+AnalyticsService.RATIOS+" FROM (SELECT p.job_id,MAX(n.standard_name) sname,"+AnalyticsService.MEASURES+AnalyticsService.FROM
            +" WHERE p.client_id=? AND (p.cost IS NOT NULL OR p.gmv IS NOT NULL) GROUP BY p.job_id) a ORDER BY net_roi DESC NULLS LAST,a.job_id LIMIT ? OFFSET ?","c1",50,0);
        assertThat(agg).hasSize(1);
        Map<String,Object> m=AnalyticsService.measures(lower(agg.get(0)));
        assertThat(m.get("netRoi")).isEqualTo(2.8);assertThat(m.get("overallRoi")).isEqualTo(3.0);assertThat(m.get("netSettleRate")).isEqualTo(93.33);assertThat(m.get("dataDays")).isEqualTo(1L);
    }
    private static Map<String,Object> lower(Map<String,Object> row){Map<String,Object> m=new HashMap<>();row.forEach((k,v)->m.put(k.toLowerCase(Locale.ROOT),v));return m;}
}
