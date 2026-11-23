-- 团队管理：账号由管理员开通，每人一个角色。
-- team_owner 是这支团队的主账号（部署时用 ADMIN_USERNAME 建的那个）；团队里的客户就是主账号名下的客户。
-- 管理员能进团队全部客户；其他角色只能进 client_members 里分给他的客户。已有账号都按主账号 + 管理员处理，原来的访问范围不变。
ALTER TABLE app_users ADD COLUMN display_name VARCHAR(60) NOT NULL DEFAULT '';
ALTER TABLE app_users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'ADMIN';
ALTER TABLE app_users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE app_users ADD COLUMN team_owner VARCHAR(100);
ALTER TABLE app_users ADD COLUMN created_at TIMESTAMP;
ALTER TABLE app_users ADD COLUMN last_login_at TIMESTAMP;
ALTER TABLE app_users ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
UPDATE app_users SET team_owner=username WHERE team_owner IS NULL;
CREATE INDEX idx_app_users_team ON app_users(team_owner);

CREATE TABLE client_members (
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 username VARCHAR(100) NOT NULL REFERENCES app_users(username),
 created_by VARCHAR(100) NOT NULL,
 created_at TIMESTAMP NOT NULL,
 PRIMARY KEY (client_id, username)
);
CREATE INDEX idx_client_members_user ON client_members(username);

-- 团队层面的操作记录（开通、改角色、改负责客户、停用、重设密码）。不记录任何密码内容。
CREATE TABLE team_events (
 id VARCHAR(36) PRIMARY KEY,
 team_owner VARCHAR(100) NOT NULL,
 actor VARCHAR(100) NOT NULL,
 action VARCHAR(60) NOT NULL,
 target VARCHAR(100) NOT NULL,
 detail VARCHAR(500) NOT NULL,
 created_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_team_events_team ON team_events(team_owner, created_at);
