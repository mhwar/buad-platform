import {
  bankMinimum,
  type CompanyEntryLite,
  companyCalc,
  type DistributionLite,
  distributable,
  fromRiyals,
  type ProjectProfitLite,
  periodLabel,
  retainedTotals,
  splitDistribution,
  splitShares,
} from "@buad/domain";
import { companyEntryInput, distributionInput, partnerInput } from "@buad/schema/company";
import {
  clients,
  companyEntries,
  distributionShares,
  distributions,
  partners,
  projects,
} from "@buad/schema/db";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requireRole, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { newId, nowSec } from "./common";
import { loadFinance } from "./finance";
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
  const out: (ProjectProfitLite & { number: string; name: string; clientName: string })[] = [];
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
  if (input.mode === "project") {
    const p = figs.find((f) => f.id === input.projectId);
    if (!p) return null;
    net = Math.max(0, p.profit);
    grossIncome = net;
    grossExpenses = 0;
    label ||= `أرباح مشروع: ${p.name}`;
  } else {
    const d = distributable(figs, entries, dists.map(distLite));
    net = d.available;
    grossIncome = d.income;
    grossExpenses = d.companyExpenses;
    label ||= periodLabel(input.periodType, input.from, input.to);
  }
  const netH = Math.max(0, fromRiyals(net));
  const { distributed, retained } = splitDistribution(netH, input.pct);
  const people = await livePartners(db, orgId);
  return {
    label,
    grossIncome: fromRiyals(grossIncome),
    grossExpenses: fromRiyals(grossExpenses),
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
  shares: shares
    .filter((s) => s.distributionId === d.id)
    .map((s) => ({
      partnerId: s.partnerId,
      partnerName: s.partnerName,
      sharePct: s.sharePct,
      amount: riyals(s.amount),
    })),
});

export const companyFinanceApp = new Hono<Env>()
  .use(requireAuth)
  .use(requireRole("owner", "admin"))

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

  // ── Partners ─────────────────────────────────────────────────────────────
  .get("/partners", async (c) => {
    const items = await livePartners(c.get("db"), c.get("user").orgId);
    return c.json({ ok: true, items, totalPct: items.reduce((s, p) => s + p.sharePct, 0) });
  })
  .post("/partners", zValidator("json", partnerInput), async (c) => {
    const me = c.get("user");
    const v = c.req.valid("json");
    const id = newId("prt");
    await c
      .get("db")
      .insert(partners)
      .values({ id, orgId: me.orgId, ...v, createdBy: me.id, updatedBy: me.id });
    return c.json({ ok: true, id }, 201);
  })
  .patch("/partners/:id", zValidator("json", partnerInput), async (c) => {
    const me = c.get("user");
    const upd = await c
      .get("db")
      .update(partners)
      .set({ ...c.req.valid("json"), updatedBy: me.id, updatedAt: nowSec() })
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
      const r = await computeDistribution(db, me.orgId, v);
      if (!r) return c.json({ ok: false, error: "not_found" }, 404);
      if (r.netProfit <= 0) return c.json({ ok: false, error: "nothing_to_distribute" }, 409);
      const id = newId("dst");
      const t = nowSec();
      await db.insert(distributions).values({
        id,
        orgId: me.orgId,
        periodType: v.mode === "project" ? "project" : v.periodType,
        periodLabel: r.label,
        fromDate: v.from,
        toDate: v.to,
        grossIncome: r.grossIncome,
        grossExpenses: r.grossExpenses,
        netProfit: r.netProfit,
        distributionPct: v.pct,
        distributedAmount: r.distributed,
        retainedAmount: r.retained,
        retainedCategory: r.retained > 0 ? v.retainedCategory : null,
        projectIds: JSON.stringify(v.mode === "project" ? [v.projectId] : v.projectIds),
        projectId: v.mode === "project" ? v.projectId : "",
        status: v.status,
        note: v.note,
        completedAt: v.status === "completed" ? t : null,
        createdBy: me.id,
        createdAt: t,
        updatedBy: me.id,
        updatedAt: t,
      });
      if (r.shares.length)
        await db.insert(distributionShares).values(
          r.shares.map((s) => ({
            id: newId("dsh"),
            distributionId: id,
            partnerId: s.partnerId,
            partnerName: s.partnerName,
            sharePct: s.sharePct,
            amount: s.amount,
          })),
        );
      return c.json({ ok: true, id }, 201);
    },
  )
  // A draft is confirmed as it was prepared; completed ones are frozen.
  .post("/distributions/:id/complete", async (c) => {
    const me = c.get("user");
    const upd = await c
      .get("db")
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
    await db.delete(distributions).where(eq(distributions.id, d.id));
    return c.json({ ok: true });
  });
