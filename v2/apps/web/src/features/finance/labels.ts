import { CATEGORY_LABELS } from "@buad/schema/finance";
import type { BudgetItem, Category } from "./api";

/** Readable name for any entry category: built-in, custom, or a budget row (v1 showed raw `bdg_n`). */
export function catLabel(cat: string, categories: Category[], budget: BudgetItem[]): string {
  if (CATEGORY_LABELS[cat]) return CATEGORY_LABELS[cat];
  if (cat.startsWith("bdg_"))
    return budget.find((b) => `bdg_${b.id}` === cat)?.name || "بند ميزانية";
  return categories.find((c) => c.id === cat)?.label ?? "تصنيف محذوف";
}

export const FEE_ROWS = [
  { key: "exec", label: "أتعاب التنفيذ" },
  { key: "mkt", label: "التسويق" },
  { key: "cb", label: "كاش باك" },
  { key: "cf", label: "رسوم إضافية" },
] as const;
