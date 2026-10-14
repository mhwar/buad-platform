/* ─────────────────────────────────────────────────────────────────────────────
 * Plans: how far an indicator, an objective and a whole plan have got, and whether that is on
 * track for the time elapsed. Pure: the API feeds it numbers (including platform metrics).
 * ──────────────────────────────────────────────────────────────────────────── */

export type Direction = "up" | "down";
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** 0..1: how much of the way from baseline to target the current value is (works for «lower is better»). */
export function attainment(i: {
  baseline: number;
  target: number;
  current: number;
  direction?: Direction;
}): number {
  const { baseline, target, current } = i;
  if (target === baseline)
    return (i.direction === "down" ? current <= target : current >= target) ? 1 : 0;
  return clamp01((current - baseline) / (target - baseline));
}

export const INITIATIVE_WEIGHT = { todo: 0, doing: 0.5, blocked: 0.25, done: 1 } as const;
export type InitiativeStatus = keyof typeof INITIATIVE_WEIGHT;

/**
 * Objective progress (0..1): the average of its indicators' attainment and of its initiatives'
 * completion. Whichever of the two exists counts; with neither, there is nothing to measure.
 */
export function objectiveProgress(
  indicators: { baseline: number; target: number; current: number; direction?: Direction }[],
  initiatives: { status: InitiativeStatus }[],
): number | null {
  const parts: number[] = [];
  if (indicators.length)
    parts.push(indicators.reduce((s, i) => s + attainment(i), 0) / indicators.length);
  if (initiatives.length)
    parts.push(
      initiatives.reduce((s, i) => s + INITIATIVE_WEIGHT[i.status], 0) / initiatives.length,
    );
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

/** Weighted average over objectives that have something to measure. */
export function cycleProgress(objs: { weight: number; progress: number | null }[]): number | null {
  const m = objs.filter((o) => o.progress !== null && o.weight > 0);
  const w = m.reduce((s, o) => s + o.weight, 0);
  return w ? m.reduce((s, o) => s + (o.progress as number) * o.weight, 0) / w : null;
}

export type PlanStatus = "no_data" | "not_started" | "on_track" | "at_risk" | "late" | "done";
export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  no_data: "بلا قياس",
  not_started: "لم يبدأ",
  on_track: "على المسار",
  at_risk: "معرّض للتأخر",
  late: "متأخر",
  done: "مكتمل",
};

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86400000;

/** Progress against the share of the period already gone. */
export function planStatus(
  progress: number | null,
  start: string,
  end: string,
  today: string,
): PlanStatus {
  if (progress === null) return "no_data";
  if (progress >= 1) return "done";
  if (!start || !end || day(end) <= day(start)) return progress > 0 ? "on_track" : "no_data";
  if (today < start) return "not_started";
  const expected = clamp01((day(today) - day(start)) / (day(end) - day(start)));
  const gap = expected - progress;
  return gap <= 0.1 ? "on_track" : gap <= 0.25 ? "at_risk" : "late";
}

/** First and last day of a quarter (1–4) of `year`; 0 returns the whole year. */
export function yearQuarterRange(year: number, q: number): { start: string; end: string } {
  if (q < 1 || q > 4) return { start: `${year}-01-01`, end: `${year}-12-31` };
  const sm = (q - 1) * 3 + 1;
  const last = new Date(Date.UTC(year, sm + 2, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { start: `${year}-${pad(sm)}-01`, end: `${year}-${pad(sm + 2)}-${pad(last)}` };
}

/** Platform numbers an indicator can follow by itself. */
export const PLATFORM_METRICS = [
  { key: "contracts", label: "قيمة العقود الجديدة", unit: "ر.س" },
  { key: "projects_started", label: "مشاريع بدأت", unit: "مشروع" },
  { key: "projects_completed", label: "مشاريع مكتملة", unit: "مشروع" },
  { key: "clients_new", label: "عملاء جدد", unit: "عميل" },
  { key: "requests", label: "طلبات العروض الواردة", unit: "طلب" },
  { key: "requests_won", label: "طلبات تحوّلت إلى عقد", unit: "طلب" },
  { key: "conversion", label: "نسبة تحويل الطلبات", unit: "%" },
] as const;
export type PlatformMetric = (typeof PLATFORM_METRICS)[number]["key"];
export const isMetric = (k: string): k is PlatformMetric =>
  PLATFORM_METRICS.some((m) => m.key === k);
export const metricOf = (source: string) => (source.startsWith("platform:") ? source.slice(9) : "");
