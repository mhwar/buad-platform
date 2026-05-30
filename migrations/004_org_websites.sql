ALTER TABLE orgs ADD COLUMN website_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS org_websites (
  org_id        TEXT PRIMARY KEY,
  config        TEXT NOT NULL DEFAULT '{}',
  published     INTEGER NOT NULL DEFAULT 0,
  published_at  INTEGER,
  custom_domain TEXT NOT NULL DEFAULT '',
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
