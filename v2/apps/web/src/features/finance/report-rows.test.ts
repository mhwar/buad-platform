import { describe, expect, it } from "vitest";
import type { Finance } from "./api";
import { agreementRows, budgetRows } from "./ProjectFinanceReport";

const fin = {
  ctrl: {
    execV: 10,
    execType: "pct",
    execBase: "net",
    mktV: 500,
    mktType: "fixed",
    mktBase: "net",
    cbV: 0,
    cbType: "pct",
    cbBase: "net",
    cfV: 0,
    cfType: "pct",
    cfBase: "net",
    vatPct: 15,
  },
  summary: { execAmt: 10000, mkt: 500, cb: 0, cfAmt: 0 },
  budget: [{ id: "b1", name: "قاعة", amount: 300000, note: "", sort: 0 }],
  categories: [],
  entries: [
    { cat: "exec", type: "income", amount: 1000000, status: "paid" },
    { cat: "mkt", type: "expense", amount: 20000, status: "paid" },
    { cat: "mkt", type: "expense", amount: 99999, status: "cancelled" },
    { cat: "bdg_b1", type: "expense", amount: 350000, status: "" },
  ],
} as unknown as Finance;

describe("project report rows", () => {
  it("agreement: agreed vs registered (cancelled ignored)", () => {
    expect(agreementRows(fin)).toEqual([
      { label: "أتعاب التنفيذ", basis: "10% من الصافي", agreed: 10000, registered: 10000, diff: 0 },
      {
        label: "التسويق",
        basis: expect.stringContaining("ثابت"),
        agreed: 500,
        registered: 200,
        diff: -300,
      },
    ]);
  });
  it("budget: planned vs actual", () => {
    expect(budgetRows(fin)).toEqual([{ name: "قاعة", planned: 3000, actual: 3500, diff: -500 }]);
  });
});
