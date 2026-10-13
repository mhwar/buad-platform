/**
 * Port of v1 `FinCalc.calc` (app.html). Same arithmetic in the same order, so
 * results match v1 exactly; `fincalc.parity.test.ts` runs the real v1 source
 * against this on randomised inputs to prove it.
 *
 * Inputs are plain data (no DB access) so the function is pure and testable.
 * Values arrive as v1 stores them: numbers or numeric strings.
 */

type Num = number | string | null | undefined;

export interface FinCtrl {
  contract_value?: Num;
  vat_pct?: Num;
  vat_included?: boolean;
  mkt_internal?: boolean;
  exec_v?: Num;
  exec_type?: "pct" | "fixed";
  exec_base?: "net" | "gross";
  mkt_v?: Num;
  mkt_type?: "pct" | "fixed";
  mkt_base?: "net" | "gross";
  cb_v?: Num;
  cb_type?: "pct" | "fixed";
  cb_base?: "net" | "gross";
  cf_v?: Num;
  cf_type?: "pct" | "fixed";
  cf_base?: "net" | "gross";
  op_cats?: string[];
}

export interface FinEntry {
  type: "expense" | "income";
  cat?: string;
  amount?: Num;
  profit_margin?: Num;
  profit_margin_type?: "pct" | "fixed";
}

export interface FinInput {
  ctrl?: FinCtrl;
  budget?: { amount?: Num }[];
  entries?: FinEntry[];
}

const n = (v: Num): number => Number.parseFloat(String(v ?? "")) || 0;
const sum = (xs: FinEntry[]): number => xs.reduce((s, e) => s + n(e.amount), 0);

export const DEFAULT_OP_CATS = ["salary", "logistics", "materials", "other"];

export function finCalc(fin: FinInput) {
  const c: FinCtrl = fin.ctrl || {};
  const cv = n(c.contract_value);
  const vatPct = n(c.vat_pct);
  const vatIncluded = !!c.vat_included;
  const isInternalMkt = !!c.mkt_internal;

  let contractNet: number;
  let vatAmt: number;
  if (vatIncluded) {
    contractNet = cv / (1 + vatPct / 100);
    vatAmt = cv - contractNet;
  } else {
    contractNet = cv;
    vatAmt = (cv * vatPct) / 100;
  }
  const grossTotal = contractNet + vatAmt;

  const applyFee = (v: Num, type: string, base: string): number =>
    type === "fixed" ? n(v) : ((base === "gross" ? grossTotal : contractNet) * n(v)) / 100;

  const execAmt = applyFee(c.exec_v, c.exec_type || "pct", c.exec_base || "net");
  const mkt = applyFee(c.mkt_v, c.mkt_type || "pct", c.mkt_base || "net");
  const cb = applyFee(c.cb_v, c.cb_type || "pct", c.cb_base || "net");
  const cfAmt = applyFee(c.cf_v, c.cf_type || "pct", c.cf_base || "net");

  const budgetTotal = (fin.budget || []).reduce((s, b) => s + n(b.amount), 0);

  const entries = fin.entries || [];
  const expenses = entries.filter((e) => e.type === "expense");
  const incomes = entries.filter((e) => e.type === "income");
  const totalExpenses = sum(expenses);
  const totalIncome = sum(incomes);
  const execIncomeReg = sum(incomes.filter((e) => e.cat === "exec"));
  const profitMargins = expenses.reduce((s, e) => {
    const pm = n(e.profit_margin);
    return s + ((e.profit_margin_type || "pct") === "fixed" ? pm : (pm * n(e.amount)) / 100);
  }, 0);
  const nonExecInc = totalIncome - execIncomeReg;

  const mktShare = isInternalMkt ? mkt : 0;
  const profit =
    execIncomeReg > 0
      ? Math.max(0, execIncomeReg + profitMargins + nonExecInc + mktShare)
      : Math.max(0, execAmt + profitMargins + nonExecInc + mktShare);

  const available = grossTotal - execAmt - mkt - cb - cfAmt;
  const totalAllEntries = sum(entries);
  const obligations = execAmt + mkt + cb + cfAmt;

  const opCats = c.op_cats?.length ? c.op_cats : DEFAULT_OP_CATS;
  const opExpenses = sum(expenses.filter((e) => opCats.includes(e.cat ?? "")));
  const totalDeductions = totalAllEntries;
  const remaining = grossTotal - totalDeductions;
  const remainingExec = available - opExpenses;
  const totalSpent = sum(expenses);

  const regCats = entries.map((e) => e.cat);
  const missingItems: string[] = [];
  if (cfAmt > 0 && !regCats.includes("cf")) missingItems.push("ضريبة القيمة المضافة (الرسوم)");
  if (execAmt > 0 && !regCats.includes("exec")) missingItems.push("أتعاب التنفيذ");
  if (mkt > 0 && !regCats.includes("mkt")) missingItems.push("التسويق");
  if (cb > 0 && !regCats.includes("cashback")) missingItems.push("كاش باك");

  return {
    cv,
    vatIncluded,
    vatPct,
    vatAmt,
    contractNet,
    grossTotal,
    execAmt,
    mkt,
    cb,
    budgetTotal,
    available,
    obligations,
    opExpenses,
    remainingExec,
    totalSpent,
    remainingFromGross: remaining,
    totalDeductions,
    opCats,
    defaultOpCats: DEFAULT_OP_CATS,
    totalExpenses,
    totalIncome,
    totalAllEntries,
    execIncomeReg,
    nonExecInc,
    profitMargins,
    profit,
    remaining,
    cfAmt,
    isInternalMkt,
    missingItems,
  };
}

export type FinResult = ReturnType<typeof finCalc>;
