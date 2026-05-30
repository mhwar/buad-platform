-- CRM transaction workflow: beneficiary onboarding/approval, document checklist,
-- request approval chain, and enhanced audit notes.
-- All of this is also lazy-migrated at runtime (see crmGuard in functions/api/[[all]].js);
-- this file documents the canonical schema for fresh DB setups.

-- ── Beneficiary onboarding lifecycle ──
-- stage: pending → reviewing → approved (status=active) | rejected (status=inactive)
ALTER TABLE beneficiaries ADD COLUMN stage TEXT NOT NULL DEFAULT 'active';
ALTER TABLE beneficiaries ADD COLUMN stage_note TEXT NOT NULL DEFAULT '';
ALTER TABLE beneficiaries ADD COLUMN assigned_to TEXT NOT NULL DEFAULT '';

-- ── Enhanced notes: internal-only flag + workflow-stage link ──
ALTER TABLE crm_notes ADD COLUMN internal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crm_notes ADD COLUMN stage TEXT NOT NULL DEFAULT '';

-- ── Request workflow stage ──
ALTER TABLE crm_requests ADD COLUMN stage TEXT NOT NULL DEFAULT '';

-- ── Document checklist (per beneficiary file or per request) ──
CREATE TABLE IF NOT EXISTS crm_documents (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL,
  beneficiary_id TEXT NOT NULL DEFAULT '',
  request_id     TEXT NOT NULL DEFAULT '',
  doc_type       TEXT NOT NULL DEFAULT '',
  label          TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'required',   -- required | submitted | verified | missing
  note           TEXT NOT NULL DEFAULT '',
  file_url       TEXT NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  verified_at    INTEGER NOT NULL DEFAULT 0,
  verified_by    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_cdoc_ben ON crm_documents(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_cdoc_req ON crm_documents(request_id);

-- ── Request approval chain (each step in the workflow) ──
CREATE TABLE IF NOT EXISTS crm_approvals (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  request_id  TEXT NOT NULL,
  stage       TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL DEFAULT '',   -- advance | approve | reject | return | complete
  actor       TEXT NOT NULL DEFAULT '',
  from_status TEXT NOT NULL DEFAULT '',
  to_status   TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_capp_req ON crm_approvals(request_id);
