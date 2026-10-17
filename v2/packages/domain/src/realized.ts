/* ─────────────────────────────────────────────────────────────────────────────
 * Realized profit: a project's profit counts when its money is received.
 * Received a share of the contract → that share of the profit is realized (instalments,
 * refunds as negative receipts). What a completed distribution paid out of a project is
 * remembered, so the same profit is never distributed twice; if the profit later drops
 * below what was paid, the project's available amount goes negative and is carried.
 * Amounts in riyals. Pure.
 * ──────────────────────────────────────────────────────────────────────────── */

export type ReceiptLite = { projectId: string; date: string; amount: number };
export type RealizedProject = {
  id: string;
  number: string;
  name: string;
  status: string;
  /** finCalc profit and contract value incl. VAT. */
  profit: number;
  gross: number;
  hasFinance: boolean;
  /** Agreement items computed but not registered (profit is an estimate). */
  unregistered: boolean;
  pendingExpenses: number;
  /** Financially closed («إغلاق المشروع»): its profit is final and ready to distribute. */
  closed?: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The day before an ISO date (for "up to the start of the period"). */
export function dayBefore(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const receivedUpTo = (receipts: ReceiptLite[], projectId: string, upTo?: string) =>
  receipts
    .filter((r) => r.projectId === projectId && (!upTo || r.date <= upTo))
    .reduce((s, r) => s + r.amount, 0);

/** Profit realized by the money received up to a date (capped at the whole profit). */
export function realizedProfit(profit: number, gross: number, received: number) {
  if (gross <= 0 || profit <= 0 || received <= 0) return 0;
  return r2(Math.max(0, profit) * Math.min(1, received / gross));
}

export type QuarterRow = RealizedProject & {
  receivedInPeriod: number;
  receivedToDate: number;
  realizedInPeriod: number;
  realizedToDate: number;
  distributed: number;
  /** realizedToDate − distributed: what may still be distributed (negative = paid too much). */
  available: number;
  flags: (
    | "no_receipts"
    | "over_distributed"
    | "estimate"
    | "pending_expenses"
    | "cancelled"
    | "inactive"
  )[];
};

/**
 * One period (usually a quarter) of realized profit, project by project.
 * Realized "to date" means up to the period's end: receipts after it wait for their own period.
 */
export function quarterView(
  projects: RealizedProject[],
  receipts: ReceiptLite[],
  distributed: Record<string, number>,
  from: string,
  to: string,
) {
  const rows: QuarterRow[] = projects.map((p) => {
    const toDate = receivedUpTo(receipts, p.id, to);
    const before = receivedUpTo(receipts, p.id, dayBefore(from));
    const realizedToDate = realizedProfit(p.profit, p.gross, toDate);
    const realizedBefore = realizedProfit(p.profit, p.gross, before);
    const paid = r2(distributed[p.id] ?? 0);
    const flags: QuarterRow["flags"] = [];
    if (p.gross > 0 && !receipts.some((r) => r.projectId === p.id)) flags.push("no_receipts");
    if (realizedToDate - paid < -0.005) flags.push("over_distributed");
    if (!p.hasFinance || p.unregistered) flags.push("estimate");
    if (p.pendingExpenses > 0) flags.push("pending_expenses");
    if (p.status === "cancelled") flags.push("cancelled");
    if (p.status === "draft" || p.status === "paused") flags.push("inactive");
    return {
      ...p,
      receivedInPeriod: r2(toDate - before),
      receivedToDate: r2(toDate),
      realizedInPeriod: r2(realizedToDate - realizedBefore),
      realizedToDate,
      distributed: paid,
      available: r2(realizedToDate - paid),
      flags,
    };
  });
  const sum = (k: "receivedInPeriod" | "realizedInPeriod" | "available") =>
    r2(rows.reduce((s, r) => s + r[k], 0));
  return {
    rows,
    totals: {
      receivedInPeriod: sum("receivedInPeriod"),
      realizedInPeriod: sum("realizedInPeriod"),
      available: sum("available"),
      positive: r2(rows.filter((r) => r.available > 0).reduce((s, r) => s + r.available, 0)),
      carried: r2(rows.filter((r) => r.available < 0).reduce((s, r) => s + r.available, 0)),
    },
  };
}

/**
 * What a quarter distribution may pay: the chosen projects' positive available amounts,
 * minus every over-distributed project (always carried, chosen or not), plus the quarter's
 * company income, minus its company expenses.
 */
export function quarterDistributable(
  rows: Pick<QuarterRow, "id" | "available">[],
  selected: string[],
  companyIncome: number,
  companyExpenses: number,
) {
  const chosen = rows.filter((r) => selected.includes(r.id) && r.available > 0);
  const projects = chosen.reduce((s, r) => s + r.available, 0);
  const carried = rows.filter((r) => r.available < 0).reduce((s, r) => s + r.available, 0);
  return {
    projects: r2(projects),
    carried: r2(carried),
    companyNet: r2(companyIncome - companyExpenses),
    total: r2(projects + carried + companyIncome - companyExpenses),
    /** Per project, what this distribution takes (positive chosen + every negative carry). */
    perProject: [
      ...chosen.map((r) => ({ projectId: r.id, amount: r.available })),
      ...rows.filter((r) => r.available < 0).map((r) => ({ projectId: r.id, amount: r.available })),
    ],
  };
}

/** "2026-08-14" → { year: 2026, q: 3 }. */
export function quarterOf(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return { year: y ?? 0, q: Math.floor(((m ?? 1) - 1) / 3) + 1 };
}
export function quarterRange(year: number, q: number) {
  const startM = (q - 1) * 3 + 1;
  const endM = startM + 2;
  const last = new Date(Date.UTC(year, endM, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { from: `${year}-${pad(startM)}-01`, to: `${year}-${pad(endM)}-${pad(last)}` };
}
export function previousQuarter(year: number, q: number) {
  return q === 1 ? { year: year - 1, q: 4 } : { year, q: q - 1 };
}
export const QUARTER_NAMES = ["", "الربع الأول", "الربع الثاني", "الربع الثالث", "الربع الرابع"];

export type SettledDistribution = {
  /** What it covered: distributed + retained. */
  netProfit: number;
  distributed: number;
  retained: number;
};

/**
 * Where the company's profit stands, from the start: realized by approved receipts, plus the
 * company's own net, less what completed distributions settled (paid out or retained). What is
 * left is «أرباح غير موزّعة». Cancelled projects realize nothing.
 */
export function profitBalances(input: {
  projects: { id: string; status: string; profit: number; gross: number }[];
  receipts: ReceiptLite[];
  companyIncome: number;
  companyExpenses: number;
  settled: SettledDistribution[];
}) {
  const realized = r2(
    input.projects
      .filter((p) => p.status !== "cancelled")
      .reduce(
        (s, p) => s + realizedProfit(p.profit, p.gross, receivedUpTo(input.receipts, p.id)),
        0,
      ),
  );
  const companyNet = r2(input.companyIncome - input.companyExpenses);
  const distributed = r2(input.settled.reduce((s, d) => s + d.distributed, 0));
  const retained = r2(input.settled.reduce((s, d) => s + d.retained, 0));
  const settled = r2(input.settled.reduce((s, d) => s + d.netProfit, 0));
  return {
    realized,
    companyNet,
    distributed,
    retained,
    undistributed: r2(realized + companyNet - settled),
  };
}
