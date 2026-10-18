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
  /** When the partners were paid ("" = approved, not paid yet). */
  paidOn?: string;
  shares: Share[];
};
export type Balances = {
  realized: number;
  companyNet: number;
  distributed: number;
  retained: number;
  undistributed: number;
  retainedBy: { ops: number; dev: number; reserve: number };
  approvedUnpaid: number;
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

export const balancesQuery = queryOptions({
  queryKey: [...companyKeys.all, "balances"],
  queryFn: () => send<Balances>("GET", `${B}/balances`),
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
  payDistribution: (id: string, b: { date: string; ref: string }) =>
    send("POST", `${B}/distributions/${id}/pay`, b),
  removeDistribution: (id: string) => send("DELETE", `${B}/distributions/${id}`),
};

export type QuarterFlag =
  | "no_receipts"
  | "over_distributed"
  | "estimate"
  | "pending_expenses"
  | "cancelled"
  | "inactive";
export type QuarterRow = {
  /** Closed, and all it realized has been distributed. */
  fullyDistributed?: boolean;
  /** Contract money not yet booked as an expense, fee or income. */
  unclassified?: number;
  /** Financially closed: profit final, ready to distribute. */
  closed?: boolean;
  id: string;
  number: string;
  name: string;
  clientName: string;
  status: string;
  profit: number;
  gross: number;
  receivedInPeriod: number;
  receivedToDate: number;
  realizedInPeriod: number;
  realizedToDate: number;
  distributed: number;
  available: number;
  pendingExpenses: number;
  flags: QuarterFlag[];
};
export type QuarterData = {
  year: number;
  q: number;
  from: string;
  to: string;
  label: string;
  rows: QuarterRow[];
  totals: {
    receivedInPeriod: number;
    realizedInPeriod: number;
    available: number;
    positive: number;
    carried: number;
  };
  company: { income: number; expenses: number };
  retained: { ops: number; dev: number; reserve: number; total: number };
  partnersPct: number;
  defaultSelected: string[];
  settlement: Settlement;
  /** q = 0 (the year): each quarter's line. */
  quarters?: ({
    q: number;
    label: string;
    receivedInPeriod: number;
    realizedInPeriod: number;
    companyNet: number;
  } & Settlement)[];
};
export type Settlement = {
  distributions: number;
  settled: number;
  leftover: number;
  stamp: "open" | "distributed" | "partial";
};
export const quarterQuery = (year: number, q: number) =>
  queryOptions({
    queryKey: [...companyKeys.all, "quarter", year, q],
    queryFn: () => send<QuarterData>("GET", `${B}/quarter?year=${year}&q=${q}`),
    placeholderData: (prev) => prev,
  });

export type ReceiptProposal = {
  projectId: string;
  number: string;
  name: string;
  clientName: string;
  status: string;
  gross: number;
  contractDate: string;
  suggestion: {
    date: string;
    source: string;
    basis: string;
    quarter: string;
    warnings: ("future" | "before_contract" | "near_quarter_edge")[];
  } | null;
};
export const receiptProposalsQuery = queryOptions({
  queryKey: [...companyKeys.all, "receipt-proposals"],
  queryFn: async () =>
    (await send<{ items: ReceiptProposal[] }>("GET", `${B}/receipt-suggestions`)).items,
});
