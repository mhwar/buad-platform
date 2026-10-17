import { z } from "zod";
import { COMPANY_EXPENSE_CATS, COMPANY_INCOME_CATS, RETAINED_CATS } from "./enums";

const date = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/)
  .default("");
/** Riyals as typed (stored as halalas). */
const money = z.coerce.number().positive().max(1e10);

export const companyEntryInput = z
  .object({
    type: z.enum(["income", "expense"]),
    category: z.string().max(40).default("other"),
    date,
    paymentDate: date,
    description: z.string().trim().min(1).max(300),
    amount: money,
    note: z.string().trim().max(2000).default(""),
    /** A purchase with a tax invoice: its VAT is claimed in the VAT return. */
    taxInvoice: z
      .object({
        vatAmount: z.coerce.number().min(0).max(1e10).optional(),
        supplierName: z.string().trim().max(200).default(""),
        supplierVatNo: z.string().trim().max(20).default(""),
        invoiceNo: z.string().trim().max(60).default(""),
        invoiceDate: date,
      })
      .nullable()
      .optional(),
  })
  .refine(
    (v) =>
      (v.type === "income"
        ? (COMPANY_INCOME_CATS as readonly string[])
        : (COMPANY_EXPENSE_CATS as readonly string[])
      ).includes(v.category),
    { message: "invalid_category", path: ["category"] },
  );
export type CompanyEntryInput = z.input<typeof companyEntryInput>;

export const partnerInput = z.object({
  name: z.string().trim().min(1).max(120),
  sharePct: z.coerce.number().gt(0).max(100),
  note: z.string().trim().max(500).default(""),
});

export const distributionInput = z.object({
  /** "period": company profit still available; "project": one project's profit. */
  mode: z.enum(["period", "project", "quarter", "manual"]).default("period"),
  /** mode "manual": a distribution already paid in the past, by its actual amount (riyals). */
  amount: z.coerce.number().positive().max(1e10).optional(),
  paidOn: date,
  paidRef: z.string().trim().max(120).default(""),
  /** mode "quarter": the quarter whose realized profit is distributed. */
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  q: z.coerce.number().int().min(1).max(4).optional(),
  periodType: z.enum(["q1", "q2", "q3", "q4", "annual", "custom", "project"]).default("custom"),
  from: date,
  to: date,
  label: z.string().trim().max(120).default(""),
  projectIds: z.array(z.string().max(64)).max(500).default([]),
  projectId: z.string().max(64).default(""),
  pct: z.coerce.number().min(0).max(100).default(100),
  retainedCategory: z.enum(RETAINED_CATS).default("reserve"),
  note: z.string().trim().max(1000).default(""),
});
export type DistributionInput = z.input<typeof distributionInput>;

export const COMPANY_CAT_LABELS: Record<string, string> = {
  project_fee: "أتعاب مشروع",
  subscription: "رسوم اشتراك",
  setup: "رسوم إعداد وتشغيل",
  consulting: "خدمات استشارية",
  commission: "عمولات",
  hosting: "استضافة وبنية تحتية",
  marketing: "تسويق وإعلان",
  payroll: "رواتب وأجور",
  tools: "خدمات وأدوات",
  legal: "قانونية وإدارية",
  asset: "أصل رأسمالي (أجهزة، أثاث…)",
  purchase: "مشتريات عامة",
  zakat: "زكاة",
  gov_fees: "رسوم حكومية",
  other: "أخرى",
};
export const RETAINED_LABELS: Record<string, string> = {
  ops: "تشغيل",
  dev: "تطوير",
  reserve: "احتياطي",
};
export { COMPANY_EXPENSE_CATS, COMPANY_INCOME_CATS, RETAINED_CATS } from "./enums";

/** Money received from the client for a project (negative = refund). Riyals as typed. */
export const receiptInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.coerce
    .number()
    .refine((n) => n !== 0 && Math.abs(n) <= 1e10, { message: "invalid_amount" }),
  note: z.string().trim().max(500).default(""),
  /** Where the date came from (kept with the approval). */
  basis: z.string().trim().max(200).default(""),
  /** Set after the person is warned that this receipt takes the total above the contract. */
  confirmOver: z.boolean().optional(),
});
