CREATE TABLE app_users (username VARCHAR(100) PRIMARY KEY, password VARCHAR(200) NOT NULL);
CREATE TABLE clients (
 id VARCHAR(36) PRIMARY KEY, owner VARCHAR(100) NOT NULL REFERENCES app_users(username),
 name VARCHAR(100) NOT NULL, category VARCHAR(60) NOT NULL, created_at TIMESTAMP NOT NULL
);
CREATE TABLE assets (
 id VARCHAR(36) PRIMARY KEY, client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 name VARCHAR(255) NOT NULL, kind VARCHAR(30) NOT NULL, sku VARCHAR(100) NOT NULL,
 tags VARCHAR(500) NOT NULL, mime VARCHAR(100) NOT NULL, size_bytes BIGINT NOT NULL,
 storage_name VARCHAR(100) NOT NULL, metadata TEXT NOT NULL, created_at TIMESTAMP NOT NULL
);
CREATE TABLE projects (
 id VARCHAR(36) PRIMARY KEY, client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 name VARCHAR(150) NOT NULL, sku VARCHAR(100) NOT NULL, category VARCHAR(60) NOT NULL,
 platform VARCHAR(40) NOT NULL, format VARCHAR(60) NOT NULL, duration INTEGER NOT NULL,
 facts TEXT NOT NULL, facts_confirmed BOOLEAN NOT NULL, shots TEXT NOT NULL,
 config TEXT NOT NULL, status VARCHAR(30) NOT NULL, revision INTEGER NOT NULL, created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL
);
CREATE TABLE jobs (
 id VARCHAR(36) PRIMARY KEY, client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 project_id VARCHAR(36) NOT NULL REFERENCES projects(id), name VARCHAR(150) NOT NULL,
 provider VARCHAR(30) NOT NULL, status VARCHAR(30) NOT NULL, progress INTEGER NOT NULL,
 snapshot TEXT NOT NULL, message TEXT NOT NULL, output_name VARCHAR(100),
 revision INTEGER NOT NULL, created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL
);
CREATE TABLE reviews (
 id VARCHAR(36) PRIMARY KEY, job_id VARCHAR(36) NOT NULL REFERENCES jobs(id),
 author VARCHAR(100) NOT NULL, timecode INTEGER NOT NULL, decision VARCHAR(30) NOT NULL,
 comment TEXT NOT NULL, created_at TIMESTAMP NOT NULL
);
CREATE TABLE presets (
 id VARCHAR(36) PRIMARY KEY, client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 name VARCHAR(100) NOT NULL, kind VARCHAR(30) NOT NULL, content TEXT NOT NULL,
 enabled BOOLEAN NOT NULL, created_at TIMESTAMP NOT NULL
);
CREATE TABLE metrics (
 id VARCHAR(36) PRIMARY KEY, client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 material_id VARCHAR(150) NOT NULL, impressions BIGINT NOT NULL, clicks BIGINT NOT NULL,
 spend DECIMAL(18,2) NOT NULL, orders BIGINT NOT NULL, revenue DECIMAL(18,2) NOT NULL,
 UNIQUE(client_id, material_id)
);
CREATE TABLE audit_events (
 id VARCHAR(36) PRIMARY KEY, client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 actor VARCHAR(100) NOT NULL, action VARCHAR(100) NOT NULL, detail VARCHAR(500) NOT NULL, created_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_clients_owner ON clients(owner);
CREATE INDEX idx_assets_client ON assets(client_id);
CREATE INDEX idx_projects_client ON projects(client_id);
CREATE INDEX idx_jobs_client ON jobs(client_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_presets_client ON presets(client_id);
CREATE INDEX idx_events_client ON audit_events(client_id);
