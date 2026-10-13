import type { Plan } from "./plan";

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
  return out;
}
