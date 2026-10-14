import { describe, expect, it } from "vitest";
import {
  addDays,
  aging,
  bucketOf,
  cashForecast,
  firstShortfall,
  reminderText,
} from "./receivables";

const T = "2026-03-01";
describe("receivables", () => {
  it("puts an instalment in the right age bucket", () => {
    expect(bucketOf("2026-03-01", T)).toBe("current"); // due today is not late yet
    expect(bucketOf("2026-04-01", T)).toBe("current");
    expect(bucketOf("2026-02-28", T)).toBe("d1_30");
    expect(bucketOf("2026-01-30", T)).toBe("d1_30"); // 30 days
    expect(bucketOf("2026-01-29", T)).toBe("d31_60");
    expect(bucketOf("2025-12-30", T)).toBe("d61_90"); // 61 days
    expect(bucketOf("2025-11-01", T)).toBe("d90");
  });

  it("sums buckets and the overdue total", () => {
    const a = aging(
      [
        { dueDate: "2026-04-01", amount: 100 },
        { dueDate: "2026-02-20", amount: 200 },
        { dueDate: "2026-02-10", amount: 300 },
        { dueDate: "2025-10-01", amount: 400 },
      ],
      T,
    );
    expect(a.buckets.current).toEqual({ amount: 100, count: 1 });
    expect(a.buckets.d1_30).toEqual({ amount: 500, count: 2 });
    expect(a.buckets.d90.amount).toBe(400);
    expect(a.overdue).toBe(900);
    expect(a.total).toBe(1000);
  });

  it("builds 13 weeks from the opening balance; overdue and undated land in week one", () => {
    const w = cashForecast({
      today: T,
      opening: 1000,
      inflows: [
        { date: "2026-02-01", amount: 500 }, // overdue → week 1
        { date: "2026-03-09", amount: 700 }, // week 2
        { date: "2027-01-01", amount: 9999 }, // beyond the horizon
      ],
      outflows: [
        { date: "", amount: 200 }, // undated → week 1
        { date: "2026-03-09", amount: 2500 },
      ],
    });
    expect(w).toHaveLength(13);
    expect(w[0]).toMatchObject({
      start: "2026-03-01",
      end: "2026-03-07",
      inflow: 500,
      outflow: 200,
      net: 300,
      balance: 1300,
    });
    expect(w[1]).toMatchObject({ inflow: 700, outflow: 2500, balance: -500 });
    expect(w[12]?.balance).toBe(-500);
    expect(firstShortfall(w)?.start).toBe("2026-03-08");
    expect(
      firstShortfall(cashForecast({ today: T, opening: 5, inflows: [], outflows: [] })),
    ).toBeNull();
  });

  it("adds days across month ends and writes a reminder", () => {
    expect(addDays("2026-02-27", 3)).toBe("2026-03-02");
    expect(
      reminderText({
        client: "جمعية الأمل",
        project: "ملتقى",
        label: "الدفعة الثانية",
        amountRiyals: "11,500 ر.س",
        dueDate: "2026-03-01",
        org: "بُعد",
      }),
    ).toContain("الدفعة الثانية");
  });
});
