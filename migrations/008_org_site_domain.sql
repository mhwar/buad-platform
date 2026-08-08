-- Association websites: ensure the table exists and make custom domains unique.
-- Both statements also run idempotently from POST /api/admin/run-migrations.

CREATE TABLE IF NOT EXISTS org_websites (
  org_id        TEXT PRIMARY KEY,
  config        TEXT NOT NULL DEFAULT '{}',
  published     INTEGER NOT NULL DEFAULT 0,
  published_at  INTEGER,
  custom_domain TEXT NOT NULL DEFAULT '',
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- A domain may belong to at most one association. Partial index so the many
-- rows with no domain ('') don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orgws_domain
  ON org_websites(custom_domain) WHERE custom_domain <> '';
