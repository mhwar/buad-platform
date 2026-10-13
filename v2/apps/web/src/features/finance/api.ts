import type { FinResult } from "@buad/domain";
import type { CtrlPatch, EntryInput } from "@buad/schema/finance";
import { queryOptions } from "@tanstack/react-query";
import { ok } from "../../lib/format";

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
};
export type BudgetItem = { id: string; name: string; amount: number; note: string; sort: number };
export type Category = { id: string; label: string; type: "expense" | "income" | "both" };
export type Finance = {
  ctrl: Ctrl;
  entries: Entry[];
  budget: BudgetItem[];
  categories: Category[];
  summary: FinResult;
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

export const financeQuery = (projectId: string) =>
  queryOptions({ queryKey: financeKey(projectId), queryFn: () => send("GET", base(projectId)) });

export const financeApi = (projectId: string) => ({
  saveCtrl: (patch: CtrlPatch) => send("PATCH", `${base(projectId)}/ctrl`, patch),
  addEntry: (e: EntryInput) => send("POST", `${base(projectId)}/entries`, e),
  updateEntry: (id: string, e: Partial<EntryInput>) =>
    send("PATCH", `${base(projectId)}/entries/${id}`, e),
  deleteEntry: (id: string) => send("DELETE", `${base(projectId)}/entries/${id}`),
  registerAgreement: (item: string) => send("POST", `${base(projectId)}/agreement/${item}`),
  addBudget: (b: { name: string; amount: number; note?: string }) =>
    send("POST", `${base(projectId)}/budget`, b),
  updateBudget: (id: string, b: Partial<{ name: string; amount: number; note: string }>) =>
    send("PATCH", `${base(projectId)}/budget/${id}`, b),
  deleteBudget: (id: string) => send("DELETE", `${base(projectId)}/budget/${id}`),
  addCategory: (c: { label: string; type: Category["type"] }) =>
    send("POST", `${base(projectId)}/categories`, c),
  deleteCategory: (id: string) => send("DELETE", `${base(projectId)}/categories/${id}`),
});
