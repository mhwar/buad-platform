import { z } from "zod";

const s = (max = 200) => z.string().trim().max(max);
export const orgProfileFields = {
  name: s(),
  email: s(),
  phone: s(40),
  website: s(),
  address: s(300),
  reg: s(40),
  tax: s(40),
  signerName: s(),
  signerTitle: s(),
  signerId: s(40),
  bankName: s(),
  bankIban: s(40),
  logoAsset: s(64),
  stampAsset: s(64),
  signatureAsset: s(64),
  headerAsset: s(64),
  footerAsset: s(64),
};
export const orgProfilePatch = z
  .object(orgProfileFields)
  .partial()
  .extend({ version: z.number().int().min(0) });
export type OrgProfilePatch = z.input<typeof orgProfilePatch>;
export const ASSET_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
] as const;
export const MAX_ASSET_BYTES = 2 * 1024 * 1024;

/* ── Organisation settings (org_settings) ─────────────────────────────────────── */
const fee = z.enum(["pct", "fixed"]);
const base = z.enum(["gross", "net"]);
const amount = z.coerce.number().min(0).max(1e12);

/** The contract terms a new project starts with (the same fields as its «إعدادات العقد»). */
export const projectDefaults = z.object({
  vatIncluded: z.boolean(),
  vatPct: z.coerce.number().min(0).max(100),
  execV: amount,
  execType: fee,
  execBase: base,
  mktV: amount,
  mktType: fee,
  mktBase: base,
  cbV: amount,
  cbType: fee,
  cbBase: base,
  cfV: amount,
  cfType: fee,
  cfBase: base,
});
export type ProjectDefaults = z.output<typeof projectDefaults>;

const year = z.string().regex(/^20\d{2}$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** A change to the settings: only the keys sent are touched; `null` clears one. */
export const orgSettingsPatch = z.object({
  projectDefaults: projectDefaults.optional(),
  /** The year's revenue target in riyals, with VAT (the measure of «مراجعة السنة»). */
  targets: z.record(year, amount.nullable()).optional(),
  /** Cash on hand on a date, the start of the 13-week cash forecast (riyals). */
  cashOpening: z
    .object({ amount: z.coerce.number().min(-1e12).max(1e12), date: isoDate })
    .nullable()
    .optional(),
  /** What a new distribution starts with: the share paid out, and where the rest is kept. */
  distributionDefaults: z
    .object({
      pct: z.coerce.number().min(0).max(100),
      retainedCategory: z.enum(["ops", "dev", "reserve"]),
    })
    .optional(),
});
export type OrgSettingsPatch = z.input<typeof orgSettingsPatch>;

/** Fixed texts new documents start from (empty = the platform's own wording). */
export const docTexts = z.object({
  quoteTerms: z.string().trim().max(4000),
  /** Days a new quote stays valid; 0 = no validity date filled in. */
  quoteValidityDays: z.coerce.number().int().min(0).max(365),
  letterClosing: z.string().trim().max(300),
});
export type DocTexts = z.output<typeof docTexts>;
export const DEFAULT_DOC_TEXTS: DocTexts = {
  quoteTerms: "",
  quoteValidityDays: 0,
  letterClosing: "",
};

/** Numbering: a new prefix, and/or the next number (which may only move forward). */
export const orgPrefsPatch = z.object({
  numbering: z
    .record(
      z.string(),
      z.object({
        prefix: z
          .string()
          .trim()
          .regex(/^[\p{L}\p{N}]{1,8}$/u)
          .optional(),
        next: z.coerce.number().int().min(1).max(999999).optional(),
      }),
    )
    .optional(),
  texts: docTexts.partial().optional(),
});
export type OrgPrefsPatch = z.input<typeof orgPrefsPatch>;
