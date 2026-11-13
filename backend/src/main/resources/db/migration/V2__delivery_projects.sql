CREATE TABLE campaigns (
 id VARCHAR(36) PRIMARY KEY, client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 name VARCHAR(150) NOT NULL, owner_name VARCHAR(100) NOT NULL,
 due_date DATE, target_count INTEGER NOT NULL, brief TEXT NOT NULL,
 archived BOOLEAN NOT NULL, revision INTEGER NOT NULL,
 created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL
);
CREATE TABLE work_flow (
 project_id VARCHAR(36) PRIMARY KEY REFERENCES projects(id),
 campaign_id VARCHAR(36) REFERENCES campaigns(id), assignee VARCHAR(100) NOT NULL,
 phase VARCHAR(30) NOT NULL, due_date DATE, note TEXT NOT NULL,
 revision INTEGER NOT NULL, updated_at TIMESTAMP NOT NULL
);
INSERT INTO work_flow(project_id,campaign_id,assignee,phase,due_date,note,revision,updated_at)
 SELECT p.id,NULL,c.owner,CASE WHEN p.status='DRAFT' THEN 'PLAN' ELSE 'PRODUCTION' END,NULL,'',0,p.updated_at
 FROM projects p JOIN clients c ON c.id=p.client_id;
CREATE TABLE team_contacts (
 id VARCHAR(36) PRIMARY KEY, client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 name VARCHAR(100) NOT NULL, responsibility VARCHAR(40) NOT NULL, created_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_campaigns_client ON campaigns(client_id);
CREATE INDEX idx_flow_campaign ON work_flow(campaign_id);
