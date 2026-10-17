import {
  bankMinimum,
  type CompanyEntryLite,
  companyCalc,
  type DistributionLite,
  distributable,
  fromRiyals,
  type ProjectProfitLite,
  periodLabel,
  profitBalances,
  QUARTER_NAMES,
  quarterDistributable,
  quarterLabelOf,
  quarterRange,
  quarterView,
  type RealizedProject,
  type ReceiptLite,
  realizedProfit,
  receiptWarnings,
  receivedUpTo,
  retainedTotals,
  splitDistribution,
  splitShares,
  suggestReceipt,
} from "@buad/domain";
import { companyEntryInput, distributionInput, partnerInput } from "@buad/schema/company";
import {
  clients,
  companyEntries,
  distributionProjects,
  distributionShares,
  distributions,
  partners,
  projectReceipts,
  projects,
} from "@buad/schema/db";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requireRW, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { atomic, newId, nowSec } from "./common";
import { loadFinance, loadVatRate, taxInvoiceColumns } from "./finance";
import { projectDate } from "./finance-overview";

/* ─────────────────────────────────────────────────────────────────────────────
 * «مالية الشركة» (v1 «مالية المنصة»): company income and expenses, partners, and profit
 * distributions. Owner and managers only. Money is stored in halalas, returned in riyals.
 * ──────────────────────────────────────────────────────────────────────────── */

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };
const riyals = (h: number) => h / 100;
const periodQuery = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** Every live project with what the company calculations need (each from its own finCalc). */
export async function projectFigures(db: Db, orgId: string) {
  const rows = await db
    .select({ p: projects, clientName: clients.name })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.orgId, orgId), isNull(projects.archivedAt)))
    .orderBy(asc(projects.number));
  const out: (ProjectProfitLite &
    RealizedProject & { number: string; name: string; clientName: string })[] = [];
  for (const { p, clientName } of rows) {
    const fin = await loadFinance(db, p);
    out.push({
      id: p.id,
      number: p.number,
      name: p.name,
      clientName,
      status: p.status,
      profit: fin.summary.profit,
      remainingExec: fin.summary.remainingExec,
      date: projectDate(p, fin),
      gross: fin.summary.grossTotal,
      hasFinance: fin.ctrl.version > 0 || fin.entries.length > 0,
      unregistered: fin.summary.missingItems.length > 0,
      pendingExpenses: fin.summary.pendingExpenses,
      closed: !!p.closedAt,
    });
  }
  return out;
}

async function liveEntries(db: Db, orgId: string) {
  return db
    .select()
    .from(companyEntries)
    .where(and(eq(companyEntries.orgId, orgId), isNull(companyEntries.archivedAt)))
    .orderBy(desc(companyEntries.date), desc(companyEntries.createdAt));
}
const lite = (e: typeof companyEntries.$inferSelect): CompanyEntryLite => ({
  type: e.type,
  category: e.category,
  date: e.date,
  paymentDate: e.paymentDate,
  amount: riyals(e.amount),
});
const distLite = (d: typeof distributions.$inferSelect): DistributionLite => ({
  status: d.status,
  distributed: riyals(d.distributedAmount),
  retained: riyals(d.retainedAmount),
  retainedCategory: d.retainedCategory,
});

async function livePartners(db: Db, orgId: string) {
  return db
    .select()
    .from(partners)
    .where(and(eq(partners.orgId, orgId), isNull(partners.archivedAt)))
    .orderBy(desc(partners.sharePct), asc(partners.name));
}

/** Partners' shares must add up to exactly 100% before any profit leaves the company. */
const sharesTotal = async (db: Db, orgId: string, without = "") =>
  (await livePartners(db, orgId))
    .filter((p) => p.id !== without)
    .reduce((s, p) => s + p.sharePct, 0);
const sharesOk = (total: number) => Math.abs(total - 100) < 0.011;

async function orgReceipts(db: Db, orgId: string): Promise<ReceiptLite[]> {
  const rows = await db
    .select({
      projectId: projectReceipts.projectId,
      date: projectReceipts.date,
      amount: projectReceipts.amount,
    })
    .from(projectReceipts)
    // Only approved receipts are money the company can count on (and distribute).
    .where(and(eq(projectReceipts.orgId, orgId), isNotNull(projectReceipts.approvedAt)));
  return rows.map((r) => ({ ...r, amount: riyals(r.amount) }));
}

/** What completed distributions already paid out of each project (riyals). */
async function distributedByProject(db: Db, orgId: string) {
  const rows = await db
    .select({ projectId: distributionProjects.projectId, amount: distributionProjects.amount })
    .from(distributionProjects)
    .innerJoin(distributions, eq(distributions.id, distributionProjects.distributionId))
    .where(and(eq(distributions.orgId, orgId), eq(distributions.status, "completed")));
  const out: Record<string, number> = {};
  for (const r of rows) out[r.projectId] = (out[r.projectId] ?? 0) + riyals(r.amount);
  return out;
}

/** The quarter centre: realized profit per project, the quarter's company result, warnings. */
export async function quarterData(db: Db, orgId: string, year: number, q: number) {
  const { from, to } = quarterRange(year, q);
  const figs = await projectFigures(db, orgId);
  const receipts = await orgReceipts(db, orgId);
  const paid = await distributedByProject(db, orgId);
  const view = quarterView(figs, receipts, paid, from, to);
  const entries = (await liveEntries(db, orgId)).map(lite);
  const company = companyCalc([], entries, from, to);
  return {
    year,
    q,
    from,
    to,
    label: `${QUARTER_NAMES[q]} ${year}`,
    ...view,
    company: { income: company.serviceIncome, expenses: company.companyExpenses },
  };
}

/** The amounts a distribution would have now (also what is saved: the server decides). */
async function computeDistribution(
  db: Db,
  orgId: string,
  input: z.output<typeof distributionInput>,
) {
  const figs = await projectFigures(db, orgId);
  const entries = (await liveEntries(db, orgId)).map(lite);
  const dists = await db.select().from(distributions).where(eq(distributions.orgId, orgId));
  let net: number;
  let grossIncome: number;
  let grossExpenses: number;
  let label = input.label;
  let perProject: { projectId: string; amount: number }[] = [];
  let range = { from: input.from, to: input.to };
  if (input.mode === "manual") {
    // A past distribution by what was actually paid: taken from one project, or spread over a
    // quarter's projects by what each still had to distribute (the rest counts as company net).
    if (!input.amount) return null;
    net = input.amount;
    if (input.projectId) {
      const p = figs.find((f) => f.id === input.projectId);
      if (!p) return null;
      perProject = [{ projectId: p.id, amount: net }];
      label ||= `توزيع سابق: ${p.name}`;
    } else if (input.year && input.q) {
      const qd = await quarterData(db, orgId, input.year, input.q);
      const open = qd.rows.filter((r) => r.available > 0);
      const total = open.reduce((a, r) => a + r.available, 0);
      const fromProjects = Math.min(net, total);
      perProject = open.map((r) => ({
        projectId: r.id,
        amount: Math.round((r.available / total) * fromProjects * 100) / 100,
      }));
      label ||= `توزيع سابق: ${qd.label}`;
      range = { from: qd.from, to: qd.to };
    } else return null;
    grossIncome = net;
    grossExpenses = 0;
  } else if (input.mode === "quarter") {
    if (!input.year || !input.q) return null;
    const qd = await quarterData(db, orgId, input.year, input.q);
    const d = quarterDistributable(
      qd.rows,
      input.projectIds,
      qd.company.income,
      qd.company.expenses,
    );
    net = d.total;
    grossIncome = d.projects + qd.company.income;
    grossExpenses = qd.company.expenses - d.carried;
    perProject = d.perProject;
    label ||= qd.label;
    range = { from: qd.from, to: qd.to };
  } else if (input.mode === "project") {
    // One project's realized profit that was not distributed yet (never twice).
    const p = figs.find((f) => f.id === input.projectId);
    if (!p) return null;
    const receipts = await orgReceipts(db, orgId);
    const paid = (await distributedByProject(db, orgId))[p.id] ?? 0;
    const realized = realizedProfit(p.profit, p.gross, receivedUpTo(receipts, p.id));
    net = Math.max(0, realized - paid);
    grossIncome = net;
    grossExpenses = 0;
    perProject = net > 0 ? [{ projectId: p.id, amount: net }] : [];
    label ||= `أرباح مشروع: ${p.name}`;
  } else {
    // Everything realized and not yet settled, project by project, plus the company's own net
    // that earlier distributions have not covered yet. The same money is never distributed twice.
    const receipts = await orgReceipts(db, orgId);
    const paid = await distributedByProject(db, orgId);
    for (const p of figs) {
      if (p.status === "cancelled") continue;
      const left =
        realizedProfit(p.profit, p.gross, receivedUpTo(receipts, p.id)) - (paid[p.id] ?? 0);
      if (left > 0) perProject.push({ projectId: p.id, amount: Math.round(left * 100) / 100 });
    }
    const projectsPart = perProject.reduce((a, x) => a + x.amount, 0);
    const company = companyCalc([], entries);
    const done = dists.filter((d) => d.status === "completed");
    const coveredByProjects = Object.values(paid).reduce((a, x) => a + x, 0);
    const companyCovered = done.reduce((a, d) => a + riyals(d.netProfit), 0) - coveredByProjects;
    const companyLeft = company.serviceIncome - company.companyExpenses - companyCovered;
    net = projectsPart + companyLeft;
    grossIncome = projectsPart + company.serviceIncome;
    grossExpenses = company.companyExpenses + companyCovered;
    label ||= periodLabel(input.periodType, input.from, input.to);
  }
  const netH = Math.max(0, fromRiyals(net));
  const { distributed, retained } = splitDistribution(netH, input.pct);
  const people = await livePartners(db, orgId);
  return {
    label,
    range,
    perProject,
    grossIncome: fromRiyals(Math.max(0, grossIncome)),
    grossExpenses: fromRiyals(Math.max(0, grossExpenses)),
    netProfit: netH,
    distributed,
    retained,
    shares: splitShares(distributed, people),
    sharesPct: people.reduce((s, p) => s + p.sharePct, 0),
  };
}

const viewDistribution = (
  d: typeof distributions.$inferSelect,
  shares: (typeof distributionShares.$inferSelect)[],
) => ({
  id: d.id,
  periodType: d.periodType,
  periodLabel: d.periodLabel,
  from: d.fromDate,
  to: d.toDate,
  grossIncome: riyals(d.grossIncome),
  grossExpenses: riyals(d.grossExpenses),
  netProfit: riyals(d.netProfit),
  pct: d.distributionPct,
  distributed: riyals(d.distributedAmount),
  retained: riyals(d.retainedAmount),
  retainedCategory: d.retainedCategory,
  projectIds: JSON.parse(d.projectIds) as string[],
  projectId: d.projectId,
  status: d.status,
  note: d.note,
  createdAt: d.createdAt,
  completedAt: d.completedAt,
  paidOn: d.paidOn,
  shares: shares
    .filter((s) => s.distributionId === d.id)
    .map((s) => ({
      partnerId: s.partnerId,
      partnerName: s.partnerName,
      sharePct: s.sharePct,
      amount: riyals(s.amount),
      paidOn: s.paidOn,
      paidRef: s.paidRef,
    })),
});

export const companyFinanceApp = new Hono<Env>()
  .use(requireAuth)
  .use(requireRW("treasury.view", "treasury.edit"))

  .get("/overview", zValidator("query", periodQuery), async (c) => {
    const db = c.get("db");
    const orgId = c.get("user").orgId;
    const { from, to } = c.req.valid("query");
    const figs = await projectFigures(db, orgId);
    const rows = await liveEntries(db, orgId);
    const entries = rows.map(lite);
    const dists = (await db.select().from(distributions).where(eq(distributions.orgId, orgId))).map(
      distLite,
    );
    const months = new Map<string, { income: number; expense: number }>();
    for (const e of entries) {
      const d = e.type === "income" ? e.paymentDate || e.date : e.date;
      if (!d || (from && d < from) || (to && d > to)) continue;
      if (e.type === "income" && e.category === "project_fee") continue;
      const m = months.get(d.slice(0, 7)) ?? { income: 0, expense: 0 };
      if (e.type === "income") m.income += e.amount;
      else m.expense += e.amount;
      months.set(d.slice(0, 7), m);
    }
    const ps = await livePartners(db, orgId);
    return c.json({
      ok: true,
      period: { from: from ?? "", to: to ?? "" },
      calc: companyCalc(figs, entries, from, to),
      allTime: distributable(figs, entries, dists),
      retained: retainedTotals(dists),
      bankMinimum: bankMinimum(figs),
      monthly: [...months.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({
          month,
          income: Math.round(v.income * 100) / 100,
          expense: Math.round(v.expense * 100) / 100,
        })),
      projects: figs.map((f) => ({
        ...f,
        earning: f.status === "active" || f.status === "completed",
      })),
      partnersPct: ps.reduce((s, p) => s + p.sharePct, 0),
    });
  })

  // ── «توزيع الربع»: realized profit of a quarter, per project ─────────────────
  .get(
    "/quarter",
    zValidator(
      "query",
      z.object({
        year: z.coerce.number().int().min(2000).max(2100),
        q: z.coerce.number().int().min(1).max(4),
      }),
    ),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("user").orgId;
      const { year, q } = c.req.valid("query");
      const d = await quarterData(db, orgId, year, q);
      const dists = (
        await db.select().from(distributions).where(eq(distributions.orgId, orgId))
      ).map(distLite);
      const ps = await livePartners(db, orgId);
      return c.json({
        ok: true,
        ...d,
        retained: retainedTotals(dists),
        partnersPct: ps.reduce((s, p) => s + p.sharePct, 0),
        // Chosen by default: projects with profit realized and not yet distributed.
        defaultSelected: d.rows.filter((r) => r.available > 0).map((r) => r.id),
      });
    },
  )

  // ── Proposed receipts: a date and amount worked out from the old platform's data, for a
  //    person to verify and approve. Nothing is stored until they do. ───────────────────
  .get("/receipt-suggestions", async (c) => {
    const db = c.get("db");
    const orgId = c.get("user").orgId;
    const rows = await db
      .select({ p: projects, clientName: clients.name })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(and(eq(projects.orgId, orgId), isNull(projects.archivedAt)))
      .orderBy(asc(projects.number));
    const today = new Date().toISOString().slice(0, 10);
    const items = [];
    for (const { p, clientName } of rows) {
      if (p.status === "draft") continue;
      const fin = await loadFinance(db, p);
      const gross = fin.summary.grossTotal;
      if (gross <= 0 || fin.receipts.length) continue;
      const execIncome = fin.entries
        .filter(
          (e) => e.cat === "exec" && e.type === "income" && e.status !== "cancelled" && e.date,
        )
        .map((e) => e.date)
        .sort()[0];
      const sug = suggestReceipt({
        payDate: p.payDate,
        execIncomeDate: execIncome,
        contractDate: fin.ctrl.contractDate,
        startDate: p.startDate,
      });
      items.push({
        projectId: p.id,
        number: p.number,
        name: p.name,
        clientName,
        status: p.status,
        gross: Math.round(gross * 100) / 100,
        contractDate: fin.ctrl.contractDate,
        suggestion: sug && {
          ...sug,
          quarter: quarterLabelOf(sug.date),
          warnings: receiptWarnings(sug.date, fin.ctrl.contractDate, today),
        },
      });
    }
    return c.json({ ok: true, items });
  })

  // ── Company income and expenses ─────────────────────────────────────────
  .get(
    "/entries",
    zValidator("query", z.object({ archived: z.enum(["0", "1"]).optional() })),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("user").orgId;
      const archived = c.req.valid("query").archived === "1";
      const rows = await db
        .select()
        .from(companyEntries)
        .where(
          and(
            eq(companyEntries.orgId, orgId),
            archived ? isNotNull(companyEntries.archivedAt) : isNull(companyEntries.archivedAt),
          ),
        )
        .orderBy(desc(companyEntries.date), desc(companyEntries.createdAt));
      return c.json({ ok: true, items: rows.map((e) => ({ ...e, amount: riyals(e.amount) })) });
    },
  )
  .post("/entries", zValidator("json", companyEntryInput), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const v = c.req.valid("json");
    const id = newId("cen");
    const t = nowSec();
    await db.insert(companyEntries).values({
      id,
      orgId: me.orgId,
      type: v.type,
      category: v.category,
      date: v.date || new Date().toISOString().slice(0, 10),
      paymentDate: v.type === "income" ? v.paymentDate : "",
      description: v.description,
      amount: fromRiyals(v.amount),
      note: v.note,
      ...(v.type === "expense"
        ? taxInvoiceColumns(v.taxInvoice, fromRiyals(v.amount), await loadVatRate(db, me.orgId))
        : {}),
      createdBy: me.id,
      createdAt: t,
      updatedBy: me.id,
      updatedAt: t,
    });
    return c.json({ ok: true, id }, 201);
  })
  .patch("/entries/:id", zValidator("json", companyEntryInput), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const v = c.req.valid("json");
    const upd = await db
      .update(companyEntries)
      .set({
        type: v.type,
        category: v.category,
        date: v.date,
        paymentDate: v.type === "income" ? v.paymentDate : "",
        description: v.description,
        amount: fromRiyals(v.amount),
        note: v.note,
        // Left out = unchanged; null = no invoice any more.
        ...(v.taxInvoice !== undefined
          ? taxInvoiceColumns(
              v.type === "expense" ? v.taxInvoice : null,
              fromRiyals(v.amount),
              await loadVatRate(db, me.orgId),
            )
          : {}),
        updatedBy: me.id,
        updatedAt: nowSec(),
      })
      .where(and(eq(companyEntries.id, c.req.param("id")), eq(companyEntries.orgId, me.orgId)))
      .returning({ id: companyEntries.id });
    if (!upd.length) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true });
  })
  // Deleting keeps the row (restorable): money records are never lost by a click.
  .delete("/entries/:id", async (c) => {
    const me = c.get("user");
    const upd = await c
      .get("db")
      .update(companyEntries)
      .set({ archivedAt: nowSec(), updatedBy: me.id, updatedAt: nowSec() })
      .where(and(eq(companyEntries.id, c.req.param("id")), eq(companyEntries.orgId, me.orgId)))
      .returning({ id: companyEntries.id });
    return upd.length ? c.json({ ok: true }) : c.json({ ok: false, error: "not_found" }, 404);
  })
  .post("/entries/:id/restore", async (c) => {
    const me = c.get("user");
    const upd = await c
      .get("db")
      .update(companyEntries)
      .set({ archivedAt: null, updatedBy: me.id, updatedAt: nowSec() })
      .where(and(eq(companyEntries.id, c.req.param("id")), eq(companyEntries.orgId, me.orgId)))
      .returning({ id: companyEntries.id });
    return upd.length ? c.json({ ok: true }) : c.json({ ok: false, error: "not_found" }, 404);
  })

  // ── Where the profit stands: realized − settled = undistributed ────────────────────
  .get("/balances", async (c) => {
    const db = c.get("db");
    const orgId = c.get("user").orgId;
    const figs = await projectFigures(db, orgId);
    const receipts = await orgReceipts(db, orgId);
    const company = companyCalc([], (await liveEntries(db, orgId)).map(lite));
    const done = (
      await db
        .select()
        .from(distributions)
        .where(and(eq(distributions.orgId, orgId), eq(distributions.status, "completed")))
    ).map(distLite);
    const b = profitBalances({
      projects: figs,
      receipts,
      companyIncome: company.serviceIncome,
      companyExpenses: company.companyExpenses,
      settled: done.map((d) => ({
        netProfit: d.distributed + d.retained,
        distributed: d.distributed,
        retained: d.retained,
      })),
    });
    const unpaid = (
      await db
        .select({ amount: distributions.distributedAmount })
        .from(distributions)
        .where(
          and(
            eq(distributions.orgId, orgId),
            eq(distributions.status, "completed"),
            eq(distributions.paidOn, ""),
          ),
        )
    ).reduce((a, x) => a + riyals(x.amount), 0);
    return c.json({
      ok: true,
      ...b,
      retainedBy: retainedTotals(done),
      /** Approved distributions not paid to the partners yet. */
      approvedUnpaid: Math.round(unpaid * 100) / 100,
    });
  })

  // An approved distribution paid out: the date (and a reference) for every partner.
  .post(
    "/distributions/:id/pay",
    zValidator(
      "json",
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        ref: z.string().trim().max(120).default(""),
      }),
    ),
    async (c) => {
      const db = c.get("db");
      const me = c.get("user");
      const v = c.req.valid("json");
      const [d] = await db
        .select()
        .from(distributions)
        .where(and(eq(distributions.id, c.req.param("id")), eq(distributions.orgId, me.orgId)))
        .limit(1);
      if (!d) return c.json({ ok: false, error: "not_found" }, 404);
      if (d.status !== "completed") return c.json({ ok: false, error: "not_approved" }, 409);
      await atomic(db, [
        db
          .update(distributions)
          .set({ paidOn: v.date, paidBy: me.id, updatedBy: me.id, updatedAt: nowSec() })
          .where(eq(distributions.id, d.id)),
        db
          .update(distributionShares)
          .set({ paidOn: v.date, paidRef: v.ref })
          .where(eq(distributionShares.distributionId, d.id)),
      ]);
      return c.json({ ok: true });
    },
  )

  // ── Partners ─────────────────────────────────────────────────────────────
  .get("/partners", async (c) => {
    const items = await livePartners(c.get("db"), c.get("user").orgId);
    return c.json({ ok: true, items, totalPct: items.reduce((s, p) => s + p.sharePct, 0) });
  })
  .post("/partners", zValidator("json", partnerInput), async (c) => {
    const me = c.get("user");
    const v = c.req.valid("json");
    const others = await sharesTotal(c.get("db"), me.orgId);
    if (others + v.sharePct > 100.011)
      return c.json({ ok: false, error: "shares_over_100", total: others + v.sharePct }, 409);
    const id = newId("prt");
    await c
      .get("db")
      .insert(partners)
      .values({ id, orgId: me.orgId, ...v, createdBy: me.id, updatedBy: me.id });
    return c.json({ ok: true, id }, 201);
  })
  .patch("/partners/:id", zValidator("json", partnerInput), async (c) => {
    const me = c.get("user");
    const v = c.req.valid("json");
    const others = await sharesTotal(c.get("db"), me.orgId, c.req.param("id"));
    if (others + v.sharePct > 100.011)
      return c.json({ ok: false, error: "shares_over_100", total: others + v.sharePct }, 409);
    const upd = await c
      .get("db")
      .update(partners)
      .set({ ...v, updatedBy: me.id, updatedAt: nowSec() })
      .where(and(eq(partners.id, c.req.param("id")), eq(partners.orgId, me.orgId)))
      .returning({ id: partners.id });
    return upd.length ? c.json({ ok: true }) : c.json({ ok: false, error: "not_found" }, 404);
  })
  // Past distributions keep the partner's name and share (copied at completion).
  .delete("/partners/:id", async (c) => {
    const me = c.get("user");
    const upd = await c
      .get("db")
      .update(partners)
      .set({ archivedAt: nowSec(), updatedBy: me.id, updatedAt: nowSec() })
      .where(and(eq(partners.id, c.req.param("id")), eq(partners.orgId, me.orgId)))
      .returning({ id: partners.id });
    return upd.length ? c.json({ ok: true }) : c.json({ ok: false, error: "not_found" }, 404);
  })

  // ── Distributions ────────────────────────────────────────────────────────
  .get("/distributions", async (c) => {
    const db = c.get("db");
    const orgId = c.get("user").orgId;
    const rows = await db
      .select()
      .from(distributions)
      .where(eq(distributions.orgId, orgId))
      .orderBy(desc(distributions.createdAt));
    const shares = rows.length
      ? await db
          .select()
          .from(distributionShares)
          .where(
            inArray(
              distributionShares.distributionId,
              rows.map((r) => r.id),
            ),
          )
      : [];
    return c.json({ ok: true, items: rows.map((d) => viewDistribution(d, shares)) });
  })
  .post("/distributions/preview", zValidator("json", distributionInput), async (c) => {
    const r = await computeDistribution(c.get("db"), c.get("user").orgId, c.req.valid("json"));
    if (!r) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({
      ok: true,
      ...r,
      grossIncome: riyals(r.grossIncome),
      grossExpenses: riyals(r.grossExpenses),
      netProfit: riyals(r.netProfit),
      distributed: riyals(r.distributed),
      retained: riyals(r.retained),
      shares: r.shares.map((s) => ({ ...s, amount: riyals(s.amount) })),
    });
  })
  .post(
    "/distributions",
    zValidator("json", distributionInput.extend({ status: z.enum(["draft", "completed"]) })),
    async (c) => {
      const db = c.get("db");
      const me = c.get("user");
      const v = c.req.valid("json");
      if (
        (v.status === "completed" || v.mode === "manual") &&
        !sharesOk(await sharesTotal(db, me.orgId))
      )
        return c.json({ ok: false, error: "shares_not_100" }, 409);
      const r = await computeDistribution(db, me.orgId, v);
      if (!r) return c.json({ ok: false, error: "not_found" }, 404);
      if (r.netProfit <= 0) return c.json({ ok: false, error: "nothing_to_distribute" }, 409);
      const id = newId("dst");
      const t = nowSec();
      // The distribution, what it takes from each project and each partner's share: all or none.
      const writes: { run: () => unknown }[] = [
        db.insert(distributions).values({
          id,
          orgId: me.orgId,
          periodType:
            v.mode === "project" || (v.mode === "manual" && v.projectId)
              ? "project"
              : v.mode === "quarter" || v.mode === "manual"
                ? `q${v.q}`
                : v.periodType,
          periodLabel: r.label,
          fromDate: r.range.from,
          toDate: r.range.to,
          grossIncome: r.grossIncome,
          grossExpenses: r.grossExpenses,
          netProfit: r.netProfit,
          distributionPct: v.pct,
          distributedAmount: r.distributed,
          retainedAmount: r.retained,
          retainedCategory: r.retained > 0 ? v.retainedCategory : null,
          projectIds: JSON.stringify(
            v.mode === "project" ? [v.projectId] : r.perProject.map((x) => x.projectId),
          ),
          projectId: v.mode === "project" ? v.projectId : "",
          // A past distribution is recorded as it happened: approved and paid.
          status: v.mode === "manual" ? "completed" : v.status,
          note: v.note,
          completedAt: v.status === "completed" || v.mode === "manual" ? t : null,
          paidOn: v.mode === "manual" ? v.paidOn : "",
          paidBy: v.mode === "manual" ? me.id : "",
          createdBy: me.id,
          createdAt: t,
          updatedBy: me.id,
          updatedAt: t,
        }),
      ];
      // What this distribution takes out of each project's realized profit.
      if (r.perProject.length)
        writes.push(
          db.insert(distributionProjects).values(
            r.perProject.map((x) => ({
              id: newId("dpr"),
              distributionId: id,
              projectId: x.projectId,
              amount: Math.sign(x.amount) * fromRiyals(Math.abs(x.amount)),
            })),
          ),
        );
      if (r.shares.length)
        writes.push(
          db.insert(distributionShares).values(
            r.shares.map((s) => ({
              id: newId("dsh"),
              distributionId: id,
              partnerId: s.partnerId,
              partnerName: s.partnerName,
              sharePct: s.sharePct,
              amount: s.amount,
              paidOn: v.mode === "manual" ? v.paidOn : "",
              paidRef: v.mode === "manual" ? v.paidRef : "",
            })),
          ),
        );
      await atomic(db, writes);
      return c.json({ ok: true, id }, 201);
    },
  )
  // A draft is confirmed as it was prepared; completed ones are frozen. A draft whose
  // projects were paid by another distribution meanwhile is refused (never pay twice).
  .post("/distributions/:id/complete", async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    if (!sharesOk(await sharesTotal(db, me.orgId)))
      return c.json({ ok: false, error: "shares_not_100" }, 409);
    const mine = await db
      .select({ projectId: distributionProjects.projectId, amount: distributionProjects.amount })
      .from(distributionProjects)
      .where(eq(distributionProjects.distributionId, c.req.param("id")));
    if (mine.length) {
      const receipts = await orgReceipts(db, me.orgId);
      const paid = await distributedByProject(db, me.orgId);
      const figs = await projectFigures(db, me.orgId);
      for (const m of mine) {
        if (m.amount <= 0) continue;
        const f = figs.find((x) => x.id === m.projectId);
        const left = f
          ? realizedProfit(f.profit, f.gross, receivedUpTo(receipts, f.id)) - (paid[f.id] ?? 0)
          : 0;
        if (riyals(m.amount) - left > 0.01)
          return c.json({ ok: false, error: "stale_draft", projectId: m.projectId }, 409);
      }
    }
    const upd = await db
      .update(distributions)
      .set({ status: "completed", completedAt: nowSec(), updatedBy: me.id, updatedAt: nowSec() })
      .where(
        and(
          eq(distributions.id, c.req.param("id")),
          eq(distributions.orgId, me.orgId),
          eq(distributions.status, "draft"),
        ),
      )
      .returning({ id: distributions.id });
    return upd.length ? c.json({ ok: true }) : c.json({ ok: false, error: "not_draft" }, 409);
  })
  .delete("/distributions/:id", async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const [d] = await db
      .select()
      .from(distributions)
      .where(and(eq(distributions.id, c.req.param("id")), eq(distributions.orgId, me.orgId)))
      .limit(1);
    if (!d) return c.json({ ok: false, error: "not_found" }, 404);
    if (d.status !== "draft") return c.json({ ok: false, error: "completed_locked" }, 409);
    await db.delete(distributionShares).where(eq(distributionShares.distributionId, d.id));
    await db.delete(distributionProjects).where(eq(distributionProjects.distributionId, d.id));
    await db.delete(distributions).where(eq(distributions.id, d.id));
    return c.json({ ok: true });
  });
