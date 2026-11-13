CREATE TABLE remake_drafts (
 id VARCHAR(36) PRIMARY KEY,
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 campaign_id VARCHAR(36) NOT NULL REFERENCES campaigns(id),
 asset_id VARCHAR(36) NOT NULL REFERENCES assets(id),
 anchor_id VARCHAR(36) NOT NULL REFERENCES assets(id),
 revision INTEGER NOT NULL DEFAULT 0,
 status VARCHAR(20) NOT NULL DEFAULT 'EMPTY',
 phase VARCHAR(150) NOT NULL DEFAULT '',
 source_json TEXT,
 result_source_json TEXT,
 request_json TEXT,
 draft_json TEXT,
 prompt TEXT NOT NULL DEFAULT '',
 error VARCHAR(500) NOT NULL DEFAULT '',
 updated_at TIMESTAMP NOT NULL,
 UNIQUE(client_id,campaign_id,asset_id,anchor_id)
);
