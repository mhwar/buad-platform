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

const D = 86400;
const nowS = () => Math.floor(Date.now() / 1000);
const lead = (id: string, status: string, valueHalalas: number, extra: object = {}) =>
  ctx.db.insert(productRequests).values({
    id,
    orgId: "org_platform",
    name: id,
    status: status as "new",
    valueHalalas,
    createdAt: nowS() - 30 * D,
    updatedAt: nowS() - D,
    ...extra,
  });
const overview = async (who = "own") => (await call(who, "GET", "/api/sales/overview")).body;

describe("sales overview", () => {
  it("is for those who may see sales", async () => {
    expect((await call("own", "GET", "/api/sales/overview")).status).toBe(200);
    expect((await call("sal", "GET", "/api/sales/overview")).status).toBe(200);
    expect((await call("m1", "GET", "/api/sales/overview")).status).toBe(403);
    expect((await call("view", "GET", "/api/sales/overview")).status).toBe(403);
  });

  it("summarises the pipeline, results and sources from the live records", async () => {
    await lead("a", "new", 10_000_000);
    await lead("b", "quoted", 20_000_000);
    await lead("c", "negotiating", 40_000_000, {
      updatedAt: nowS() - 10 * D,
      followUpAt: "2020-01-01",
    });
    await lead("w1", "won", 30_000_000, { createdAt: nowS() - 20 * D, updatedAt: nowS() - 2 * D });
    await lead("w2", "won", 10_000_000, { createdAt: nowS() - 10 * D, updatedAt: nowS() - D });
    await lead("l1", "lost", 5_000_000);
    const o = await overview();
    expect(o.pipeline.open).toEqual({ count: 3, value: 700000, weighted: 10000 + 80000 + 260000 });
    expect(o.pipeline.stages.find((s: J) => s.stage === "quoted")).toEqual({
      stage: "quoted",
      count: 1,
      value: 200000,
      weighted: 80000,
    });
    expect(o.results).toMatchObject({ won: 2, lost: 1, winRate: 66.7, avgCycleDays: 14 });
    expect(o.stale.map((s: J) => s.id)).toEqual(["c"]); // only the one idle for more than a week
    expect(o.stale[0]).toMatchObject({ daysIdle: 10, value: 400000 });
    expect(o.followups.leadsDue).toBe(1);
    expect(o.sources[0]).toMatchObject({ source: "site", total: 6 }); // the default for a lead that arrived by the form
    expect(o.monthlyWon).toHaveLength(12);
    expect(o.monthlyWon.reduce((s: number, m: J) => s + m.value, 0)).toBe(400000); // both wins fall inside the year
  });

  it("uses the client's recorded source when a lead has a client", async () => {
    const c = (await call("own", "POST", "/api/clients", { name: "عميل" })).body.id;
    await call("own", "PATCH", `/api/crm/clients/${c}`, { source: "referral" });
    await lead("r1", "won", 1_000_000, { clientId: c });
    await lead("r2", "new", 1_000_000);
    const src = Object.fromEntries((await overview()).sources.map((s: J) => [s.source, s.total]));
    expect(src).toEqual({ referral: 1, site: 1 });
  });

  it("reports quotes: counts, accept rate, value, those expiring soon and those waiting too long", async () => {
    const mk = async (title: string, unit: number, extra: object = {}) =>
      (
        await call("sal", "POST", "/api/quotes", {
          title,
          recipient: "منى",
          items: [{ label: "بند", qty: 1, unit }],
          vatPct: 0,
          ...extra,
        })
      ).body.id as string;
    const send = (id: string, to: string) =>
      call("sal", "POST", `/api/quotes/${id}/status`, { to });
    const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const a = await mk("مقبول", 1000);
    await send(a, "sent");
    await send(a, "accepted");
    const b = await mk("مرفوض", 3000);
    await send(b, "sent");
    await send(b, "rejected");
    const c = await mk("ينتهي قريباً", 2000, { validUntil: soon });
    await send(c, "sent");
    await mk("مسودة", 500);
    const q = (await overview("sal")).quotes;
    expect(q).toMatchObject({
      sent: 3,
      accepted: 1,
      rejected: 1,
      acceptRate: 50,
      acceptedValue: 1000,
      avgValue: 2000,
    });
    expect(q.expiring.map((x: J) => x.title)).toEqual(["ينتهي قريباً"]);
    expect(q.waiting).toEqual([]);
    ctx.sqlite.prepare("UPDATE quotes SET updated_at = ? WHERE id = ?").run(nowS() - 9 * D, c);
    expect((await overview("sal")).quotes.waiting[0]).toMatchObject({
      title: "ينتهي قريباً",
      days: 9,
    });
  });

  it("lists the clients that have brought the most work, and keeps organisations apart", async () => {
    const c1 = (await call("own", "POST", "/api/clients", { name: "كبير" })).body.id;
    const c2 = (await call("own", "POST", "/api/clients", { name: "صغير" })).body.id;
    await call("own", "POST", "/api/projects", { clientId: c1, name: "م1", expectedValue: 90000 });
    await call("own", "POST", "/api/projects", { clientId: c2, name: "م2", expectedValue: 10000 });
    expect((await overview()).topClients.map((x: J) => x.name)).toEqual(["كبير", "صغير"]);
    expect((await call("x", "GET", "/api/sales/overview")).body.topClients).toEqual([]);
  });

  it("starts empty without errors", async () => {
    const o = await overview();
    expect(o.pipeline.open).toEqual({ count: 0, value: 0, weighted: 0 });
    expect(o.results).toMatchObject({ winRate: null, avgCycleDays: null, wonThisQuarter: 0 });
    expect(o.quotes).toMatchObject({ sent: 0, acceptRate: null, avgValue: 0 });
  });
});
