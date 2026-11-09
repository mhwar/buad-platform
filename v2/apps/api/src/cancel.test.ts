import { orgs, users } from "@buad/schema/db";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, type Env } from "./app";
import { hashPassword } from "./auth/password";
import { testDb } from "./test-db";

const env = { APP_VERSION: "t", JWT_SECRET: "test-secret-at-least-16-chars" } as Env;
let ctx: ReturnType<typeof testDb>;
let app: ReturnType<typeof createApp>;
let cookie = "";
// biome-ignore lint/suspicious/noExplicitAny: test helper
type J = any;
const call = async (method: string, path: string, body?: unknown) => {
  const r = await app.request(
    path,
    {
      method,
      headers: { "content-type": "application/json", cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
  return { status: r.status, body: (await r.json()) as J };
};
const year = new Date().getFullYear();
const today = new Date().toISOString().slice(0, 10);
let clientId = "";

beforeEach(async () => {
  ctx = testDb();
  app = createApp({ getDb: () => ctx.db });
  await ctx.db.insert(orgs).values({ id: "o1", name: "بُعد" });
  await ctx.db.insert(users).values({
    id: "own",
    orgId: "o1",
    email: "own@a.sa",
    role: "owner",
    passwordHash: await hashPassword("password-123"),
  });
  const r = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "own@a.sa", password: "password-123" }),
    },
    env,
  );
  cookie = (r.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  clientId = (await call("POST", "/api/clients", { name: "عميل" })).body.id;
});

/** An active project: contract 10,000 + VAT = 11,500; 5,000 received; 6,500 still scheduled. */
const project = async () => {
  const id = (
    await call("POST", "/api/projects", {
      clientId,
      name: "مشروع",
      status: "active",
      startDate: today,
    })
  ).body.id;
  await call("PATCH", `/api/projects/${id}/finance/ctrl`, { version: 0, contractValue: 10000 });
  await call("POST", `/api/projects/${id}/finance/receipts`, {
    date: today,
    amount: 5000,
    note: "",
  });
  await call("POST", `/api/receivables/projects/${id}`, {
    label: "الدفعة الثانية",
    dueDate: "2020-01-01",
    amount: 6500,
  });
  return id;
};
const check = async (id: string) => (await call("GET", `/api/projects/${id}/close`)).body;
const owed = async () => (await call("GET", "/api/receivables")).body.aging.total;
const checks = async () => (await call("GET", "/api/finance/checks")).body.checks;

describe("إلغاء المشروع", () => {
  it("keeps what was received; what is still scheduled is not expected any more", async () => {
    const id = await project();
    expect(await owed()).toBe(6500);
    const before = await check(id);
    expect(before.instalments).toEqual({ count: 1, amount: 6500 });

    const r = await call("POST", `/api/projects/${id}/close/cancel`, {
      reason: "أوقف العميل العمل",
    });
    expect(r.status).toBe(200);
    expect(await owed()).toBe(0);
    // The receipt still counts.
    expect((await check(id)).figures.received).toBe(5000);
    // The pending instalment is flagged until someone deals with it.
    const flag = (await checks()).find((c: J) => c.key === "cancelled_instalments");
    expect(flag.rows[0].detail).toContain("1 دفعة");
    // No overdue-instalment alert for it.
    const att = (await call("GET", "/api/attention")).body.items ?? [];
    expect(att.find((i: J) => i.key === "instalments")?.count ?? 0).toBe(0);

    const again = await call("POST", `/api/projects/${id}/close/cancel`, { reason: "مرة ثانية" });
    expect(again.body.error).toBe("already_cancelled");
  });

  it("settles: the received amount becomes the final value and the instalments go", async () => {
    const id = await project();
    const r = await call("POST", `/api/projects/${id}/close/cancel`, {
      reason: "اتفاق على ما دُفع",
      finalValue: 5000,
      cancelInstalments: true,
    });
    expect(r.status).toBe(200);
    const c = await check(id);
    expect(c.figures.gross).toBeCloseTo(5000, 1);
    expect(c.figures.remaining).toBe(0);
    expect(c.figures.realized).toBeCloseTo(c.figures.profit, 1);
    expect(c.instalments.count).toBe(0);
    expect((await checks()).find((x: J) => x.key === "cancelled_instalments")).toBeUndefined();
  });

  it("refuses a final value below what was received", async () => {
    const id = await project();
    const r = await call("POST", `/api/projects/${id}/close/cancel`, {
      reason: "خطأ",
      finalValue: 1000,
    });
    expect([r.status, r.body.error]).toEqual([409, "below_received"]);
    expect((await call("GET", `/api/projects/${id}`)).body.project.status).toBe("active");
  });
});

describe("إغلاق المشروع مع التسوية", () => {
  it("closes at an agreed final value and sets the pending instalments aside", async () => {
    const id = await project();
    const r = await call("POST", `/api/projects/${id}/close`, {
      note: "خصم متفق عليه",
      finalValue: 5000,
      cancelInstalments: true,
    });
    expect(r.status).toBe(200);
    expect(r.body.figures.remaining).toBe(0);
    expect(r.body.instalments.count).toBe(0);
    expect(r.body.closed).not.toBeNull();
    expect(await owed()).toBe(0);
  });

  it("a cancelled project closes as cancelled", async () => {
    const id = await project();
    await call("POST", `/api/projects/${id}/close/cancel`, { reason: "أُوقف" });
    await call("POST", `/api/projects/${id}/close`, { note: "" });
    expect((await call("GET", `/api/projects/${id}`)).body.project.status).toBe("cancelled");
  });
});
