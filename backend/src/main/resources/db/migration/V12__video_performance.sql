-- 资产库的投放数据：每条成片（jobs 一行）可以有多条投放记录，手填或从表格导入。
-- 一条记录 = 一天或一段日期的合计；同一条成片的记录日期不能重叠（不重复计数）。
-- 只存用户填的 / 表格里的真实数字；点击率、转化率不存，按曝光、点击、成交单数现算。
CREATE TABLE performance_imports (
 id VARCHAR(36) PRIMARY KEY,
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 file_name VARCHAR(200) NOT NULL,
 total_rows INTEGER NOT NULL,
 imported_rows INTEGER NOT NULL,
 skipped_rows INTEGER NOT NULL,
 error_rows INTEGER NOT NULL,
 created_by VARCHAR(100) NOT NULL,
 created_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_performance_imports_client ON performance_imports(client_id);
CREATE TABLE job_performance (
 id VARCHAR(36) PRIMARY KEY,
 job_id VARCHAR(36) NOT NULL REFERENCES jobs(id),
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 date_from DATE NOT NULL,
 date_to DATE NOT NULL,
 impressions BIGINT NOT NULL,
 clicks BIGINT NOT NULL,
 -- 3 秒留存、完播率、负反馈率都是百分数（0~100）
 retain_3s DECIMAL(7,2),
 finish_rate DECIMAL(7,2),
 product_clicks BIGINT,
 orders BIGINT,
 -- 千次曝光成交额（元）
 gpm DECIMAL(14,2),
 roi DECIMAL(10,2),
 negative_rate DECIMAL(7,2),
 note VARCHAR(300) NOT NULL DEFAULT '',
 -- MANUAL：手填；IMPORT：表格导入（import_id 指向那次导入）
 source VARCHAR(10) NOT NULL,
 import_id VARCHAR(36) REFERENCES performance_imports(id),
 revision INTEGER NOT NULL DEFAULT 0,
 created_by VARCHAR(100) NOT NULL,
 created_at TIMESTAMP NOT NULL,
 updated_by VARCHAR(100) NOT NULL,
 updated_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_job_performance_job ON job_performance(job_id);
CREATE INDEX idx_job_performance_client ON job_performance(client_id);
