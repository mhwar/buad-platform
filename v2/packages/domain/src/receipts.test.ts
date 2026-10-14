import { describe, expect, it } from "vitest";
import { quarterLabelOf, receiptWarnings, suggestReceipt } from "./receipts";

describe("receipt proposals", () => {
  it("prefers the old platform's received date, then the fee income date, then the contract and start", () => {
    expect(suggestReceipt({ payDate: "2026-08-05", execIncomeDate: "2026-06-01" })).toMatchObject({
      date: "2026-08-05",
      source: "pay_date",
    });
    expect(
      suggestReceipt({ execIncomeDate: "2026-06-01", contractDate: "2026-05-01" }),
    ).toMatchObject({
      date: "2026-06-01",
      source: "exec_income",
    });
    expect(suggestReceipt({ contractDate: "2026-05-01", startDate: "2026-07-01" })?.source).toBe(
      "contract_date",
    );
    expect(suggestReceipt({ startDate: "2026-07-01" })?.source).toBe("start_date");
    expect(suggestReceipt({ payDate: "bad", contractDate: "" })).toBeNull();
  });

  it("warns about what decides the quarter", () => {
    expect(receiptWarnings("2026-09-29", "", "2026-10-14")).toEqual(["near_quarter_edge"]);
    expect(receiptWarnings("2026-10-02", "", "2026-10-14")).toEqual(["near_quarter_edge"]);
    expect(receiptWarnings("2026-08-15", "2026-09-01", "2026-10-14")).toEqual(["before_contract"]);
    expect(receiptWarnings("2027-01-20", "", "2026-10-14")).toEqual(["future"]);
    expect(receiptWarnings("2026-08-15", "2026-07-01", "2026-10-14")).toEqual([]);
  });

  it("names the quarter", () => {
    expect(quarterLabelOf("2026-08-15")).toBe("الربع الثالث 2026");
    expect(quarterLabelOf("")).toBe("");
  });
});
