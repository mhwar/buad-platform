import { type FinInput, finCalc } from "./fincalc";

/** Shape of v2 finance as stored (money in halalas). */
export type StoredFinance = {
  ctrl: {
    contractValue: number;
    vatIncluded: boolean;
    vatPct: number;
    execV: number;
    execType: string;
    execBase: string;
    mktV: number;
    mktType: string;
    mktBase: string;
    mktInternal: boolean;
    cbV: number;
    cbType: string;
    cbBase: string;
    cfV: number;
    cfType: string;
    cfBase: string;
    opCats: string[];
  };
  entries: {
    type: string;
    cat: string;
    amount: number;
    profitMargin: number;
    profitMarginType: string;
  }[];
  budget: { amount: number }[];
};

/** Converts stored v2 finance to the v1-shaped input finCalc expects (halalas → riyals). */
export function toFinInput(f: StoredFinance): FinInput {
  const c = f.ctrl;
  return {
    ctrl: {
      contract_value: c.contractValue / 100,
      vat_included: c.vatIncluded,
      vat_pct: c.vatPct,
      exec_v: c.execV,
      exec_type: c.execType as "pct",
      exec_base: c.execBase as "net",
      mkt_v: c.mktV,
      mkt_type: c.mktType as "pct",
      mkt_base: c.mktBase as "net",
      mkt_internal: c.mktInternal,
      cb_v: c.cbV,
      cb_type: c.cbType as "pct",
      cb_base: c.cbBase as "net",
      cf_v: c.cfV,
      cf_type: c.cfType as "pct",
      cf_base: c.cfBase as "net",
      op_cats: c.opCats,
    },
    entries: f.entries.map((e) => ({
      type: e.type as "income",
      cat: e.cat,
      amount: e.amount / 100,
      profit_margin: e.profitMargin,
      profit_margin_type: e.profitMarginType as "pct",
    })),
    budget: f.budget.map((b) => ({ amount: b.amount / 100 })),
  };
}

export const summarize = (f: StoredFinance) => finCalc(toFinInput(f));
