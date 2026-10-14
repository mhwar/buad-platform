import { clients, projects } from "@buad/schema/db";
import { CATEGORY_LABELS } from "@buad/schema/finance";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requireRole, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { loadFinance } from "./finance";
import { loadOrgProfile } from "./org";

/* ─────────────────────────────────────────────────────────────────────────────
 * «المالية»: the organisation's finance in one place (owner / admins).
 * Every number comes from each project's own finance (the same finCalc the project page
 * shows), so the dashboard and the project pages always agree.
 *  - a project belongs to the period by its contract date (else start date, else creation)
 *  - entries (monthly movement, categories, pending) belong to it by their own date
 * Amounts are riyals, rounded to the halala.
 * ──────────────────────────────────────────────────────────────────────────── */

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };

const r2 = (n: number) => Math.round(n * 100) / 100;
const iso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();
const periodQuery = z.object({ from: iso, to: iso });
/** With no period everything counts; with one, an undated item cannot be placed in it. */
const inRange = (d: string, from?: string, to?: string) =>
  (!from && !to) || (!!d && (!from || d >= from) && (!to || d <= to));

/** Agreement items that the contract defines but finance has not registered yet. */
const AGREEMENT = [
  { cat: "exec", label: "أتعاب التنفيذ", key: "execAmt" },
  { cat: "mkt", label: "التسويق", key: "mkt" },
  { cat: "cashback", label: "كاش باك", key: "cb" },
  { cat: "cf", label: "رسوم إضافية", key: "cfAmt" },
] as const;

type ProjectRow = {
  id: string;
  number: string;
  name: string;
  clientId: string;
  clientName: string;
  status: string;
  date: string;
  hasFinance: boolean;
  gross: number;
  net: number;
  vat: number;
  profit: number;
  margin: number;
  spent: number;
  income: number;
  remaining: number;
};

export async function financeOverview(db: Db, orgId: string, from?: string, to?: string) {
  const rows = await db
    .select({ p: projects, clientName: clients.name })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.orgId, orgId), isNull(projects.archivedAt)))
    .orderBy(asc(projects.number));

  const list: ProjectRow[] = [];
  const quality: {
    projectId: string;
    number: string;
    name: string;
    missingContractDate: boolean;
    ctrlVersion: number;
    entriesWithoutStatus: number;
  }[] = [];
  const months = new Map<string, { expense: number; income: number }>();
  const cats = new Map<string, number>();
  const pending: {
    projectId: string;
    projectName: string;
    date: string;
    description: string;
    type: string;
    amount: number;
  }[] = [];
  const unregistered: { projectId: string; projectName: string; item: string; amount: number }[] =
    [];

  for (const { p, clientName } of rows) {
    const fin = await loadFinance(db, p);
    const s = fin.summary;
    const hasFinance = fin.ctrl.version > 0 || fin.entries.length > 0;
    // The project's date in time: money received (v1 «تاريخ الاستلام»), else the contract,
    // else the start, else its first entry. Never the date it was created or imported.
    const firstEntry = fin.entries
      .map((e) => e.date)
      .filter(Boolean)
      .sort()[0];
    const date = p.payDate || fin.ctrl.contractDate || p.startDate || firstEntry || "";
    const noStatus = fin.entries.filter((e) => e.status === "").length;
    if (!fin.ctrl.contractDate || noStatus)
      quality.push({
        projectId: p.id,
        number: p.number,
        name: p.name,
        missingContractDate: !fin.ctrl.contractDate,
        ctrlVersion: fin.ctrl.version,
        entriesWithoutStatus: noStatus,
      });

    // Entries by their own date (cancelled ones never count).
    for (const e of fin.entries) {
      if (e.status === "cancelled" || !inRange(e.date, from, to)) continue;
      const amount = e.amount / 100;
      const m = e.date.slice(0, 7);
      const cur = months.get(m) ?? { expense: 0, income: 0 };
      if (e.type === "expense") cur.expense += amount;
      else cur.income += amount;
      months.set(m, cur);
      if (e.type === "expense") {
        const label =
          CATEGORY_LABELS[e.cat] ??
          (e.cat.startsWith("bdg_")
            ? fin.budget.find((b) => `bdg_${b.id}` === e.cat)?.name || "بند ميزانية"
            : (fin.categories.find((c) => c.id === e.cat)?.label ?? "أخرى"));
        cats.set(label, (cats.get(label) ?? 0) + amount);
      }
      if (e.status === "pending")
        pending.push({
          projectId: p.id,
          projectName: p.name,
          date: e.date,
          description: e.description,
          type: e.type,
          amount: r2(amount),
        });
    }

    if (!inRange(date, from, to)) continue;
    const registered = new Set(fin.entries.map((e) => e.cat));
    if (hasFinance)
      for (const a of AGREEMENT) {
        const amount = s[a.key];
        if (amount > 0 && !registered.has(a.cat))
          unregistered.push({
            projectId: p.id,
            projectName: p.name,
            item: a.label,
            amount: r2(amount),
          });
      }
    list.push({
      id: p.id,
      number: p.number,
      name: p.name,
      clientId: p.clientId,
      clientName,
      status: p.status,
      date,
      hasFinance,
      gross: r2(s.grossTotal),
      net: r2(s.contractNet),
      vat: r2(s.vatAmt),
      profit: r2(s.profit),
      margin: s.grossTotal ? r2((s.profit / s.grossTotal) * 100) : 0,
      spent: r2(s.totalSpent),
      income: r2(s.totalIncome),
      remaining: r2(s.remainingFromGross),
    });
  }

  const sum = (k: "gross" | "net" | "vat" | "profit" | "spent" | "income" | "remaining") =>
    r2(list.reduce((a, x) => a + x[k], 0));
  const totals = {
    gross: sum("gross"),
    net: sum("net"),
    vat: sum("vat"),
    profit: sum("profit"),
    spent: sum("spent"),
    income: sum("income"),
    remaining: sum("remaining"),
    margin: 0,
    projects: list.length,
    withoutFinance: list.filter((x) => !x.hasFinance).length,
    pending: r2(pending.reduce((a, x) => a + x.amount, 0)),
    unregistered: r2(unregistered.reduce((a, x) => a + x.amount, 0)),
  };
  totals.margin = totals.gross ? r2((totals.profit / totals.gross) * 100) : 0;

  const byClient = new Map<
    string,
    { id: string; name: string; projects: number; gross: number; profit: number }
  >();
  for (const x of list) {
    const c = byClient.get(x.clientId) ?? {
      id: x.clientId,
      name: x.clientName,
      projects: 0,
      gross: 0,
      profit: 0,
    };
    c.projects += 1;
    c.gross = r2(c.gross + x.gross);
    c.profit = r2(c.profit + x.profit);
    byClient.set(x.clientId, c);
  }

  return {
    period: { from: from ?? "", to: to ?? "" },
    totals,
    projects: list,
    clients: [...byClient.values()].sort((a, b) => b.gross - a.gross),
    monthly: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, expense: r2(v.expense), income: r2(v.income) })),
    categories: [...cats.entries()]
      .map(([label, amount]) => ({ label, amount: r2(amount) }))
      .sort((a, b) => b.amount - a.amount),
    obligations: {
      pending: pending.sort((a, b) => a.date.localeCompare(b.date)),
      unregistered,
    },
    /** Data to complete so periods and statuses are right. */
    quality,
  };
}

export const financeOverviewApp = new Hono<Env>()
  .use(requireAuth)
  .use(requireRole("owner", "admin"))
  .get("/overview", zValidator("query", periodQuery), async (c) => {
    const { from, to } = c.req.valid("query");
    return c.json({
      ok: true,
      ...(await financeOverview(c.get("db"), c.get("user").orgId, from, to)),
    });
  })
  .get("/report", zValidator("query", periodQuery), async (c) => {
    const { from, to } = c.req.valid("query");
    const db = c.get("db");
    const orgId = c.get("user").orgId;
    const org = await loadOrgProfile(db, orgId);
    return c.json({
      ok: true,
      ...(await financeOverview(db, orgId, from, to)),
      org: { name: org.name, reg: org.reg, tax: org.tax, urls: org.urls },
      generatedAt: Math.floor(Date.now() / 1000),
    });
  });
