CREATE TABLE campaign_products (
 campaign_id VARCHAR(36) NOT NULL REFERENCES campaigns(id),
 anchor_id VARCHAR(36) NOT NULL REFERENCES assets(id),
 sort_order INTEGER NOT NULL,
 PRIMARY KEY (campaign_id, anchor_id)
);
