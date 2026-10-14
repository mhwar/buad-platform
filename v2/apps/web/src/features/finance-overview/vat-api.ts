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
};
export type VatUnidentified = {
  entryId: string;
  projectId: string;
  projectName: string;
  date: string;
  description: string;
  category: string;
  amount: number;
};
export type VatWarningCode =
  | "no_vat_number"
  | "projects_without_receipts"
  | "invoice_incomplete"
  | "unidentified_purchases";
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
  warnings: { code: VatWarningCode; count?: number }[];
};

const B = "/api/finance/vat";
export const vatKeys = { all: ["vat"] as const };
export const vatSettingsQuery = queryOptions({
  queryKey: [...vatKeys.all, "settings"],
  queryFn: async () => ok<VatSettings & { ok: true }>(await fetch(`${B}/settings`)),
  staleTime: 60_000,
});
export const vatReportQuery = (year: number, q: number) =>
  queryOptions({
    queryKey: [...vatKeys.all, "report", year, q],
    queryFn: async () => ok<VatReport>(await fetch(`${B}/report?year=${year}&q=${q}`)),
    placeholderData: (prev) => prev,
  });
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
