import { describe, expect, it } from "vitest";
import { quoteIsValid, quoteTotals, weightedPipeline } from "./quotes";

describe("quotes", () => {
  it("totals with discount before VAT", () => {
    const t = quoteTotals(
      [
        { label: "أ", qty: 2, unitHalalas: 50_000 },
        { label: "ب", qty: 1, unitHalalas: 20_000 },
      ],
      20_000,
      15,
    );
    expect(t).toEqual({
      subtotal: 120_000,
      discount: 20_000,
      net: 100_000,
      vat: 15_000,
      total: 115_000,
    });
  });
  it("never discounts below zero, rounds to the halala, and allows 0% VAT", () => {
    expect(quoteTotals([{ label: "أ", qty: 1, unitHalalas: 1000 }], 5000, 15).total).toBe(0);
    expect(quoteTotals([{ label: "أ", qty: 3, unitHalalas: 333 }], 0, 15)).toMatchObject({
      subtotal: 999,
      vat: 150,
      total: 1149,
    });
    expect(quoteTotals([{ label: "أ", qty: 1, unitHalalas: 1000 }], 0, 0).vat).toBe(0);
    expect(quoteTotals([], 0, 15).total).toBe(0);
  });
  it("validity and the weighted pipeline", () => {
    expect(quoteIsValid("", "2026-05-01")).toBe(true);
    expect(quoteIsValid("2026-05-01", "2026-05-01")).toBe(true);
    expect(quoteIsValid("2026-04-30", "2026-05-01")).toBe(false);
    expect(
      weightedPipeline([
        { status: "quoted", valueHalalas: 100_000 },
        { status: "negotiating", valueHalalas: 100_000 },
        { status: "won", valueHalalas: 900_000 },
        { status: "lost", valueHalalas: 900_000 },
      ]),
    ).toBe(105_000);
  });
});

import { quoteStats, scheduleSplit } from "./quotes";

describe("quote control", () => {
  const NOW = Date.parse("2026-03-10T12:00:00Z") / 1000;
  const q = (id: string, status: string, total: number, validUntil = "", days = 1) => ({
    id,
    status,
    total,
    validUntil,
    updatedAt: NOW - days * 86400,
  });

  it("counts how offers went, by number and by value, and what needs attention", () => {
    const s = quoteStats(
      [
        q("a", "accepted", 100_000),
        q("b", "rejected", 300_000),
        q("c", "sent", 200_000, "2026-03-12"),
        q("d", "sent", 200_000, "2026-03-30", 9),
        q("e", "draft", 50_000),
        q("f", "sent", 100_000, "2026-03-01"),
      ],
      "2026-03-10",
      NOW,
    );
    expect(s).toMatchObject({
      sent: 5,
      accepted: 1,
      rejected: 1,
      acceptRate: 50,
      acceptedValue: 100_000,
      avgValue: 180_000,
    });
    expect(s.expiring.map((x) => x.id)).toEqual(["c"]); // d ends later, f has already ended
    expect(s.waiting.map((x) => x.id)).toEqual(["d"]);
  });
  it("is quiet with nothing", () => {
    expect(quoteStats([], "2026-03-10", NOW)).toMatchObject({
      sent: 0,
      acceptRate: null,
      avgValue: 0,
      expiring: [],
      waiting: [],
    });
  });

  it("splits a total into instalments that add up exactly, due on the right days", () => {
    const t = scheduleSplit("thirds", 100_001, "2026-03-10");
    expect(t.map((x) => [x.dueDate, x.amount])).toEqual([
      ["2026-03-10", 40_000],
      ["2026-04-09", 30_000],
      ["2026-05-09", 30_001],
    ]);
    expect(t.reduce((s, x) => s + x.amount, 0)).toBe(100_001);
    expect(scheduleSplit("half", 11_501, "2026-01-31").map((x) => x.amount)).toEqual([
      5_751, 5_750,
    ]);
    expect(scheduleSplit("full", 500, "2026-03-10")).toEqual([
      { label: "الدفعة الكاملة", amount: 500, dueDate: "2026-04-09" },
    ]);
    expect(scheduleSplit("none", 500, "2026-03-10")).toEqual([]);
    expect(scheduleSplit("full", 0, "2026-03-10")).toEqual([]);
  });
});
