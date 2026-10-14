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

const proj = async (who = "own", body: J = {}) => {
  const c = await call(who, "POST", "/api/clients", { name: `عميل ${Math.random()}` });
  return (await call(who, "POST", "/api/projects", { name: "مشروع", clientId: c.body.id, ...body }))
    .body.id as string;
};
const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const sched = async (pid: string, label: string, due: string, amount: number) =>
  (await call("own", "POST", `/api/receivables/projects/${pid}`, { label, dueDate: due, amount }))
    .body.id as string;

describe("receivables", () => {
  it("ages what is owed, totals the overdue and forecasts 13 weeks", async () => {
    const pid = await proj();
    await sched(pid, "الأولى", addDays(-45), 11500);
    await sched(pid, "الثانية", addDays(-5), 5750);
    await sched(pid, "الثالثة", addDays(10), 23000);
    const r = (await call("own", "GET", "/api/receivables?opening=1000")).body;
    expect(r.aging.buckets.d31_60).toEqual({ amount: 11500, count: 1 });
    expect(r.aging.buckets.d1_30).toEqual({ amount: 5750, count: 1 });
    expect(r.aging.buckets.current).toEqual({ amount: 23000, count: 1 });
    expect(r.aging.overdue).toBe(17250);
    expect(r.aging.total).toBe(40250);
    expect(r.items).toHaveLength(3);
    expect(r.weeks).toHaveLength(13);
    expect(r.weeks[0].inflow).toBe(17250); // overdue is due now
    expect(r.weeks[0].balance).toBe(18250); // opening 1000 + 17250
    expect(r.weeks[1].inflow).toBe(23000); // the one due in 10 days (week 2)
    expect(r.weeks[12].balance).toBe(41250);
    expect(r.shortfallWeek).toBeNull();
  });

  it("subtracts registered expenses that are still unpaid and flags a shortfall", async () => {
    const pid = await proj();
    await call("own", "PATCH", `/api/projects/${pid}/finance/ctrl`, {
      version: 1,
      contractValue: 100000,
    });
    await call("own", "POST", `/api/projects/${pid}/finance/entries`, {
      description: "مورد",
      type: "expense",
      amount: 3000,
      status: "pending",
      date: addDays(3),
    });
    const r = (await call("own", "GET", "/api/receivables?opening=1000")).body;
    expect(r.pendingExpenses).toBe(3000);
    expect(r.weeks[0].outflow).toBe(3000);
    expect(r.shortfallWeek).toBe(r.weeks[0].start);
  });

  it("receiving an instalment creates a verified receipt once, and closes the line", async () => {
    const pid = await proj();
    const id = await sched(pid, "الدفعة الأولى", addDays(-2), 11500);
    const rec = await call("own", "POST", `/api/receivables/${id}/receive`, { date: "2026-03-05" });
    expect(rec.status).toBe(200);
    expect((await call("own", "POST", `/api/receivables/${id}/receive`, {})).body.error).toBe(
      "not_pending",
    );
    const fin = (await call("own", "GET", `/api/projects/${pid}/finance`)).body;
    expect(fin.receipts).toHaveLength(1);
    expect(fin.receipts[0]).toMatchObject({
      amount: 1150000, // receipts are kept in halalas
      date: "2026-03-05",
      note: "الدفعة الأولى",
    });
    expect(fin.received).toBe(11500);
    expect((await call("own", "GET", "/api/receivables")).body.items).toHaveLength(0);
    expect((await call("own", "DELETE", `/api/receivables/${id}`)).body.error).toBe(
      "already_received",
    );
    expect((await call("own", "PATCH", `/api/receivables/${id}`, { label: "x" })).body.error).toBe(
      "already_received",
    );
    const list = (await call("own", "GET", `/api/receivables/projects/${pid}`)).body.items;
    expect(list[0]).toMatchObject({ status: "received", receivedAt: "2026-03-05" });
  });

  it("edits and cancels lines; a cancelled line leaves the totals", async () => {
    const pid = await proj();
    const id = await sched(pid, "أ", addDays(-40), 1000);
    expect((await call("own", "PATCH", `/api/receivables/${id}`, { amount: 2000 })).status).toBe(
      200,
    );
    expect((await call("own", "GET", "/api/receivables")).body.aging.total).toBe(2000);
    await call("own", "PATCH", `/api/receivables/${id}`, { status: "cancelled" });
    expect((await call("own", "GET", "/api/receivables")).body.aging.total).toBe(0);
    expect(
      (
        await call("own", "POST", `/api/receivables/projects/${pid}`, {
          label: "س",
          dueDate: "غداً",
          amount: 5,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("own", "POST", `/api/receivables/projects/${pid}`, {
          label: "س",
          dueDate: addDays(1),
          amount: 0,
        })
      ).status,
    ).toBe(400);
  });

  it("respects roles, project visibility and organisations", async () => {
    const pid = await proj();
    const id = await sched(pid, "أ", addDays(-10), 500);
    expect((await call("m1", "GET", "/api/receivables")).status).toBe(403); // no treasury.view
    expect((await call("acc", "GET", "/api/receivables")).status).toBe(200);
    expect(
      (
        await call("m1", "POST", `/api/receivables/projects/${pid}`, {
          label: "س",
          dueDate: addDays(1),
          amount: 5,
        })
      ).status,
    ).toBe(403);
    expect((await call("x", "POST", `/api/receivables/${id}/receive`, {})).status).toBe(404);
    expect((await call("x", "GET", `/api/receivables/projects/${pid}`)).status).toBe(404);
    expect((await call("x", "GET", "/api/receivables")).body.items).toEqual([]);
  });

  it("flags overdue instalments on the home feed for those who handle money", async () => {
    const pid = await proj();
    await sched(pid, "أ", addDays(-10), 500);
    const f = (await call("own", "GET", "/api/attention")).body.items.find(
      (i: J) => i.key === "instalments",
    );
    expect(f.count).toBe(1);
    expect(
      (await call("m1", "GET", "/api/attention")).body.items.some(
        (i: J) => i.key === "instalments",
      ),
    ).toBe(false);
  });
});
