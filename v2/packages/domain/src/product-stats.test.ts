import { describe, expect, it } from "vitest";
import { plannedMargin, productStats, quarterKey, type StatProject } from "./product-stats";

const P = (o: Partial<StatProject>): StatProject => ({
  id: "p",
  clientId: "c1",
  clientName: "جسد",
  status: "completed",
  packageId: "full",
  contractNet: 100000,
  gross: 115000,
  received: 115000,
  expenses: 70000,
  profit: 30000,
  startDate: "2026-02-10",
  ...o,
});
const names = { full: "المتكاملة", transport: "نقل فقط" };
const NOW = 1_800_000_000;

describe("productStats", () => {
  const projects = [
    P({ id: "a", clientId: "c1", clientName: "جسد" }),
    P({
      id: "b",
      clientId: "c1",
      clientName: "جسد",
      contractNet: 50000,
      gross: 57500,
      received: 28750,
      profit: 10000,
      startDate: "2026-08-01",
      packageId: "transport",
    }),
    P({
      id: "c",
      clientId: "c2",
      clientName: "النور",
      contractNet: 50000,
      gross: 57500,
      received: 0,
      profit: -5000,
      status: "active",
      packageId: "",
      startDate: "",
    }),
  ];
  const s = productStats({
    projects,
    requests: [],
    plannedMarginPct: 25,
    packageNames: names,
    now: NOW,
  });

  it("totals", () => {
    expect(s.totals).toMatchObject({
      projects: 3,
      active: 1,
      completed: 2,
      entities: 2,
      repeatEntities: 1,
      contractNet: 200000,
      gross: 230000,
      received: 143750,
      profit: 35000,
      avgContract: 66666.67,
    });
    // 30,000 fully received + 10,000 × 50% received + nothing for the unpaid loss-making one
    expect(s.totals.realizedProfit).toBe(35000);
    expect(s.totals.marginPct).toBe(17.5);
  });

  it("margin against the plan", () => {
    expect(s.marginGap).toBe(-7.5);
    expect(s.insights).toContainEqual({ code: "margin_below_plan", gap: 7.5 });
  });

  it("per package, entity and quarter", () => {
    expect(s.packages.map((p) => [p.name, p.projects])).toEqual([
      ["المتكاملة", 1],
      ["نقل فقط", 1],
      ["بدون باقة محددة", 1],
    ]);
    expect(s.packages[0]).toMatchObject({
      contractNet: 100000,
      profit: 30000,
      marginPct: 30,
      share: 33.33,
    });
    expect(s.entities[0]).toMatchObject({ name: "جسد", projects: 2, contractNet: 150000 });
    expect(s.trend).toEqual([
      { key: "2026-Q1", projects: 1, contractNet: 100000 },
      { key: "2026-Q3", projects: 1, contractNet: 50000 },
      { key: "—", projects: 1, contractNet: 50000 },
    ]);
  });

  it("rule-based insights", () => {
    const codes = s.insights.map((i) => i.code);
    expect(codes).toContain("repeat_entities");
    expect(codes).toContain("no_package");
    expect(codes).toContain("losing_projects");
    expect(codes).not.toContain("top_package");
  });

  it("flags a dominant package and a margin above plan", () => {
    const many = [P({ id: "1" }), P({ id: "2" }), P({ id: "3", packageId: "transport" })];
    const r = productStats({
      projects: many,
      requests: [],
      plannedMarginPct: 20,
      packageNames: names,
      now: NOW,
    });
    expect(r.insights).toContainEqual({ code: "top_package", name: "المتكاملة", share: 66.67 });
    expect(r.insights).toContainEqual({ code: "margin_above_plan", gap: 10 });
  });

  it("requests funnel and stale requests", () => {
    const req = [
      { status: "new", createdAt: NOW - 5 * 86400 },
      { status: "new", createdAt: NOW - 3600 },
      { status: "contacted", createdAt: NOW },
      { status: "quoted", createdAt: NOW },
      { status: "won", createdAt: NOW },
      { status: "lost", createdAt: NOW },
    ];
    const r = productStats({
      projects: [],
      requests: req,
      plannedMarginPct: null,
      packageNames: {},
      now: NOW,
    });
    expect(r.funnel).toMatchObject({ total: 6, new: 2, won: 1, lost: 1, conversionPct: 16.67 });
    expect(r.insights).toContainEqual({ code: "stale_requests", count: 1 });
    expect(r.insights).toContainEqual({ code: "low_conversion", pct: 16.67 });
    expect(r.insights).toContainEqual({ code: "no_projects" });
    expect(r.marginGap).toBeNull();
  });
});

describe("helpers", () => {
  it("quarter keys and planned margin", () => {
    expect(quarterKey("2026-08-01")).toBe("2026-Q3");
    expect(quarterKey("")).toBe("");
    expect(plannedMargin("margin", 20)).toBe(20);
    expect(plannedMargin("markup", 25)).toBe(20);
    expect(plannedMargin("markup", 0)).toBeNull();
    expect(plannedMargin("fixed", 0)).toBeNull();
  });
});
