import { realizedProfit, receiptParts } from "@buad/domain";
import { PROJECT_STATUS_LABELS } from "@buad/schema/clients";
import {
  distributionProjects,
  distributions,
  paymentSchedule,
  projectFinance,
  projects,
  salesInvoices,
} from "@buad/schema/db";
import { DEFAULT_CTRL } from "@buad/schema/finance";
import { zValidator } from "@hono/zod-validator";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePerm, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { atomic, nowSec } from "./common";
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

  const pending = await db
    .select({ amount: paymentSchedule.amount })
    .from(paymentSchedule)
    .where(and(eq(paymentSchedule.projectId, project.id), eq(paymentSchedule.status, "pending")));
  const unapproved = fin.receipts.filter((r) => !r.approvedAt);

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
      unapproved: r2(unapproved.reduce((a, r) => a + r.amount / 100, 0)),
    },
    /** Client instalments still waiting to be received. */
    instalments: {
      count: pending.length,
      amount: r2(pending.reduce((a, x) => a + x.amount / 100, 0)),
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

/**
 * Settling the contract at a close or a cancellation: an agreed final value (e.g. only what was
 * collected, when the rest is waived) and/or the instalments still pending set aside. Returns
 * the writes (to run with the status change in one batch) and the audit lines; or an error.
 */
const settleInput = {
  /** Agreed final contract value, VAT included (riyals); omitted = the contract stays. */
  finalValue: z.number().min(0).max(1e10).nullish(),
  cancelInstalments: z.boolean().default(false),
};
type Settle = { finalValue?: number | null; cancelInstalments: boolean };
type Change = { field: string; label: string; before: string; after: string };
const money = (n: number) => `${r2(n).toLocaleString("en")} ر.س`;

async function settlement(
  db: Db,
  me: { id: string; orgId: string },
  project: typeof projects.$inferSelect,
  { finalValue, cancelInstalments }: Settle,
  t: number,
): Promise<{ error: string } | { writes: { run: () => unknown }[]; changes: Change[] }> {
  const writes: { run: () => unknown }[] = [];
  const changes: Change[] = [];
  if (finalValue !== undefined && finalValue !== null) {
    const fin = await loadFinance(db, project);
    if (finalValue + 0.5 < fin.received) return { error: "below_received" };
    const [row] = await db
      .select()
      .from(projectFinance)
      .where(eq(projectFinance.projectId, project.id))
      .limit(1);
    const vatIncluded = row?.vatIncluded ?? DEFAULT_CTRL.vatIncluded;
    const vatPct = row?.vatPct ?? DEFAULT_CTRL.vatPct;
    const gross = Math.round(finalValue * 100);
    const cv = vatIncluded ? gross : Math.round((gross * 100) / (100 + vatPct));
    if (row)
      writes.push(
        db
          .update(projectFinance)
          .set({ contractValue: cv, version: row.version + 1, updatedBy: me.id, updatedAt: t })
          .where(eq(projectFinance.projectId, project.id)),
      );
    else
      writes.push(
        db.insert(projectFinance).values({
          ...DEFAULT_CTRL,
          opCats: "[]",
          contractValue: cv,
          projectId: project.id,
          orgId: me.orgId,
          version: 1,
          createdBy: me.id,
          createdAt: t,
          updatedBy: me.id,
          updatedAt: t,
        }),
      );
    changes.push({
      field: "contractValue",
      label: "القيمة النهائية للعقد",
      before: money(fin.summary.grossTotal),
      after: money(finalValue),
    });
  }
  if (cancelInstalments) {
    const pending = await db
      .select({ id: paymentSchedule.id })
      .from(paymentSchedule)
      .where(and(eq(paymentSchedule.projectId, project.id), eq(paymentSchedule.status, "pending")));
    if (pending.length) {
      writes.push(
        db
          .update(paymentSchedule)
          .set({ status: "cancelled" })
          .where(
            and(eq(paymentSchedule.projectId, project.id), eq(paymentSchedule.status, "pending")),
          ),
      );
      changes.push({
        field: "instalments",
        label: "الدفعات المجدولة",
        before: `${pending.length} معلّقة`,
        after: "أُلغيت",
      });
    }
  }
  return { writes, changes };
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
    zValidator("json", z.object({ note: z.string().trim().max(500).default(""), ...settleInput })),
    async (c) => {
      const db = c.get("db");
      const me = c.get("user");
      const body = c.req.valid("json");
      const project = await loadVisible(db, me, c.req.param("projectId") ?? "");
      if (!project) return c.json({ ok: false, error: "not_found" }, 404);
      if (project.closedAt) return c.json({ ok: false, error: "already_closed" }, 409);
      if (project.external) return c.json({ ok: false, error: "project_external" }, 409);
      const t = nowSec();
      const settle = await settlement(db, me, project, body, t);
      if ("error" in settle) return c.json({ ok: false, error: settle.error }, 409);
      // A cancelled project is closed as it is; anything else is closed as completed.
      const status = project.status === "cancelled" ? "cancelled" : "completed";
      await atomic(db, [
        ...settle.writes,
        db
          .update(projects)
          .set({
            status,
            closedAt: t,
            closedBy: me.id,
            closeNote: body.note,
            updatedBy: me.id,
            updatedAt: t,
          })
          .where(eq(projects.id, project.id)),
      ]);
      c.set("auditChanges", [
        { field: "closed", label: "الإغلاق", before: "مفتوح", after: "مغلق" },
        ...settle.changes,
      ]);
      return c.json({ ok: true, ...(await closeCheck(db, { ...project, closedAt: t })) });
    },
  )
  // «إلغاء المشروع»: the work stops. What was received stays counted; what is still owed is not.
  .post(
    "/cancel",
    zValidator("json", z.object({ reason: z.string().trim().min(3).max(500), ...settleInput })),
    async (c) => {
      const db = c.get("db");
      const me = c.get("user");
      const body = c.req.valid("json");
      const project = await loadVisible(db, me, c.req.param("projectId") ?? "");
      if (!project) return c.json({ ok: false, error: "not_found" }, 404);
      if (project.closedAt) return c.json({ ok: false, error: "project_closed" }, 409);
      if (project.status === "cancelled")
        return c.json({ ok: false, error: "already_cancelled" }, 409);
      const t = nowSec();
      const settle = project.external
        ? { writes: [], changes: [] }
        : await settlement(db, me, project, body, t);
      if ("error" in settle) return c.json({ ok: false, error: settle.error }, 409);
      await atomic(db, [
        ...settle.writes,
        db
          .update(projects)
          .set({ status: "cancelled", updatedBy: me.id, updatedAt: t })
          .where(eq(projects.id, project.id)),
      ]);
      c.set("auditChanges", [
        {
          field: "status",
          label: "إلغاء المشروع",
          before: PROJECT_STATUS_LABELS[project.status],
          after: `ملغي · ${body.reason}`,
        },
        ...settle.changes,
      ]);
      return c.json({ ok: true });
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
