-- Read-only snapshot queries for the v1 database (BUAD_DB). Run each, save the rows as JSON.
-- The migrate tool never connects to v1; it only reads the file you give it.
--   wrangler d1 execute buad-platform --remote --json --command "<query>"
SELECT id, name, email, password_hash, role, must_change_pass, created_at FROM users;
SELECT id, name, email, password_hash, contact_name, phone, city, license_no, plan_start, created_at FROM orgs;
SELECT id, org_id, name, email, password_hash, role, created_at FROM org_members;
SELECT id, data, updated_at FROM workspace WHERE id = 'main';
