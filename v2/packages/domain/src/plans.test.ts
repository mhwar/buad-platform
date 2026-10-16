import { describe, expect, it } from "vitest";
import {
  attainment,
  cycleProgress,
  objectiveProgress,
  planStatus,
  yearQuarterRange,
} from "./plans";

describe("plans", () => {
  it("measures an indicator from baseline to target, clamped", () => {
    expect(attainment({ baseline: 0, target: 100, current: 40 })).toBe(0.4);
    expect(attainment({ baseline: 0, target: 100, current: 250 })).toBe(1);
    expect(attainment({ baseline: 10, target: 100, current: 5 })).toBe(0);
    expect(attainment({ baseline: 100, target: 60, current: 80, direction: "down" })).toBe(0.5);
    expect(attainment({ baseline: 5, target: 5, current: 5 })).toBe(1);
    expect(attainment({ baseline: 5, target: 5, current: 7, direction: "down" })).toBe(0);
  });

  it("averages indicators and initiatives; nothing to measure is not zero", () => {
    expect(objectiveProgress([], [])).toBeNull();
    expect(objectiveProgress([{ baseline: 0, target: 10, current: 5 }], [])).toBe(0.5);
    expect(
      objectiveProgress(
        [{ baseline: 0, target: 10, current: 10 }],
        [{ status: "todo" }, { status: "done" }],
      ),
    ).toBeCloseTo(0.75);
    expect(objectiveProgress([], [{ status: "doing" }])).toBe(0.5);
  });

  it("rolls objectives up by weight and skips unmeasured ones", () => {
    expect(
      cycleProgress([
        { weight: 3, progress: 1 },
        { weight: 1, progress: 0 },
        { weight: 5, progress: null },
      ]),
    ).toBe(0.75);
    expect(cycleProgress([{ weight: 1, progress: null }])).toBeNull();
  });

  it("compares progress with elapsed time", () => {
    const s = "2026-01-01";
    const e = "2026-12-31";
    expect(planStatus(null, s, e, "2026-06-01")).toBe("no_data");
    expect(planStatus(1, s, e, "2026-02-01")).toBe("done");
    expect(planStatus(0.2, s, e, "2025-12-01")).toBe("not_started");
    expect(planStatus(0.5, s, e, "2026-07-02")).toBe("on_track");
    expect(planStatus(0.3, s, e, "2026-07-02")).toBe("at_risk");
    expect(planStatus(0.1, s, e, "2026-07-02")).toBe("late");
  });

  it("gives quarter ranges including leap years", () => {
    expect(yearQuarterRange(2026, 1)).toEqual({ start: "2026-01-01", end: "2026-03-31" });
    expect(yearQuarterRange(2026, 2).end).toBe("2026-06-30");
    expect(yearQuarterRange(2026, 4).end).toBe("2026-12-31");
    expect(yearQuarterRange(2026, 0)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });
});

import { initiativeDone, monthsOf, targetPace } from "./plans";

describe("tracking a target", () => {
  it("compares the actual with straight-line pacing and projects the year", () => {
    const p = targetPace({
      target: 2_000_000,
      actual: 600_000,
      start: "2027-01-01",
      end: "2027-12-31",
      today: "2027-06-30",
    });
    expect(p.share).toBeCloseTo(181 / 365, 3);
    expect(p.expected).toBe(Math.round(2_000_000 * (181 / 365)));
    expect(p.projected).toBe(Math.round((600_000 / 181) * 365));
    expect(p.gap).toBe(1_400_000);
    expect(p.ahead).toBe(false);
    expect(p.perMonthNeeded).toBeGreaterThan(200_000);
  });
  it("before the start nothing is expected", () => {
    const p = targetPace({
      target: 100,
      actual: 0,
      start: "2027-01-01",
      end: "2027-12-31",
      today: "2026-12-01",
    });
    expect([p.expected, p.projected, p.ahead]).toEqual([0, 0, true]);
  });
  it("splits a period into months, clipped to it", () => {
    const m = monthsOf("2027-01-15", "2027-03-10");
    expect(m.map((x) => x.key)).toEqual(["2027-01", "2027-02", "2027-03"]);
    expect(m[0]).toMatchObject({ start: "2027-01-15", end: "2027-01-31" });
    expect(m[2]).toMatchObject({ start: "2027-03-01", end: "2027-03-10" });
  });
  it("an initiative with tasks counts their completion", () => {
    expect(initiativeDone({ status: "doing", tasks: { total: 4, done: 1 } })).toBe(0.25);
    expect(initiativeDone({ status: "doing" })).toBe(0.5);
    expect(initiativeDone({ status: "done", tasks: { total: 4, done: 1 } })).toBe(1);
  });
});
