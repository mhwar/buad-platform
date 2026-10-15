/* ─────────────────────────────────────────────────────────────────────────────
 * Sales and light CRM rules: what each kind of contact is, how a client's relationship with the
 * company is worked out, and whether a follow-up is due. Pure: the API supplies the numbers.
 * ──────────────────────────────────────────────────────────────────────────── */

export const ACTIVITY_TYPES = ["call", "meeting", "visit", "email", "whatsapp", "note"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  call: "اتصال",
  meeting: "اجتماع",
  visit: "زيارة",
  email: "بريد",
  whatsapp: "واتساب",
  note: "ملاحظة",
};

export const SOURCES = ["site", "referral", "event", "call", "social", "other"] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_LABEL: Record<Source, string> = {
  site: "الموقع",
  referral: "إحالة",
  event: "معرض أو فعالية",
  call: "اتصال وارد",
  social: "تواصل اجتماعي",
  other: "أخرى",
};

export type Relationship = "active" | "prospect" | "former" | "dormant" | "new";
export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  active: "عميل نشط",
  prospect: "محتمل",
  former: "عميل سابق",
  dormant: "خامل",
  new: "جديد",
};
/** Order of precedence is also the order filters are offered in. */
export const RELATIONSHIPS: Relationship[] = ["active", "prospect", "former", "dormant", "new"];

const DAY = 86400;
export const DORMANT_AFTER_DAYS = 180;

/**
 * Where a client stands, from facts the platform already has — never typed in by hand:
 * a running project makes them active; else an open enquiry or quote makes them a prospect;
 * else finished work makes them a former client; else silence for six months makes them dormant.
 */
export function relationshipOf(f: {
  activeProjects: number;
  completedProjects: number;
  openRequests: number;
  openQuotes: number;
  /** Latest contact, activity or project touch (epoch seconds, 0 = never). */
  lastTouch: number;
  createdAt: number;
  now: number;
}): Relationship {
  if (f.activeProjects > 0) return "active";
  if (f.openRequests + f.openQuotes > 0) return "prospect";
  if (f.completedProjects > 0) return "former";
  const since = Math.max(f.lastTouch, f.createdAt);
  return f.now - since > DORMANT_AFTER_DAYS * DAY ? "dormant" : "new";
}

export type FollowUpState = "none" | "overdue" | "today" | "soon" | "later";
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);

/** A follow-up date against today: «soon» is within the coming week. */
export function followUpState(date: string, today: string): FollowUpState {
  if (!date) return "none";
  const d = dayNum(date) - dayNum(today);
  return d < 0 ? "overdue" : d === 0 ? "today" : d <= 7 ? "soon" : "later";
}

export const FOLLOW_UP_LABEL: Record<FollowUpState, string> = {
  none: "",
  overdue: "متأخرة",
  today: "اليوم",
  soon: "هذا الأسبوع",
  later: "لاحقاً",
};

/** Whole days since `epoch`, or null when there never was a contact. */
export const daysSince = (epoch: number, now: number): number | null =>
  epoch > 0 ? Math.max(0, Math.floor((now - epoch) / DAY)) : null;

/** Tags as people type them: trimmed, de-duplicated, at most ten of 24 characters. */
export function cleanTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const v = t.trim().slice(0, 24);
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, 10);
}

/* ── The pipeline: how the open leads and the closed ones are doing ────────── */
export const OPEN_STAGES = ["new", "contacted", "quoted", "negotiating"] as const;
export type OpenStage = (typeof OPEN_STAGES)[number];
export type Lead = {
  status: string;
  /** Expected value in halalas. */
  valueHalalas: number;
  createdAt: number;
  /** Last time anything changed on it (epoch seconds). */
  updatedAt: number;
  source?: string;
};

const STAGE_P: Record<OpenStage, number> = {
  new: 0.1,
  contacted: 0.2,
  quoted: 0.4,
  negotiating: 0.65,
};

export type StageStat = { stage: string; count: number; value: number; weighted: number };

/** Count, value and probability-weighted value per open stage, plus the totals of everything open. */
export function pipelineStats(leads: Lead[]) {
  const stages: StageStat[] = OPEN_STAGES.map((stage) => {
    const rows = leads.filter((l) => l.status === stage);
    const value = rows.reduce((s, l) => s + l.valueHalalas, 0);
    return { stage, count: rows.length, value, weighted: Math.round(value * STAGE_P[stage]) };
  });
  return {
    stages,
    open: {
      count: stages.reduce((s, x) => s + x.count, 0),
      value: stages.reduce((s, x) => s + x.value, 0),
      weighted: stages.reduce((s, x) => s + x.weighted, 0),
    },
  };
}

/** Share of closed leads that were won, in percent with one decimal; null when nothing has closed. */
export function winRate(won: number, lost: number): number | null {
  const n = won + lost;
  return n ? Math.round((won / n) * 1000) / 10 : null;
}

/** Average days from first enquiry to winning, or null when nothing was won. */
export function avgCycleDays(won: { createdAt: number; updatedAt: number }[]): number | null {
  if (!won.length) return null;
  const total = won.reduce((s, l) => s + Math.max(0, l.updatedAt - l.createdAt) / DAY, 0);
  return Math.round(total / won.length);
}

export const STALE_DAYS = 7;
/** An open lead nobody has touched for a week. */
export const isStale = (l: Pick<Lead, "status" | "updatedAt">, now: number, days = STALE_DAYS) =>
  (OPEN_STAGES as readonly string[]).includes(l.status) && now - l.updatedAt > days * DAY;

/** Per source: how many leads, how many were won, and the win rate among the closed ones. */
export function bySource(leads: Lead[]) {
  const map = new Map<string, { total: number; won: number; lost: number }>();
  for (const l of leads) {
    const k = l.source || "other";
    const r = map.get(k) ?? { total: 0, won: 0, lost: 0 };
    r.total += 1;
    if (l.status === "won") r.won += 1;
    if (l.status === "lost") r.lost += 1;
    map.set(k, r);
  }
  return [...map.entries()]
    .map(([source, r]) => ({ source, ...r, rate: winRate(r.won, r.lost) }))
    .sort((a, b) => b.total - a.total);
}

/** Value won in each of the last `months` months (oldest first), by the month the win was recorded. */
export function monthlyWon(leads: Lead[], now: number, months = 12) {
  const end = new Date(now * 1000);
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const sums = new Map(keys.map((k) => [k, 0]));
  for (const l of leads) {
    if (l.status !== "won") continue;
    const d = new Date(l.updatedAt * 1000);
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (sums.has(k)) sums.set(k, (sums.get(k) ?? 0) + l.valueHalalas);
  }
  return keys.map((month) => ({ month, value: sums.get(month) ?? 0 }));
}

/** Value won since the start of the calendar quarter of `now`. */
export function wonThisQuarter(leads: Lead[], now: number) {
  const d = new Date(now * 1000);
  const start = Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1) / 1000;
  return leads
    .filter((l) => l.status === "won" && l.updatedAt >= start)
    .reduce((s, l) => s + l.valueHalalas, 0);
}
