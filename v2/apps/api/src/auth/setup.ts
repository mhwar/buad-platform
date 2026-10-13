import { orgs, users } from "@buad/schema/db";
import { count, eq, sql } from "drizzle-orm";
import { hashPassword, safeEqual } from "./password";
import type { Db } from "./service";

export const PLATFORM_ORG_ID = "org_platform";
const MIN_TOKEN_LENGTH = 24;

/** The setup flow exists only when a long enough token has been configured. */
export const setupEnabled = (token: string | undefined): token is string =>
  typeof token === "string" && token.length >= MIN_TOKEN_LENGTH;

/** Constant-time comparison: both sides are hashed to equal length first. */
export async function tokenMatches(given: string, expected: string): Promise<boolean> {
  const digest = async (s: string) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return safeEqual(await digest(given), await digest(expected));
}

export async function ownerExists(db: Db): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(users).where(eq(users.role, "owner"));
  return (row?.n ?? 0) > 0;
}

export type ClaimInput = { email: string; name: string; password: string };
export type ClaimResult = { ok: true; userId: string } | { ok: false };

/**
 * Creates the first owner. The "no owner yet" check and the write are ONE statement, so two
 * simultaneous claims cannot both succeed. An existing user with the same email (e.g. imported
 * from v1) is promoted instead of duplicated, and their old sessions are revoked.
 */
export async function claimOwner(db: Db, input: ClaimInput): Promise<ClaimResult> {
  const hash = await hashPassword(input.password);
  const id = `usr_owner_${crypto.randomUUID()}`;

  await db.insert(orgs).values({ id: PLATFORM_ORG_ID, name: "بُعد" }).onConflictDoNothing();

  await db.run(sql`
    INSERT INTO users (id, org_id, email, name, role, password_hash, legacy_hash, must_change_pass, token_version)
    SELECT ${id}, ${PLATFORM_ORG_ID}, ${input.email}, ${input.name}, 'owner', ${hash}, '', 0, 0
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'owner')
    ON CONFLICT(email) DO UPDATE SET
      role = 'owner',
      org_id = ${PLATFORM_ORG_ID},
      name = excluded.name,
      password_hash = excluded.password_hash,
      legacy_hash = '',
      must_change_pass = 0,
      token_version = users.token_version + 1
  `);

  // We won only if the row now carries OUR hash (a loser's statement changes nothing).
  const [row] = await db
    .select({ id: users.id, role: users.role, hash: users.passwordHash })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  return row && row.role === "owner" && row.hash === hash
    ? { ok: true, userId: row.id }
    : { ok: false };
}
