/* Receivables and the cash forecast. Pure: amounts are halalas, dates are «YYYY-MM-DD». */

const day = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);
export const addDays = (iso: string, n: number) =>
  new Date((day(iso) + n) * 86400000).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => day(to) - day(from);

export const AGING_BUCKETS = [
  { key: "current", label: "غير مستحقة" },
  { key: "d1_30", label: "1–30 يوماً" },
  { key: "d31_60", label: "31–60 يوماً" },
  { key: "d61_90", label: "61–90 يوماً" },
  { key: "d90", label: "أكثر من 90 يوماً" },
] as const;
export type AgingKey = (typeof AGING_BUCKETS)[number]["key"];

export const bucketOf = (dueDate: string, today: string): AgingKey => {
  const late = daysBetween(dueDate, today);
  if (late <= 0) return "current";
  if (late <= 30) return "d1_30";
  if (late <= 60) return "d31_60";
  if (late <= 90) return "d61_90";
  return "d90";
};

export function aging(items: { dueDate: string; amount: number }[], today: string) {
  const out = Object.fromEntries(
    AGING_BUCKETS.map((b) => [b.key, { amount: 0, count: 0 }]),
  ) as Record<AgingKey, { amount: number; count: number }>;
  for (const i of items) {
    const b = out[bucketOf(i.dueDate, today)];
    b.amount += i.amount;
    b.count += 1;
  }
  const overdue = (Object.keys(out) as AgingKey[])
    .filter((k) => k !== "current")
    .reduce((s, k) => s + out[k].amount, 0);
  return { buckets: out, overdue, total: overdue + out.current.amount };
}

export type Movement = { date: string; amount: number };
export type Week = {
  start: string;
  end: string;
  inflow: number;
  outflow: number;
  net: number;
  balance: number;
};

/**
 * Week-by-week cash from `opening`: expected receipts in, planned payments out.
 * Anything overdue or undated lands in the first week (it is due now); beyond the horizon is left out.
 */
export function cashForecast(o: {
  today: string;
  weeks?: number;
  opening: number;
  inflows: Movement[];
  outflows: Movement[];
}): Week[] {
  const n = o.weeks ?? 13;
  const weeks: Week[] = Array.from({ length: n }, (_, i) => ({
    start: addDays(o.today, i * 7),
    end: addDays(o.today, i * 7 + 6),
    inflow: 0,
    outflow: 0,
    net: 0,
    balance: 0,
  }));
  const place = (m: Movement, key: "inflow" | "outflow") => {
    const d = m.date && m.date > o.today ? m.date : o.today;
    const w = weeks.find((x) => d >= x.start && d <= x.end);
    if (w) w[key] += m.amount;
  };
  for (const m of o.inflows) place(m, "inflow");
  for (const m of o.outflows) place(m, "outflow");
  let bal = o.opening;
  for (const w of weeks) {
    w.net = w.inflow - w.outflow;
    bal += w.net;
    w.balance = bal;
  }
  return weeks;
}

/** The first week the balance goes below zero, or null. */
export const firstShortfall = (weeks: Week[]) => weeks.find((w) => w.balance < 0) ?? null;

/** A short message to send a client about an instalment that is due. */
export function reminderText(o: {
  client: string;
  project: string;
  label: string;
  amountRiyals: string;
  dueDate: string;
  org: string;
}) {
  return `السلام عليكم ${o.client}،\nنذكّركم بدفعة «${o.label}» لمشروع «${o.project}» بمبلغ ${o.amountRiyals}، وتاريخ استحقاقها ${o.dueDate}.\nنشكر لكم تعاونكم.\n${o.org}`;
}
