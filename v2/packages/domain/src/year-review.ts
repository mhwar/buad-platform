/* ─────────────────────────────────────────────────────────────────────────────
 * «مراجعة السنة»: what to check on each project so the year's revenue is right.
 * Pure. Amounts in halalas.
 * ──────────────────────────────────────────────────────────────────────────── */

export const REVIEW_FLAGS = [
  "closed_not_paid",
  "paid_not_closed",
  "overdue",
  "no_receipts",
  "no_contract",
] as const;
export type ReviewFlag = (typeof REVIEW_FLAGS)[number];

export const REVIEW_FLAG_LABEL: Record<ReviewFlag, string> = {
  closed_not_paid: "مكتمل وعليه متبقٍّ",
  paid_not_closed: "محصَّل بالكامل ولم يُغلق",
  overdue: "دفعة متأخرة",
  no_receipts: "لا استلامات مسجّلة",
  no_contract: "بلا بيانات عقد",
};
export const REVIEW_FLAG_HINT: Record<ReviewFlag, string> = {
  closed_not_paid: "على الأرجح وصل مبلغ لم يُسجَّل استلامه، أو بقي على العميل فعلاً.",
  paid_not_closed: "حُصّلت قيمته كاملة؛ أغلقه كمكتمل إن انتهى العمل.",
  overdue: "سطر في جدول الدفعات تجاوز موعده ولم يُستلم.",
  no_receipts: "له قيمة عقد ولم يُسجَّل عليه أي مبلغ مستلم.",
  no_contract: "القيمة تقديرية من القيمة المتوقعة؛ أدخل رقم العقد وقيمته.",
};

export type ReviewInput = {
  status: string;
  /** Contract value with VAT (halalas). */
  gross: number;
  /** Everything received so far (halalas, refunds subtract). */
  received: number;
  /** No contract data yet: the value is the expected value plus VAT. */
  estimated: boolean;
  overdueLines: number;
};

/** One riyal of slack, so rounding never flags a project that is in fact settled. */
const SLACK = 100;

export function reviewFlags(p: ReviewInput): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  const open = p.status === "active" || p.status === "paused";
  const due = p.gross - p.received;
  if (p.status === "completed" && p.gross > 0 && due > SLACK) flags.push("closed_not_paid");
  if (open && p.gross > 0 && due <= SLACK) flags.push("paid_not_closed");
  if (p.overdueLines > 0) flags.push("overdue");
  if (p.status !== "cancelled" && p.gross > 0 && p.received <= 0) flags.push("no_receipts");
  if (p.estimated && p.status !== "cancelled") flags.push("no_contract");
  return flags;
}
