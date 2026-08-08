-- Uploaded files (governance PDFs, images).
-- Stored base64 in D1 because no object store is bound to this project; the API
-- enforces an 800 KB raw ceiling so a single stored value stays well within limits.
-- Also runs idempotently from POST /api/admin/run-migrations.

CREATE TABLE IF NOT EXISTS org_assets (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL DEFAULT '',
  filename   TEXT NOT NULL DEFAULT '',
  mime       TEXT NOT NULL DEFAULT '',
  size       INTEGER NOT NULL DEFAULT 0,
  data       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_assets_owner ON org_assets(owner_id);
