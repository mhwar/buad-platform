-- Per-org CRM configuration (taxonomies + form builder) and team members
-- Lazy-migrated at runtime too (see crmGuard / org_members in functions/api/[[all]].js),
-- this file documents the canonical schema for fresh DB setups.

-- Per-org CRM config: a single JSON blob holding categories, service_types,
-- aid_types, statuses, priorities, marital, housing, employment, note_types,
-- and form_fields (the beneficiary registration form builder).
CREATE TABLE IF NOT EXISTS crm_config (
  org_id     TEXT PRIMARY KEY,
  config     TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Custom field values for beneficiaries (keyed by custom form-field key).
ALTER TABLE beneficiaries ADD COLUMN custom_data TEXT NOT NULL DEFAULT '{}';

-- Org team members (settings → users). Each member can log in to the org portal
-- with a role: admin | editor | viewer.
CREATE TABLE IF NOT EXISTS org_members (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'editor',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_email ON org_members(email);
