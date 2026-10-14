import { describe, expect, it } from "vitest";
import {
  bankMinimum,
  companyCalc,
  distributable,
  periodLabel,
  periodRange,
  retainedTotals,
  splitDistribution,
  splitShares,
} from "./company";

const projects = [
  { id: "a", status: "active", profit: 10000, remainingExec: 3000, date: "2026-02-10" },
  { id: "b", status: "completed", profit: 5000, remainingExec: -50, date: "2026-05-01" },
  { id: "c", status: "draft", profit: 99999, remainingExec: 7000, date: "2026-02-01" },
  { id: "d", status: "active", profit: -400, remainingExec: 1000, date: "2026-08-01" },
];
const entries = [
  {
    type: "income" as const,
    category: "consulting",
    date: "2026-03-30",
    paymentDate: "2026-04-02",
    amount: 2000,
  },
  { type: "income" as const, category: "project_fee", date: "2026-02-01", amount: 777 }, // v1 sync leftover
  { type: "expense" as const, category: "hosting", date: "2026-02-15", amount: 300 },
  { type: "expense" as const, category: "payroll", date: "2026-05-20", amount: 1200 },
];

describe("company finance (v1 «مالية المنصة»)", () => {
  it("adds earning projects (losses as zero), service income, minus company expenses", () => {
    expect(companyCalc(projects, entries)).toEqual({
      projectProfit: 15000,
      serviceIncome: 2000,
      companyExpenses: 1500,
      income: 17000,
      netProfit: 15500,
    });
  });
  it("places income by the day it reached the bank", () => {
    const q1 = companyCalc(projects, entries, "2026-01-01", "2026-03-31");
    expect(q1).toMatchObject({ projectProfit: 10000, serviceIncome: 0, companyExpenses: 300 });
    const q2 = companyCalc(projects, entries, "2026-04-01", "2026-06-30");
    expect(q2).toMatchObject({ projectProfit: 5000, serviceIncome: 2000, companyExpenses: 1200 });
  });
  it("available = all-time net − completed distributions; retained by purpose", () => {
    const dists = [
      {
        status: "completed" as const,
        distributed: 8000,
        retained: 1000,
        retainedCategory: "dev" as const,
      },
      { status: "draft" as const, distributed: 4000, retained: 0, retainedCategory: null },
      { status: "completed" as const, distributed: 500, retained: 200, retainedCategory: null },
    ];
    expect(distributable(projects, entries, dists)).toMatchObject({
      distributed: 8500,
      available: 7000,
    });
    expect(retainedTotals(dists)).toEqual({ ops: 0, dev: 1000, reserve: 200, total: 1200 });
  });
  it("keeps in the bank what active projects still need", () => {
    expect(bankMinimum(projects)).toBe(4000);
  });
  it("splits exactly to the halala when shares make 100%", () => {
    const parts = splitShares(100000, [
      { id: "1", name: "أ", sharePct: 33.33 },
      { id: "2", name: "ب", sharePct: 33.33 },
      { id: "3", name: "ج", sharePct: 33.34 },
    ]);
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBe(100000);
    expect(splitDistribution(100001, 70)).toEqual({ distributed: 70001, retained: 30000 });
  });
  it("names v1 periods", () => {
    expect(periodRange("q2", new Date("2026-10-14"))).toEqual({
      from: "2026-04-01",
      to: "2026-06-30",
    });
    expect(periodRange("quarter", new Date("2026-10-14"))).toEqual({
      from: "2026-10-01",
      to: "2026-12-31",
    });
    expect(periodLabel("q4", "2026-10-01", "2026-12-31")).toBe("الربع الرابع 2026");
  });
});
