import { users } from "@buad/schema/db";
import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { hashPassword, legacyDjb2, verifyPassword } from "./password";

// biome-ignore lint/suspicious/noExplicitAny: works for both D1 and better-sqlite3 drivers
export type Db = BaseSQLiteDatabase<"sync" | "async", any, any>;

export type AuthUser = {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: string;
  tokenVersion: number;
};
export type LoginResult = { status: "ok"; user: AuthUser } | { status: "invalid" };

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
  const user: AuthUser = {
    id: row.id,
    orgId: row.orgId,
    email: row.email,
    name: row.name,
    role: row.role,
    tokenVersion: row.tokenVersion,
  };
  // Awaiting first password: only an admin-issued invite token can set one, never a bare email.
  if (row.mustChangePass) return { status: "invalid" };

  if (row.passwordHash) {
    return (await verifyPassword(password, row.passwordHash))
      ? { status: "ok", user }
      : { status: "invalid" };
  }
  // Imported from v1: verify the old hash once, then replace it with a strong one.
  if (row.legacyHash && legacyDjb2(password) === row.legacyHash) {
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(password), legacyHash: "" })
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
  return row
    ? {
        id: row.id,
        orgId: row.orgId,
        email: row.email,
        name: row.name,
        role: row.role,
        tokenVersion: row.tokenVersion,
      }
    : null;
}
