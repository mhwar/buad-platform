import { type FinInput, finCalc, fromRiyals, type StoredFinance, summarize } from "@buad/domain";

/**
 * v1 project finance (localStorage `buad2_fin_<pid>` / workspace.fin[pid]) → v2 rows.
 * Every missing v1 field takes the same fallback v1's FinCalc uses, so numbers stay identical.
 */
type Loose = Record<string, unknown>;

export type FinanceRows = {
  projectId: string;
  ctrl: {
    contractNo: string;
    contractDate: string;
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
  };
  entries: {
    id: string;
    date: string;
    description: string;
    cat: string;
    type: "income" | "expense";
    amount: number;
    profitMargin: number;
    profitMarginType: "pct" | "fixed";
    status: "" | "paid" | "pending" | "cancelled";
    note: string;
    source: "manual" | "agreement";
  }[];
  budget: { id: string; name: string; amount: number; note: string; sort: number }[];
  categories: { id: string; label: string; type: "expense" | "income" | "both" }[];
};

export type ParityField = { field: string; v1: number; v2: number };
export type Parity = {
  projectId: string;
  status: "exact" | "rounding" | "mismatch";
  diffs: ParityField[];
};

const n = (v: unknown) => Number.parseFloat(String(v ?? "")) || 0;
const s = (v: unknown) =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
const ft = (v: unknown): "pct" | "fixed" => (v === "fixed" ? "fixed" : "pct");
const fb = (v: unknown): "net" | "gross" => (v === "gross" ? "gross" : "net");
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function planFinance(projectId: string, fin: Loose): FinanceRows {
  const c = (fin.ctrl && typeof fin.ctrl === "object" ? fin.ctrl : {}) as Loose;
  const budgetRaw = Array.isArray(fin.budget) ? (fin.budget as Loose[]) : [];
  const budget = budgetRaw.map((b, i) => ({
    id: `bud_${projectId}_${i}`,
    name: s(b?.name),
    amount: fromRiyals(n(b?.amount)),
    note: s(b?.note),
    sort: i + 1,
  }));
  const custom = Array.isArray(c.custom_cats) ? (c.custom_cats as Loose[]) : [];
  const categories = custom
    .filter((x) => s(x?.id) && s(x?.label))
    .map((x) => ({
      id: s(x.id),
      label: s(x.label),
      type: (["income", "both"].includes(s(x.type)) ? s(x.type) : "expense") as "expense",
    }));
  const entries = (Array.isArray(fin.entries) ? (fin.entries as Loose[]) : []).map((e, i) => {
    const cat = s(e?.cat) || "other";
    // v1 budget categories are positional (`bdg_<index>`); v2 points at the budget row's id.
    const bdg = /^bdg_(\d+)$/.exec(cat);
    const agreement = s(e?.note) === "من الاتفاقية";
    return {
      // Namespaced by project so imported ids can never collide across projects.
      id: `v1_${projectId}_${s(e?.id) || i}`,
      date: DATE.test(s(e?.date)) ? s(e?.date) : "",
      description: s(e?.desc) || "(بدون وصف)",
      cat: bdg && budget[Number(bdg[1])] ? `bdg_${budget[Number(bdg[1])]!.id}` : cat,
      type: (e?.type === "income" ? "income" : "expense") as "income" | "expense",
      amount: fromRiyals(n(e?.amount)),
      profitMargin: n(e?.profit_margin),
      profitMarginType: ft(e?.profit_margin_type),
      status: (["paid", "pending", "cancelled"].includes(s(e?.status)) ? s(e?.status) : "") as "",
      note: agreement ? "" : s(e?.note),
      source: (agreement ? "agreement" : "manual") as "agreement" | "manual",
    };
  });
  return {
    projectId,
    ctrl: {
      contractNo: s(c.contract_no),
      contractDate: DATE.test(s(c.contract_date)) ? s(c.contract_date) : "",
      contractValue: fromRiyals(n(c.contract_value)),
      cvLocked: !!c.cv_locked,
      vatIncluded: !!c.vat_included,
      vatPct: n(c.vat_pct),
      execV: n(c.exec_v),
      execType: ft(c.exec_type),
      execBase: fb(c.exec_base),
      mktV: n(c.mkt_v),
      mktType: ft(c.mkt_type),
      mktBase: fb(c.mkt_base),
      mktInternal: !!c.mkt_internal,
      cbV: n(c.cb_v),
      cbType: ft(c.cb_type),
      cbBase: fb(c.cb_base),
      cfV: n(c.cf_v),
      cfType: ft(c.cf_type),
      cfBase: fb(c.cf_base),
      opCats: Array.isArray(c.op_cats) ? (c.op_cats as unknown[]).map(String) : [],
    },
    entries,
    budget,
    categories,
  };
}

const COMPARED = [
  "grossTotal",
  "contractNet",
  "vatAmt",
  "execAmt",
  "mkt",
  "cb",
  "cfAmt",
  "available",
  "obligations",
  "totalIncome",
  "totalExpenses",
  "opExpenses",
  "remainingExec",
  "remaining",
  "profitMargins",
  "profit",
  "budgetTotal",
] as const;

/** v1's numbers (computed by the exact v1 formula on the raw data) against v2's numbers from the imported rows. */
export function financeParity(projectId: string, raw: Loose, rows: FinanceRows): Parity {
  const v1 = finCalc(raw as FinInput) as Record<string, unknown>;
  const v2 = summarize(rows as unknown as StoredFinance) as Record<string, unknown>;
  // Amounts are stored in whole halalas: each one may move by at most half a halala.
  const tolerance = 0.005 * (rows.entries.length + rows.budget.length + 2) + 1e-9;
  const diffs: ParityField[] = [];
  let worst = 0;
  for (const f of COMPARED) {
    const a = Number(v1[f]);
    const b = Number(v2[f]);
    const d = Math.abs(a - b);
    worst = Math.max(worst, d);
    if (d > 5e-7) diffs.push({ field: f, v1: a, v2: b });
  }
  const sameMissing = JSON.stringify(v1.missingItems) === JSON.stringify(v2.missingItems);
  if (!sameMissing)
    diffs.push({
      field: "missingItems",
      v1: (v1.missingItems as string[]).length,
      v2: (v2.missingItems as string[]).length,
    });
  const status = !diffs.length
    ? "exact"
    : sameMissing && worst <= tolerance
      ? "rounding"
      : "mismatch";
  return { projectId, status, diffs };
}
