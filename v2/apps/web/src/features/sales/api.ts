import { queryOptions } from "@tanstack/react-query";
import { ok } from "../../lib/format";

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected";
export type QuoteItemView = { label: string; qty: number; unit: number; total: number };
export type Quote = {
  id: string;
  number: string;
  requestId: string;
  clientId: string;
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
