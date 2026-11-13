CREATE TABLE product_analyses (
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 group_id VARCHAR(100) NOT NULL,
 anchor_id VARCHAR(36) NOT NULL REFERENCES assets(id),
 brief VARCHAR(3000) NOT NULL DEFAULT '',
 status VARCHAR(20) NOT NULL,
 input_json TEXT NOT NULL,
 result_input_json TEXT,
 result_json TEXT,
 model VARCHAR(150) NOT NULL DEFAULT '',
 error VARCHAR(500) NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 0,
 analyzed_at TIMESTAMP,
 updated_at TIMESTAMP NOT NULL,
 PRIMARY KEY (client_id, group_id)
);
