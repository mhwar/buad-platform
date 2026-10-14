/* ─────────────────────────────────────────────────────────────────────────────
 * Company finance («مالية الشركة»), ported from v1 «مالية المنصة» (app.html):
 *   _pfCalcFull, _pfDistribProfit, _pfRetainedTotals, _pfBankMin, the share split.
 * Amounts in riyals (callers convert halalas). Pure, so it is unit-tested.
 * ──────────────────────────────────────────────────────────────────────────── */

export type CompanyEntryLite = {
  type: "income" | "expense";
  category: string;
  date: string;
  paymentDate?: string;
  amount: number;
};
export type ProjectProfitLite = {
  id: string;
  status: string;
  /** finCalc profit and remainingExec, riyals. */
  profit: number;
  remainingExec: number;
  /** The project's date in time (received → contract → start → first entry). */
  date?: string;
};
export type DistributionLite = {
  status: "draft" | "completed";
  distributed: number;
  retained: number;
  retainedCategory: "ops" | "dev" | "reserve" | null;
};

const within = (d: string | undefined, from?: string, to?: string) =>
  (!from && !to) || (!!d && (!from || d >= from) && (!to || d <= to));
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Only active and completed projects earn (v1: drafts, paused and cancelled do not). */
export const earning = (p: ProjectProfitLite) => p.status === "active" || p.status === "completed";

/**
 * Company result for a period: project profits + service income − company expenses.
 * Income falls in a period by the day it reached the bank (else its date), as in v1.
 * v1 sync leftovers (category project_fee) are never service income.
 */
export function companyCalc(
  projects: ProjectProfitLite[],
  entries: CompanyEntryLite[],
  from?: string,
  to?: string,
) {
  const projectProfit = projects
    .filter((p) => earning(p) && within(p.date, from, to))
    .reduce((s, p) => s + Math.max(0, p.profit), 0);
  const serviceIncome = entries
    .filter(
      (e) =>
        e.type === "income" &&
        e.category !== "project_fee" &&
        within(e.paymentDate || e.date, from, to),
    )
    .reduce((s, e) => s + e.amount, 0);
  const companyExpenses = entries
    .filter((e) => e.type === "expense" && within(e.date, from, to))
    .reduce((s, e) => s + e.amount, 0);
  return {
    projectProfit: r2(projectProfit),
    serviceIncome: r2(serviceIncome),
    companyExpenses: r2(companyExpenses),
    income: r2(projectProfit + serviceIncome),
    netProfit: r2(projectProfit + serviceIncome - companyExpenses),
  };
}

/** What can still be distributed: all-time net profit − completed distributions (v1). */
export function distributable(
  projects: ProjectProfitLite[],
  entries: CompanyEntryLite[],
  dists: DistributionLite[],
) {
  const all = companyCalc(projects, entries);
  const distributed = dists
    .filter((d) => d.status === "completed")
    .reduce((s, d) => s + d.distributed, 0);
  return { ...all, distributed: r2(distributed), available: r2(all.netProfit - distributed) };
}

/** Kept back from completed distributions, by purpose (تشغيل / تطوير / احتياطي). */
export function retainedTotals(dists: DistributionLite[]) {
  const t = { ops: 0, dev: 0, reserve: 0 };
  for (const d of dists)
    if (d.status === "completed" && d.retained > 0)
      t[d.retainedCategory ?? "reserve"] += d.retained;
  return {
    ops: r2(t.ops),
    dev: r2(t.dev),
    reserve: r2(t.reserve),
    total: r2(t.ops + t.dev + t.reserve),
  };
}

/** Money that must stay in the bank: what active projects still need for execution. */
export const bankMinimum = (projects: ProjectProfitLite[]) =>
  r2(
    projects
      .filter((p) => p.status === "active")
      .reduce((s, p) => s + Math.max(0, p.remainingExec), 0),
  );

/**
 * Splits a distributed amount (halalas) by partner share. When the shares make exactly
 * 100%, the halalas lost to rounding go to the largest share so the parts add up exactly.
 */
export function splitShares<P extends { id: string; name: string; sharePct: number }>(
  amountHalalas: number,
  partners: P[],
) {
  const parts = partners.map((p) => ({
    partnerId: p.id,
    partnerName: p.name,
    sharePct: p.sharePct,
    amount: Math.round((amountHalalas * p.sharePct) / 100),
  }));
  const pct = partners.reduce((s, p) => s + p.sharePct, 0);
  if (parts.length && Math.abs(pct - 100) < 0.005) {
    const diff = amountHalalas - parts.reduce((s, p) => s + p.amount, 0);
    const big = parts.reduce((a, b) => (b.sharePct > a.sharePct ? b : a));
    big.amount += diff;
  }
  return parts;
}

/** Distributed and retained parts of an available profit, in halalas (v1 saveDistrib). */
export function splitDistribution(availableHalalas: number, pct: number) {
  const p = Math.min(100, Math.max(0, pct));
  const distributed = Math.max(0, Math.round((availableHalalas * p) / 100));
  const retained = Math.max(0, availableHalalas - distributed);
  return { distributed, retained };
}

/** v1 period presets: the quarters and the year of a given date. */
export function periodRange(type: string, today = new Date()): { from: string; to: string } {
  const y = today.getFullYear();
  const q = Math.floor(today.getMonth() / 3);
  const quarters: [string, string][] = [
    [`${y}-01-01`, `${y}-03-31`],
    [`${y}-04-01`, `${y}-06-30`],
    [`${y}-07-01`, `${y}-09-30`],
    [`${y}-10-01`, `${y}-12-31`],
  ];
  const m: Record<string, [string, string]> = {
    q1: quarters[0] as [string, string],
    q2: quarters[1] as [string, string],
    q3: quarters[2] as [string, string],
    q4: quarters[3] as [string, string],
    annual: [`${y}-01-01`, `${y}-12-31`],
  };
  const [from, to] = m[type] ?? (quarters[q] as [string, string]);
  return { from, to };
}

/** «الربع الأول 2026»… (v1 _pfDistribNext). */
export function periodLabel(type: string, from: string, to: string) {
  const y = from.slice(0, 4);
  const names: Record<string, string> = {
    q1: `الربع الأول ${y}`,
    q2: `الربع الثاني ${y}`,
    q3: `الربع الثالث ${y}`,
    q4: `الربع الرابع ${y}`,
    annual: `سنة ${y}`,
  };
  return names[type] ?? `${from} — ${to}`;
}
