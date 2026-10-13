import { orgs, users } from "@buad/schema/db";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, type Env } from "./app";
import { hashPassword } from "./auth/password";
import { testDb } from "./test-db";

const TOKEN = "setup-token-0123456789-abcdefghij";
const base = { APP_VERSION: "t", JWT_SECRET: "test-secret-at-least-16-chars" };
const env = (extra: Partial<Env> = {}) => ({ ...base, OWNER_SETUP_TOKEN: TOKEN, ...extra }) as Env;

let ctx: ReturnType<typeof testDb>;
let app: ReturnType<typeof createApp>;

const claim = (body: Record<string, unknown>, e: Env = env()) =>
  app.request(
    "/api/setup/owner",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    e,
  );
const good = {
  token: TOKEN,
  name: "مالك المنصة",
  email: "Info@Mhwar.sa",
  password: "a-very-long-password",
};
const status = async (e: Env = env()) =>
  ((await (await app.request("/api/setup/status", {}, e)).json()) as { needsSetup: boolean })
    .needsSetup;
const ownerCount = () =>
  (ctx.sqlite.prepare("select count(*) c from users where role='owner'").get() as { c: number }).c;

beforeEach(() => {
  ctx = testDb();
  app = createApp({ getDb: () => ctx.db });
});

describe("first-owner setup", () => {
  it("is invisible when no token is configured or the token is too short", async () => {
    expect(await status(env({ OWNER_SETUP_TOKEN: undefined }))).toBe(false);
    expect(await status(env({ OWNER_SETUP_TOKEN: "short" }))).toBe(false);
    expect((await claim(good, env({ OWNER_SETUP_TOKEN: undefined }))).status).toBe(404);
    expect(
      (await claim({ ...good, token: "short" }, env({ OWNER_SETUP_TOKEN: "short" }))).status,
    ).toBe(404);
    expect(ownerCount()).toBe(0);
  });

  it("rejects a wrong token and creates nothing", async () => {
    expect(await status()).toBe(true);
    const res = await claim({ ...good, token: `${TOKEN}x` });
    expect(res.status).toBe(403);
    expect(ownerCount()).toBe(0);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("validates the password and email", async () => {
    expect((await claim({ ...good, password: "short" })).status).toBe(400);
    expect((await claim({ ...good, email: "nope" })).status).toBe(400);
    expect((await claim({ ...good, name: "  " })).status).toBe(400);
    expect(ownerCount()).toBe(0);
  });

  it("creates the owner, signs them in, and the password works for a normal login", async () => {
    const res = await claim(good);
    expect(res.status).toBe(200);
    const raw = res.headers.get("set-cookie") ?? "";
    expect(raw).toMatch(/HttpOnly/i);
    const cookie = raw.split(";")[0] ?? "";
    const me = await app.request("/api/me", { headers: { cookie } }, env());
    expect(((await me.json()) as { user: { email: string; role: string } }).user).toMatchObject({
      email: "info@mhwar.sa",
      role: "owner",
    });
    const login = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "info@mhwar.sa", password: good.password }),
      },
      env(),
    );
    expect(login.status).toBe(200);
    // the stored value is a PBKDF2 hash, never the password
    const row = ctx.sqlite.prepare("select password_hash h from users").get() as { h: string };
    expect(row.h.startsWith("pbkdf2$")).toBe(true);
    expect(row.h).not.toContain(good.password);
  });

  it("works exactly once: afterwards the status is false and every claim is 409", async () => {
    expect((await claim(good)).status).toBe(200);
    expect(await status()).toBe(false);
    expect((await claim({ ...good, email: "other@x.sa" })).status).toBe(409);
    expect((await claim(good)).status).toBe(409);
    expect(ownerCount()).toBe(1);
  });

  it("two simultaneous claims produce exactly one owner", async () => {
    const [a, b] = await Promise.all([
      claim(good),
      claim({ ...good, email: "second@x.sa", password: "another-long-password" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(ownerCount()).toBe(1);
  });

  it("promotes an imported v1 user with the same email instead of duplicating, and revokes old sessions", async () => {
    await ctx.db.insert(orgs).values({ id: "org_platform", name: "بُعد" });
    await ctx.db.insert(users).values({
      id: "usr_admin_1",
      orgId: "org_platform",
      email: "info@mhwar.sa",
      name: "قديم",
      role: "admin",
      legacyHash: "abc",
      tokenVersion: 3,
    });
    expect((await claim(good)).status).toBe(200);
    const rows = ctx.sqlite
      .prepare("select id, role, legacy_hash lh, token_version v from users")
      .all() as {
      id: string;
      role: string;
      lh: string;
      v: number;
    }[];
    expect(rows).toEqual([{ id: "usr_admin_1", role: "owner", lh: "", v: 4 }]);
  });

  it("does not leak the token or password in any response body", async () => {
    const bodies = [
      await (await claim({ ...good, token: "wrong-token-value-xxxxxxxxxxxx" })).text(),
      await (await claim(good)).text(),
      await (await claim(good)).text(),
    ];
    for (const b of bodies) {
      expect(b).not.toContain(TOKEN);
      expect(b).not.toContain(good.password);
    }
  });
});
