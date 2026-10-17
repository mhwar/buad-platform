import {
  filingDueDate,
  fromRiyals,
  invoiceGaps,
  QUARTER_NAMES,
  quarterRange,
  receiptParts,
  vatInsideHalalas,
  vatPeriodKey,
  vatReturn,
} from "@buad/domain";
import { COMPANY_CAT_LABELS } from "@buad/schema/company";
import {
  clients,
  companyEntries,
  financeEntries,
  orgProfile,
  orgVatSettings,
  projectFinance,
  projects,
  salesInvoices,
  vatFilings,
} from "@buad/schema/db";
import { CATEGORY_LABELS } from "@buad/schema/finance";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requireRW, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { atomic, newId, nowSec } from "./common";
import { loadFinance, loadVatRate } from "./finance";

/* ─────────────────────────────────────────────────────────────────────────────
 * VAT («الضريبة»): settings and the quarterly return, from what the platform records.
 *  - sales:     approved receipts, by the day the money arrived, each carrying its share of
 *               its contract's VAT
 *  - purchases: expenses registered with a tax invoice, by the invoice date (else the entry's)
 * Owner and managers only. Amounts in riyals.
 * ──────────────────────────────────────────────────────────────────────────── */

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };

const r2 = (n: number) => Math.round(n * 100) / 100;
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const periodQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  q: z.coerce.number().int().min(1).max(4).optional(),
  from: iso.optional(),
  to: iso.optional(),
});
const within = (d: string, from: string, to: string) => !!d && d >= from && d <= to;

/** Expenses that are not purchases from a supplier: pay, agreement items, fees and tax paid. */
export const NOT_PURCHASES = new Set(["salary", "exec", "cashback", "cf", "vat"]);
/** Company expenses that never carry a supplier's tax invoice. */
const COMPANY_NOT_PURCHASES = new Set(["payroll", "zakat", "gov_fees"]);

export async function vatReport(db: Db, orgId: string, from: string, to: string, label: string) {
  const rows = await db
    .select({ p: projects, clientName: clients.name })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.orgId, orgId), isNull(projects.archivedAt)))
    .orderBy(asc(projects.number));

  const sales: {
    receiptId: string;
    projectId: string;
    number: string;
    name: string;
    clientName: string;
    date: string;
    amount: number;
    base: number;
    vat: number;
    basis: string;
    /** "invoice": a tax invoice issued to the client; "receipt": a payment with no invoice yet. */
    source: "invoice" | "receipt";
    invoiceNo: string;
    invoiceId: string;
  }[] = [];
  const purchases: {
    entryId: string;
    projectId: string;
    projectName: string;
    date: string;
    description: string;
    supplierName: string;
    supplierVatNo: string;
    invoiceNo: string;
    invoiceDate: string;
    amount: number;
    base: number;
    vat: number;
    gaps: string[];
    /** "company": a company purchase (not a project's). */
    owner: "project" | "company";
  }[] = [];
  const unidentified: {
    entryId: string;
    projectId: string;
    projectName: string;
    date: string;
    description: string;
    category: string;
    cat: string;
    amount: number;
    owner: "project" | "company";
  }[] = [];
  let withoutReceipts = 0;
  let invoicesShort = 0;
  let cfUndecided = 0;
  const vatExpenses: {
    entryId: string;
    projectId: string;
    projectName: string;
    date: string;
    description: string;
    amount: number;
  }[] = [];
  let reserved = 0;
  const invoices = await db
    .select()
    .from(salesInvoices)
    .where(and(eq(salesInvoices.orgId, orgId), isNull(salesInvoices.archivedAt)));

  for (const { p, clientName } of rows) {
    const fin = await loadFinance(db, p);
    const s = fin.summary;
    if (s.grossTotal > 0 && !fin.receipts.length && p.status !== "draft") withoutReceipts++;
    // Output VAT follows the tax invoices issued to the client, by their date. A project with
    // none yet falls back to its approved receipts (flagged), so nothing goes missing meanwhile.
    const mine = invoices.filter((i) => i.projectId === p.id);
    if (mine.length) {
      const invoiced = mine.reduce((a, i) => a + i.amount, 0);
      const received = fin.receipts.reduce((a, r) => a + (r.approvedAt ? r.amount : 0), 0);
      if (received > invoiced + 100) invoicesShort++;
      for (const i of mine) {
        if (!within(i.date, from, to)) continue;
        sales.push({
          receiptId: i.receiptId,
          projectId: p.id,
          number: p.number,
          name: p.name,
          clientName,
          date: i.date,
          amount: r2(i.amount / 100),
          base: r2((i.amount - i.vat) / 100),
          vat: r2(i.vat / 100),
          basis: i.note,
          source: "invoice",
          invoiceNo: i.number,
          invoiceId: i.id,
        });
      }
    } else
      for (const r of fin.receipts) {
        if (!r.approvedAt || !within(r.date, from, to)) continue;
        const parts = receiptParts(r.amount / 100, {
          gross: s.grossTotal,
          net: s.contractNet,
          vat: s.vatAmt,
        });
        sales.push({
          receiptId: r.id,
          projectId: p.id,
          number: p.number,
          name: p.name,
          clientName,
          date: r.date,
          amount: r2(r.amount / 100),
          ...parts,
          basis: r.basis,
          source: "receipt",
          invoiceNo: "",
          invoiceId: "",
        });
      }
    const catLabel = (cat: string) =>
      CATEGORY_LABELS[cat] ??
      (cat.startsWith("bdg_")
        ? fin.budget.find((b) => `bdg_${b.id}` === cat)?.name || "بند ميزانية"
        : (fin.categories.find((c) => c.id === cat)?.label ?? "أخرى"));
    for (const e of fin.entries) {
      if (e.type !== "expense" || e.status === "cancelled") continue;
      if (e.cat === "cf" && within(e.date, from, to)) {
        if (e.cfKind === "vat") reserved += e.amount;
        else if (!e.cfKind) cfUndecided++;
      }
      if (e.cat === "vat" && within(e.date, from, to))
        vatExpenses.push({
          entryId: e.id,
          projectId: p.id,
          projectName: p.name,
          date: e.date,
          description: e.description,
          amount: r2(e.amount / 100),
        });
      if (e.taxInvoice) {
        const date = e.invoiceDate || e.date;
        if (!within(date, from, to)) continue;
        purchases.push({
          entryId: e.id,
          projectId: p.id,
          projectName: p.name,
          date,
          description: e.description,
          supplierName: e.supplierName,
          supplierVatNo: e.supplierVatNo,
          invoiceNo: e.invoiceNo,
          invoiceDate: e.invoiceDate,
          amount: r2(e.amount / 100),
          base: r2((e.amount - e.vatAmount) / 100),
          vat: r2(e.vatAmount / 100),
          gaps: invoiceGaps(e),
          owner: "project",
        });
      } else if (within(e.date, from, to) && e.source === "manual" && !NOT_PURCHASES.has(e.cat)) {
        unidentified.push({
          entryId: e.id,
          projectId: p.id,
          projectName: p.name,
          date: e.date,
          description: e.description,
          category: catLabel(e.cat),
          cat: e.cat,
          amount: r2(e.amount / 100),
          owner: "project",
        });
      }
    }
  }
  // The company's own purchases (outside projects): equipment, general purchases…
  const company = await db
    .select()
    .from(companyEntries)
    .where(
      and(
        eq(companyEntries.orgId, orgId),
        eq(companyEntries.type, "expense"),
        isNull(companyEntries.archivedAt),
      ),
    );
  for (const e of company) {
    if (e.taxInvoice) {
      const date = e.invoiceDate || e.date;
      if (!within(date, from, to)) continue;
      purchases.push({
        entryId: e.id,
        projectId: "",
        projectName: "الشركة",
        date,
        description: e.description,
        supplierName: e.supplierName,
        supplierVatNo: e.supplierVatNo,
        invoiceNo: e.invoiceNo,
        invoiceDate: e.invoiceDate,
        amount: r2(e.amount / 100),
        base: r2((e.amount - e.vatAmount) / 100),
        vat: r2(e.vatAmount / 100),
        gaps: invoiceGaps(e),
        owner: "company",
      });
    } else if (within(e.date, from, to) && !COMPANY_NOT_PURCHASES.has(e.category)) {
      unidentified.push({
        entryId: e.id,
        projectId: "",
        projectName: "الشركة",
        date: e.date,
        description: e.description,
        category: COMPANY_CAT_LABELS[e.category] ?? "أخرى",
        cat: e.category,
        amount: r2(e.amount / 100),
        owner: "company",
      });
    }
  }
  sales.sort((a, b) => a.date.localeCompare(b.date));
  purchases.sort((a, b) => a.date.localeCompare(b.date));
  unidentified.sort((a, b) => a.date.localeCompare(b.date));

  const [prof] = await db
    .select({ name: orgProfile.name, tax: orgProfile.tax })
    .from(orgProfile)
    .where(eq(orgProfile.orgId, orgId))
    .limit(1);
  const ret = vatReturn(sales, purchases);
  const warnings: { code: string; count?: number }[] = [];
  if (!prof?.tax) warnings.push({ code: "no_vat_number" });
  if (withoutReceipts) warnings.push({ code: "projects_without_receipts", count: withoutReceipts });
  const incomplete = purchases.filter((x) => x.gaps.length).length;
  if (incomplete) warnings.push({ code: "invoice_incomplete", count: incomplete });
  if (unidentified.length)
    warnings.push({ code: "unidentified_purchases", count: unidentified.length });
  const fromReceipts = sales.filter((x) => x.source === "receipt").length;
  if (fromReceipts) warnings.push({ code: "sales_without_invoice", count: fromReceipts });
  if (invoicesShort) warnings.push({ code: "invoices_below_receipts", count: invoicesShort });
  if (cfUndecided) warnings.push({ code: "cf_undecided", count: cfUndecided });
  if (vatExpenses.length) warnings.push({ code: "vat_as_expense", count: vatExpenses.length });

  return {
    period: { from, to, label },
    rate: await loadVatRate(db, orgId),
    vatNumber: prof?.tax ?? "",
    sales: { rows: sales, ...ret.sales, total: r2(ret.sales.base + ret.sales.vat) },
    purchases: {
      rows: purchases,
      ...ret.purchases,
      total: r2(ret.purchases.base + ret.purchases.vat),
    },
    unidentified: {
      rows: unidentified,
      total: r2(unidentified.reduce((a, x) => a + x.amount, 0)),
    },
    outputVat: ret.outputVat,
    inputVat: ret.inputVat,
    netPayable: ret.netPayable,
    /** The contract VAT already set aside in projects («cf» entries marked as VAT). */
    reserved: r2(reserved / 100),
    /** Tax paid to ZATCA that was booked as a project expense: to move to its return. */
    vatExpenses,
    warnings,
  };
}

const invoiceInput = z.object({
  projectId: z.string().max(64),
  number: z.string().trim().max(60).default(""),
  date: iso,
  /** With VAT, riyals. */
  amount: z.coerce.number().positive().max(1e10),
  /** Left out: worked out from the project's VAT rate. */
  vat: z.coerce.number().min(0).max(1e10).optional(),
  receiptId: z.string().max(64).default(""),
  assetId: z.string().max(64).default(""),
  note: z.string().trim().max(500).default(""),
});

/** The project's VAT rate (15 when its contract terms are not saved), or null if not ours. */
async function projectVatPct(db: Db, orgId: string, projectId: string) {
  const [p] = await db
    .select({ id: projects.id, vatPct: projectFinance.vatPct })
    .from(projects)
    .leftJoin(projectFinance, eq(projectFinance.projectId, projects.id))
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
    .limit(1);
  return p ? (p.vatPct ?? 15) : null;
}

export const vatApp = new Hono<Env>()
  .use(requireAuth)
  .use(requireRW("vat.view", "vat.edit"))

  .get("/settings", async (c) => {
    const db = c.get("db");
    const orgId = c.get("user").orgId;
    const [row] = await db
      .select()
      .from(orgVatSettings)
      .where(eq(orgVatSettings.orgId, orgId))
      .limit(1);
    const [prof] = await db
      .select({ tax: orgProfile.tax })
      .from(orgProfile)
      .where(eq(orgProfile.orgId, orgId))
      .limit(1);
    return c.json({
      ok: true,
      rate: row?.rate ?? 15,
      period: row?.period ?? "quarterly",
      vatNumber: prof?.tax ?? "",
    });
  })

  .patch(
    "/settings",
    zValidator(
      "json",
      z.object({
        rate: z.coerce.number().min(0).max(100),
        period: z.enum(["quarterly", "monthly"]),
      }),
    ),
    async (c) => {
      const me = c.get("user");
      const v = c.req.valid("json");
      await c
        .get("db")
        .insert(orgVatSettings)
        .values({ orgId: me.orgId, ...v, updatedBy: me.id, updatedAt: nowSec() })
        .onConflictDoUpdate({
          target: orgVatSettings.orgId,
          set: { ...v, updatedBy: me.id, updatedAt: nowSec() },
        });
      return c.json({ ok: true });
    },
  )

  .get("/report", zValidator("query", periodQuery), async (c) => {
    const { year, q, from, to } = c.req.valid("query");
    let range: { from: string; to: string };
    let label: string;
    if (year && q) {
      range = quarterRange(year, q);
      label = `${QUARTER_NAMES[q]} ${year}`;
    } else if (year && !from && !to) {
      range = { from: `${year}-01-01`, to: `${year}-12-31` };
      label = `سنة ${year}`;
    } else if (from && to) {
      range = { from, to };
      label = `${from} — ${to}`;
    } else {
      return c.json({ ok: false, error: "period_required" }, 400);
    }
    return c.json({
      ok: true,
      ...(await vatReport(c.get("db"), c.get("user").orgId, range.from, range.to, label)),
    });
  })

  // ── The year at a glance: each quarter's return, its due date and where it stands ──
  .get(
    "/year",
    zValidator("query", z.object({ year: z.coerce.number().int().min(2000).max(2100) })),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("user").orgId;
      const { year } = c.req.valid("query");
      const filings = await db
        .select()
        .from(vatFilings)
        .where(and(eq(vatFilings.orgId, orgId), isNull(vatFilings.archivedAt)));
      const quarters = await Promise.all(
        [1, 2, 3, 4].map(async (q) => {
          const range = quarterRange(year, q);
          const r = await vatReport(db, orgId, range.from, range.to, `${QUARTER_NAMES[q]} ${year}`);
          const key = vatPeriodKey(year, q);
          const f = filings.find((x) => x.periodKey === key);
          return {
            q,
            key,
            label: r.period.label,
            from: range.from,
            to: range.to,
            dueDate: filingDueDate(year, q),
            salesTotal: r.sales.total,
            purchasesTotal: r.purchases.total,
            outputVat: r.outputVat,
            inputVat: r.inputVat,
            netPayable: r.netPayable,
            reserved: r.reserved,
            warnings: r.warnings.length,
            filing: f
              ? {
                  status: f.status,
                  filedOn: f.filedOn,
                  paidOn: f.paidOn,
                  paidAmount: r2(f.paidAmount / 100),
                  reference: f.reference,
                  note: f.note,
                  net: r2(f.net / 100),
                }
              : null,
          };
        }),
      );
      const sum = (k: "outputVat" | "inputVat" | "netPayable" | "reserved") =>
        r2(quarters.reduce((a, x) => a + x[k], 0));
      const paid = r2(quarters.reduce((a, x) => a + (x.filing?.paidAmount ?? 0), 0));
      return c.json({
        ok: true,
        year,
        quarters,
        totals: {
          outputVat: sum("outputVat"),
          inputVat: sum("inputVat"),
          netPayable: sum("netPayable"),
          reserved: sum("reserved"),
          paid,
          /** Still owed to ZATCA for the year (negative = a credit). */
          balance: r2(sum("netPayable") - paid),
        },
      });
    },
  )

  // ── A return filed, then paid: a settlement with ZATCA, never an expense ──────────
  .put(
    "/filings/:key",
    zValidator(
      "json",
      z.object({
        status: z.enum(["open", "filed", "paid"]),
        filedOn: z.union([iso, z.literal("")]).default(""),
        paidOn: z.union([iso, z.literal("")]).default(""),
        paidAmount: z.coerce.number().min(0).max(1e10).default(0),
        reference: z.string().trim().max(120).default(""),
        note: z.string().trim().max(500).default(""),
      }),
    ),
    async (c) => {
      const db = c.get("db");
      const me = c.get("user");
      const key = c.req.param("key");
      const m = /^(\d{4})-Q([1-4])$/.exec(key);
      if (!m) return c.json({ ok: false, error: "bad_period" }, 400);
      const v = c.req.valid("json");
      const range = quarterRange(Number(m[1]), Number(m[2]));
      // The figures as they stand when it is filed, kept even if entries change later.
      const r = await vatReport(db, me.orgId, range.from, range.to, key);
      const t = nowSec();
      const values = {
        status: v.status,
        filedOn: v.filedOn,
        paidOn: v.paidOn,
        paidAmount: fromRiyals(v.paidAmount),
        reference: v.reference,
        note: v.note,
        outputVat: fromRiyals(r.outputVat),
        inputVat: fromRiyals(r.inputVat),
        net: fromRiyals(r.netPayable),
        updatedBy: me.id,
        updatedAt: t,
      };
      await db
        .insert(vatFilings)
        .values({
          id: newId("vfl"),
          orgId: me.orgId,
          periodKey: key,
          ...values,
          createdBy: me.id,
          createdAt: t,
        })
        .onConflictDoUpdate({ target: [vatFilings.orgId, vatFilings.periodKey], set: values });
      return c.json({ ok: true });
    },
  )

  // ── Tax paid to ZATCA that was booked as a project expense: moved to its return ──
  .post(
    "/convert-entry",
    zValidator(
      "json",
      z.object({
        projectId: z.string().max(64),
        entryId: z.string().max(64),
        periodKey: z.string().regex(/^\d{4}-Q[1-4]$/),
      }),
    ),
    async (c) => {
      const db = c.get("db");
      const me = c.get("user");
      const v = c.req.valid("json");
      const [e] = await db
        .select()
        .from(financeEntries)
        .where(
          and(
            eq(financeEntries.id, v.entryId),
            eq(financeEntries.projectId, v.projectId),
            eq(financeEntries.orgId, me.orgId),
          ),
        )
        .limit(1);
      if (!e || e.cat !== "vat" || e.status === "cancelled")
        return c.json({ ok: false, error: "not_found" }, 404);
      const [f] = await db
        .select()
        .from(vatFilings)
        .where(and(eq(vatFilings.orgId, me.orgId), eq(vatFilings.periodKey, v.periodKey)))
        .limit(1);
      const t = nowSec();
      await atomic(db, [
        db
          .update(financeEntries)
          .set({
            status: "cancelled",
            note: `${e.note ? `${e.note} · ` : ""}نُقل إلى سداد ضريبة ${v.periodKey}`,
            updatedBy: me.id,
            updatedAt: t,
          })
          .where(eq(financeEntries.id, e.id)),
        f
          ? db
              .update(vatFilings)
              .set({
                status: "paid",
                paidAmount: f.paidAmount + e.amount,
                paidOn: f.paidOn || e.date,
                updatedBy: me.id,
                updatedAt: t,
              })
              .where(eq(vatFilings.id, f.id))
          : db.insert(vatFilings).values({
              id: newId("vfl"),
              orgId: me.orgId,
              periodKey: v.periodKey,
              status: "paid",
              paidAmount: e.amount,
              paidOn: e.date,
              createdBy: me.id,
              createdAt: t,
              updatedBy: me.id,
              updatedAt: t,
            }),
      ]);
      return c.json({ ok: true });
    },
  )

  // ── Tax invoices issued to clients (output VAT by their date) ─────────────────────
  .get("/invoices", zValidator("query", z.object({ projectId: z.string().max(64) })), async (c) => {
    const rows = await c
      .get("db")
      .select()
      .from(salesInvoices)
      .where(
        and(
          eq(salesInvoices.orgId, c.get("user").orgId),
          eq(salesInvoices.projectId, c.req.valid("query").projectId),
          isNull(salesInvoices.archivedAt),
        ),
      )
      .orderBy(asc(salesInvoices.date));
    return c.json({
      ok: true,
      items: rows.map((i) => ({ ...i, amount: r2(i.amount / 100), vat: r2(i.vat / 100) })),
    });
  })
  .post("/invoices", zValidator("json", invoiceInput), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const v = c.req.valid("json");
    const vatPct = await projectVatPct(db, me.orgId, v.projectId);
    if (vatPct === null) return c.json({ ok: false, error: "not_found" }, 404);
    const amount = fromRiyals(v.amount);
    const id = newId("sin");
    const t = nowSec();
    await db.insert(salesInvoices).values({
      id,
      orgId: me.orgId,
      projectId: v.projectId,
      receiptId: v.receiptId,
      number: v.number,
      date: v.date,
      amount,
      vat:
        v.vat !== undefined
          ? Math.min(fromRiyals(v.vat), amount)
          : vatInsideHalalas(amount, vatPct),
      assetId: v.assetId,
      note: v.note,
      createdBy: me.id,
      createdAt: t,
      updatedBy: me.id,
      updatedAt: t,
    });
    return c.json({ ok: true, id }, 201);
  })
  .patch("/invoices/:id", zValidator("json", invoiceInput), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const v = c.req.valid("json");
    const vatPct = await projectVatPct(db, me.orgId, v.projectId);
    if (vatPct === null) return c.json({ ok: false, error: "not_found" }, 404);
    const amount = fromRiyals(v.amount);
    const upd = await db
      .update(salesInvoices)
      .set({
        receiptId: v.receiptId,
        number: v.number,
        date: v.date,
        amount,
        vat:
          v.vat !== undefined
            ? Math.min(fromRiyals(v.vat), amount)
            : vatInsideHalalas(amount, vatPct),
        assetId: v.assetId,
        note: v.note,
        updatedBy: me.id,
        updatedAt: nowSec(),
      })
      .where(and(eq(salesInvoices.id, c.req.param("id")), eq(salesInvoices.orgId, me.orgId)))
      .returning({ id: salesInvoices.id });
    return upd.length ? c.json({ ok: true }) : c.json({ ok: false, error: "not_found" }, 404);
  })
  .delete("/invoices/:id", async (c) => {
    const me = c.get("user");
    const upd = await c
      .get("db")
      .update(salesInvoices)
      .set({ archivedAt: nowSec(), updatedBy: me.id, updatedAt: nowSec() })
      .where(and(eq(salesInvoices.id, c.req.param("id")), eq(salesInvoices.orgId, me.orgId)))
      .returning({ id: salesInvoices.id });
    return upd.length ? c.json({ ok: true }) : c.json({ ok: false, error: "not_found" }, 404);
  });
