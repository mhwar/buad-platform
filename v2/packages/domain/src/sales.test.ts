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
