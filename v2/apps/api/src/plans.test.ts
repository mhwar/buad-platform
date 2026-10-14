import { orgs, users } from "@buad/schema/db";
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
      mk("x", "owner", "", "o2"),
    ]);
  for (const id of ["own", "adm", "m1", "acc", "view", "sal", "x"]) await login(id, `${id}@a.sa`);
});

const mkCycle = async (kind: "strategic" | "operational", extra: J = {}) =>
  (
    await call("own", "POST", "/api/plans/cycles", {
      kind,
      name: kind === "strategic" ? "استراتيجية 2026-2028" : "تشغيلية 2026",
      startDate: "2026-01-01",
      endDate: kind === "strategic" ? "2028-12-31" : "2026-12-31",
      ...extra,
    })
  ).body.id as string;
const mkObj = async (cycleId: string, extra: J = {}) =>
  (await call("own", "POST", "/api/plans/objectives", { cycleId, title: "هدف", ...extra })).body
    .id as string;

describe("plans: access", () => {
  it("only roles with the permission read or edit plans", async () => {
    expect((await call("own", "GET", "/api/plans/cycles")).status).toBe(200);
    expect((await call("adm", "GET", "/api/plans/cycles")).status).toBe(200);
    expect((await call("m1", "GET", "/api/plans/cycles")).status).toBe(403);
    expect((await call("sal", "GET", "/api/plans/cycles")).status).toBe(403);
    // the project manager reads plans but does not edit them
    await call("own", "PATCH", "/api/team/users/acc", { roleKey: "project-manager" });
    expect((await call("acc", "GET", "/api/plans/cycles")).status).toBe(200);
    expect(
      (await call("acc", "POST", "/api/plans/cycles", { kind: "strategic", name: "س" })).status,
    ).toBe(403);
  });
});

describe("plans: cycles and objectives", () => {
  it("creates a strategic cycle, edits it with version locking, and links an operational plan", async () => {
    const s = await mkCycle("strategic");
    const patch = await call("own", "PATCH", `/api/plans/cycles/${s}`, {
      version: 1,
      vision: "رؤية",
      values: ["الإتقان", "الأمانة"],
      status: "active",
    });
    expect(patch.body.version).toBe(2);
    expect(
      (await call("own", "PATCH", `/api/plans/cycles/${s}`, { version: 1, vision: "x" })).status,
    ).toBe(409);
    expect(
      (await call("own", "PATCH", `/api/plans/cycles/${s}`, { version: 2, endDate: "2025-01-01" }))
        .body.error,
    ).toBe("end_before_start");
    const op = await mkCycle("operational", { parentCycleId: s });
    expect(op).toBeTruthy();
    expect(
      (
        await call("own", "POST", "/api/plans/cycles", {
          kind: "operational",
          name: "ع",
          parentCycleId: "nope",
        })
      ).status,
    ).toBe(404);
    const got = await call("own", "GET", `/api/plans/cycles/${s}`);
    expect(got.body.cycle).toMatchObject({
      vision: "رؤية",
      values: ["الإتقان", "الأمانة"],
      status: "active",
    });
    expect((await call("own", "DELETE", `/api/plans/cycles/${s}`)).body.error).toBe("has_children");
    expect((await call("own", "DELETE", `/api/plans/cycles/${op}`)).status).toBe(200);
    expect((await call("own", "DELETE", `/api/plans/cycles/${s}`)).status).toBe(200);
  });

  it("an operational objective serves a strategic one; deleting the strategic one unlinks it", async () => {
    const s = await mkCycle("strategic");
    const op = await mkCycle("operational", { parentCycleId: s });
    const so = await mkObj(s, { title: "نمو الإيراد" });
    const oo = await mkObj(op, {
      title: "إطلاق خدمتين",
      parentId: so,
      quarter: 2,
      budget: 25000.5,
      ownerId: "adm",
    });
    const got = (await call("own", "GET", `/api/plans/cycles/${op}`)).body;
    expect(got.objectives[0]).toMatchObject({ id: oo, parentId: so, quarter: 2, budget: 25000.5 });
    expect(got.budget).toBe(25000.5);
    expect(
      (
        await call("own", "POST", "/api/plans/objectives", {
          cycleId: op,
          title: "ب",
          parentId: "nope",
        })
      ).status,
    ).toBe(404);
    await call("own", "DELETE", `/api/plans/objectives/${so}`);
    expect((await call("own", "GET", `/api/plans/cycles/${op}`)).body.objectives[0].parentId).toBe(
      "",
    );
  });

  it("keeps organisations apart", async () => {
    const s = await mkCycle("strategic");
    const o = await mkObj(s);
    expect((await call("x", "GET", `/api/plans/cycles/${s}`)).status).toBe(404);
    expect(
      (await call("x", "POST", "/api/plans/objectives", { cycleId: s, title: "غريب" })).status,
    ).toBe(404);
    expect((await call("x", "PATCH", `/api/plans/objectives/${o}`, { title: "غ" })).status).toBe(
      404,
    );
    expect((await call("x", "GET", "/api/plans/cycles")).body.cycles).toEqual([]);
  });
});

describe("plans: progress", () => {
  it("rolls indicators and initiatives into objective and plan progress", async () => {
    const c = await mkCycle("operational");
    const a = await mkObj(c, { title: "أ", weight: 3 });
    const b = await mkObj(c, { title: "ب", weight: 1 });
    await call("own", "POST", `/api/plans/objectives/${a}/indicators`, {
      name: "رضا العملاء",
      unit: "%",
      baseline: 60,
      target: 90,
      current: 75,
    });
    await call("own", "POST", `/api/plans/objectives/${a}/initiatives`, {
      title: "استبيان",
      status: "done",
    });
    await call("own", "POST", `/api/plans/objectives/${a}/initiatives`, {
      title: "تحسين",
      status: "todo",
    });
    const g = (await call("own", "GET", `/api/plans/cycles/${c}`)).body;
    const oa = g.objectives.find((o: J) => o.id === a);
    expect(oa.indicators[0].attainment).toBeCloseTo(0.5);
    expect(oa.progress).toBeCloseTo(0.5); // (0.5 indicator + 0.5 initiatives) / 2
    expect(g.objectives.find((o: J) => o.id === b).progress).toBeNull(); // nothing to measure
    expect(g.progress).toBeCloseTo(0.5); // unmeasured objectives do not drag it down
  });

  it("a platform indicator follows real data in its window", async () => {
    const cl = (await call("own", "POST", "/api/clients", { name: "عميل" })).body.id;
    await call("own", "POST", "/api/projects", {
      clientId: cl,
      name: "ق1",
      expectedValue: 100000,
      startDate: "2026-02-10",
    });
    await call("own", "POST", "/api/projects", {
      clientId: cl,
      name: "ق2",
      expectedValue: 200000,
      startDate: "2026-05-01",
      status: "completed",
      endDate: "2026-06-01",
    });
    await call("own", "POST", "/api/projects", {
      clientId: cl,
      name: "قديم",
      expectedValue: 900000,
      startDate: "2025-02-10",
    });
    const c = await mkCycle("operational");
    const q1 = await mkObj(c, { title: "ربع أول", quarter: 1 });
    const year = await mkObj(c, { title: "السنة" });
    for (const [o, src, target] of [
      [q1, "platform:projects_started", 2],
      [year, "platform:projects_started", 2],
      [year, "platform:contracts", 345000],
    ] as const)
      await call("own", "POST", `/api/plans/objectives/${o}/indicators`, {
        name: src,
        target,
        source: src,
      });
    const g = (await call("own", "GET", `/api/plans/cycles/${c}`)).body;
    const cur = (id: string, name: string) =>
      g.objectives.find((o: J) => o.id === id).indicators.find((i: J) => i.name === name).current;
    expect(cur(q1, "platform:projects_started")).toBe(1); // only the one that started in Q1
    expect(cur(year, "platform:projects_started")).toBe(2);
    expect(cur(year, "platform:contracts")).toBe(345000); // (100000 + 200000) + 15% VAT, last year's excluded
    const m = await call("own", "GET", "/api/plans/metrics?start=2026-01-01&end=2026-12-31");
    expect(m.body.metrics).toMatchObject({ projects_started: 2, projects_completed: 1 });
    expect(
      (
        await call("own", "POST", `/api/plans/objectives/${q1}/indicators`, {
          name: "x",
          target: 1,
          source: "platform:nope",
        })
      ).status,
    ).toBe(400);
  });

  it("freezes a review with the numbers at that moment", async () => {
    const c = await mkCycle("operational");
    const o = await mkObj(c);
    const ind = (
      await call("own", "POST", `/api/plans/objectives/${o}/indicators`, {
        name: "م",
        target: 10,
        current: 4,
      })
    ).body.id;
    await call("own", "POST", `/api/plans/objectives/${o}/reviews`, {
      quarter: 1,
      note: "ربع جيد",
    });
    await call("own", "PATCH", `/api/plans/indicators/${ind}`, { current: 9 });
    const rev = (await call("own", "GET", `/api/plans/cycles/${c}`)).body.objectives[0].reviews[0];
    expect(rev).toMatchObject({ quarter: 1, note: "ربع جيد" });
    expect(rev.snapshot.indicators[0].current).toBe(4); // not changed by the later edit
    expect(rev.snapshot.progress).toBeCloseTo(0.4);
  });

  it("edits and deletes indicators and initiatives, and logs the changes", async () => {
    const c = await mkCycle("strategic");
    const o = await mkObj(c);
    const it = (
      await call("own", "POST", `/api/plans/objectives/${o}/initiatives`, {
        title: "م",
        budget: 100,
      })
    ).body.id;
    expect(
      (
        await call("own", "PATCH", `/api/plans/initiatives/${it}`, {
          status: "doing",
          budget: 250.5,
        })
      ).status,
    ).toBe(200);
    const got = (await call("own", "GET", `/api/plans/cycles/${c}`)).body.objectives[0]
      .initiatives[0];
    expect(got).toMatchObject({ status: "doing", budget: 250.5 });
    expect((await call("own", "DELETE", `/api/plans/initiatives/${it}`)).status).toBe(200);
    expect((await call("own", "DELETE", `/api/plans/initiatives/${it}`)).status).toBe(404);
    const log = (await call("own", "GET", "/api/audit?entity=plan")).body.items;
    expect(log.length).toBeGreaterThan(3);
  });
});
