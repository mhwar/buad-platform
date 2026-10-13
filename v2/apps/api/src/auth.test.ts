import { orgs, users } from "@buad/schema/db";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, type Env } from "./app";
import { hashPassword, legacyDjb2, verifyPassword } from "./auth/password";
import { testDb } from "./test-db";

const SECRET = "test-secret-at-least-16-chars";
const env = { APP_VERSION: "t", JWT_SECRET: SECRET } as Env;

let ctx: ReturnType<typeof testDb>;
let app: ReturnType<typeof createApp>;

const call = (path: string, init: RequestInit = {}) => app.request(path, init, env);
const post = (path: string, body: unknown, cookie?: string) =>
  call(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

async function seed() {
  const { db } = ctx;
  await db.insert(orgs).values([
    { id: "o1", name: "جمعية أ" },
    { id: "o2", name: "جمعية ب" },
  ]);
  await db.insert(users).values([
    {
      id: "u1",
      orgId: "o1",
      email: "admin@a.sa",
      name: "مدير",
      role: "admin",
      passwordHash: await hashPassword("correct-horse"),
    },
    {
      id: "u2",
      orgId: "o1",
      email: "member@a.sa",
      name: "عضو",
      role: "member",
      passwordHash: await hashPassword("member-pass-1"),
    },
    {
      id: "u3",
      orgId: "o2",
      email: "admin@b.sa",
      name: "مدير ب",
      role: "admin",
      passwordHash: await hashPassword("other-org-pass"),
    },
    {
      id: "u4",
      orgId: "o1",
      email: "old@a.sa",
      name: "قديم",
      role: "member",
      legacyHash: legacyDjb2("oldpass"),
    },
    {
      id: "u5",
      orgId: "o1",
      email: "new@a.sa",
      name: "جديد",
      role: "member",
      mustChangePass: true,
    },
  ]);
}

beforeEach(async () => {
  ctx = testDb();
  app = createApp({ getDb: () => ctx.db });
  await seed();
});

describe("password hashing", () => {
  it("verifies correct and rejects wrong passwords, with unique salts", async () => {
    const a = await hashPassword("secret-1");
    const b = await hashPassword("secret-1");
    expect(a).not.toBe(b);
    expect(await verifyPassword("secret-1", a)).toBe(true);
    expect(await verifyPassword("secret-2", a)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
  it("reproduces the v1 djb2 values", () => {
    expect(legacyDjb2("")).toBe((5381).toString(36));
    expect(legacyDjb2("oldpass")).toMatch(/^[0-9a-z]+$/);
  });
});

describe("login", () => {
  it("logs in with a session cookie that is HttpOnly + Secure + SameSite=Strict", async () => {
    const res = await post("/api/auth/login", { email: "ADMIN@a.sa ", password: "correct-horse" });
    expect(res.status).toBe(200);
    const raw = res.headers.get("set-cookie") ?? "";
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/Secure/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    const me = await call("/api/me", { headers: { cookie: cookieOf(res) } });
    expect(((await me.json()) as { user: { email: string } }).user.email).toBe("admin@a.sa");
  });

  it("rejects bad password and unknown email identically", async () => {
    const bad = await post("/api/auth/login", { email: "admin@a.sa", password: "nope" });
    const unknown = await post("/api/auth/login", { email: "ghost@a.sa", password: "nope" });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await bad.json()).toEqual(await unknown.json());
  });

  it("upgrades a v1 djb2 password to PBKDF2 on first login", async () => {
    const ok = await post("/api/auth/login", { email: "old@a.sa", password: "oldpass" });
    expect(ok.status).toBe(200);
    const row = ctx.sqlite
      .prepare("select password_hash, legacy_hash from users where id='u4'")
      .get() as {
      password_hash: string;
      legacy_hash: string;
    };
    expect(row.password_hash.startsWith("pbkdf2$")).toBe(true);
    expect(row.legacy_hash).toBe("");
    const again = await post("/api/auth/login", { email: "old@a.sa", password: "oldpass" });
    expect(again.status).toBe(200);
    const wrong = await post("/api/auth/login", { email: "old@a.sa", password: "other" });
    expect(wrong.status).toBe(401);
  });

  it("an imported user with no usable hash cannot log in", async () => {
    ctx.sqlite.prepare("update users set legacy_hash='' where id='u4'").run();
    expect((await post("/api/auth/login", { email: "old@a.sa", password: "" + "x" })).status).toBe(
      401,
    );
  });

  it("first-login users get a setup token, then set a password and are signed in", async () => {
    const res = await post("/api/auth/login", { email: "new@a.sa", password: "anything" });
    const body = (await res.json()) as { action: string; setupToken: string };
    expect(body.action).toBe("setup");
    expect(res.headers.get("set-cookie")).toBeNull();

    expect(
      (await post("/api/auth/setup-password", { setupToken: body.setupToken, password: "short" }))
        .status,
    ).toBe(400);
    const done = await post("/api/auth/setup-password", {
      setupToken: body.setupToken,
      password: "a-new-strong-pass",
    });
    expect(done.status).toBe(200);
    expect((await call("/api/me", { headers: { cookie: cookieOf(done) } })).status).toBe(200);
    // setup token is a different kind from a session token
    expect(
      (await call("/api/me", { headers: { authorization: `Bearer ${body.setupToken}` } })).status,
    ).toBe(401);
  });
});

describe("authorization", () => {
  const login = async (email: string, password: string) =>
    cookieOf(await post("/api/auth/login", { email, password }));

  it("requires a session", async () => {
    expect((await call("/api/me")).status).toBe(401);
    expect((await call("/api/users")).status).toBe(401);
    expect(
      (await call("/api/me", { headers: { cookie: "buad_session=forged.token.here" } })).status,
    ).toBe(401);
  });

  it("enforces roles", async () => {
    const member = await login("member@a.sa", "member-pass-1");
    expect((await call("/api/users", { headers: { cookie: member } })).status).toBe(403);
  });

  it("isolates organisations", async () => {
    const adminA = await login("admin@a.sa", "correct-horse");
    const listA = (await (await call("/api/users", { headers: { cookie: adminA } })).json()) as {
      users: { email: string }[];
    };
    expect(listA.users.map((u) => u.email)).not.toContain("admin@b.sa");
    expect(listA.users.length).toBe(4);
    const adminB = await login("admin@b.sa", "other-org-pass");
    const listB = (await (await call("/api/users", { headers: { cookie: adminB } })).json()) as {
      users: { email: string }[];
    };
    expect(listB.users.map((u) => u.email)).toEqual(["admin@b.sa"]);
  });

  it("revokes sessions when the token version changes", async () => {
    const cookie = await login("admin@a.sa", "correct-horse");
    expect((await call("/api/me", { headers: { cookie } })).status).toBe(200);
    ctx.sqlite.prepare("update users set token_version = token_version + 1 where id='u1'").run();
    expect((await call("/api/me", { headers: { cookie } })).status).toBe(401);
  });

  it("refuses to sign tokens without a proper secret", async () => {
    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@a.sa", password: "correct-horse" }),
      },
      { ...env, JWT_SECRET: "" },
    );
    expect(res.status).toBe(500);
  });
});
