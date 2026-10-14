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
  const c = await call(who, "POST", "/api/clients", { name: "عميل" });
  return (await call(who, "POST", "/api/projects", { name: "مشروع", clientId: c.body.id, ...body }))
    .body.id as string;
};
const keys = (r: J) => r.body.items.map((i: J) => i.key).sort();

describe("attention feed", () => {
  it("shows each role only what it can act on, and nothing when all is well", async () => {
    expect((await call("own", "GET", "/api/attention")).body.items).toEqual([]);
    const old = Math.floor(Date.now() / 1000) - 5 * 86400;
    await ctx.db
      .insert(productRequests)
      .values({ id: "rq1", orgId: "org_platform", name: "طالب", createdAt: old });
    await proj("own", { endDate: "2020-01-01", startDate: "2019-01-01" });
    expect(keys(await call("own", "GET", "/api/attention"))).toEqual(["overdue", "requests"]);
    // sales sees the request but not what belongs to other roles
    expect(keys(await call("sal", "GET", "/api/attention"))).toContain("requests");
    // a team member sees neither requests nor finance lines
    expect(keys(await call("m1", "GET", "/api/attention"))).not.toContain("requests");
    expect((await call("x", "GET", "/api/attention")).body.items).toEqual([]);
  });

  it("a recent request is not yet flagged", async () => {
    await ctx.db.insert(productRequests).values({ id: "rq2", orgId: "org_platform", name: "جديد" });
    expect(keys(await call("own", "GET", "/api/attention"))).toEqual([]);
  });

  it("the setup checklist follows real data, is for those who edit the organisation, and vanishes when complete", async () => {
    const first = (await call("own", "GET", "/api/attention")).body.checklist;
    expect(first.map((i: J) => i.key)).toEqual([
      "org",
      "client",
      "project",
      "product",
      "team",
      "plan",
    ]);
    expect(first.every((i: J) => !i.done)).toBe(false); // the owner already has colleagues in this fixture
    expect(first.find((i: J) => i.key === "team").done).toBe(true);
    expect((await call("m1", "GET", "/api/attention")).body.checklist).toEqual([]);
    await proj("own");
    const next = (await call("own", "GET", "/api/attention")).body.checklist;
    expect(next.find((i: J) => i.key === "client").done).toBe(true);
    expect(next.find((i: J) => i.key === "project").done).toBe(true);
  });
});

describe("notifications", () => {
  it("asking for approval notifies the others who can approve, once", async () => {
    const id = await proj("own");
    const doc = (
      await call("own", "POST", `/api/projects/${id}/documents`, {
        kind: "letter",
        template: "blank",
        title: "خطاب",
      })
    ).body;
    const st = await call("adm", "POST", `/api/documents/${doc.id}/status`, {
      to: "review",
      version: 1,
    });
    expect(st.status).toBe(200);
    const mine = await call("own", "GET", "/api/notifications");
    expect(mine.body.unread).toBe(1);
    expect(mine.body.items[0]).toMatchObject({
      kind: "approval",
      title: expect.stringContaining("خطاب"),
    });
    expect((await call("adm", "GET", "/api/notifications")).body.unread).toBe(0); // not the actor
    expect((await call("view", "GET", "/api/notifications")).body.unread).toBe(0); // no permission
    expect(keys(await call("own", "GET", "/api/attention"))).toContain("docs");
  });

  it("marks one or all as read, and never touches someone else's", async () => {
    const id = await proj("own");
    const doc = (
      await call("own", "POST", `/api/projects/${id}/documents`, {
        kind: "letter",
        template: "blank",
      })
    ).body;
    await call("adm", "POST", `/api/documents/${doc.id}/status`, { to: "review", version: 1 });
    const n = (await call("own", "GET", "/api/notifications")).body.items[0];
    await call("adm", "POST", `/api/notifications/${n.id}/read`);
    expect((await call("own", "GET", "/api/notifications")).body.unread).toBe(1);
    await call("own", "POST", `/api/notifications/${n.id}/read`);
    expect((await call("own", "GET", "/api/notifications")).body.unread).toBe(0);
    await call("own", "POST", "/api/notifications/read-all");
    expect((await call("own", "GET", "/api/notifications")).body.items[0].readAt).toBeGreaterThan(
      0,
    );
  });
});
