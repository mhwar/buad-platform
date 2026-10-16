import { companyEntries, orgs, users } from "@buad/schema/db";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, type Env } from "./app";
import { hashPassword } from "./auth/password";
import { testDb } from "./test-db";

const env = { APP_VERSION: "t", JWT_SECRET: "test-secret-at-least-16-chars" } as unknown as Env;
let ctx: ReturnType<typeof testDb>;
let app: ReturnType<typeof createApp>;
const cookie: Record<string, string> = {};
type J = any;
const call = async (who: string, method: string, path: string, body?: unknown) => {
  const r = await app.request(
    path,
    {
      method,
      headers: { "content-type": "application/json", cookie: cookie[who] ?? "" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
  return { status: r.status, body: (await r.json()) as J };
};
const login = async (who: string, email: string, password = "password-123") => {
  const r = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
    env,
  );
  cookie[who] = (r.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  return r.status;
};

beforeEach(async () => {
  ctx = testDb();
  app = createApp({ getDb: () => ctx.db });
  await ctx.db.insert(orgs).values([
    { id: "org_platform", name: "بُعد" },
    { id: "o2", name: "أخرى" },
  ]);
  const pw = await hashPassword("password-123");
  const mk = (
    id: string,
    role: "owner" | "admin" | "member",
    roleKey = "",
    org = "org_platform",
  ) => ({
    id,
    orgId: org,
    email: `${id}@a.sa`,
    name: id,
    role,
    roleKey,
    passwordHash: pw,
  });
  await ctx.db
    .insert(users)
    .values([
      mk("own", "owner"),
      mk("adm", "admin"),
      mk("m1", "member"),
      mk("acc", "member", "accountant"),
      mk("view", "member", "viewer"),
      mk("sal", "member", "sales"),
      mk("pm", "member", "project-manager"),
      mk("x", "owner", "", "o2"),
    ]);
  for (const id of ["own", "adm", "m1", "acc", "view", "sal", "pm", "x"])
    await login(id, `${id}@a.sa`);
});

const year = new Date().getUTCFullYear();

describe("the year-one plan template", () => {
  it("creates the strategic plan and the operational plan serving it, once per year", async () => {
    const t = (await call("own", "GET", "/api/plans/templates")).body.templates;
    expect(t[0]).toMatchObject({ key: "year-one", usedYears: [] });
    const r = await call("own", "POST", "/api/plans/from-template/year-one", { year });
    expect(r.status).toBe(201);
    const cycles = (await call("own", "GET", "/api/plans/cycles")).body.cycles;
    expect(cycles.map((c: J) => c.kind).sort()).toEqual(["operational", "strategic"]);
    const op = cycles.find((c: J) => c.kind === "operational");
    expect(op.parentCycleId).toBe(r.body.strategicId);
    const s = (await call("own", "GET", `/api/plans/cycles/${r.body.strategicId}`)).body;
    expect(s.cycle.vision).toContain("الشريك التنفيذي");
    expect(s.objectives).toHaveLength(5);
    const rev = s.objectives[0].indicators.find((i: J) => i.source === "platform:revenue");
    expect(rev.target).toBe(2_000_000);
    const o = (await call("own", "GET", `/api/plans/cycles/${r.body.operationalId}`)).body;
    const quarterly = o.objectives
      .filter((x: J) => x.quarter > 0)
      .map((x: J) => x.indicators[0].target);
    expect(quarterly.reduce((a: number, b: number) => a + b, 0)).toBe(2_000_000);
    // every operational objective serves a strategic one, and initiatives are dated in their quarter
    expect(o.objectives.every((x: J) => s.objectives.some((y: J) => y.id === x.parentId))).toBe(
      true,
    );
    const q2 = o.objectives.find((x: J) => x.quarter === 2);
    expect(q2.initiatives[0]).toMatchObject({
      startDate: `${year}-04-01`,
      dueDate: `${year}-06-30`,
    });
    // budgets are left for the owner
    expect(s.budget).toBe(0);
    expect((await call("own", "POST", "/api/plans/from-template/year-one", { year })).status).toBe(
      409,
    );
    expect((await call("own", "GET", "/api/plans/templates")).body.templates[0].usedYears).toEqual([
      year,
    ]);
    expect(
      (await call("view", "POST", "/api/plans/from-template/year-one", { year: year + 1 })).status,
    ).toBe(403);
  });

  it("revenue counts company income (not v1 project fees), hidden from those without finances", async () => {
    const r = await call("own", "POST", "/api/plans/from-template/year-one", { year });
    const today = new Date().toISOString().slice(0, 10);
    await ctx.db.insert(companyEntries).values([
      {
        id: "ce1",
        orgId: "org_platform",
        type: "income",
        category: "service",
        date: today,
        description: "خدمة",
        amount: 1_234_500,
      },
      {
        id: "ce2",
        orgId: "org_platform",
        type: "income",
        category: "project_fee",
        date: today,
        description: "قديم",
        amount: 999_900,
      },
    ]);
    const s = (await call("own", "GET", `/api/plans/cycles/${r.body.strategicId}`)).body;
    const rev = s.objectives[0].indicators.find((i: J) => i.source === "platform:revenue");
    expect(rev.current).toBe(12_345);
    const hidden = (await call("pm", "GET", `/api/plans/cycles/${r.body.strategicId}`)).body;
    const h = hidden.objectives[0].indicators.find((i: J) => i.source === "platform:revenue");
    expect([h.current, h.hidden]).toEqual([null, true]);
    expect(h.attainment).toBeCloseTo(rev.attainment);
    // the month-by-month curve and the pace
    const series = await call("own", "GET", `/api/plans/indicators/${rev.id}/series`);
    expect(series.body.months).toHaveLength(12);
    expect(series.body.months.at(-1).cumulative).toBe(12_345);
    expect(series.body.pace.gap).toBe(2_000_000 - 12_345);
    expect((await call("pm", "GET", `/api/plans/indicators/${rev.id}/series`)).status).toBe(403);
    const m = (await call("pm", "GET", `/api/plans/metrics?start=${year}-01-01&end=${year}-12-31`))
      .body;
    expect(m.metrics.revenue).toBeNull();
  });

  it("tasks filed under an initiative drive its progress", async () => {
    const r = await call("own", "POST", "/api/plans/from-template/year-one", { year });
    const o = (await call("own", "GET", `/api/plans/cycles/${r.body.operationalId}`)).body;
    const init = o.objectives.find((x: J) => x.quarter === 1).initiatives[0];
    for (const [title, status] of [
      ["أ", "done"],
      ["ب", "todo"],
    ])
      await call("own", "POST", "/api/tasks", { title, status, initiativeId: init.id });
    const again = (await call("own", "GET", `/api/plans/cycles/${r.body.operationalId}`)).body;
    const same = again.objectives.find((x: J) => x.quarter === 1).initiatives[0];
    expect(same.tasks).toEqual({ total: 2, done: 1 });
  });
});
