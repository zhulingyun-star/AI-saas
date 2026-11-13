CREATE TABLE reference_storyboards (
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 asset_id VARCHAR(36) NOT NULL REFERENCES assets(id),
 status VARCHAR(20) NOT NULL DEFAULT 'EMPTY',
 revision INTEGER NOT NULL DEFAULT 0,
 report_json TEXT,
 request_json TEXT,
 calls_json TEXT NOT NULL DEFAULT '[]',
 error VARCHAR(500) NOT NULL DEFAULT '',
 updated_at TIMESTAMP NOT NULL,
 PRIMARY KEY(client_id,asset_id)
);
