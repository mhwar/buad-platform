-- BUAD Platform — Landing page content + service requests
-- Run: wrangler d1 execute buad-platform --file=migrations/002_site.sql

-- Editable landing-page content (services, hero text, contact info) as JSON blob.
-- Public read (so the landing page can render), authenticated write (dashboard).
CREATE TABLE IF NOT EXISTS site_content (
  id         TEXT PRIMARY KEY DEFAULT 'main',
  data       TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO site_content (id, data) VALUES ('main', '{}');

-- Service requests submitted from the public landing page form.
CREATE TABLE IF NOT EXISTS service_requests (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  org         TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  service     TEXT NOT NULL DEFAULT '',
  budget      TEXT NOT NULL DEFAULT '',
  message     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'new',   -- new | contacted | in_progress | won | lost
  notes       TEXT NOT NULL DEFAULT '',
  assignee    TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'website',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_requests_status  ON service_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_created ON service_requests(created_at DESC);
