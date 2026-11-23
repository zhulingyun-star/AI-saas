CREATE TABLE reference_folders (
 id VARCHAR(36) PRIMARY KEY,
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 parent_id VARCHAR(36) REFERENCES reference_folders(id),
 name VARCHAR(30) NOT NULL,
 sort_order INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL,
 UNIQUE(client_id, name)
);
CREATE INDEX idx_reference_folders_client ON reference_folders(client_id);
CREATE TABLE reference_profiles (
 client_id VARCHAR(36) NOT NULL REFERENCES clients(id),
 asset_id VARCHAR(36) NOT NULL REFERENCES assets(id),
 folder_id VARCHAR(36) REFERENCES reference_folders(id),
 display_name VARCHAR(60),
 hook VARCHAR(20),
 shot_tasks_json TEXT NOT NULL DEFAULT '{}',
 revision INTEGER NOT NULL DEFAULT 0,
 updated_at TIMESTAMP NOT NULL,
 PRIMARY KEY (client_id, asset_id)
);
CREATE INDEX idx_reference_profiles_folder ON reference_profiles(folder_id);
