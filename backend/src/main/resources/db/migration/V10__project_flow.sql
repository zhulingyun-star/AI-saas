-- 新版「项目」：一个项目 = 一个商品 + 一种创作方式，对应 projects 里的一行（作品）。
-- 画幅、分辨率、给谁看、改编思路继续放在 projects.config；每一版出片 = jobs 里的一行，出片词和改动说明在 jobs.snapshot。
CREATE TABLE project_folders (
 id VARCHAR(36) PRIMARY KEY,
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 parent_id VARCHAR(36) REFERENCES project_folders(id),
 name VARCHAR(30) NOT NULL,
 sort_order INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL,
 UNIQUE(client_id, name)
);
CREATE INDEX idx_project_folders_client ON project_folders(client_id);
CREATE TABLE project_profiles (
 project_id VARCHAR(36) PRIMARY KEY REFERENCES projects(id),
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 folder_id VARCHAR(36) REFERENCES project_folders(id),
 updated_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_project_profiles_folder ON project_profiles(folder_id);
-- 视频二创的分镜：每镜左边是参考视频的原样（拆解快照），右边是改成的机位 / 画面 / 台词和这一镜的任务。
CREATE TABLE project_storyboards (
 project_id VARCHAR(36) PRIMARY KEY REFERENCES projects(id),
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 reference_id VARCHAR(36) NOT NULL REFERENCES assets(id),
 source_revision INTEGER NOT NULL,
 shots_json TEXT NOT NULL,
 confirmed BOOLEAN NOT NULL DEFAULT FALSE,
 revision INTEGER NOT NULL DEFAULT 0,
 updated_at TIMESTAMP NOT NULL
);
-- 广告用语检查里用户点了「没问题，忽略」的命中
CREATE TABLE project_ad_ignores (
 project_id VARCHAR(36) NOT NULL REFERENCES projects(id),
 item_key VARCHAR(300) NOT NULL,
 created_by VARCHAR(100) NOT NULL,
 created_at TIMESTAMP NOT NULL,
 PRIMARY KEY (project_id, item_key)
);
-- 每一版的单独审片：好 / 差（必填原因），可投放 / 不用了
CREATE TABLE job_verdicts (
 job_id VARCHAR(36) PRIMARY KEY REFERENCES jobs(id),
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 rating VARCHAR(10),
 reason VARCHAR(300) NOT NULL DEFAULT '',
 use_state VARCHAR(10),
 revision INTEGER NOT NULL DEFAULT 0,
 updated_by VARCHAR(100) NOT NULL,
 updated_at TIMESTAMP NOT NULL
);
