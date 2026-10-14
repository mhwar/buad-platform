import { QUARTER_NAMES, quarterOf, quarterRange } from "./realized";

/* ─────────────────────────────────────────────────────────────────────────────
 * Proposing when a project's money was received, from what the old platform recorded.
 * A proposal is only a suggestion: it is computed, never stored, and counts for nothing
 * until a person verifies the date and approves it (which creates the receipt).
 * ──────────────────────────────────────────────────────────────────────────── */

export type ReceiptSource = "pay_date" | "exec_income" | "contract_date" | "start_date";
export type ReceiptSuggestion = { date: string; source: ReceiptSource; basis: string };

const BASIS: Record<ReceiptSource, string> = {
  pay_date: "من «تاريخ الاستلام» المسجّل في المنصة القديمة",
  exec_income: "من تاريخ قيد أتعاب التنفيذ المسجّل مدفوعاً",
  contract_date: "من تاريخ العقد",
  start_date: "من تاريخ بداية المشروع",
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The best available date, in order of how directly it speaks of money arriving. */
export function suggestReceipt(i: {
  payDate?: string;
  execIncomeDate?: string;
  contractDate?: string;
  startDate?: string;
}): ReceiptSuggestion | null {
  const order: [ReceiptSource, string | undefined][] = [
    ["pay_date", i.payDate],
    ["exec_income", i.execIncomeDate],
    ["contract_date", i.contractDate],
    ["start_date", i.startDate],
  ];
  for (const [source, date] of order)
    if (date && ISO.test(date)) return { date, source, basis: BASIS[source] };
  return null;
}

export type ReceiptWarning = "future" | "before_contract" | "near_quarter_edge";

const dayDiff = (a: string, b: string) =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

/** What to double-check about a receipt date (it decides the quarter). */
export function receiptWarnings(
  date: string,
  contractDate: string,
  today: string,
): ReceiptWarning[] {
  const out: ReceiptWarning[] = [];
  if (date > today) out.push("future");
  if (contractDate && ISO.test(contractDate) && date < contractDate) out.push("before_contract");
  const { year, q } = quarterOf(date);
  const { from, to } = quarterRange(year, q);
  if (dayDiff(date, from) < 3 || dayDiff(to, date) < 3) out.push("near_quarter_edge");
  return out;
}

/** «الربع الثالث 2026» for a date. */
export function quarterLabelOf(date: string) {
  if (!ISO.test(date)) return "";
  const { year, q } = quarterOf(date);
  return `${QUARTER_NAMES[q]} ${year}`;
}
