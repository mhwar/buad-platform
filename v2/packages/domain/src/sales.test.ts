import { describe, expect, it } from "vitest";
import { cleanTags, daysSince, followUpState, relationshipOf } from "./sales";

const NOW = 1_800_000_000;
const D = 86400;
const base = {
  activeProjects: 0,
  completedProjects: 0,
  openRequests: 0,
  openQuotes: 0,
  lastTouch: 0,
  createdAt: NOW - 10 * D,
  now: NOW,
};

describe("relationshipOf", () => {
  it("a running project makes the client active, whatever else is true", () => {
    expect(
      relationshipOf({ ...base, activeProjects: 1, completedProjects: 3, openRequests: 2 }),
    ).toBe("active");
  });
  it("an open enquiry or quote makes a prospect (unless active)", () => {
    expect(relationshipOf({ ...base, openRequests: 1 })).toBe("prospect");
    expect(relationshipOf({ ...base, openQuotes: 1, completedProjects: 2 })).toBe("prospect");
  });
  it("finished work makes a former client", () => {
    expect(relationshipOf({ ...base, completedProjects: 1, lastTouch: NOW - 400 * D })).toBe(
      "former",
    );
  });
  it("silence for more than six months makes dormant; recent contact keeps them new", () => {
    expect(relationshipOf({ ...base, createdAt: NOW - 200 * D })).toBe("dormant");
    expect(relationshipOf({ ...base, createdAt: NOW - 200 * D, lastTouch: NOW - 30 * D })).toBe(
      "new",
    );
    expect(relationshipOf({ ...base, createdAt: NOW - 181 * D, lastTouch: NOW - 181 * D })).toBe(
      "dormant",
    );
    expect(relationshipOf({ ...base, createdAt: NOW - 180 * D, lastTouch: NOW - 180 * D })).toBe(
      "new",
    );
    expect(relationshipOf(base)).toBe("new");
  });
});

describe("follow-ups", () => {
  it("compares the date with today", () => {
    expect(followUpState("", "2026-03-10")).toBe("none");
    expect(followUpState("2026-03-09", "2026-03-10")).toBe("overdue");
    expect(followUpState("2026-03-10", "2026-03-10")).toBe("today");
    expect(followUpState("2026-03-17", "2026-03-10")).toBe("soon");
    expect(followUpState("2026-03-18", "2026-03-10")).toBe("later");
  });
  it("counts days since the last contact", () => {
    expect(daysSince(0, NOW)).toBeNull();
    expect(daysSince(NOW - 3 * D - 100, NOW)).toBe(3);
    expect(daysSince(NOW + 100, NOW)).toBe(0);
  });
});

describe("cleanTags", () => {
  it("trims, drops empties and duplicates, and caps length and count", () => {
    expect(cleanTags([" مهم ", "", "مهم", "VIP"])).toEqual(["مهم", "VIP"]);
    expect(cleanTags(["x".repeat(40)])[0]).toHaveLength(24);
    expect(cleanTags(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(10);
  });
});

import {
  avgCycleDays,
  bySource,
  isStale,
  monthlyWon,
  pipelineStats,
  winRate,
  wonThisQuarter,
} from "./sales";

describe("the pipeline", () => {
  const lead = (status: string, value: number, extra: object = {}) => ({
    status,
    valueHalalas: value,
    createdAt: NOW - 30 * D,
    updatedAt: NOW - D,
    ...extra,
  });

  it("totals each open stage, weighted by its probability", () => {
    const s = pipelineStats([
      lead("new", 100_000),
      lead("quoted", 100_000),
      lead("quoted", 50_000),
      lead("negotiating", 200_000),
      lead("won", 999),
      lead("lost", 999),
    ]);
    expect(s.stages.map((x) => [x.stage, x.count, x.value, x.weighted])).toEqual([
      ["new", 1, 100_000, 10_000],
      ["contacted", 0, 0, 0],
      ["quoted", 2, 150_000, 60_000],
      ["negotiating", 1, 200_000, 130_000],
    ]);
    expect(s.open).toEqual({ count: 4, value: 450_000, weighted: 200_000 });
  });

  it("win rate counts only closed leads; no closed leads is not zero", () => {
    expect(winRate(3, 1)).toBe(75);
    expect(winRate(1, 2)).toBe(33.3);
    expect(winRate(0, 0)).toBeNull();
  });

  it("averages days to win", () => {
    expect(avgCycleDays([])).toBeNull();
    expect(
      avgCycleDays([
        { createdAt: NOW - 10 * D, updatedAt: NOW },
        { createdAt: NOW - 20 * D, updatedAt: NOW },
      ]),
    ).toBe(15);
  });

  it("a lead untouched for more than a week is stale, only while open", () => {
    expect(isStale({ status: "contacted", updatedAt: NOW - 8 * D }, NOW)).toBe(true);
    expect(isStale({ status: "contacted", updatedAt: NOW - 7 * D }, NOW)).toBe(false);
    expect(isStale({ status: "won", updatedAt: NOW - 90 * D }, NOW)).toBe(false);
  });

  it("breaks results down by source, busiest first", () => {
    const r = bySource([
      lead("won", 1, { source: "site" }),
      lead("lost", 1, { source: "site" }),
      lead("won", 1, { source: "referral" }),
      lead("new", 1, { source: "referral" }),
      lead("new", 1, { source: "referral" }),
      lead("new", 1),
    ]);
    expect(r.map((x) => [x.source, x.total, x.rate])).toEqual([
      ["referral", 3, 100],
      ["site", 2, 50],
      ["other", 1, null],
    ]);
  });

  it("sums wins per month over the last twelve, and this quarter", () => {
    const jan = Date.UTC(2026, 0, 15) / 1000;
    const may = Date.UTC(2026, 4, 2) / 1000;
    const now = Date.UTC(2026, 4, 20) / 1000;
    const m = monthlyWon(
      [
        lead("won", 100, { updatedAt: jan }),
        lead("won", 50, { updatedAt: may }),
        lead("won", 25, { updatedAt: may }),
        lead("new", 999, { updatedAt: may }),
        lead("won", 7, { updatedAt: Date.UTC(2024, 0, 1) / 1000 }),
      ],
      now,
    );
    expect(m).toHaveLength(12);
    expect(m.at(-1)).toEqual({ month: "2026-05", value: 75 });
    expect(m.find((x) => x.month === "2026-01")?.value).toBe(100);
    expect(m[0]?.month).toBe("2025-06");
    expect(
      wonThisQuarter(
        [lead("won", 100, { updatedAt: jan }), lead("won", 50, { updatedAt: may })],
        now,
      ),
    ).toBe(50); // Q2 starts in April
  });
});
