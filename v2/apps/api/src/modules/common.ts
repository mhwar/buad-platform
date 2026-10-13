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

/**
 * A project's contract total (gross, halalas) for lists and sorting: from its finance settings
 * when they exist, otherwise the expected value with v1's default VAT (15%, not included).
 * `p` is the SQL alias/table name of the projects row.
 */
export const contractTotalSql = (p: string) =>
  sql.raw(`COALESCE((SELECT CASE WHEN f.vat_included THEN f.contract_value_halalas
      ELSE f.contract_value_halalas + CAST(ROUND(f.contract_value_halalas * f.vat_pct / 100.0) AS INTEGER) END
    FROM project_finance f WHERE f.project_id = ${p}.id),
    ${p}.expected_value_halalas + CAST(ROUND(${p}.expected_value_halalas * 15 / 100.0) AS INTEGER))`);

/** URL of a client's logo (versioned by updated_at so browsers can cache it forever), or "". */
export const logoUrlSql = (c: string) =>
  sql.raw(
    `CASE WHEN ${c}.logo <> '' THEN '/api/clients/' || ${c}.id || '/logo?v=' || ${c}.updated_at ELSE '' END`,
  );
