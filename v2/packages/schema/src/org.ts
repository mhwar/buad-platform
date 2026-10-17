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
export const ASSET_MIME = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
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
});
export type OrgSettingsPatch = z.input<typeof orgSettingsPatch>;
