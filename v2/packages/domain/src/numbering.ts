/**
 * What the platform numbers, and how: a prefix, an optional year, a sequence that only grows.
 * The prefixes here are the defaults; «الإعدادات ← بيانات الجهة ← الترقيم» may replace them.
 */
export const NUMBERING = {
  project: { label: "المشاريع", prefix: "PRJ", yearly: true },
  client: { label: "العملاء", prefix: "CL", yearly: false },
  quote: { label: "عروض الأسعار", prefix: "QT", yearly: true },
  doc_contract: { label: "العقود", prefix: "CT", yearly: true },
  doc_letter: { label: "الخطابات", prefix: "LT", yearly: true },
  outgoing: { label: "الصادر", prefix: "ص", yearly: true },
} as const;
export type NumberingKind = keyof typeof NUMBERING;
export const NUMBERING_KINDS = Object.keys(NUMBERING) as NumberingKind[];

/** A prefix of letters or digits only (Arabic or Latin): the dash is the separator. */
export const PREFIX_RE = /^[\p{L}\p{N}]{1,8}$/u;
