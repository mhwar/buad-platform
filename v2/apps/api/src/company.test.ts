import { finCalc } from "@buad/domain";
import { orgs, users } from "@buad/schema/db";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, type Env } from "./app";
import { hashPassword } from "./auth/password";
import { testDb } from "./test-db";

const env = { APP_VERSION: "t", JWT_SECRET: "test-secret-at-least-16-chars" } as Env;
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
let pid = "";
const F = () => `/api/projects/${pid}/finance`;

beforeEach(async () => {
  ctx = testDb();
  app = createApp({ getDb: () => ctx.db });
  await ctx.db.insert(orgs).values([
    { id: "o1", name: "بُعد" },
    { id: "o2", name: "أخرى" },
  ]);
  const pw = await hashPassword("password-123");
  await ctx.db.insert(users).values([
    { id: "adm", orgId: "o1", email: "adm@a.sa", role: "admin", passwordHash: pw },
    { id: "m1", orgId: "o1", email: "m1@a.sa", role: "member", passwordHash: pw },
    { id: "x", orgId: "o2", email: "x@b.sa", role: "owner", passwordHash: pw },
  ]);
  for (const [w, e] of [
    ["adm", "adm@a.sa"],
    ["m1", "m1@a.sa"],
    ["x", "x@b.sa"],
  ]) {
    const r = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: e, password: "password-123" }),
      },
      env,
    );
    cookie[w as string] = (r.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  }
  const c = await call("adm", "POST", "/api/clients", { name: "عميل" });
  pid = (
    await call("adm", "POST", "/api/projects", {
      clientId: c.body.id,
      name: "مشروع",
      expectedValue: 100000,
    })
  ).body.id;
});

const C = "/api/finance/company";
const setupProject = async (status = "active") => {
  await call("adm", "PATCH", `${F()}/ctrl`, {
    version: 0,
    contractValue: 100000,
    execV: 10,
    execBase: "net",
  });
  await call("adm", "PATCH", `/api/projects/${pid}`, { status });
};

describe("مالية الشركة", () => {
  it("company income/expenses, project profits, and what can be distributed", async () => {
    await setupProject();
    const inc = await call("adm", "POST", `${C}/entries`, {
      type: "income",
      category: "consulting",
      date: "2026-03-30",
      paymentDate: "2026-04-02",
      description: "استشارة",
      amount: 2000,
    });
    expect(inc.status).toBe(201);
    await call("adm", "POST", `${C}/entries`, {
      type: "expense",
      category: "hosting",
      date: "2026-04-10",
      description: "استضافة",
      amount: 500,
    });
    expect(
      (
        await call("adm", "POST", `${C}/entries`, {
          type: "expense",
          category: "consulting",
          description: "x",
          amount: 1,
        })
      ).status,
    ).toBe(400); // an income category on an expense
    const o = (await call("adm", "GET", `${C}/overview`)).body;
    const profit = (await call("adm", "GET", F())).body.summary.profit;
    expect(o.calc).toMatchObject({ serviceIncome: 2000, companyExpenses: 500 });
    expect(o.calc.projectProfit).toBeCloseTo(profit, 2);
    expect(o.allTime.available).toBeCloseTo(profit + 1500, 2);
    expect(o.monthly).toEqual([{ month: "2026-04", income: 2000, expense: 500 }]);
    expect((await call("m1", "GET", `${C}/overview`)).status).toBe(403);
    expect((await call("x", "GET", `${C}/overview`)).body.calc.serviceIncome).toBe(0);

    // Deleting keeps the record (restorable).
    await call("adm", "DELETE", `${C}/entries/${inc.body.id}`);
    expect((await call("adm", "GET", `${C}/overview`)).body.calc.serviceIncome).toBe(0);
    expect((await call("adm", "GET", `${C}/entries?archived=1`)).body.items).toHaveLength(1);
    await call("adm", "POST", `${C}/entries/${inc.body.id}/restore`);
    expect((await call("adm", "GET", `${C}/overview`)).body.calc.serviceIncome).toBe(2000);
  });

  it("distributes to partners exactly, keeps the rest, and locks completed ones", async () => {
    await setupProject();
    for (const [name, pct] of [
      ["سلطان", 33.33],
      ["أحمد", 33.33],
      ["خالد", 33.34],
    ] as const)
      await call("adm", "POST", `${C}/partners`, { name, sharePct: pct });
    expect((await call("adm", "GET", `${C}/partners`)).body.totalPct).toBeCloseTo(100, 5);
    const input = {
      mode: "period",
      periodType: "q4",
      from: "2026-10-01",
      to: "2026-12-31",
      pct: 70,
      retainedCategory: "dev",
    };
    const pre = (await call("adm", "POST", `${C}/distributions/preview`, input)).body;
    expect(pre.label).toBe("الربع الرابع 2026");
    expect(pre.distributed + pre.retained).toBeCloseTo(pre.netProfit, 2);
    expect(pre.shares.reduce((s: number, x: J) => s + x.amount, 0)).toBeCloseTo(pre.distributed, 2);

    const draft = (await call("adm", "POST", `${C}/distributions`, { ...input, status: "draft" }))
      .body.id;
    // A draft does not reduce what is available; completing does.
    expect((await call("adm", "GET", `${C}/overview`)).body.allTime.distributed).toBe(0);
    await call("adm", "POST", `${C}/distributions/${draft}/complete`);
    const o = (await call("adm", "GET", `${C}/overview`)).body;
    expect(o.allTime.distributed).toBeCloseTo(pre.distributed, 2);
    expect(o.retained.dev).toBeCloseTo(pre.retained, 2);
    expect((await call("adm", "DELETE", `${C}/distributions/${draft}`)).body.error).toBe(
      "completed_locked",
    );
    expect((await call("adm", "POST", `${C}/distributions/${draft}/complete`)).status).toBe(409);
    // Shares stay as they were even if a partner changes later.
    const p = (await call("adm", "GET", `${C}/partners`)).body.items[0];
    await call("adm", "PATCH", `${C}/partners/${p.id}`, { name: "اسم جديد", sharePct: 50 });
    const list = (await call("adm", "GET", `${C}/distributions`)).body.items;
    expect(list[0].shares.map((s: J) => s.partnerName)).not.toContain("اسم جديد");
    // Nothing left to distribute → refused.
    const again = await call("adm", "POST", `${C}/distributions`, {
      ...input,
      pct: 100,
      status: "draft",
    });
    expect([201, 409]).toContain(again.status);
  });

  it("a single project's profit can be distributed on its own", async () => {
    await setupProject("completed");
    await call("adm", "POST", `${C}/partners`, { name: "أ", sharePct: 100 });
    const pre = (
      await call("adm", "POST", `${C}/distributions/preview`, {
        mode: "project",
        projectId: pid,
        pct: 100,
      })
    ).body;
    const profit = (await call("adm", "GET", F())).body.summary.profit;
    expect(pre.netProfit).toBeCloseTo(profit, 2);
    expect(pre.label).toContain("أرباح مشروع");
    const d = (
      await call("adm", "POST", `${C}/distributions`, {
        mode: "project",
        projectId: pid,
        pct: 100,
        status: "draft",
      })
    ).body;
    expect((await call("adm", "DELETE", `${C}/distributions/${d.id}`)).status).toBe(200);
  });
});
