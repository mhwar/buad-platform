/**
 * Document variables: everything a contract or letter can say about the organisation,
 * the client, the project and its money, computed in one place.
 *
 * Mirrors v1 (createContract L8443, _applyVars L11473) and fills its gaps:
 * a real Hijri date (v1 printed `{{contract_date_hijri}}` as-is) and Arabic amount words
 * beyond millions.
 */

export type OrgProfile = {
  name: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  reg: string;
  tax: string;
  signerName: string;
  signerTitle: string;
  signerId: string;
  bankName: string;
  bankIban: string;
};
export type DocClient = {
  name: string;
  contactName: string;
  contactTitle: string;
  regNo: string;
  taxNo: string;
  address: string;
  city: string;
  phone: string;
  email: string;
};
export type DocContext = {
  org: OrgProfile;
  client?: DocClient | null;
  project?: { name: string } | null;
  /** From finance: gross contract total (riyals), cashback (riyals), contract no/date. */
  finance?: {
    grossTotal: number;
    cashback: number;
    contractNo: string;
    contractDate: string;
  } | null;
  /** YYYY-MM-DD; passed in so results are reproducible. */
  today: string;
};

export type VarSource =
  | "org"
  | "client"
  | "project"
  | "finance"
  | "default"
  | "manual"
  | "computed";
export type Resolved = Record<string, { value: string; source: VarSource }>;

/** Values a new contract starts with (v1 createContract mapping), each with where it came from. */
export function initialVariables(ctx: DocContext): Resolved {
  const o = ctx.org;
  const c = ctx.client;
  const f = ctx.finance;
  const v: Resolved = {};
  const put = (k: string, value: string | undefined | null, source: VarSource) => {
    v[k] = { value: (value ?? "").toString().trim(), source };
  };
  put("party_a_name", o.name, "org");
  put("party_a_rep_name", o.signerName, "org");
  put("party_a_title", o.signerTitle, "org");
  put("party_a_id", o.signerId, "org");
  put("party_a_address", o.address, "org");
  put("party_a_phone", o.phone, "org");
  put("party_a_email", o.email, "org");
  put("party_a_reg", o.reg, "org");
  put("party_a_tax", o.tax, "org");
  put("party_b_name", c?.name, "client");
  put("party_b_rep_name", c?.contactName, "client");
  put("party_b_title", c?.contactTitle, "client");
  put("party_b_id", c?.regNo, "client");
  put("party_b_reg", c?.regNo, "client");
  put("party_b_address", c?.address || c?.city, "client");
  put("party_b_phone", c?.phone, "client");
  put("party_b_email", c?.email, "client");
  put("party_b_tax", c?.taxNo, "client");
  put(
    "contract_date_gregorian",
    f?.contractDate || ctx.today,
    f?.contractDate ? "finance" : "default",
  );
  put("contract_city", c?.city || "الرياض", c?.city ? "client" : "default");
  put("signature_city", c?.city || "الرياض", c?.city ? "client" : "default");
  const amount = Math.round(f?.grossTotal ?? 0);
  put("contract_amount", amount ? amount.toLocaleString("en-US") : "", "finance");
  put("subject", ctx.project?.name, "project");
  put("contract_no", f?.contractNo, f?.contractNo ? "finance" : "default");
  put("currency", "ر.س", "default");
  put("duration_months", "12", "default");
  put("duration_unit", "شهر", "default");
  put("payment_method", "تحويل بنكي", "default");
  return v;
}

/**
 * Final values used when rendering: stored values (as edited) plus computed tokens.
 * Organisation tokens always follow the current organisation profile, like v1.
 */
export function resolveVariables(stored: Record<string, string>, ctx: DocContext): Resolved {
  const out: Resolved = {};
  for (const [k, value] of Object.entries(stored))
    out[k] = { value: String(value ?? ""), source: "manual" };
  const o = ctx.org;
  const org: Record<string, string> = {
    company_name: o.name,
    company_email: o.email,
    company_phone: o.phone,
    company_website: o.website,
    company_address: o.address,
    company_reg: o.reg,
    company_tax: o.tax,
    company_signer_name: o.signerName,
    company_signer_title: o.signerTitle,
    company_signer_id: o.signerId,
    company_bank_name: o.bankName,
    company_bank_iban: o.bankIban,
  };
  for (const [k, value] of Object.entries(org))
    out[k] = { value: value || stored[k] || "", source: "org" };

  const amount = Number.parseFloat((stored.contract_amount ?? "").replace(/,/g, ""));
  out.contract_amount_words = {
    value: Number.isFinite(amount) ? numberToArabicWords(amount) : "",
    source: "computed",
  };
  const dv = (stored.duration_months ?? "").trim();
  out.duration_full = {
    value: dv ? `${dv} ${(stored.duration_unit || "شهر").trim()}` : "",
    source: "computed",
  };
  const g = stored.contract_date_gregorian ?? "";
  out.contract_date_gregorian = {
    value: formatGregorian(g),
    source: stored.contract_date_gregorian ? "manual" : "default",
  };
  out.contract_date_hijri = {
    value: stored.contract_date_hijri?.trim() || toHijri(g),
    source: stored.contract_date_hijri?.trim() ? "manual" : "computed",
  };
  const cb = ctx.finance?.cashback ?? 0;
  out.cashback_amount = {
    value: cb ? Math.round(cb).toLocaleString("en-US") : "",
    source: "finance",
  };
  out.cashback_amount_words = { value: cb ? numberToArabicWords(cb) : "", source: "computed" };
  if (stored.letter_date)
    out.letter_date_hijri = { value: toHijri(stored.letter_date), source: "computed" };
  out.today_gregorian = { value: formatGregorian(ctx.today), source: "computed" };
  out.today_hijri = { value: toHijri(ctx.today), source: "computed" };
  return out;
}

export type Segment = { text: string } | { key: string; value: string; empty: boolean };

/** Splits text into literal text and variable slots (so the editor can highlight or flag empty ones). */
export function segments(text: string, values: Resolved): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(/\{\{(\w+)\}\}/g)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const key = m[1] ?? "";
    const value = values[key]?.value ?? "";
    out.push({ key, value, empty: !value.trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Plain text with every variable filled (empty ones left visible as {{key}} so nothing is silently lost). */
export function fillText(text: string, values: Resolved): string {
  return segments(text, values)
    .map((s) => ("text" in s ? s.text : s.empty ? `{{${s.key}}}` : s.value))
    .join("");
}

/** DD/MM/YYYY like v1 (_fmtDateDisplay). */
export function formatGregorian(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Umm al-Qura date, e.g. "22 ربيع الآخر 1448" (no era: templates add «هـ» themselves). */
export function toHijri(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const parts = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).formatToParts(new Date(`${iso}T12:00:00Z`));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}`.trim();
}

const ONES = [
  "",
  "واحد",
  "اثنان",
  "ثلاثة",
  "أربعة",
  "خمسة",
  "ستة",
  "سبعة",
  "ثمانية",
  "تسعة",
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = [
  "",
  "مئة",
  "مئتان",
  "ثلاثمئة",
  "أربعمئة",
  "خمسمئة",
  "ستمئة",
  "سبعمئة",
  "ثمانمئة",
  "تسعمئة",
];
const SCALES = [
  { size: 1e9, one: "مليار", two: "ملياران", few: "مليارات", many: "ملياراً" },
  { size: 1e6, one: "مليون", two: "مليونان", few: "ملايين", many: "مليوناً" },
  { size: 1e3, one: "ألف", two: "ألفان", few: "آلاف", many: "ألفاً" },
];

function under1000(x: number): string {
  if (x === 0) return "";
  if (x < 20) return ONES[x] ?? "";
  if (x < 100) {
    const u = ONES[x % 10];
    const t = TENS[Math.floor(x / 10)] ?? "";
    return u ? `${u} و${t}` : t;
  }
  const h = HUNDREDS[Math.floor(x / 100)] ?? "";
  const r = under1000(x % 100);
  return r ? `${h} و${r}` : h;
}

/** Arabic words for a whole number (v1 _numToArabic, extended to billions). Rounds like v1. */
export function numberToArabicWords(n: number): string {
  let x = Math.round(Number(n) || 0);
  if (x <= 0) return "";
  const parts: string[] = [];
  for (const s of SCALES) {
    const k = Math.floor(x / s.size);
    if (!k) continue;
    x %= s.size;
    parts.push(
      k === 1
        ? s.one
        : k === 2
          ? s.two
          : k <= 10
            ? `${under1000(k)} ${s.few}`
            : `${under1000(k)} ${s.many}`,
    );
  }
  if (x) parts.push(under1000(x));
  return parts.join(" و");
}

/** Numbered clause titles like v1 (_renumberClauses): only clauses with a baseTitle are numbered. */
export function renumberClauses<T extends { title: string; baseTitle: string }>(
  clauses: T[],
  ordinals: readonly string[],
): T[] {
  let n = 0;
  return clauses.map((c) => {
    if (!c.baseTitle) return c;
    const ord = ordinals[n] ?? String(n + 1);
    n++;
    return { ...c, title: `المادة ${ord}: ${c.baseTitle}` };
  });
}

/**
 * v1's cashback letter never said how much (it had no variables). When the project has a
 * cashback amount, the v2 letter states it, in figures and in words, from finance.
 */
export function cashbackBody(v1Body: string, hasAmount: boolean): string {
  if (!hasAmount) return v1Body;
  return v1Body.replace(
    "صرف مبلغ (كاش باك) للجمعية من إجمالي قيمة العقد",
    "صرف مبلغ (كاش باك) للجمعية قدره {{cashback_amount}} ريال ({{cashback_amount_words}} ريال) من إجمالي قيمة العقد",
  );
}
