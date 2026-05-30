ALTER TABLE orgs ADD COLUMN crm_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS beneficiaries (
  id                TEXT PRIMARY KEY,
  org_id            TEXT NOT NULL,
  name              TEXT NOT NULL,
  id_number         TEXT NOT NULL DEFAULT '',
  dob               TEXT NOT NULL DEFAULT '',
  gender            TEXT NOT NULL DEFAULT 'male',
  phone             TEXT NOT NULL DEFAULT '',
  phone2            TEXT NOT NULL DEFAULT '',
  email             TEXT NOT NULL DEFAULT '',
  city              TEXT NOT NULL DEFAULT '',
  district          TEXT NOT NULL DEFAULT '',
  address           TEXT NOT NULL DEFAULT '',
  marital_status    TEXT NOT NULL DEFAULT '',
  dependents        INTEGER NOT NULL DEFAULT 0,
  housing_type      TEXT NOT NULL DEFAULT '',
  income            REAL NOT NULL DEFAULT 0,
  employment_status TEXT NOT NULL DEFAULT '',
  category          TEXT NOT NULL DEFAULT 'needy',
  status            TEXT NOT NULL DEFAULT 'active',
  notes             TEXT NOT NULL DEFAULT '',
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_ben_org    ON beneficiaries(org_id);
CREATE INDEX IF NOT EXISTS idx_ben_status ON beneficiaries(org_id, status);
CREATE INDEX IF NOT EXISTS idx_ben_cat    ON beneficiaries(org_id, category);

CREATE TABLE IF NOT EXISTS crm_requests (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL,
  beneficiary_id TEXT NOT NULL,
  service_type   TEXT NOT NULL DEFAULT 'other',
  title          TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  amount         REAL NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'pending',
  priority       TEXT NOT NULL DEFAULT 'normal',
  assigned_to    TEXT NOT NULL DEFAULT '',
  due_date       TEXT NOT NULL DEFAULT '',
  resolution     TEXT NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_creq_org    ON crm_requests(org_id);
CREATE INDEX IF NOT EXISTS idx_creq_ben    ON crm_requests(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_creq_status ON crm_requests(org_id, status);

CREATE TABLE IF NOT EXISTS crm_aids (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL,
  beneficiary_id TEXT NOT NULL,
  request_id     TEXT NOT NULL DEFAULT '',
  aid_type       TEXT NOT NULL DEFAULT 'financial',
  amount         REAL NOT NULL DEFAULT 0,
  items          TEXT NOT NULL DEFAULT '[]',
  provided_at    TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  created_by     TEXT NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_caid_org ON crm_aids(org_id);
CREATE INDEX IF NOT EXISTS idx_caid_ben ON crm_aids(beneficiary_id);

CREATE TABLE IF NOT EXISTS crm_notes (
  id             TEXT PRIMARY KEY,
  org_id         TEXT NOT NULL,
  beneficiary_id TEXT NOT NULL,
  request_id     TEXT NOT NULL DEFAULT '',
  type           TEXT NOT NULL DEFAULT 'note',
  content        TEXT NOT NULL DEFAULT '',
  created_by     TEXT NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_cnote_ben ON crm_notes(beneficiary_id);
