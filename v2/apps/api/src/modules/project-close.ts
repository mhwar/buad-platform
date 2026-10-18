import { realizedProfit, receiptParts } from "@buad/domain";
import { distributionProjects, distributions, projects, salesInvoices } from "@buad/schema/db";
import { zValidator } from "@hono/zod-validator";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePerm, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { nowSec } from "./common";
import { loadFinance } from "./finance";
import { loadVisible } from "./projects";
import { NOT_PURCHASES } from "./vat";

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };
const r2 = (n: number) => Math.round(n * 100) / 100;

export type CloseWarning = { code: string; text: string; count?: number };

/**
 * Everything to look at before a project is closed: its final figures, its VAT, and what still
 * looks unfinished. Warnings only: the owner may close regardless.
 */
export async function closeCheck(db: Db, project: typeof projects.$inferSelect) {
  const fin = await loadFinance(db, project);
  const s = fin.summary;
  const gross = s.grossTotal;
  const received = fin.received;
  const approved = fin.receipts.filter((r) => r.approvedAt);
  const live = fin.entries.filter((e) => e.status !== "cancelled");

  const distributed = (
    await db
      .select({ amount: distributionProjects.amount })
      .from(distributionProjects)
      .innerJoin(distributions, eq(distributions.id, distributionProjects.distributionId))
      .where(
        and(eq(distributionProjects.projectId, project.id), eq(distributions.status, "completed")),
      )
  ).reduce((a, x) => a + x.amount / 100, 0);
  const realized = realizedProfit(s.profit, gross, received);

  const invoices = await db
    .select()
    .from(salesInvoices)
    .where(and(eq(salesInvoices.projectId, project.id), isNull(salesInvoices.archivedAt)));
  const invoiced = invoices.reduce((a, i) => a + i.amount / 100, 0);
  const outputVat = invoices.length
    ? invoices.reduce((a, i) => a + i.vat / 100, 0)
    : approved.reduce(
        (a, r) =>
          a + receiptParts(r.amount / 100, { gross, net: s.contractNet, vat: s.vatAmt }).vat,
        0,
      );
  const purchases = live.filter((e) => e.type === "expense" && e.taxInvoice);
  const inputVat = purchases.reduce((a, e) => a + e.vatAmount / 100, 0);
  const reserved = live
    .filter((e) => e.cat === "cf" && e.cfKind === "vat")
    .reduce((a, e) => a + e.amount / 100, 0);

  const warnings: CloseWarning[] = [];
  const add = (code: string, text: string, count?: number) =>
    (count === undefined || count > 0) && warnings.push({ code, text, count });
  if (gross - received > 0.5)
    add("remaining", `على العميل متبقٍّ ${r2(gross - received).toLocaleString("en")} ر.س لم يُستلم.`);
  add(
    "unapproved_receipts",
    "مقبوضات غير معتمدة لا تُحتسب.",
    fin.receipts.filter((r) => !r.approvedAt).length,
  );
  add(
    "pending_entries",
    "مصروفات أو إيرادات حالتها «معلّقة».",
    live.filter((e) => e.status === "pending").length,
  );
  if (!invoices.length && approved.length)
    add("no_sales_invoice", "لا فاتورة ضريبية مرسلة مسجّلة: الضريبة محسوبة بتواريخ الاستلام.");
  else if (invoices.length && received - invoiced > 1)
    add("invoices_below_receipts", "الفواتير الضريبية المسجّلة أقل مما استُلم.");
  add(
    "purchases_without_invoice",
    "مشتريات بلا فاتورة ضريبية (إن كان لها فاتورة تُخصم ضريبتها).",
    live.filter(
      (e) =>
        e.type === "expense" && !e.taxInvoice && e.source === "manual" && !NOT_PURCHASES.has(e.cat),
    ).length,
  );
  add(
    "cf_undecided",
    "بنود «رسوم إضافية» لم يُحدَّد هل هي ضريبة العقد أم رسوم فعلية.",
    live.filter((e) => e.cat === "cf" && !e.cfKind).length,
  );
  add(
    "vat_as_expense",
    "سداد ضريبة مسجّل كمصروف مشروع.",
    live.filter((e) => e.cat === "vat").length,
  );

  return {
    closed: project.closedAt
      ? { at: project.closedAt, by: project.closedBy, note: project.closeNote }
      : null,
    figures: {
      gross: r2(gross),
      received: r2(received),
      remaining: r2(Math.max(0, gross - received)),
      expenses: r2(s.totalSpent),
      profit: r2(s.profit),
      realized: r2(realized),
      distributed: r2(distributed),
      undistributed: r2(realized - distributed),
      unclassified: r2(s.remainingFromGross),
    },
    vat: {
      outputVat: r2(outputVat),
      inputVat: r2(inputVat),
      net: r2(outputVat - inputVat),
      reserved: r2(reserved),
      invoices: invoices.length,
      source: invoices.length ? "invoices" : "receipts",
    },
    warnings,
  };
}

/** «إغلاق المشروع»: check, close (locks its money records), reopen with a reason. */
export const projectCloseApp = new Hono<Env>()
  .use(requireAuth)
  .use(requirePerm("finance.edit"))
  .get("/", async (c) => {
    const project = await loadVisible(c.get("db"), c.get("user"), c.req.param("projectId") ?? "");
    if (!project) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true, ...(await closeCheck(c.get("db"), project)) });
  })
  .post(
    "/",
    zValidator("json", z.object({ note: z.string().trim().max(500).default("") })),
    async (c) => {
      const db = c.get("db");
      const me = c.get("user");
      const project = await loadVisible(db, me, c.req.param("projectId") ?? "");
      if (!project) return c.json({ ok: false, error: "not_found" }, 404);
      if (project.closedAt) return c.json({ ok: false, error: "already_closed" }, 409);
      const t = nowSec();
      await db
        .update(projects)
        .set({
          status: "completed",
          closedAt: t,
          closedBy: me.id,
          closeNote: c.req.valid("json").note,
          updatedBy: me.id,
          updatedAt: t,
        })
        .where(eq(projects.id, project.id));
      c.set("auditChanges", [
        { field: "closed", label: "الإغلاق", before: "مفتوح", after: "مغلق" },
      ]);
      return c.json({ ok: true, ...(await closeCheck(db, { ...project, closedAt: t })) });
    },
  )
  .post(
    "/reopen",
    zValidator("json", z.object({ reason: z.string().trim().min(3).max(500) })),
    async (c) => {
      const db = c.get("db");
      const me = c.get("user");
      const project = await loadVisible(db, me, c.req.param("projectId") ?? "");
      if (!project) return c.json({ ok: false, error: "not_found" }, 404);
      if (!project.closedAt) return c.json({ ok: false, error: "not_closed" }, 409);
      await db
        .update(projects)
        .set({ closedAt: null, closedBy: "", closeNote: "", updatedBy: me.id, updatedAt: nowSec() })
        .where(eq(projects.id, project.id));
      c.set("auditChanges", [
        {
          field: "closed",
          label: "إعادة الفتح",
          before: "مغلق",
          after: c.req.valid("json").reason,
        },
      ]);
      return c.json({ ok: true });
    },
  );
