import { type Business, planBusiness } from "./business";
import type { V1Member, V1Org, V1Snapshot, V1User } from "./v1";

export const PLATFORM_ORG_ID = "org_platform";
export const PLATFORM_ORG_NAME = "بُعد";

export interface OrgRow {
  id: string;
  name: string;
  createdAt: number | null;
}
export interface UserRow {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "member";
  legacyHash: string;
  mustChangePass: boolean;
  createdAt: number | null;
  legacyKind: "user" | "org" | "org_member";
}
export interface Reject {
  kind: "user" | "org" | "org_member";
  id: string;
  name: string;
  email: string;
  reason: string;
}
export interface Plan {
  orgs: OrgRow[];
  users: UserRow[];
  rejects: Reject[];
  inventory: Record<string, number | string>;
  business: Business;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const text = (s: string | null | undefined) => (s ?? "").trim();

/** v1 stores `djb2('__pending__' + id)` for invited users who have not chosen a password yet. */
const isPending = (hash: string, id: string, legacy: (s: string) => string) =>
  !hash || hash === legacy(`__pending__${id}`);

export function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h << 5) + h + s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

const staffRole = (r: string | null | undefined): UserRow["role"] =>
  r === "admin" ? "admin" : "member";
const memberRole = (r: string | null | undefined): UserRow["role"] =>
  r === "admin" ? "admin" : "member";

/** Turn a v1 snapshot into v2 rows. Pure: no I/O, deterministic, never throws on bad data (it reports it). */
export function planMigration(v1: V1Snapshot): Plan {
  const orgs: OrgRow[] = [{ id: PLATFORM_ORG_ID, name: PLATFORM_ORG_NAME, createdAt: null }];
  const users: UserRow[] = [];
  const rejects: Reject[] = [];
  const seenEmail = new Map<string, string>();
  const orgIds = new Set<string>([PLATFORM_ORG_ID]);

  const claim = (
    kind: Reject["kind"],
    id: string,
    name: string,
    emailRaw: string | null | undefined,
  ): string | null => {
    const email = norm(emailRaw);
    if (!email || !EMAIL.test(email)) {
      rejects.push({
        kind,
        id,
        name,
        email: text(emailRaw),
        reason: "بريد إلكتروني مفقود أو غير صالح",
      });
      return null;
    }
    const owner = seenEmail.get(email);
    if (owner) {
      rejects.push({ kind, id, name, email, reason: `البريد مكرر مع السجل ${owner}` });
      return null;
    }
    seenEmail.set(email, `${kind}:${id}`);
    return email;
  };

  const credential = (
    hash: string | null | undefined,
    id: string,
    mustChange?: number | boolean | null,
  ) => {
    const h = text(hash);
    const pending = !!mustChange || isPending(h, id, djb2);
    return { legacyHash: pending ? "" : h, mustChangePass: pending };
  };

  // 1. Platform staff → the platform org.
  for (const u of v1.users ?? ([] as V1User[])) {
    const name = text(u.name);
    const email = claim("user", u.id, name, u.email);
    if (!email) continue;
    users.push({
      id: u.id,
      orgId: PLATFORM_ORG_ID,
      email,
      name,
      role: staffRole(u.role),
      ...credential(u.password_hash, u.id, u.must_change_pass),
      createdAt: u.created_at ?? null,
      legacyKind: "user",
    });
  }

  // 2. Associations → one org each, with the association login as its owner.
  for (const o of v1.orgs ?? ([] as V1Org[])) {
    const name = text(o.name) || text(o.contact_name);
    if (!name) {
      rejects.push({
        kind: "org",
        id: o.id,
        name: "",
        email: text(o.email),
        reason: "جمعية بلا اسم",
      });
      continue;
    }
    orgs.push({ id: o.id, name, createdAt: o.created_at ?? null });
    orgIds.add(o.id);
    const email = claim("org", o.id, name, o.email);
    if (!email) continue;
    users.push({
      id: `own_${o.id}`,
      orgId: o.id,
      email,
      name: text(o.contact_name) || name,
      role: "owner",
      ...credential(o.password_hash, o.id),
      createdAt: o.created_at ?? null,
      legacyKind: "org",
    });
  }

  // 3. Association team members.
  for (const m of v1.org_members ?? ([] as V1Member[])) {
    const name = text(m.name);
    if (!orgIds.has(m.org_id)) {
      rejects.push({
        kind: "org_member",
        id: m.id,
        name,
        email: text(m.email),
        reason: `الجمعية ${m.org_id} غير موجودة`,
      });
      continue;
    }
    const email = claim("org_member", m.id, name, m.email);
    if (!email) continue;
    users.push({
      id: m.id,
      orgId: m.org_id,
      email,
      name,
      role: memberRole(m.role),
      ...credential(m.password_hash, m.id),
      createdAt: m.created_at ?? null,
      legacyKind: "org_member",
    });
  }

  return {
    orgs,
    users,
    rejects,
    inventory: inventory(v1.workspace),
    business: planBusiness(parseWorkspace(v1.workspace)),
  };
}

/** What the workspace blob contains. Counted now, converted module by module in later phases. */
function inventory(ws: V1Snapshot["workspace"]): Record<string, number | string> {
  let data: unknown = ws;
  if (typeof ws === "string") {
    try {
      data = JSON.parse(ws);
    } catch {
      return { _error: "كتلة workspace ليست JSON صالحاً" };
    }
  }
  if (!data || typeof data !== "object") return {};
  const out: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (Array.isArray(v)) out[k] = v.length;
    else if (v && typeof v === "object") out[k] = `${Object.keys(v).length} مفتاح`;
  }
  return out;
}

function parseWorkspace(ws: V1Snapshot["workspace"]): Record<string, unknown> {
  if (!ws) return {};
  if (typeof ws === "string") {
    try {
      const d = JSON.parse(ws);
      return d && typeof d === "object" ? d : {};
    } catch {
      return {};
    }
  }
  return ws;
}
