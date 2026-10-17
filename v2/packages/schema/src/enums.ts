/** Shared enum values. Kept free of drizzle so the web bundle can import them cheaply. */
export const CLIENT_TYPES = [
  "company",
  "association",
  "government",
  "individual",
  "other",
] as const;
export const PROJECT_TYPES = ["training", "consulting", "event", "other"] as const;
export const PROJECT_STATUSES = ["draft", "active", "completed", "paused", "cancelled"] as const;
export const FEE_TYPES = ["pct", "fixed"] as const;
export const FEE_BASES = ["net", "gross"] as const;
export const ENTRY_TYPES = ["income", "expense"] as const;
export const ENTRY_STATUSES = ["", "paid", "pending", "cancelled"] as const;
export const CATEGORY_TYPES = ["expense", "income", "both"] as const;
/** v1 built-in categories (app.html catLabel L3776). */
export const BUILTIN_CATEGORIES = [
  "salary",
  "logistics",
  "materials",
  "other",
  "exec",
  "mkt",
  "cashback",
  "cf",
  "vat",
] as const;
export const DEFAULT_OP_CATS = ["salary", "logistics", "materials", "other"] as const;

/** Company finance (v1 «مالية المنصة», app.html Pages._pfCats). */
export const COMPANY_INCOME_CATS = [
  "project_fee",
  "subscription",
  "setup",
  "consulting",
  "commission",
  "other",
] as const;
export const COMPANY_EXPENSE_CATS = [
  "hosting",
  "marketing",
  "payroll",
  "tools",
  "legal",
  "other",
  "asset",
  "purchase",
  "zakat",
  "gov_fees",
] as const;
export const RETAINED_CATS = ["ops", "dev", "reserve"] as const;
export const DISTRIBUTION_STATUSES = ["draft", "completed"] as const;
