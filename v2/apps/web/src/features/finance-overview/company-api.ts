import type { CompanyEntryInput, DistributionInput } from "@buad/schema/company";
import { queryOptions } from "@tanstack/react-query";
import { ok } from "../../lib/format";
import { type Period, periodQs } from "./api";

/** Amounts in riyals. */
export type CompanyOverview = {
  period: { from: string; to: string };
  calc: {
    projectProfit: number;
    serviceIncome: number;
    companyExpenses: number;
    income: number;
    netProfit: number;
  };
  allTime: {
    projectProfit: number;
    serviceIncome: number;
    companyExpenses: number;
    netProfit: number;
    distributed: number;
    available: number;
  };
  retained: { ops: number; dev: number; reserve: number; total: number };
  bankMinimum: number;
  monthly: { month: string; income: number; expense: number }[];
  projects: {
    id: string;
    number: string;
    name: string;
    clientName: string;
    status: string;
    profit: number;
    remainingExec: number;
    date: string;
    earning: boolean;
  }[];
  partnersPct: number;
};
export type CompanyEntry = {
  id: string;
  type: "income" | "expense";
  category: string;
  date: string;
  paymentDate: string;
  description: string;
  amount: number;
  note: string;
  archivedAt: number | null;
};
export type Partner = { id: string; name: string; sharePct: number; note: string };
export type Share = { partnerId: string; partnerName: string; sharePct: number; amount: number };
export type Distribution = {
  id: string;
  periodType: string;
  periodLabel: string;
  from: string;
  to: string;
  grossIncome: number;
  grossExpenses: number;
  netProfit: number;
  pct: number;
  distributed: number;
  retained: number;
  retainedCategory: "ops" | "dev" | "reserve" | null;
  projectIds: string[];
  projectId: string;
  status: "draft" | "completed";
  note: string;
  createdAt: number;
  completedAt: number | null;
  shares: Share[];
};
export type Preview = {
  label: string;
  grossIncome: number;
  grossExpenses: number;
  netProfit: number;
  distributed: number;
  retained: number;
  shares: Share[];
  sharesPct: number;
};

const B = "/api/finance/company";
const send = async <T>(method: string, url: string, body?: unknown) =>
  ok<T>(
    await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

export const companyKeys = { all: ["company-finance"] as const };
export const companyOverviewQuery = (p: Period) =>
  queryOptions({
    queryKey: [...companyKeys.all, "overview", p],
    queryFn: () => send<CompanyOverview>("GET", `${B}/overview${periodQs(p)}`),
    placeholderData: (prev) => prev,
  });
export const companyEntriesQuery = (archived = false) =>
  queryOptions({
    queryKey: [...companyKeys.all, "entries", archived],
    queryFn: async () =>
      (await send<{ items: CompanyEntry[] }>("GET", `${B}/entries${archived ? "?archived=1" : ""}`))
        .items,
  });
export const partnersQuery = queryOptions({
  queryKey: [...companyKeys.all, "partners"],
  queryFn: () => send<{ items: Partner[]; totalPct: number }>("GET", `${B}/partners`),
});
export const distributionsQuery = queryOptions({
  queryKey: [...companyKeys.all, "distributions"],
  queryFn: async () => (await send<{ items: Distribution[] }>("GET", `${B}/distributions`)).items,
});

export const companyApi = {
  addEntry: (e: CompanyEntryInput) => send<{ id: string }>("POST", `${B}/entries`, e),
  updateEntry: (id: string, e: CompanyEntryInput) => send("PATCH", `${B}/entries/${id}`, e),
  removeEntry: (id: string) => send("DELETE", `${B}/entries/${id}`),
  restoreEntry: (id: string) => send("POST", `${B}/entries/${id}/restore`),
  addPartner: (p: { name: string; sharePct: number; note?: string }) =>
    send<{ id: string }>("POST", `${B}/partners`, p),
  updatePartner: (id: string, p: { name: string; sharePct: number; note?: string }) =>
    send("PATCH", `${B}/partners/${id}`, p),
  removePartner: (id: string) => send("DELETE", `${B}/partners/${id}`),
  preview: (d: DistributionInput) => send<Preview>("POST", `${B}/distributions/preview`, d),
  saveDistribution: (d: DistributionInput & { status: "draft" | "completed" }) =>
    send<{ id: string }>("POST", `${B}/distributions`, d),
  completeDistribution: (id: string) => send("POST", `${B}/distributions/${id}/complete`),
  removeDistribution: (id: string) => send("DELETE", `${B}/distributions/${id}`),
};
