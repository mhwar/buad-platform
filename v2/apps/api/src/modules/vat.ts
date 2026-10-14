import { invoiceGaps, QUARTER_NAMES, quarterRange, receiptParts, vatReturn } from "@buad/domain";
import { clients, orgProfile, orgVatSettings, projects } from "@buad/schema/db";
import { CATEGORY_LABELS } from "@buad/schema/finance";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requireRW, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { nowSec } from "./common";
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
const NOT_PURCHASES = new Set(["salary", "exec", "cashback", "cf", "vat"]);

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
  }[] = [];
  const unidentified: {
    entryId: string;
    projectId: string;
    projectName: string;
    date: string;
    description: string;
    category: string;
    amount: number;
  }[] = [];
  let withoutReceipts = 0;

  for (const { p, clientName } of rows) {
    const fin = await loadFinance(db, p);
    const s = fin.summary;
    if (s.grossTotal > 0 && !fin.receipts.length && p.status !== "draft") withoutReceipts++;
    for (const r of fin.receipts) {
      if (!within(r.date, from, to)) continue;
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
      });
    }
    const catLabel = (cat: string) =>
      CATEGORY_LABELS[cat] ??
      (cat.startsWith("bdg_")
        ? fin.budget.find((b) => `bdg_${b.id}` === cat)?.name || "بند ميزانية"
        : (fin.categories.find((c) => c.id === cat)?.label ?? "أخرى"));
    for (const e of fin.entries) {
      if (e.type !== "expense" || e.status === "cancelled") continue;
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
        });
      } else if (within(e.date, from, to) && e.source === "manual" && !NOT_PURCHASES.has(e.cat)) {
        unidentified.push({
          entryId: e.id,
          projectId: p.id,
          projectName: p.name,
          date: e.date,
          description: e.description,
          category: catLabel(e.cat),
          amount: r2(e.amount / 100),
        });
      }
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
    warnings,
  };
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
  });
