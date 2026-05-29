-- BUAD Platform — D1 Schema
-- Run this in Cloudflare D1 console or via: wrangler d1 execute buad-platform --file=migrations/001_initial.sql

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL COLLATE NOCASE,
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'user',
  must_change_pass INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE);

-- Workspace: all app data as JSON (clients, projects, fin, settings, templates)
CREATE TABLE IF NOT EXISTS workspace (
  id         TEXT PRIMARY KEY DEFAULT 'main',
  data       TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO workspace (id, data) VALUES ('main', '{}');

-- Seed admin: sultan.sa41@gmail.com / 123
-- password_hash is djb2('123') = '375x4r'
INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
VALUES ('usr_admin_1', 'سلطان عسيري', 'sultan.sa41@gmail.com', '375x4r', 'admin');
