-- BUAD Platform — Associations portal (100-day plan tracker)
-- Run: wrangler d1 execute buad-platform --remote --file=migrations/003_orgs.sql

-- Emerging associations who self-register to track their National Center 100-day plan.
CREATE TABLE IF NOT EXISTS orgs (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL DEFAULT '',          -- اسم الجمعية
  email         TEXT NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL DEFAULT '',
  contact_name  TEXT NOT NULL DEFAULT '',          -- اسم المسؤول
  phone         TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  license_no    TEXT NOT NULL DEFAULT '',          -- رقم الترخيص
  plan_start    TEXT NOT NULL DEFAULT '',          -- تاريخ بدء الخطة (YYYY-MM-DD)
  progress      TEXT NOT NULL DEFAULT '{}',        -- JSON: { taskId: { done, at, note } }
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  last_active   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orgs_email   ON orgs(email COLLATE NOCASE);
CREATE INDEX        IF NOT EXISTS idx_orgs_created ON orgs(created_at DESC);
