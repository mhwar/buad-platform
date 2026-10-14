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
