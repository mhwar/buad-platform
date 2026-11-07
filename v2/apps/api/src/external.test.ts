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
  // One ordinary project with a contract and a receipt, so every figure has something in it.
  const p = (
    await call("POST", "/api/projects", {
      clientId,
      name: "داخلي",
      status: "active",
      startDate: today,
    })
  ).body.id;
  await call("PATCH", `/api/projects/${p}/finance/ctrl`, { version: 0, contractValue: 10000 });
  await call("POST", `/api/projects/${p}/finance/receipts`, {
    date: today,
    amount: 5000,
    note: "",
  });
});

/** Every figure that adds projects up into money. */
const figures = async () => {
  const strip = (b: J) => JSON.parse(JSON.stringify(b, (k, v) => (k === "generatedAt" ? 0 : v)));
  const get = async (path: string) => strip((await call("GET", path)).body);
  const clients = (await call("GET", "/api/clients")).body.items.map((c: J) => ({
    projectValue: c.projectValue,
    owed: c.owed,
  }));
  return {
    company: await get(`/api/finance/company/overview?year=${year}`),
    quarter: await get(`/api/finance/company/quarter?year=${year}&q=0`),
    balances: await get("/api/finance/company/balances"),
    overview: await get(`/api/finance/overview?year=${year}`),
    checks: await get("/api/finance/checks"),
    vat: await get(`/api/finance/vat/year?year=${year}`),
    review: await get(`/api/finance/year-review?year=${year}`),
    receivables: await get("/api/receivables"),
    statement: await get(`/api/clients/${clientId}/statement`),
    products: await get("/api/products/overview"),
    clients,
  };
};

describe("مشروع خارجي", () => {
  it("never enters a financial figure", async () => {
    const before = await figures();
    const ext = await call("POST", "/api/projects", {
      clientId,
      name: "خارجي",
      status: "active",
      startDate: today,
      expectedValue: 250000,
      external: true,
    });
    expect(ext.status).toBe(201);
    expect(await figures()).toEqual(before);
    // It is still a project: listed, and filterable.
    const list = (await call("GET", "/api/projects?external=1")).body.items;
    expect(list.map((p: J) => p.name)).toEqual(["خارجي"]);
    expect(list[0].external).toBe(true);
  });

  it("refuses money records, and closing", async () => {
    const id = (await call("POST", "/api/projects", { clientId, name: "خارجي", external: true }))
      .body.id;
    const F = `/api/projects/${id}/finance`;
    for (const [m, path, body] of [
      ["POST", `${F}/entries`, { type: "expense", amount: 100, description: "x" }],
      ["POST", `${F}/receipts`, { date: today, amount: 100, note: "" }],
      ["PATCH", `${F}/ctrl`, { version: 0, contractValue: 1000 }],
      [
        "POST",
        "/api/finance/vat/invoices",
        { projectId: id, number: "1", date: today, amount: 100 },
      ],
      ["POST", `/api/receivables/projects/${id}`, { label: "دفعة", dueDate: today, amount: 100 }],
      ["POST", `/api/projects/${id}/close`, { note: "" }],
    ] as const) {
      const r = await call(m, path, body);
      expect([m, path, r.status, r.body.error]).toEqual([m, path, 409, "project_external"]);
    }
  });

  it("becomes external only without money records; back to internal any time", async () => {
    const id = (await call("POST", "/api/projects", { clientId, name: "يتحول" })).body.id;
    await call("POST", `/api/projects/${id}/finance/receipts`, {
      date: today,
      amount: 10,
      note: "",
    });
    const no = await call("PATCH", `/api/projects/${id}`, { external: true });
    expect(no.status).toBe(409);
    expect(no.body).toMatchObject({ error: "has_finance_records", held: ["receipts"] });

    const clean = (await call("POST", "/api/projects", { clientId, name: "نظيف" })).body.id;
    expect((await call("PATCH", `/api/projects/${clean}`, { external: true })).status).toBe(200);
    expect((await call("PATCH", `/api/projects/${clean}`, { external: false })).status).toBe(200);
    const r = await call("POST", `/api/projects/${clean}/finance/receipts`, {
      date: today,
      amount: 10,
      note: "",
    });
    expect(r.status).toBe(201);
  });
});
