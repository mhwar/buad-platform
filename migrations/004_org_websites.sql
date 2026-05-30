-- BUAD Platform — Association websites
-- Run: wrangler d1 execute buad-platform --remote --file=migrations/004_org_websites.sql

-- Add website_enabled flag to existing orgs table
ALTER TABLE orgs ADD COLUMN website_enabled INTEGER NOT NULL DEFAULT 0;

-- Website config & content per org
CREATE TABLE IF NOT EXISTS org_websites (
  org_id        TEXT PRIMARY KEY,
  config        TEXT NOT NULL DEFAULT '{}',
  published     INTEGER NOT NULL DEFAULT 0,
  published_at  INTEGER,
  custom_domain TEXT NOT NULL DEFAULT '',
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
