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
    // Profit counts once the money is received: the whole contract here.
    const gross = (await call("adm", "GET", F())).body.summary.grossTotal;
    await call("adm", "POST", `${F()}/receipts`, { date: "2026-05-01", amount: gross });
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

  it("quarter centre: realized by receipts, distributed once, carried when overpaid", async () => {
    await setupProject();
    await call("adm", "POST", `${C}/partners`, { name: "أ", sharePct: 60 });
    await call("adm", "POST", `${C}/partners`, { name: "ب", sharePct: 40 });
    const fin = (await call("adm", "GET", F())).body.summary;
    const half = Math.round((fin.grossTotal / 2) * 100) / 100;
    expect(
      (await call("m1", "POST", `${F()}/receipts`, { date: "2026-08-10", amount: half })).status,
    ).toBe(403);
    await call("adm", "POST", `${F()}/receipts`, { date: "2026-08-10", amount: half });
    await call("adm", "POST", `${F()}/receipts`, { date: "2026-11-05", amount: half });
    expect((await call("adm", "GET", F())).body.received).toBeCloseTo(fin.grossTotal, 2);

    const q3 = (await call("adm", "GET", `${C}/quarter?year=2026&q=3`)).body;
    expect(q3.label).toBe("الربع الثالث 2026");
    expect(q3.rows[0].realizedInPeriod).toBeCloseTo(fin.profit / 2, 2);
    expect(q3.defaultSelected).toEqual([pid]);
    expect(q3.totals.available).toBeCloseTo(
      q3.rows.reduce((s: number, r: J) => s + r.available, 0),
      2,
    );

    const body = {
      mode: "quarter",
      year: 2026,
      q: 3,
      projectIds: [pid],
      pct: 100,
      status: "completed",
    };
    const d1 = await call("adm", "POST", `${C}/distributions`, body);
    expect(d1.status).toBe(201);
    // The same quarter again: nothing left of that project.
    expect((await call("adm", "POST", `${C}/distributions`, body)).body.error).toBe(
      "nothing_to_distribute",
    );
    // Q4 holds only the second half.
    const q4 = (await call("adm", "GET", `${C}/quarter?year=2026&q=4`)).body;
    expect(q4.rows[0].available).toBeCloseTo(fin.profit / 2, 2);

    // A draft that becomes stale (another distribution paid the project) cannot be completed.
    const draft = (
      await call("adm", "POST", `${C}/distributions`, { ...body, q: 4, status: "draft" })
    ).body.id;
    await call("adm", "POST", `${C}/distributions`, { ...body, q: 4, status: "completed" });
    expect((await call("adm", "POST", `${C}/distributions/${draft}/complete`)).body.error).toBe(
      "stale_draft",
    );

    // Profit falls after everything was paid (fee lowered) → negative, carried into the next one.
    const v = (await call("adm", "GET", F())).body.ctrl.version;
    await call("adm", "PATCH", `${F()}/ctrl`, { version: v, execV: 5 });
    const after = (await call("adm", "GET", `${C}/quarter?year=2026&q=4`)).body;
    expect(after.rows[0].flags).toContain("over_distributed");
    expect(after.totals.carried).toBeLessThan(0);
  });

  it("proposes receipts from existing data, stores nothing, and approving records who and why", async () => {
    await call("adm", "PATCH", `${F()}/ctrl`, {
      version: 0,
      contractValue: 100000,
      execV: 10,
      contractDate: "2026-06-01",
    });
    // v1's «تاريخ الاستلام» wins over every other date.
    await call("adm", "PATCH", `/api/projects/${pid}`, { payDate: "2026-09-30", status: "active" });
    const sug = (await call("adm", "GET", `${C}/receipt-suggestions`)).body.items;
    expect(sug).toHaveLength(1);
    expect(sug[0].suggestion).toMatchObject({
      date: "2026-09-30",
      source: "pay_date",
      quarter: "الربع الثالث 2026",
      warnings: ["near_quarter_edge"],
    });
    expect(sug[0].gross).toBeGreaterThan(0);
    // Nothing is counted or stored until someone approves it.
    expect((await call("adm", "GET", F())).body.receipts).toHaveLength(0);
    expect(
      (await call("adm", "GET", `${C}/quarter?year=2026&q=3`)).body.totals.realizedInPeriod,
    ).toBe(0);

    expect((await call("m1", "GET", `${C}/receipt-suggestions`)).status).toBe(403);
    const gross = sug[0].gross;
    // The approver may move the date: it is the date that decides the quarter.
    const r = (
      await call("adm", "POST", `${F()}/receipts`, {
        date: "2026-10-02",
        amount: gross,
        basis: sug[0].suggestion.basis,
      })
    ).body;
    expect(r.receipts[0]).toMatchObject({
      date: "2026-10-02",
      approvedBy: "adm",
      basis: "من «تاريخ الاستلام» المسجّل في المنصة القديمة",
    });
    expect(r.receipts[0].approvedAt).toBeGreaterThan(0);
    // Approved: it left the proposals, and it counts in the quarter it really belongs to.
    expect((await call("adm", "GET", `${C}/receipt-suggestions`)).body.items).toHaveLength(0);
    expect(
      (await call("adm", "GET", `${C}/quarter?year=2026&q=3`)).body.totals.realizedInPeriod,
    ).toBe(0);
    expect(
      (await call("adm", "GET", `${C}/quarter?year=2026&q=4`)).body.totals.realizedInPeriod,
    ).toBeGreaterThan(0);
  });
});
