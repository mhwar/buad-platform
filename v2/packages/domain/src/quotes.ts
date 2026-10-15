/* Quote arithmetic in halalas. Pure: the API and the printed page use the same numbers. */

export type QuoteItem = { label: string; qty: number; unitHalalas: number };
export type QuoteTotals = {
  subtotal: number;
  discount: number;
  net: number;
  vat: number;
  total: number;
};

const round = (n: number) => Math.round(n);

/** Subtotal − discount = taxable amount; VAT is on that; total = taxable + VAT. */
export function quoteTotals(
  items: QuoteItem[],
  discountHalalas: number,
  vatPct: number,
): QuoteTotals {
  const subtotal = items.reduce((s, i) => s + round(i.qty * i.unitHalalas), 0);
  const discount = Math.min(Math.max(0, round(discountHalalas)), subtotal);
  const net = subtotal - discount;
  const vat = round((net * Math.max(0, vatPct)) / 100);
  return { subtotal, discount, net, vat, total: net + vat };
}

/** Whether an offer can still be accepted on `today` (no validity date means open). */
export const quoteIsValid = (validUntil: string, today: string) =>
  !validUntil || validUntil >= today;

/** Weight of each pipeline stage when forecasting what the open leads are worth. */
export const STAGE_PROBABILITY = {
  new: 0.1,
  contacted: 0.2,
  quoted: 0.4,
  negotiating: 0.65,
} as const;

export function weightedPipeline(leads: { status: string; valueHalalas: number }[]): number {
  return round(
    leads.reduce(
      (s, l) =>
        s + l.valueHalalas * (STAGE_PROBABILITY[l.status as keyof typeof STAGE_PROBABILITY] ?? 0),
      0,
    ),
  );
}

/* ── Quote control: how the offers are doing, and how an accepted one becomes instalments ── */
export type QuoteFacts = {
  id: string;
  status: string;
  /** Gross total, halalas. */
  total: number;
  validUntil: string;
  /** Epoch seconds of the last change. */
  updatedAt: number;
};
const DAY_S = 86400;
const addDaysIso = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export function quoteStats(list: QuoteFacts[], today: string, now: number) {
  const sent = list.filter((q) => q.status !== "draft");
  const accepted = list.filter((q) => q.status === "accepted");
  const rejected = list.filter((q) => q.status === "rejected");
  const sum = (a: QuoteFacts[]) => a.reduce((s, q) => s + q.total, 0);
  const closed = accepted.length + rejected.length;
  return {
    sent: sent.length,
    accepted: accepted.length,
    rejected: rejected.length,
    acceptRate: closed ? Math.round((accepted.length / closed) * 1000) / 10 : null,
    acceptedValue: sum(accepted),
    avgValue: sent.length ? Math.round(sum(sent) / sent.length) : 0,
    /** Sent, still valid, and ending within a week. */
    expiring: list.filter(
      (q) =>
        q.status === "sent" &&
        q.validUntil !== "" &&
        q.validUntil >= today &&
        q.validUntil <= addDaysIso(today, 7),
    ),
    /** Sent and unanswered for more than a week. */
    waiting: list.filter((q) => q.status === "sent" && now - q.updatedAt > 7 * DAY_S),
  };
}

export const SCHEDULE_KINDS = ["full", "half", "thirds", "none"] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];
export const SCHEDULE_LABEL: Record<ScheduleKind, string> = {
  full: "دفعة واحدة بعد 30 يوماً",
  half: "50% عند البدء و50% بعد 60 يوماً",
  thirds: "40% عند البدء و30% بعد 30 يوماً و30% بعد 60 يوماً",
  none: "بلا جدول دفعات",
};

/** Instalments for a gross total: percentages, due dates, and the odd halala on the last line. */
export function scheduleSplit(kind: ScheduleKind, totalHalalas: number, startIso: string) {
  const plans: Record<
    Exclude<ScheduleKind, "none">,
    { label: string; pct: number; days: number }[]
  > = {
    full: [{ label: "الدفعة الكاملة", pct: 100, days: 30 }],
    half: [
      { label: "الدفعة الأولى (50%)", pct: 50, days: 0 },
      { label: "الدفعة الثانية (50%)", pct: 50, days: 60 },
    ],
    thirds: [
      { label: "الدفعة الأولى (40%)", pct: 40, days: 0 },
      { label: "الدفعة الثانية (30%)", pct: 30, days: 30 },
      { label: "الدفعة الثالثة (30%)", pct: 30, days: 60 },
    ],
  };
  if (kind === "none" || totalHalalas <= 0) return [];
  const plan = plans[kind];
  let left = totalHalalas;
  return plan.map((p, i) => {
    const amount = i === plan.length - 1 ? left : Math.round((totalHalalas * p.pct) / 100);
    left -= amount;
    return { label: p.label, amount, dueDate: addDaysIso(startIso, p.days) };
  });
}
