-- 框架模式 / 一键成片的新版四步详情：方向和每个方向的分镜。
-- 一个项目可以有几套方向（框架模式选 1~3 个一起测；一键成片每次出片时自动写 1 个）。
-- 设置（人群、时长、一键成片的设置）继续放在 projects.config；每一版出片 = jobs 一行，出片词、方向 id 和设置快照在 jobs.snapshot。
CREATE TABLE project_directions (
 id VARCHAR(36) PRIMARY KEY,
 project_id VARCHAR(36) NOT NULL REFERENCES projects(id),
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 sort_order INTEGER NOT NULL,
 -- AI：文字模型写的；LOCAL：没配置文字模型时按商品理解拼的本地模板
 source VARCHAR(10) NOT NULL,
 data_json TEXT NOT NULL,
 origin_json TEXT NOT NULL,
 product_anchor_id VARCHAR(36) NOT NULL,
 selected BOOLEAN NOT NULL DEFAULT FALSE,
 select_order INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL,
 updated_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_project_directions_project ON project_directions(project_id);
CREATE INDEX idx_project_directions_client ON project_directions(client_id);
-- 每个方向一份分镜：每镜的画面、台词、任务，以及写出来时的原文（可以恢复）
CREATE TABLE project_direction_boards (
 direction_id VARCHAR(36) PRIMARY KEY REFERENCES project_directions(id),
 project_id VARCHAR(36) NOT NULL REFERENCES projects(id),
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 source VARCHAR(10) NOT NULL,
 direction_revision INTEGER NOT NULL,
 duration INTEGER NOT NULL,
 shots_json TEXT NOT NULL,
 confirmed BOOLEAN NOT NULL DEFAULT FALSE,
 revision INTEGER NOT NULL DEFAULT 0,
 updated_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_project_direction_boards_project ON project_direction_boards(project_id);
