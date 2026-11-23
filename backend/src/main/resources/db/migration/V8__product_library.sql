CREATE TABLE product_folders (
 id VARCHAR(36) PRIMARY KEY,
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 parent_id VARCHAR(36) REFERENCES product_folders(id),
 name VARCHAR(30) NOT NULL,
 sort_order INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL,
 UNIQUE(client_id, name)
);
CREATE INDEX idx_product_folders_client ON product_folders(client_id);
CREATE TABLE product_profiles (
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 group_id VARCHAR(100) NOT NULL,
 folder_id VARCHAR(36) REFERENCES product_folders(id),
 confirmed_json TEXT NOT NULL DEFAULT '[]',
 reviewed_analysis_at VARCHAR(40),
 personas_initialized BOOLEAN NOT NULL DEFAULT FALSE,
 updated_at TIMESTAMP NOT NULL,
 PRIMARY KEY (client_id, group_id)
);
CREATE INDEX idx_product_profiles_folder ON product_profiles(folder_id);
CREATE TABLE product_understandings (
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 group_id VARCHAR(100) NOT NULL,
 content_json TEXT NOT NULL,
 source VARCHAR(20) NOT NULL,
 edited_count INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TIMESTAMP NOT NULL,
 PRIMARY KEY (client_id, group_id)
);
CREATE TABLE product_personas (
 id VARCHAR(36) PRIMARY KEY,
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 group_id VARCHAR(100) NOT NULL,
 name VARCHAR(30) NOT NULL,
 pain VARCHAR(300) NOT NULL DEFAULT '',
 want VARCHAR(300) NOT NULL DEFAULT '',
 tone VARCHAR(300) NOT NULL DEFAULT '',
 scene VARCHAR(300) NOT NULL DEFAULT '',
 worry VARCHAR(300) NOT NULL DEFAULT '',
 hooks VARCHAR(300) NOT NULL DEFAULT '[]',
 sort_order INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL,
 updated_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_product_personas_group ON product_personas(client_id, group_id);
