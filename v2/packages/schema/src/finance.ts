import { z } from "zod";
import { CATEGORY_TYPES, ENTRY_STATUSES, ENTRY_TYPES, FEE_BASES, FEE_TYPES } from "./enums";

const num = (max = 1e12) => z.coerce.number().min(0).max(max);
const date = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "invalid_date");

/** Control centre (v1 fin.ctrl). Money in riyals as typed; the API stores halalas. */
export const ctrlFields = {
  contractNo: z.string().trim().max(100),
  contractDate: date,
  contractValue: num(),
  cvLocked: z.boolean(),
  vatIncluded: z.boolean(),
  vatPct: num(100),
  execV: num(),
  execType: z.enum(FEE_TYPES),
  execBase: z.enum(FEE_BASES),
  mktV: num(),
  mktType: z.enum(FEE_TYPES),
  mktBase: z.enum(FEE_BASES),
  mktInternal: z.boolean(),
  cbV: num(),
  cbType: z.enum(FEE_TYPES),
  cbBase: z.enum(FEE_BASES),
  cfV: num(),
  cfType: z.enum(FEE_TYPES),
  cfBase: z.enum(FEE_BASES),
  opCats: z.array(z.string().max(80)).max(50),
};
export const ctrlPatch = z
  .object(ctrlFields)
  .partial()
  .extend({ version: z.number().int().min(0) })
  .refine((v) => v.execType !== "pct" || v.execV === undefined || v.execV <= 100, {
    path: ["execV"],
    message: "pct_over_100",
  });
export type CtrlPatch = z.input<typeof ctrlPatch>;
export type Ctrl = z.output<z.ZodObject<typeof ctrlFields>>;

/** A new project's settings, exactly v1 DB.getFin defaults (app.html L2591). */
export const DEFAULT_CTRL: Omit<Ctrl, "contractValue"> = {
  contractNo: "",
  contractDate: "",
  cvLocked: false,
  vatIncluded: false,
  vatPct: 15,
  execV: 10,
  execType: "pct",
  execBase: "gross",
  mktV: 0,
  mktType: "pct",
  mktBase: "gross",
  mktInternal: false,
  cbV: 0,
  cbType: "pct",
  cbBase: "gross",
  cfV: 0,
  cfType: "pct",
  cfBase: "net",
  opCats: [],
};

/**
 * A purchase's tax invoice. `vatAmount` is optional: left out, the VAT is worked out from the
 * entry's amount (taken to include VAT) at the organisation's rate and then stored.
 */
export const taxInvoiceInput = z.object({
  vatAmount: z.coerce.number().min(0).max(1e12).optional(),
  supplierName: z.string().trim().max(200).default(""),
  supplierVatNo: z.string().trim().max(20).default(""),
  invoiceNo: z.string().trim().max(60).default(""),
  invoiceDate: date.default(""),
});
export type TaxInvoiceInput = z.input<typeof taxInvoiceInput>;

const entryFields = {
  date,
  description: z.string().trim().min(1, "required").max(300),
  cat: z.string().trim().min(1).max(80),
  type: z.enum(ENTRY_TYPES),
  amount: z.coerce.number().gt(0, "amount_positive").max(1e12),
  profitMargin: num(),
  profitMarginType: z.enum(FEE_TYPES),
  status: z.enum(ENTRY_STATUSES),
  note: z.string().trim().max(2000),
  /** «cf» entries: the contract's VAT held for ZATCA ("vat") or a real fee ("fee"). */
  cfKind: z.enum(["", "vat", "fee"]),
};
export const entryInput = z.object({
  ...entryFields,
  date: date.default(""),
  cat: entryFields.cat.default("other"),
  profitMargin: num().default(0),
  profitMarginType: entryFields.profitMarginType.default("pct"),
  status: entryFields.status.default(""),
  note: entryFields.note.default(""),
  cfKind: entryFields.cfKind.default(""),
  /** null/absent = no tax invoice. */
  taxInvoice: taxInvoiceInput.nullable().optional(),
});
export type EntryInput = z.input<typeof entryInput>;
export const entryPatch = z
  .object({ ...entryFields, taxInvoice: taxInvoiceInput.nullable() })
  .partial();

export const budgetInput = z.object({
  name: z.string().trim().max(200).default(""),
  amount: num().default(0),
  note: z.string().trim().max(500).default(""),
});
export const budgetPatch = z
  .object({ name: z.string().trim().max(200), amount: num(), note: z.string().trim().max(500) })
  .partial();

export const categoryInput = z.object({
  label: z.string().trim().min(1, "required").max(80),
  type: z.enum(CATEGORY_TYPES).default("expense"),
});

/** Agreement items that can be registered as entries (v1 registerContractItem). */
export const AGREEMENT_ITEMS = ["exec", "cf", "mkt", "cashback"] as const;

/** v1 labels (app.html catLabel L3776). */
export const CATEGORY_LABELS: Record<string, string> = {
  salary: "رواتب",
  logistics: "لوجستيات",
  materials: "مواد",
  other: "أخرى",
  exec: "أتعاب",
  mkt: "تسويق",
  cashback: "كاش باك",
  cf: "رسوم إضافية",
  vat: "ضريبة",
};
export const ENTRY_STATUS_LABELS: Record<string, string> = {
  "": "—",
  paid: "مدفوع",
  pending: "معلق",
  cancelled: "ملغي",
};
/** VAT share inside a VAT-inclusive amount: 15/115 (v1 VAT_EXTRACT_PCT). */
export const VAT_EXTRACT_PCT = 13.043;
