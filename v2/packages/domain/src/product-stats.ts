import { realizedProfit } from "./realized";

/* ─────────────────────────────────────────────────────────────────────────────
 * What a service (product) has actually done: its projects, entities, packages, money and
 * requests. Pure; amounts in riyals. Insights are deterministic rules that return a code and
 * parameters (the UI words them), never guesses.
 * ──────────────────────────────────────────────────────────────────────────── */

export type StatProject = {
  id: string;
  clientId: string;
  clientName: string;
  status: string;
  packageId: string;
  /** Contract before VAT and with VAT. */
  contractNet: number;
  gross: number;
  received: number;
  expenses: number;
  /** finCalc profit. */
  profit: number;
  /** ISO date the project started (or "" when unknown). */
  startDate: string;
};
export type StatRequest = { status: string; createdAt: number };

export type PackageStat = {
  packageId: string;
  name: string;
  projects: number;
  contractNet: number;
  profit: number;
  marginPct: number;
  /** Share of all projects, in percent. */
  share: number;
};
export type Insight =
  | { code: "no_projects" }
  | { code: "top_package"; name: string; share: number }
  | { code: "margin_below_plan"; gap: number }
  | { code: "margin_above_plan"; gap: number }
  | { code: "repeat_entities"; count: number }
  | { code: "no_package"; count: number }
  | { code: "losing_projects"; count: number }
  | { code: "stale_requests"; count: number }
  | { code: "low_conversion"; pct: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (a: number, b: number) => (b > 0 ? r2((a / b) * 100) : 0);
const DAY = 86400;

export const quarterKey = (iso: string) => {
  if (!/^\d{4}-\d{2}/.test(iso)) return "";
  const m = Number(iso.slice(5, 7));
  return `${iso.slice(0, 4)}-Q${Math.ceil(m / 3)}`;
};

export function productStats(input: {
  projects: StatProject[];
  requests: StatRequest[];
  /** Planned margin from the pricing model (percent of price), or null when it has none. */
  plannedMarginPct: number | null;
  packageNames: Record<string, string>;
  /** Epoch seconds "now" (a parameter so tests are deterministic). */
  now: number;
}) {
  const { projects: ps, requests, plannedMarginPct, packageNames, now } = input;
  const sum = (f: (p: StatProject) => number) => ps.reduce((a, p) => a + f(p), 0);
  const contractNet = r2(sum((p) => p.contractNet));
  const profit = r2(sum((p) => p.profit));

  const byEntity = new Map<
    string,
    { clientId: string; name: string; projects: number; contractNet: number }
  >();
  for (const p of ps) {
    const e = byEntity.get(p.clientId) ?? {
      clientId: p.clientId,
      name: p.clientName,
      projects: 0,
      contractNet: 0,
    };
    e.projects++;
    e.contractNet = r2(e.contractNet + p.contractNet);
    byEntity.set(p.clientId, e);
  }
  const entities = [...byEntity.values()].sort(
    (a, b) =>
      b.projects - a.projects || b.contractNet - a.contractNet || a.name.localeCompare(b.name),
  );

  const byPkg = new Map<string, StatProject[]>();
  for (const p of ps) byPkg.set(p.packageId, [...(byPkg.get(p.packageId) ?? []), p]);
  const packages: PackageStat[] = [...byPkg.entries()]
    .map(([packageId, list]) => {
      const net = r2(list.reduce((a, p) => a + p.contractNet, 0));
      const pr = r2(list.reduce((a, p) => a + p.profit, 0));
      return {
        packageId,
        name: packageId ? (packageNames[packageId] ?? packageId) : "بدون باقة محددة",
        projects: list.length,
        contractNet: net,
        profit: pr,
        marginPct: pct(pr, net),
        share: pct(list.length, ps.length),
      };
    })
    .sort((a, b) => b.projects - a.projects || b.contractNet - a.contractNet);

  const byQ = new Map<string, { projects: number; contractNet: number }>();
  for (const p of ps) {
    const k = quarterKey(p.startDate) || "—";
    const t = byQ.get(k) ?? { projects: 0, contractNet: 0 };
    t.projects++;
    t.contractNet = r2(t.contractNet + p.contractNet);
    byQ.set(k, t);
  }
  const trend = [...byQ.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => (a.key === "—" ? 1 : b.key === "—" ? -1 : a.key.localeCompare(b.key)));

  const count = (s: string) => requests.filter((r) => r.status === s).length;
  const won = count("won");
  const funnel = {
    total: requests.length,
    new: count("new"),
    contacted: count("contacted"),
    quoted: count("quoted") + count("negotiating"),
    won,
    lost: count("lost"),
    conversionPct: pct(won, requests.length),
  };

  const marginPct = pct(profit, contractNet);
  const marginGap =
    plannedMarginPct === null || !ps.length ? null : r2(marginPct - plannedMarginPct);

  const insights: Insight[] = [];
  if (!ps.length) insights.push({ code: "no_projects" });
  const top = packages.find((p) => p.packageId && p.share >= 60 && p.projects >= 2);
  if (top) insights.push({ code: "top_package", name: top.name, share: top.share });
  if (marginGap !== null && marginGap <= -2)
    insights.push({ code: "margin_below_plan", gap: Math.abs(marginGap) });
  if (marginGap !== null && marginGap >= 2)
    insights.push({ code: "margin_above_plan", gap: marginGap });
  const repeat = entities.filter((e) => e.projects >= 2).length;
  if (repeat) insights.push({ code: "repeat_entities", count: repeat });
  const noPkg = ps.filter((p) => !p.packageId).length;
  if (noPkg) insights.push({ code: "no_package", count: noPkg });
  const losing = ps.filter((p) => p.profit < 0).length;
  if (losing) insights.push({ code: "losing_projects", count: losing });
  const stale = requests.filter((r) => r.status === "new" && now - r.createdAt > 3 * DAY).length;
  if (stale) insights.push({ code: "stale_requests", count: stale });
  if (requests.length >= 5 && funnel.conversionPct < 20)
    insights.push({ code: "low_conversion", pct: funnel.conversionPct });

  return {
    totals: {
      projects: ps.length,
      active: ps.filter((p) => p.status === "active").length,
      completed: ps.filter((p) => p.status === "completed").length,
      entities: entities.length,
      repeatEntities: repeat,
      contractNet,
      gross: r2(sum((p) => p.gross)),
      received: r2(sum((p) => p.received)),
      expenses: r2(sum((p) => p.expenses)),
      profit,
      realizedProfit: r2(sum((p) => realizedProfit(p.profit, p.gross, p.received))),
      marginPct,
      avgContract: ps.length ? r2(contractNet / ps.length) : 0,
    },
    plannedMarginPct,
    marginGap,
    packages,
    entities,
    trend,
    funnel,
    insights,
  };
}

/** The margin a pricing model plans for, as a percent of the price (null for a fixed price). */
export function plannedMargin(method: "margin" | "markup" | "fixed", value: number): number | null {
  if (method === "margin") return value > 0 ? value : null;
  if (method === "markup") return value > 0 ? r2((value / (100 + value)) * 100) : null;
  return null;
}
