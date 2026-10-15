import { queryOptions } from "@tanstack/react-query";
import { ok } from "../../lib/format";

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected";
export type QuoteItemView = { label: string; qty: number; unit: number; total: number };
export type Quote = {
  id: string;
  number: string;
  requestId: string;
  clientId: string;
  productId: string;
  packageId: string;
  projectId: string;
  recipient: string;
  entity: string;
  title: string;
  items: QuoteItemView[];
  discount: number;
  vatPct: number;
  validUntil: string;
  expired: boolean;
  terms: string;
  status: QuoteStatus;
  version: number;
  updatedAt: number;
  totals: { subtotal: number; discount: number; net: number; vat: number; total: number };
  createdAt: number;
};
export const QUOTE_LABEL: Record<QuoteStatus, string> = {
  draft: "مسودة",
  sent: "أُرسل",
  accepted: "مقبول",
  rejected: "مرفوض",
};
export const quotesQuery = queryOptions({
  queryKey: ["quotes"],
  queryFn: async () => (await ok<{ quotes: Quote[] }>(await fetch("/api/quotes"))).quotes,
});
export const quoteQuery = (id: string) =>
  queryOptions({
    queryKey: ["quote", id],
    queryFn: async () => ok<{ quote: Quote; org: OrgPrint }>(await fetch(`/api/quotes/${id}`)),
  });
export const vatRateQuery = queryOptions({
  queryKey: ["quote-vat-rate"],
  queryFn: async () => (await ok<{ rate: number }>(await fetch("/api/quotes/vat-rate"))).rate,
  staleTime: 5 * 60_000,
});
export type OrgPrint = {
  profile?: unknown;
  name: string;
  tax: string;
  phone: string;
  email: string;
  address: string;
  signerName: string;
  signerTitle: string;
  urls: Record<string, string>;
};

/* ── Dashboard ───────────────────────────────────────────────────────────── */
export type SalesOverview = {
  pipeline: {
    stages: { stage: string; count: number; value: number; weighted: number }[];
    open: { count: number; value: number; weighted: number };
  };
  results: {
    won: number;
    lost: number;
    winRate: number | null;
    avgCycleDays: number | null;
    wonThisQuarter: number;
  };
  followups: { leadsDue: number; clientsDue: number };
  stale: {
    id: string;
    name: string;
    entity: string;
    status: string;
    value: number;
    daysIdle: number;
  }[];
  quotes: {
    sent: number;
    accepted: number;
    rejected: number;
    acceptRate: number | null;
    acceptedValue: number;
    avgValue: number;
    expiring: {
      id: string;
      number: string;
      title: string;
      recipient: string;
      validUntil: string;
      total: number;
    }[];
    waiting: {
      id: string;
      number: string;
      title: string;
      recipient: string;
      days: number;
      total: number;
    }[];
  };
  sources: { source: string; total: number; won: number; rate: number | null }[];
  monthlyWon: { month: string; value: number }[];
  topClients: { id: string; name: string; value: number }[];
};
export const overviewQuery = queryOptions({
  queryKey: ["sales-overview"],
  queryFn: async () => ok<SalesOverview>(await fetch("/api/sales/overview")),
  staleTime: 30_000,
});

export type CatalogItem = {
  productId: string;
  productName: string;
  packageId: string;
  packageName: string;
  price: number;
};
export const catalogQuery = queryOptions({
  queryKey: ["quote-catalog"],
  queryFn: async () =>
    (await ok<{ items: CatalogItem[] }>(await fetch("/api/quotes/catalog"))).items,
  staleTime: 60_000,
});
