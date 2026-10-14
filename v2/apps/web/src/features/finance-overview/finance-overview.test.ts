import { describe, expect, it } from "vitest";
import { presetPeriod } from "./api";
import { reportCsv } from "./ReportPage";

describe("finance overview helpers", () => {
  it("turns presets into date ranges", () => {
    const d = new Date("2026-10-14T00:00:00Z");
    expect(presetPeriod("year", d)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(presetPeriod("last", d)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(presetPeriod("all", d)).toEqual({});
  });
  it("exports the report as one CSV with a BOM and titled sections", () => {
    const csv = reportCsv(
      {
        org: { name: "بُعد", reg: "", tax: "", urls: {} },
        generatedAt: 0,
        period: { from: "", to: "" },
        totals: {
          gross: 115000,
          net: 100000,
          vat: 15000,
          profit: 11500,
          margin: 10,
          spent: 10000,
          income: 0,
          remaining: 105000,
          projects: 1,
          withoutFinance: 0,
          pending: 0,
          unregistered: 0,
        },
        projects: [
          {
            id: "p",
            number: "PRJ-1",
            name: "أكاديمية، ق",
            clientId: "c",
            clientName: "أجيالنا",
            status: "active",
            date: "2026-03-01",
            hasFinance: true,
            gross: 115000,
            net: 100000,
            vat: 15000,
            profit: 11500,
            margin: 10,
            spent: 10000,
            income: 0,
            remaining: 105000,
          },
        ],
        clients: [],
        monthly: [{ month: "2026-03", income: 0, expense: 10000 }],
        categories: [{ label: "رواتب", amount: 10000 }],
        obligations: { pending: [], unregistered: [] },
        quality: [],
      },
      {},
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"صافي الربح","11500"');
    expect(csv).toContain('"PRJ-1","أكاديمية، ق","أجيالنا","115000"');
    expect(csv).toContain('"2026-03","0","10000"');
  });
});
