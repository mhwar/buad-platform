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
});

describe("تسجيل التصدير", () => {
  it("every download leaves a line in the audit log", async () => {
    const r = await call("POST", "/api/exports", { what: "كشف حساب عميل.xlsx", format: "xlsx" });
    expect(r.status).toBe(200);
    const log = await call("GET", "/api/audit?entity=export");
    expect(log.body.items[0]).toMatchObject({
      entity: "export",
      action: "export",
      summary: "تصدير كشف حساب عميل.xlsx (XLSX)",
    });
  });

  it("refuses an unknown format, and anyone signed out", async () => {
    expect((await call("POST", "/api/exports", { what: "x", format: "exe" })).status).toBe(400);
    cookie = "";
    expect((await call("POST", "/api/exports", { what: "x", format: "csv" })).status).toBe(401);
  });
});
