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
    vat: await get(`/api/finance/vat/year?year=${year}`),
    review: await get(`/api/finance/year-review?year=${year}`),
    receivables: await get("/api/receivables"),
    statement: await get(`/api/clients/${clientId}/statement`),
    products: await get("/api/products/overview"),
    clients,
  };
};

describe("مشروع مسودة", () => {
  it("adds nothing to any figure, and «تحتاج تدخلك» lists it", async () => {
    const before = await figures();
    const id = (
      await call("POST", "/api/projects", {
        clientId,
        name: "مسودة",
        status: "draft",
        startDate: today,
      })
    ).body.id;
    const F = `/api/projects/${id}/finance`;
    await call("PATCH", `${F}/ctrl`, { version: 0, contractValue: 20000 });
    await call("POST", `${F}/receipts`, { date: today, amount: 3000, note: "" });
    await call("POST", `${F}/entries`, {
      type: "expense",
      cat: "exec",
      amount: 500,
      description: "تنفيذ",
      date: today,
    });
    expect(await figures()).toEqual(before);

    const checks = (await call("GET", "/api/finance/checks")).body.checks;
    const drafts = checks.find((c: J) => c.key === "drafts");
    expect(drafts.rows).toHaveLength(1);
    expect(drafts.rows[0].label).toContain("مسودة");
    expect(drafts.rows[0].detail).toContain("فيها استلامات");
    expect(drafts.rows[0].link).toBe(`/projects/${id}?view=finance`);

    // Once it starts it counts, and the alert goes.
    expect((await call("PATCH", `/api/projects/${id}`, { status: "active" })).status).toBe(200);
    expect(await figures()).not.toEqual(before);
    const after = (await call("GET", "/api/finance/checks")).body.checks;
    expect(after.find((c: J) => c.key === "drafts")).toBeUndefined();
  });
});
