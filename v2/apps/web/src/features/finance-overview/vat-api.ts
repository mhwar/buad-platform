import { queryOptions } from "@tanstack/react-query";
import { ok } from "../../lib/format";

/** Amounts in riyals. */
export type VatSettings = {
  rate: number;
  period: "quarterly" | "monthly";
  vatNumber: string;
};
export type VatSale = {
  receiptId: string;
  projectId: string;
  number: string;
  name: string;
  clientName: string;
  date: string;
  amount: number;
  base: number;
  vat: number;
  basis: string;
  source: "invoice" | "receipt";
  invoiceNo: string;
  invoiceId: string;
};
export type VatPurchase = {
  entryId: string;
  projectId: string;
  projectName: string;
  date: string;
  description: string;
  supplierName: string;
  supplierVatNo: string;
  invoiceNo: string;
  invoiceDate: string;
  amount: number;
  base: number;
  vat: number;
  gaps: ("supplier" | "vat_no" | "invoice_no" | "invoice_date")[];
  owner: "project" | "company";
};
export type VatUnidentified = {
  entryId: string;
  projectId: string;
  projectName: string;
  date: string;
  description: string;
  category: string;
  cat: string;
  amount: number;
  owner: "project" | "company";
};
export type VatExpense = {
  entryId: string;
  projectId: string;
  projectName: string;
  date: string;
  description: string;
  amount: number;
};
export type VatWarningCode =
  | "no_vat_number"
  | "projects_without_receipts"
  | "invoice_incomplete"
  | "unidentified_purchases"
  | "sales_without_invoice"
  | "invoices_below_receipts"
  | "cf_undecided"
  | "vat_as_expense";
export type VatReport = {
  period: { from: string; to: string; label: string };
  rate: number;
  vatNumber: string;
  sales: { rows: VatSale[]; base: number; vat: number; total: number };
  purchases: { rows: VatPurchase[]; base: number; vat: number; total: number };
  unidentified: { rows: VatUnidentified[]; total: number };
  outputVat: number;
  inputVat: number;
  netPayable: number;
  reserved: number;
  vatExpenses: VatExpense[];
  warnings: { code: VatWarningCode; count?: number }[];
};

export type VatFiling = {
  status: "open" | "filed" | "paid";
  filedOn: string;
  paidOn: string;
  paidAmount: number;
  reference: string;
  note: string;
  net: number;
};
export type VatQuarter = {
  q: number;
  key: string;
  label: string;
  from: string;
  to: string;
  dueDate: string;
  salesTotal: number;
  purchasesTotal: number;
  outputVat: number;
  inputVat: number;
  netPayable: number;
  reserved: number;
  warnings: number;
  filing: VatFiling | null;
};
export type VatYear = {
  year: number;
  quarters: VatQuarter[];
  totals: {
    outputVat: number;
    inputVat: number;
    netPayable: number;
    reserved: number;
    paid: number;
    balance: number;
  };
};
export type SalesInvoice = {
  id: string;
  projectId: string;
  receiptId: string;
  number: string;
  date: string;
  amount: number;
  vat: number;
  assetId: string;
  note: string;
};

const B = "/api/finance/vat";
export const vatKeys = { all: ["vat"] as const };
export const vatSettingsQuery = queryOptions({
  queryKey: [...vatKeys.all, "settings"],
  queryFn: async () => ok<VatSettings & { ok: true }>(await fetch(`${B}/settings`)),
  staleTime: 60_000,
});
/** q = 0: the whole year. */
export const vatReportQuery = (year: number, q: number) =>
  queryOptions({
    queryKey: [...vatKeys.all, "report", year, q],
    queryFn: async () =>
      ok<VatReport>(await fetch(`${B}/report?year=${year}${q ? `&q=${q}` : ""}`)),
    placeholderData: (prev) => prev,
  });
export const vatYearQuery = (year: number) =>
  queryOptions({
    queryKey: [...vatKeys.all, "year", year],
    queryFn: async () => ok<VatYear>(await fetch(`${B}/year?year=${year}`)),
    placeholderData: (prev) => prev,
  });
export const invoicesQuery = (projectId: string) =>
  queryOptions({
    queryKey: [...vatKeys.all, "invoices", projectId],
    queryFn: async () =>
      (await ok<{ items: SalesInvoice[] }>(await fetch(`${B}/invoices?projectId=${projectId}`)))
        .items,
  });
const json = (method: string, url: string, body?: unknown) =>
  fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => ok<{ ok: true; id?: string }>(r));
export const vatApi = {
  saveFiling: (key: string, f: Omit<VatFiling, "net">) => json("PUT", `${B}/filings/${key}`, f),
  convertEntry: (b: { projectId: string; entryId: string; periodKey: string }) =>
    json("POST", `${B}/convert-entry`, b),
  addInvoice: (b: Omit<SalesInvoice, "id" | "vat"> & { vat?: number }) =>
    json("POST", `${B}/invoices`, b),
  updateInvoice: (id: string, b: Omit<SalesInvoice, "id" | "vat"> & { vat?: number }) =>
    json("PATCH", `${B}/invoices/${id}`, b),
  deleteInvoice: (id: string) => json("DELETE", `${B}/invoices/${id}`),
};
export const saveVatSettings = async (s: { rate: number; period: VatSettings["period"] }) =>
  ok<{ ok: true }>(
    await fetch(`${B}/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(s),
    }),
  );

export const GAP_TEXT: Record<VatPurchase["gaps"][number], string> = {
  supplier: "اسم المورد",
  vat_no: "الرقم الضريبي للمورد",
  invoice_no: "رقم الفاتورة",
  invoice_date: "تاريخ الفاتورة",
};
