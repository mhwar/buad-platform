import { describe, expect, it } from "vitest";
import { reviewFlags } from "./year-review";

const p = (o: Partial<Parameters<typeof reviewFlags>[0]>) =>
  reviewFlags({
    status: "active",
    gross: 1_150_000,
    received: 0,
    estimated: false,
    overdueLines: 0,
    ...o,
  });

describe("reviewFlags", () => {
  it("a finished project still owed money is the first thing to check", () => {
    expect(p({ status: "completed", received: 500_000 })).toEqual(["closed_not_paid"]);
    expect(p({ status: "completed", received: 0 })).toEqual(["closed_not_paid", "no_receipts"]);
  });
  it("a running project fully paid should probably be closed", () => {
    expect(p({ received: 1_150_000 })).toEqual(["paid_not_closed"]);
    // a riyal of rounding is not a debt
    expect(p({ received: 1_149_950 })).toEqual(["paid_not_closed"]);
    expect(p({ status: "completed", received: 1_149_950 })).toEqual([]);
  });
  it("overdue lines, missing receipts and estimated values are flagged", () => {
    expect(p({ overdueLines: 2, received: 100 })).toEqual(["overdue"]);
    expect(p({})).toEqual(["no_receipts"]);
    expect(p({ estimated: true, received: 100 })).toEqual(["no_contract"]);
  });
  it("a cancelled project asks nothing", () => {
    expect(p({ status: "cancelled", estimated: true })).toEqual([]);
  });
});
