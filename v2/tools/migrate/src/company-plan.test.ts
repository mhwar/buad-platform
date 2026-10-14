import { describe, expect, it } from "vitest";
import { planCompany } from "./company-plan";

export const PF = {
  income: [
    {
      id: "i1",
      date: "2026-03-30",
      payment_date: "2026-04-02",
      desc: "استشارة",
      category: "consulting",
      amount: 2000,
    },
    { id: "i2", date: "2026-02-01", desc: "مزامنة قديمة", category: "project_fee", amount: 9999 },
    {
      id: "i3",
      date: "2026-02-01",
      desc: "مرتبط بمشروع",
      category: "other",
      amount: 50,
      project_id: "p1",
    },
    { id: "i4", date: "x", desc: "", category: "weird", amount: "120.5" },
  ],
  expenses: [{ id: "e1", date: "2026-04-10", desc: "استضافة", category: "hosting", amount: 500 }],
  partners: [
    { id: "pa", name: "سلطان", share_pct: 60, note: "" },
    { id: "pb", name: "أحمد", share_pct: 40 },
  ],
  distributions: [
    {
      id: "d1",
      created_at: "2026-07-01T10:00:00Z",
      period_type: "q2",
      period_label: "الربع الثاني 2026",
      from_date: "2026-04-01",
      to_date: "2026-06-30",
      gross_income: 12000,
      gross_expenses: 500,
      net_profit: 11500,
      distribution_pct: 80,
      distributed_amount: 9200,
      retained_amount: 2300,
      retained_category: "dev",
      selected_project_ids: ["p1"],
      entries: [
        { partner_id: "pa", partner_name: "سلطان", share_pct: 60, amount: 5520 },
        { partner_id: "pb", partner_name: "أحمد", share_pct: 40, amount: 3680 },
      ],
      status: "completed",
    },
    {
      id: "d2",
      period_type: "q3",
      net_profit: 100,
      distributed_amount: 100,
      status: "draft",
      entries: [],
    },
  ],
};

describe("v1 company finance → v2", () => {
  it("keeps real entries, skips v1 sync leftovers, and sums like v1", () => {
    const c = planCompany(PF);
    expect(c.entries.map((e) => e.v1Id)).toEqual(["i1", "i4", "e1"]);
    expect(c.skipped).toBe(2);
    expect(c.entries[0]).toMatchObject({ paymentDate: "2026-04-02", amount: 200000 });
    expect(c.entries[1]).toMatchObject({
      category: "other",
      date: "",
      description: "(بدون وصف)",
      amount: 12050,
    });
    expect(c.partners).toHaveLength(2);
    expect(c.distributions[0]).toMatchObject({
      status: "completed",
      distributedAmount: 920000,
      retainedAmount: 230000,
      retainedCategory: "dev",
      projectIds: ["p1"],
    });
    expect(c.distributions[0]?.shares.map((s) => s.amount)).toEqual([552000, 368000]);
    expect(c.totals).toEqual({
      income: 212050,
      expenses: 50000,
      distributed: 920000,
      retained: 230000,
    });
    expect(planCompany(undefined).entries).toEqual([]);
  });
});
