import { REVIEW_FLAGS, reviewFlags } from "@buad/domain";
import { zValidator } from "@hono/zod-validator";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePerm, type Vars } from "../auth/middleware";
import { contractTotalSql } from "./common";
import { platformMetric } from "./plans";

/* ─────────────────────────────────────────────────────────────────────────────
 * «مراجعة السنة»: the year's revenue against its target, and every project that needs a look
 * before the number can be trusted (finished but still owed, fully paid but still open…).
 * Revenue is the plan's own measure — approved receipts with VAT plus the company's income —
 * so this page and the plan's indicator always show the same figure. Amounts in riyals.
 * ──────────────────────────────────────────────────────────────────────────── */

const query = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() });
const riyals = (h: number) => Math.round(Number(h ?? 0)) / 100;

type Row = {
  id: string;
  number: string;
  name: string;
  status: string;
  clientId: string;
  clientName: string;
  contractDate: string;
  startDate: string;
  estimated: number;
  gross: number;
  received: number;
  receivedYear: number;
  lastReceipt: string | null;
  overdueLines: number;
  pendingLines: number;
};

export const yearReviewApp = new Hono<{ Variables: Vars }>()
  .use(requireAuth)
  .use(requirePerm("treasury.view"))
  .get("/", zValidator("query", query), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const today = new Date().toISOString().slice(0, 10);
    const year = c.req.valid("query").year ?? Number(today.slice(0, 4));
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;

    const rows = (await db.all(sql`
      SELECT p.id, p.number, p.name, p.status, c.id AS clientId, c.name AS clientName,
        COALESCE(f.contract_date, '') AS contractDate, p.start_date AS startDate,
        (f.project_id IS NULL) AS estimated,
        ${contractTotalSql("p")} AS gross,
        (SELECT COALESCE(SUM(r.amount_halalas), 0) FROM project_receipts r
          WHERE r.project_id = p.id AND r.approved_at IS NOT NULL) AS received,
        (SELECT COALESCE(SUM(r.amount_halalas), 0) FROM project_receipts r
          WHERE r.project_id = p.id AND r.approved_at IS NOT NULL
            AND r.date >= ${start} AND r.date <= ${end}) AS receivedYear,
        (SELECT MAX(r.date) FROM project_receipts r
          WHERE r.project_id = p.id AND r.approved_at IS NOT NULL) AS lastReceipt,
        (SELECT COUNT(*) FROM payment_schedule s
          WHERE s.project_id = p.id AND s.status = 'pending' AND s.due_date < ${today}) AS overdueLines,
        (SELECT COUNT(*) FROM payment_schedule s
          WHERE s.project_id = p.id AND s.status = 'pending') AS pendingLines
      FROM projects p
      JOIN clients c ON c.id = p.client_id
      LEFT JOIN project_finance f ON f.project_id = p.id
      WHERE p.org_id = ${me.orgId} AND p.archived_at IS NULL AND p.status <> 'draft'
      ORDER BY p.number`)) as Row[];

    // A project belongs to the year by its contract (else start) date, by money it brought in
    // that year, or because it is still running.
    const items = rows
      .filter((r) => {
        const d = r.contractDate || r.startDate;
        return (
          d.slice(0, 4) === String(year) ||
          Number(r.receivedYear) !== 0 ||
          r.status === "active" ||
          r.status === "paused"
        );
      })
      .map((r) => {
        const gross = Number(r.gross);
        const received = Number(r.received);
        const flags = reviewFlags({
          status: r.status,
          gross,
          received,
          estimated: !!Number(r.estimated),
          overdueLines: Number(r.overdueLines),
        });
        return {
          id: r.id,
          number: r.number,
          name: r.name,
          status: r.status,
          clientId: r.clientId,
          clientName: r.clientName,
          contractDate: r.contractDate,
          startDate: r.startDate,
          estimated: !!Number(r.estimated),
          gross: riyals(gross),
          received: riyals(received),
          receivedYear: riyals(Number(r.receivedYear)),
          remaining: riyals(Math.max(0, gross - received)),
          lastReceipt: r.lastReceipt ?? "",
          overdueLines: Number(r.overdueLines),
          pendingLines: Number(r.pendingLines),
          flags,
        };
      });

    // The same measure as the plan's «الإيرادات المحصّلة» indicator.
    const revenue = await platformMetric(db, me.orgId, "revenue", start, end);
    const receipts = (await db.get(sql`
      SELECT COALESCE(SUM(r.amount_halalas), 0) AS gross,
        COALESCE(SUM(ROUND(r.amount_halalas * COALESCE(f.vat_pct, 15) / (100.0 + COALESCE(f.vat_pct, 15)))), 0) AS vat
      FROM project_receipts r LEFT JOIN project_finance f ON f.project_id = r.project_id
      WHERE r.org_id = ${me.orgId} AND r.approved_at IS NOT NULL
        AND r.date >= ${start} AND r.date <= ${end}`)) as
      | { gross: number; vat: number }
      | undefined;
    const projectReceipts = riyals(Number(receipts?.gross));
    const target = (await db.get(sql`
      SELECT MAX(i.target) AS t FROM plan_indicators i
      JOIN plan_objectives o ON o.id = i.objective_id
      JOIN plan_cycles y ON y.id = o.cycle_id
      WHERE i.org_id = ${me.orgId} AND i.source = 'platform:revenue' AND o.quarter = 0
        AND substr(y.start_date, 1, 4) = ${String(year)}`)) as { t: number | null } | undefined;

    const sum = (pick: (i: (typeof items)[number]) => number) =>
      Math.round(items.reduce((s, i) => s + pick(i), 0) * 100) / 100;
    const counts = Object.fromEntries(
      REVIEW_FLAGS.map((f) => [f, items.filter((i) => i.flags.includes(f)).length]),
    );
    return c.json({
      ok: true,
      year,
      totals: {
        revenue,
        target: target?.t ?? null,
        projectReceipts,
        receiptsVat: riyals(Number(receipts?.vat)),
        companyIncome: Math.round((revenue - projectReceipts) * 100) / 100,
        // Owed on finished projects: most likely money that came in and was never recorded.
        unrecorded: sum((i) => (i.status === "completed" ? i.remaining : 0)),
        // Still to collect on running projects.
        collecting: sum((i) => (i.status === "active" || i.status === "paused" ? i.remaining : 0)),
      },
      counts,
      items,
    });
  });
