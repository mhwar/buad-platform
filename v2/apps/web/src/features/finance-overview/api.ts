import { queryOptions } from "@tanstack/react-query";
import { ok } from "../../lib/format";

export type Period = { from?: string; to?: string; client?: string; status?: string };
export type OverviewProject = {
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
/** Amounts in riyals. */
export type Overview = {
  period: { from: string; to: string };
  totals: {
    gross: number;
    net: number;
    vat: number;
    profit: number;
    margin: number;
    spent: number;
    income: number;
    remaining: number;
    projects: number;
    withoutFinance: number;
    pending: number;
    unregistered: number;
    /** Money received from clients in the period. */
    received: number;
  };
  projects: OverviewProject[];
  clients: { id: string; name: string; projects: number; gross: number; profit: number }[];
  monthly: { month: string; expense: number; income: number }[];
  categories: { label: string; amount: number }[];
  obligations: {
    pending: {
      projectId: string;
      projectName: string;
      date: string;
      description: string;
      type: string;
      amount: number;
    }[];
    unregistered: { projectId: string; projectName: string; item: string; amount: number }[];
  };
  quality: {
    projectId: string;
    number: string;
    name: string;
    missingReceipts: boolean;
    gross: number;
    entriesWithoutStatus: number;
  }[];
};
export type Report = Overview & {
  org: { name: string; reg: string; tax: string; urls: Record<string, string> };
  generatedAt: number;
};

const qs = (p: Period) => {
  const s = new URLSearchParams();
  if (p.from) s.set("from", p.from);
  if (p.to) s.set("to", p.to);
  if (p.client) s.set("client", p.client);
  if (p.status) s.set("status", p.status);
  const t = s.toString();
  return t ? `?${t}` : "";
};

export const overviewQuery = (p: Period) =>
  queryOptions({
    queryKey: ["finance-overview", p],
    queryFn: async () => ok<Overview>(await fetch(`/api/finance/overview${qs(p)}`)),
    placeholderData: (prev) => prev,
  });
export const reportQuery = (p: Period) =>
  queryOptions({
    queryKey: ["finance-report", p],
    queryFn: async () => ok<Report>(await fetch(`/api/finance/report${qs(p)}`)),
  });
export const periodQs = qs;

/** «هذه السنة» etc. → dates. */
export function presetPeriod(preset: string, today = new Date()): Period {
  const y = today.getFullYear();
  if (preset === "year") return { from: `${y}-01-01`, to: `${y}-12-31` };
  if (preset === "last") return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  return {};
}

export type PeriodChoice = {
  preset?: "all" | "year" | "quarter" | "custom" | "last";
  year?: number;
  q?: number;
  from?: string;
  to?: string;
};

/**
 * The period a page shows, its label, and the one before it (for ▲▼ comparison).
 * Quarters and years compare with the previous quarter/year; «كل الفترات» and custom don't.
 */
export function resolvePeriod(c: PeriodChoice, today = new Date()) {
  const y = c.year ?? today.getFullYear();
  const q = c.q ?? Math.floor(today.getMonth() / 3) + 1;
  const qr = (yy: number, qq: number) => {
    const m = (qq - 1) * 3 + 1;
    const last = new Date(Date.UTC(yy, m + 2, 0)).getUTCDate();
    const p2 = (n: number) => String(n).padStart(2, "0");
    return { from: `${yy}-${p2(m)}-01`, to: `${yy}-${p2(m + 2)}-${p2(last)}` };
  };
  const names = ["", "الربع الأول", "الربع الثاني", "الربع الثالث", "الربع الرابع"];
  switch (c.preset ?? "all") {
    case "quarter": {
      const prev = q === 1 ? { y: y - 1, q: 4 } : { y, q: q - 1 };
      return {
        period: qr(y, q),
        prev: qr(prev.y, prev.q),
        label: `${names[q]} ${y}`,
        prevLabel: `${names[prev.q]} ${prev.y}`,
      };
    }
    case "year":
      return {
        period: { from: `${y}-01-01`, to: `${y}-12-31` },
        prev: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
        label: `سنة ${y}`,
        prevLabel: `سنة ${y - 1}`,
      };
    case "last":
      return {
        period: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
        prev: { from: `${y - 2}-01-01`, to: `${y - 2}-12-31` },
        label: `سنة ${y - 1}`,
        prevLabel: `سنة ${y - 2}`,
      };
    case "custom":
      return { period: { from: c.from, to: c.to }, prev: null, label: "فترة مخصصة", prevLabel: "" };
    default:
      return { period: {}, prev: null, label: "كل الفترات", prevLabel: "" };
  }
}
