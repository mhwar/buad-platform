import { effectiveRoleKey, type RoleRow, resolveRole, type Scopes } from "@buad/domain";
import { orgRoles, users } from "@buad/schema/db";
import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { hashPassword, legacyDjb2, verifyPassword } from "./password";

export type Db = BaseSQLiteDatabase<"sync" | "async", any, any>;

export type AuthUser = {
  id: string;
  orgId: string;
  email: string;
  name: string;
  /** Legacy v1 role (owner|admin|member); permissions come from `roleKey`. */
  role: string;
  roleKey: string;
  perms: string[];
  scopes: Scopes;
  tokenVersion: number;
};
export type LoginResult = { status: "ok"; user: AuthUser } | { status: "invalid" };

type UserRow = typeof users.$inferSelect;

const parse = <T>(text: string, fallback: T): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

/** The organisation's own role definitions (edits of ready-made roles and custom ones). */
export async function loadRoleRows(db: Db, orgId: string): Promise<RoleRow[]> {
  const rows = await db.select().from(orgRoles).where(eq(orgRoles.orgId, orgId));
  return rows.map((r) => ({
    key: r.key,
    name: r.name,
    description: r.description,
    perms: parse<string[]>(r.perms, []),
    scopes: parse<Scopes>(r.scopes, {}),
  }));
}

/** Builds the signed-in user with the permissions of their role resolved once. */
export async function toAuthUser(db: Db, row: UserRow): Promise<AuthUser> {
  const key = effectiveRoleKey(row.roleKey, row.role);
  const role = resolveRole(key, key === "owner" ? [] : await loadRoleRows(db, row.orgId));
  return {
    id: row.id,
    orgId: row.orgId,
    email: row.email,
    name: row.name,
    role: row.role,
    roleKey: key,
    // A role that no longer exists grants nothing rather than falling back to something wider.
    perms: role?.perms ?? [],
    scopes: role?.scopes ?? {},
    tokenVersion: row.tokenVersion,
  };
}

const normEmail = (e: string) => e.trim().toLowerCase();

/** A fixed dummy hash so unknown emails cost the same time as wrong passwords. */
let dummy: Promise<string> | undefined;

export async function login(db: Db, emailIn: string, password: string): Promise<LoginResult> {
  const email = normEmail(emailIn);
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!row) {
    dummy ??= hashPassword("not-a-real-password");
    await verifyPassword(password, await dummy);
    return { status: "invalid" };
  }
  if (!row.active) return { status: "invalid" };
  const user = await toAuthUser(db, row);
  // Awaiting first password: only an admin-issued invite token can set one, never a bare email.
  if (row.mustChangePass) return { status: "invalid" };

  if (row.passwordHash) {
    if (!(await verifyPassword(password, row.passwordHash))) return { status: "invalid" };
    await db
      .update(users)
      .set({ lastLoginAt: Math.floor(Date.now() / 1000) })
      .where(eq(users.id, row.id));
    return { status: "ok", user };
  }
  // Imported from v1: verify the old hash once, then replace it with a strong one.
  if (row.legacyHash && legacyDjb2(password) === row.legacyHash) {
    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(password),
        legacyHash: "",
        lastLoginAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(users.id, row.id));
    return { status: "ok", user };
  }
  return { status: "invalid" };
}

export async function setPassword(db: Db, userId: string, password: string): Promise<void> {
  const [row] = await db
    .select({ v: users.tokenVersion })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      legacyHash: "",
      mustChangePass: false,
      tokenVersion: (row?.v ?? 0) + 1,
    })
    .where(eq(users.id, userId));
}

export async function getUser(db: Db, id: string): Promise<AuthUser | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row?.active ? toAuthUser(db, row) : null;
}
