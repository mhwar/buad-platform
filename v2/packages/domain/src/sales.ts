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
