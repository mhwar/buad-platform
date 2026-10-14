import { queryOptions } from "@tanstack/react-query";
import { ok } from "../../lib/format";

export type Period = { from?: string; to?: string };
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
    missingContractDate: boolean;
    ctrlVersion: number;
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
