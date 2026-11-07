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

const login = (password: string) =>
  app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "own@a.sa", password }),
    },
    env,
  );

describe("مفتاح الاستعادة", () => {
  it("a key made in the account page sets a new password once, and signs other devices out", async () => {
    expect((await call("GET", "/api/auth/recovery-key")).body).toMatchObject({ exists: false });
    const made = await call("POST", "/api/auth/recovery-key");
    expect(made.body.key).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/);
    expect((await call("GET", "/api/auth/recovery-key")).body.exists).toBe(true);
    const old = cookie;

    // typed in lower case and without dashes still works
    const key = made.body.key.replace(/-/g, "").toLowerCase();
    cookie = "";
    const ok = await call("POST", "/api/auth/recover", {
      email: "OWN@a.sa",
      key,
      password: "a-new-password-1",
    });
    expect(ok.status).toBe(200);
    expect((await login("password-123")).status).toBe(401);
    expect((await login("a-new-password-1")).status).toBe(200);
    // the old session no longer works
    cookie = old;
    expect((await call("GET", "/api/me")).status).toBe(401);

    // used up: the same key does not work twice
    const again = await call("POST", "/api/auth/recover", {
      email: "own@a.sa",
      key,
      password: "another-password-2",
    });
    expect(again.status).toBe(401);
  });

  it("refuses a wrong key, an unknown email, and a short password", async () => {
    await call("POST", "/api/auth/recovery-key");
    cookie = "";
    const wrong = {
      email: "own@a.sa",
      key: "AAAAA-BBBBB-CCCCC-DDDDD",
      password: "a-new-password-1",
    };
    expect((await call("POST", "/api/auth/recover", wrong)).status).toBe(401);
    expect(
      (await call("POST", "/api/auth/recover", { ...wrong, email: "nobody@a.sa" })).status,
    ).toBe(401);
    expect((await call("POST", "/api/auth/recover", { ...wrong, password: "short" })).status).toBe(
      400,
    );
    expect((await login("password-123")).status).toBe(200);
  });
});
