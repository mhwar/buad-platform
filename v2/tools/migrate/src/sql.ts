import type { Business } from "./business";
import { PLATFORM_ORG_ID, type Plan } from "./plan";

const q = (s: string) => `'${s.replaceAll("'", "''")}'`;
const n = (v: number | null) => (v === null ? "unixepoch()" : String(Math.trunc(v)));

/**
 * Idempotent import statements. Re-running never clobbers what v2 has learned since:
 * a password already upgraded in v2 is kept, and a legacy hash is only written while no v2 hash exists.
 */
export function toSql(plan: Plan): string[] {
  const out: string[] = [];
  for (const o of plan.orgs) {
    out.push(
      `INSERT INTO orgs (id, name, created_at) VALUES (${q(o.id)}, ${q(o.name)}, ${n(o.createdAt)}) ` +
        `ON CONFLICT(id) DO UPDATE SET name = excluded.name;`,
    );
    out.push(
      `INSERT OR IGNORE INTO legacy_map (kind, legacy_id, new_id) VALUES ('org', ${q(o.id)}, ${q(o.id)});`,
    );
  }
  for (const u of plan.users) {
    out.push(
      `INSERT INTO users (id, org_id, email, name, role, legacy_hash, must_change_pass, created_at) VALUES (` +
        `${q(u.id)}, ${q(u.orgId)}, ${q(u.email)}, ${q(u.name)}, ${q(u.role)}, ${q(u.legacyHash)}, ` +
        `${u.mustChangePass ? 1 : 0}, ${n(u.createdAt)}) ` +
        `ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role, org_id = excluded.org_id, ` +
        `legacy_hash = CASE WHEN users.password_hash = '' THEN excluded.legacy_hash ELSE users.legacy_hash END, ` +
        `must_change_pass = CASE WHEN users.password_hash = '' THEN excluded.must_change_pass ELSE users.must_change_pass END;`,
    );
    out.push(
      `INSERT OR IGNORE INTO legacy_map (kind, legacy_id, new_id) VALUES (${q(u.legacyKind)}, ${q(u.id)}, ${q(u.id)});`,
    );
  }
  out.push(...businessSql(plan.business, PLATFORM_ORG_ID));
  return out;
}

/**
 * Clients & projects statements for one org.
 * Data fields refresh on re-run; codes/numbers are fixed at first import and never rewritten.
 */
export function businessSql(b: Business, orgId: string): string[] {
  const out: string[] = [];
  const org = q(orgId);
  for (const c of b.clients) {
    out.push(
      `INSERT INTO clients (id, org_id, code, name, name_norm, type, email, phone, city, reg_no, tax_no, address, website, notes, logo, created_by, created_at, updated_by, updated_at) VALUES (` +
        `${q(c.id)}, ${org}, ${q(c.code)}, ${q(c.name)}, ${q(c.nameNorm)}, ${q(c.type)}, ${q(c.email)}, ${q(c.phone)}, ${q(c.city)}, ` +
        `${q(c.regNo)}, ${q(c.taxNo)}, ${q(c.address)}, ${q(c.website)}, ${q(c.notes)}, ${q(c.logo)}, 'v1-import', ${n(c.createdAt)}, 'v1-import', unixepoch()) ` +
        `ON CONFLICT(id) DO UPDATE SET name = excluded.name, name_norm = excluded.name_norm, type = excluded.type, email = excluded.email, ` +
        `phone = excluded.phone, city = excluded.city, reg_no = excluded.reg_no, tax_no = excluded.tax_no, address = excluded.address, ` +
        `website = excluded.website, notes = excluded.notes, logo = excluded.logo, updated_by = 'v1-import', updated_at = unixepoch();`,
    );
    out.push(
      `INSERT OR IGNORE INTO legacy_map (kind, legacy_id, new_id) VALUES ('client', ${q(c.id)}, ${q(c.id)});`,
    );
  }
  for (const c of b.contacts) {
    out.push(
      `INSERT INTO client_contacts (id, client_id, name, title, is_signatory) VALUES (${q(c.id)}, ${q(c.clientId)}, ${q(c.name)}, ${q(c.title)}, 1) ` +
        `ON CONFLICT(id) DO UPDATE SET name = excluded.name, title = excluded.title;`,
    );
  }
  for (const p of b.projects) {
    out.push(
      `INSERT INTO projects (id, org_id, client_id, number, name, type, status, owner_id, visibility, location, start_date, end_date, pay_date, expected_value_halalas, notes, created_by, created_at, updated_by, updated_at) VALUES (` +
        `${q(p.id)}, ${org}, ${q(p.clientId)}, ${q(p.number)}, ${q(p.name)}, ${q(p.type)}, ${q(p.status)}, ${q(p.ownerId)}, ${q(p.visibility)}, ` +
        `${q(p.location)}, ${q(p.startDate)}, ${q(p.endDate)}, ${q(p.payDate)}, ${Math.trunc(p.expectedValue)}, ${q(p.notes)}, 'v1-import', ${n(p.createdAt)}, 'v1-import', unixepoch()) ` +
        `ON CONFLICT(id) DO UPDATE SET client_id = excluded.client_id, name = excluded.name, type = excluded.type, status = excluded.status, ` +
        `owner_id = excluded.owner_id, visibility = excluded.visibility, location = excluded.location, start_date = excluded.start_date, ` +
        `end_date = excluded.end_date, pay_date = excluded.pay_date, expected_value_halalas = excluded.expected_value_halalas, ` +
        `notes = excluded.notes, updated_by = 'v1-import', updated_at = unixepoch();`,
    );
    out.push(
      `INSERT OR IGNORE INTO legacy_map (kind, legacy_id, new_id) VALUES ('project', ${q(p.id)}, ${q(p.id)});`,
    );
  }
  // New v2 records continue after the highest imported number.
  for (const k of b.counters) {
    out.push(
      `INSERT INTO org_counters (org_id, kind, year, value) VALUES (${org}, ${q(k.kind)}, ${k.year}, ${k.value}) ` +
        `ON CONFLICT(org_id, kind, year) DO UPDATE SET value = max(value, excluded.value);`,
    );
  }
  return out;
}
