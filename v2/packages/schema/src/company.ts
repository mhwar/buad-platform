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
  mode: z.enum(["period", "project"]).default("period"),
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
  other: "أخرى",
};
export const RETAINED_LABELS: Record<string, string> = {
  ops: "تشغيل",
  dev: "تطوير",
  reserve: "احتياطي",
};
export { COMPANY_EXPENSE_CATS, COMPANY_INCOME_CATS, RETAINED_CATS } from "./enums";
