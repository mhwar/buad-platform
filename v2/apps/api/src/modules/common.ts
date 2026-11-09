import { projects } from "@buad/schema/db";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
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

/**
 * The one rule for «يدخل في المالية»: a live project that is neither external nor a draft. Every
 * total, report, check and statement selects projects through this (or `inFinanceSql` in raw SQL).
 * Drafts left out are listed in «تحتاج تدخلك» (see finance-checks) so none is missed silently.
 */
export const inFinance = () =>
  and(isNull(projects.archivedAt), eq(projects.external, false), ne(projects.status, "draft"));
/**
 * Why a project's money records can't be written: closed (until reopened). An external project
 * keeps full books of its own; they simply never reach a company figure (see `inFinance`).
 */
export const moneyLock = (p: { closedAt: number | null }) =>
  p.closedAt ? ("project_closed" as const) : null;
/** Money still expected from the client: never from a cancelled project (what it paid stays counted). */
export const stillOwed = () => ne(projects.status, "cancelled");
/** Raw-SQL form of `inFinance` for the alias `p`. */
export const inFinanceSql = (p: string) =>
  sql.raw(`${p}.archived_at IS NULL AND ${p}.external = 0 AND ${p}.status <> 'draft'`);

/** URL of a client's logo (versioned by updated_at so browsers can cache it forever), or "". */
export const logoUrlSql = (c: string) =>
  sql.raw(
    `CASE WHEN ${c}.logo <> '' THEN '/api/clients/' || ${c}.id || '/logo?v=' || ${c}.updated_at ELSE '' END`,
  );

/**
 * Several writes that must all happen or none: one D1 batch in production (atomic, one round
 * trip); a transaction on the test driver, which has no batch.
 */
export async function atomic(db: Db, queries: { run: () => unknown }[]) {
  if (!queries.length) return;
  const d = db as unknown as {
    batch?: (q: unknown[]) => Promise<unknown>;
    transaction?: (fn: () => void) => unknown;
  };
  if (typeof d.batch === "function") await d.batch(queries);
  else if (typeof d.transaction === "function")
    d.transaction(() => {
      for (const q of queries) q.run();
    });
  else for (const q of queries) await q.run();
}
