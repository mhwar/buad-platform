import { describe, expect, it } from "vitest";
import {
  previousQuarter,
  profitBalances,
  quarterDistributable,
  quarterOf,
  quarterRange,
  quarterView,
  realizedProfit,
} from "./realized";

const p = (id: string, profit: number, gross: number, extra = {}) => ({
  id,
  number: id,
  name: id,
  status: "active",
  profit,
  gross,
  hasFinance: true,
  unregistered: false,
  pendingExpenses: 0,
  ...extra,
});

describe("realized profit (by money received)", () => {
  it("is proportional to what was received, capped, and never from refunds alone", () => {
    expect(realizedProfit(20000, 100000, 50000)).toBe(10000);
    expect(realizedProfit(20000, 100000, 130000)).toBe(20000);
    expect(realizedProfit(20000, 100000, -500)).toBe(0);
    expect(realizedProfit(20000, 0, 5000)).toBe(0);
  });

  it("splits instalments between quarters", () => {
    const receipts = [
      { projectId: "a", date: "2026-08-10", amount: 50000 },
      { projectId: "a", date: "2026-11-02", amount: 50000 },
    ];
    const q3 = quarterView([p("a", 20000, 100000)], receipts, {}, "2026-07-01", "2026-09-30");
    expect(q3.rows[0]).toMatchObject({
      receivedInPeriod: 50000,
      realizedInPeriod: 10000,
      available: 10000,
    });
    const q4 = quarterView(
      [p("a", 20000, 100000)],
      receipts,
      { a: 10000 },
      "2026-10-01",
      "2026-12-31",
    );
    expect(q4.rows[0]).toMatchObject({
      realizedInPeriod: 10000,
      distributed: 10000,
      available: 10000,
    });
  });

  it("never pays the same profit twice, and carries an over-payment", () => {
    const receipts = [{ projectId: "a", date: "2026-08-10", amount: 100000 }];
    // Profit dropped to 15,000 after 20,000 were already distributed.
    const v = quarterView(
      [p("a", 15000, 100000)],
      receipts,
      { a: 20000 },
      "2026-10-01",
      "2026-12-31",
    );
    expect(v.rows[0]).toMatchObject({ available: -5000 });
    expect(v.rows[0]?.flags).toContain("over_distributed");
    const d = quarterDistributable([...v.rows, { id: "b", available: 8000 }], ["b"], 1000, 500);
    expect(d).toMatchObject({ projects: 8000, carried: -5000, companyNet: 500, total: 3500 });
    expect(d.perProject).toEqual([
      { projectId: "b", amount: 8000 },
      { projectId: "a", amount: -5000 },
    ]);
  });

  it("flags what the user must know", () => {
    const v = quarterView(
      [
        p("x", 1000, 5000, { hasFinance: false }),
        p("y", 1000, 5000, { status: "cancelled", pendingExpenses: 10 }),
      ],
      [{ projectId: "y", date: "2026-02-01", amount: 5000 }],
      {},
      "2026-01-01",
      "2026-03-31",
    );
    expect(v.rows[0]?.flags).toEqual(expect.arrayContaining(["no_receipts", "estimate"]));
    expect(v.rows[1]?.flags).toEqual(expect.arrayContaining(["cancelled", "pending_expenses"]));
  });

  it("knows quarters", () => {
    expect(quarterOf("2026-08-14")).toEqual({ year: 2026, q: 3 });
    expect(quarterRange(2026, 1)).toEqual({ from: "2026-01-01", to: "2026-03-31" });
    expect(quarterRange(2024, 1).to).toBe("2024-03-31");
    expect(previousQuarter(2026, 1)).toEqual({ year: 2025, q: 4 });
  });
});

describe("profit balances", () => {
  it("realized + company net − what distributions settled = undistributed", () => {
    const b = profitBalances({
      projects: [
        { id: "a", status: "completed", profit: 10000, gross: 115000 },
        { id: "b", status: "active", profit: 6000, gross: 60000 },
        { id: "c", status: "cancelled", profit: 9000, gross: 9000 },
      ],
      receipts: [
        { projectId: "a", date: "2026-02-01", amount: 115000 },
        { projectId: "b", date: "2026-05-01", amount: 30000 },
        { projectId: "c", date: "2026-05-01", amount: 9000 },
      ],
      companyIncome: 2000,
      companyExpenses: 3000,
      settled: [{ netProfit: 8000, distributed: 6000, retained: 2000 }],
    });
    expect(b).toEqual({
      realized: 13000, // all of a, half of b, nothing of the cancelled c
      companyNet: -1000,
      distributed: 6000,
      retained: 2000,
      undistributed: 4000,
    });
  });
});
