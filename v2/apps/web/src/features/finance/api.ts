import type { summarize } from "@buad/domain";
import type { CtrlPatch, EntryInput } from "@buad/schema/finance";
import { queryOptions } from "@tanstack/react-query";
import { confirmAction } from "../../components/ui";
import { ApiError, ok, sar } from "../../lib/format";

export type Ctrl = {
  contractNo: string;
  contractDate: string;
  /** halalas */
  contractValue: number;
  cvLocked: boolean;
  vatIncluded: boolean;
  vatPct: number;
  execV: number;
  execType: "pct" | "fixed";
  execBase: "net" | "gross";
  mktV: number;
  mktType: "pct" | "fixed";
  mktBase: "net" | "gross";
  mktInternal: boolean;
  cbV: number;
  cbType: "pct" | "fixed";
  cbBase: "net" | "gross";
  cfV: number;
  cfType: "pct" | "fixed";
  cfBase: "net" | "gross";
  opCats: string[];
  version: number;
  updatedAt: number | null;
};
export type Entry = {
  id: string;
  date: string;
  description: string;
  cat: string;
  type: "income" | "expense";
  /** halalas */
  amount: number;
  profitMargin: number;
  profitMarginType: "pct" | "fixed";
  status: "" | "paid" | "pending" | "cancelled";
  note: string;
  source: "manual" | "agreement";
  /** A purchase with a tax invoice (its VAT is in the VAT report). */
  taxInvoice: boolean;
  /** halalas */
  vatAmount: number;
  supplierName: string;
  supplierVatNo: string;
  invoiceNo: string;
  invoiceDate: string;
  /** «cf» entries: the contract's VAT held for ZATCA, a real fee, or not yet said. */
  cfKind?: "" | "vat" | "fee";
};
export type BudgetItem = { id: string; name: string; amount: number; note: string; sort: number };
export type Category = { id: string; label: string; type: "expense" | "income" | "both" };
/** Money received from the client (halalas; negative = refund). */
export type Receipt = {
  id: string;
  date: string;
  amount: number;
  note: string;
  basis: string;
  approvedBy: string;
  approvedAt: number | null;
};
export type Finance = {
  /** True when the viewer's role may not see profit: those figures arrive as zero. */
  profitHidden?: boolean;
  ctrl: Ctrl;
  entries: Entry[];
  budget: BudgetItem[];
  categories: Category[];
  receipts: Receipt[];
  /** Riyals received so far. */
  received: number;
  summary: ReturnType<typeof summarize>;
};

export const financeKey = (projectId: string) => ["finance", projectId] as const;

// Plain fetch: the finance routes sit under a mounted path param the RPC types do not model well.
const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/finance`;
const send = async (method: string, url: string, body?: unknown) =>
  ok<Finance & { id?: string }>(
    await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

/**
 * Records a receipt; when it would take the total above the contract value, asks first and
 * sends it again only if the person confirms (a duplicate is the usual cause).
 */
export async function withOverContractCheck<T>(post: (confirmOver: boolean) => Promise<T>) {
  try {
    return await post(false);
  } catch (x) {
    if (!(x instanceof ApiError) || x.body.error !== "over_contract") throw x;
    const b = x.body as { gross: number; received: number };
    const ok = await confirmAction({
      title: "المبلغ يتجاوز قيمة العقد",
      text: `استُلم ${sar(b.received)} من عقد قيمته ${sar(b.gross)}. هل هذه دفعة فعلية وليست مكررة؟`,
      action: "تسجيله رغم ذلك",
    });
    if (!ok) return null;
    return post(true);
  }
}

export const financeQuery = (projectId: string) =>
  queryOptions({ queryKey: financeKey(projectId), queryFn: () => send("GET", base(projectId)) });

export const financeApi = (projectId: string) => ({
  saveCtrl: (patch: CtrlPatch) => send("PATCH", `${base(projectId)}/ctrl`, patch),
  addEntry: (e: EntryInput) => send("POST", `${base(projectId)}/entries`, e),
  updateEntry: (id: string, e: Partial<EntryInput>) =>
    send("PATCH", `${base(projectId)}/entries/${id}`, e),
  markUnsetStatus: (status: "paid" | "pending") =>
    send("POST", `${base(projectId)}/entries/bulk-status`, { status }),
  addReceipt: (r: {
    date: string;
    amount: number;
    note?: string;
    basis?: string;
    confirmOver?: boolean;
  }) => send("POST", `${base(projectId)}/receipts`, r),
  approveReceipt: (id: string) => send("POST", `${base(projectId)}/receipts/${id}/approve`),
  updateReceipt: (id: string, r: { date: string; amount: number; note?: string }) =>
    send("PATCH", `${base(projectId)}/receipts/${id}`, r),
  deleteReceipt: (id: string) => send("DELETE", `${base(projectId)}/receipts/${id}`),
  deleteEntry: (id: string) => send("DELETE", `${base(projectId)}/entries/${id}`),
  registerAgreement: (item: string) => send("POST", `${base(projectId)}/agreement/${item}`),
  registerAllAgreement: () =>
    send("POST", `${base(projectId)}/agreement-all`) as Promise<Finance & { registered: string[] }>,
  addBudget: (b: { name: string; amount: number; note?: string }) =>
    send("POST", `${base(projectId)}/budget`, b),
  updateBudget: (id: string, b: Partial<{ name: string; amount: number; note: string }>) =>
    send("PATCH", `${base(projectId)}/budget/${id}`, b),
  deleteBudget: (id: string) => send("DELETE", `${base(projectId)}/budget/${id}`),
  addCategory: (c: { label: string; type: Category["type"] }) =>
    send("POST", `${base(projectId)}/categories`, c),
  deleteCategory: (id: string) => send("DELETE", `${base(projectId)}/categories/${id}`),
});
