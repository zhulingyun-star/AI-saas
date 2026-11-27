-- 投流数据回流（PRD《投流数据回流模块 v1.0》）。在 V12 的投放数据上扩展，不另起一套：
-- 投放数据仍然只存在 job_performance 一处（一条 = 一条成片在一天或一段日期里的真实数字），这里加上千川账户、千川素材 ID、
-- 消耗 / 成交金额 / 退款 / 1 小时退款率 / 优惠券这些列；旧记录原样保留，新列是空的（没有就是没有，不补数字）。
-- PRD 里的 asset 指成片（jobs 一行），campaign_materials 合并进 job_performance。

-- 1. 成片的标准命名：YYMMDD-商品简称-内容形式-创作者-V版本。每条出好的成片一行；补不出来时 standard_name 为空（界面写「未规范化」）。
ALTER TABLE jobs ADD COLUMN created_by VARCHAR(100);
CREATE TABLE job_names (
 job_id VARCHAR(36) PRIMARY KEY REFERENCES jobs(id),
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 standard_name VARCHAR(100),
 name_date VARCHAR(6) NOT NULL,
 product_anchor VARCHAR(36),
 product_short VARCHAR(20),
 content_form VARCHAR(10) NOT NULL DEFAULT '短视频',
 creator_user VARCHAR(100),
 creator_name VARCHAR(20),
 version INTEGER,
 problem VARCHAR(200) NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 0,
 updated_by VARCHAR(100) NOT NULL,
 updated_at TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX ux_job_names_name ON job_names(client_id, standard_name);
CREATE INDEX idx_job_names_series ON job_names(client_id, name_date, product_short, creator_name);
CREATE INDEX idx_job_names_product ON job_names(client_id, product_anchor);
CREATE INDEX idx_job_names_creator ON job_names(client_id, creator_user);

-- 2. 千川账户：手动录入（本期不对接千川接口），属于一个客户空间。有数据的账户删除时只标记 DELETED。
CREATE TABLE qianchuan_accounts (
 id VARCHAR(36) PRIMARY KEY,
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 name VARCHAR(100) NOT NULL,
 advertiser_id VARCHAR(50) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
 revision INTEGER NOT NULL DEFAULT 0,
 created_by VARCHAR(100) NOT NULL,
 created_at TIMESTAMP NOT NULL,
 updated_at TIMESTAMP NOT NULL,
 UNIQUE(client_id, advertiser_id)
);
CREATE INDEX idx_qianchuan_accounts_client ON qianchuan_accounts(client_id);

-- 3. 投放数据加列。曝光、点击改成可以不填（千川素材报表不一定有）；比例仍是百分数（0~100），金额是元。
ALTER TABLE job_performance ALTER COLUMN impressions DROP NOT NULL;
ALTER TABLE job_performance ALTER COLUMN clicks DROP NOT NULL;
ALTER TABLE job_performance ADD COLUMN account_id VARCHAR(36);
ALTER TABLE job_performance ADD COLUMN material_id VARCHAR(100);
ALTER TABLE job_performance ADD COLUMN material_name VARCHAR(200);
ALTER TABLE job_performance ADD COLUMN cost DECIMAL(14,2);
ALTER TABLE job_performance ADD COLUMN gmv DECIMAL(14,2);
ALTER TABLE job_performance ADD COLUMN refund_gmv DECIMAL(14,2);
ALTER TABLE job_performance ADD COLUMN refund_orders BIGINT;
-- 净成交 = 成交 - 退款，写入时算好（两项都有才算，缺一项就是空）
ALTER TABLE job_performance ADD COLUMN net_gmv DECIMAL(14,2);
ALTER TABLE job_performance ADD COLUMN net_orders BIGINT;
ALTER TABLE job_performance ADD COLUMN refund_rate_1h DECIMAL(7,2);
ALTER TABLE job_performance ADD COLUMN coupon DECIMAL(14,2);
ALTER TABLE job_performance ADD CONSTRAINT fk_job_performance_account FOREIGN KEY (account_id) REFERENCES qianchuan_accounts(id);
-- 幂等：同一账户、同一千川素材、同一天（同一段日期）只有一条，再导入就是更新。没有账户或素材 ID 的记录（手填、旧模板）不受这条约束。
CREATE UNIQUE INDEX ux_job_performance_material_day ON job_performance(account_id, material_id, date_from, date_to);
CREATE INDEX idx_job_performance_client_date ON job_performance(client_id, date_from);
CREATE INDEX idx_job_performance_account_date ON job_performance(account_id, date_from);

ALTER TABLE performance_imports ADD COLUMN account_id VARCHAR(36);
ALTER TABLE performance_imports ADD COLUMN range_from DATE;
ALTER TABLE performance_imports ADD COLUMN range_to DATE;
ALTER TABLE performance_imports ADD COLUMN updated_rows INTEGER NOT NULL DEFAULT 0;

-- 4. 投放建议。规则写在代码里（四条），这里只存每个客户的启停和阈值；建议只记录用户的决定，系统不执行任何千川操作。
CREATE TABLE suggestion_rules (
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 rule_key VARCHAR(30) NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 params_json VARCHAR(500) NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 updated_by VARCHAR(100) NOT NULL,
 updated_at TIMESTAMP NOT NULL,
 PRIMARY KEY (client_id, rule_key)
);
CREATE TABLE campaign_suggestions (
 id VARCHAR(36) PRIMARY KEY,
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 rule_key VARCHAR(30) NOT NULL,
 job_id VARCHAR(36) NOT NULL REFERENCES jobs(id),
 suggestion_type VARCHAR(30) NOT NULL,
 reason VARCHAR(500) NOT NULL,
 data_snapshot TEXT NOT NULL,
 data_through DATE NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
 revision INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL,
 updated_at TIMESTAMP NOT NULL,
 decided_at TIMESTAMP,
 decided_by VARCHAR(100)
);
CREATE INDEX idx_suggestions_status ON campaign_suggestions(client_id, status, created_at);
CREATE INDEX idx_suggestions_job ON campaign_suggestions(job_id, rule_key);
