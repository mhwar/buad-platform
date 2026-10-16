import { orgs, productRequests, users } from "@buad/schema/db";
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

const trail = async () => (await call("own", "GET", "/api/audit")).body.items as J[];

describe("the activity trail keeps the values", () => {
  it("an edited receipt reads «المبلغ: 50,000 ← 5,000»", async () => {
    const pid = await proj();
    const fin = (
      await call("own", "POST", `/api/projects/${pid}/finance/receipts`, {
        date: "2026-03-01",
        amount: 50000,
        note: "الأولى",
      })
    ).body;
    const created = (await trail()).find((i) => i.summary === "إضافة مقبوضة");
    expect(created.detail.changes).toEqual(
      expect.arrayContaining([
        { field: "amount", label: "المبلغ", before: "—", after: "50,000 ر.س" },
      ]),
    );
    const id = fin.receipts[0].id;
    await call("own", "PATCH", `/api/projects/${pid}/finance/receipts/${id}`, {
      date: "2026-03-01",
      amount: 5000,
      note: "الأولى",
    });
    const edited = (await trail()).find((i) => i.summary === "تعديل مقبوضة");
    expect(edited.detail.changes).toEqual([
      { field: "amount", label: "المبلغ", before: "50,000 ر.س", after: "5,000 ر.س" },
    ]);
    await call("own", "DELETE", `/api/projects/${pid}/finance/receipts/${id}`);
    const gone = (await trail()).find((i) => i.summary === "حذف مقبوضة");
    expect(gone.detail.changes).toEqual(
      expect.arrayContaining([
        { field: "amount", label: "المبلغ", before: "5,000 ر.س", after: "—" },
      ]),
    );
  });

  it("contract data and a project's status show before and after", async () => {
    const pid = await proj("own", { expectedValue: 1000 });
    await call("own", "PATCH", `/api/projects/${pid}/finance/ctrl`, {
      version: 0,
      contractValue: 100000,
      contractNo: "C-1",
    });
    await call("own", "PATCH", `/api/projects/${pid}`, { status: "completed" });
    const items = await trail();
    const ctrl = items.find((i) => i.summary === "تعديل مالية المشروع");
    expect(ctrl.detail.changes).toEqual(
      expect.arrayContaining([
        { field: "contractNo", label: "رقم العقد", before: "—", after: "C-1" },
        { field: "contractValue", label: "قيمة العقد", before: "—", after: "100,000 ر.س" },
      ]),
    );
    const st = items.find((i) => i.summary === "تعديل مشروع");
    expect(st.detail.changes).toEqual([
      { field: "status", label: "الحالة", before: "جاري التنفيذ", after: "مكتمل" },
    ]);
  });
});

describe("what an opportunity costs us", () => {
  it("is kept from those who may not see profit", async () => {
    await ctx.db.insert(productRequests).values({
      id: "rq1",
      orgId: "org_platform",
      name: "منى",
      entity: "جمعية",
      quote: JSON.stringify({
        price: 1000,
        total: 1150,
        cost: 600,
        profit: 400,
        marginPct: 40,
        lines: [{ id: "l1", label: "مدرب", qty: 1, unitCost: 600, amount: 600 }],
      }),
    });
    const sal = (await call("sal", "GET", "/api/product-requests/rq1")).body.opportunity.quote;
    expect(sal).toMatchObject({ price: 1000, total: 1150 });
    expect(sal).not.toHaveProperty("cost");
    expect(sal).not.toHaveProperty("profit");
    expect(sal).not.toHaveProperty("marginPct");
    expect(sal.lines[0]).toEqual({ id: "l1", label: "مدرب", qty: 1 });
    const own = (await call("own", "GET", "/api/product-requests/rq1")).body.opportunity.quote;
    expect(own).toMatchObject({ cost: 600, profit: 400, marginPct: 40 });
    const list = (await call("sal", "GET", "/api/product-requests")).body.requests;
    expect(list[0].quote).not.toHaveProperty("profit");
  });
});
