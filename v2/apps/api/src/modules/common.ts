import { sql } from "drizzle-orm";
import type { Db } from "../auth/service";

/** Atomically takes the next number for (org, kind, year). One UPSERT … RETURNING: never repeats. */
export async function nextCounter(db: Db, orgId: string, kind: string, year = 0): Promise<number> {
  const row = (await db.get(sql`
    INSERT INTO org_counters (org_id, kind, year, value) VALUES (${orgId}, ${kind}, ${year}, 1)
    ON CONFLICT(org_id, kind, year) DO UPDATE SET value = org_counters.value + 1
    RETURNING value
  `)) as { value: number } | undefined;
  if (!row) throw new Error("counter_failed");
  return Number(row.value);
}

export const newId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;

export const nowSec = () => Math.floor(Date.now() / 1000);

export const isManager = (role: string) => role === "owner" || role === "admin";

/** Escape LIKE wildcards in user search text. */
export const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
