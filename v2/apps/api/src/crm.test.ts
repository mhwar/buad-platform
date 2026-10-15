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

const client = async (who = "own", name = `عميل ${Math.random()}`) =>
  (await call(who, "POST", "/api/clients", { name })).body.id as string;
const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const list = async (q = "", who = "own") =>
  (await call(who, "GET", `/api/clients${q}`)).body.items as J[];

describe("CRM: activities", () => {
  it("logs contacts newest first, keeps the latest contact, and sets the next follow-up", async () => {
    const id = await client();
    const a = await call("sal", "POST", `/api/crm/clients/${id}/activities`, {
      type: "call",
      summary: "اتصلنا لتعريفه بالخدمة",
      on: "2026-02-01",
      followUpAt: addDays(3),
    });
    expect(a.status).toBe(201);
    await call("sal", "POST", `/api/crm/clients/${id}/activities`, {
      type: "meeting",
      summary: "اجتماع في مقره",
      on: "2026-03-05",
    });
    await call("sal", "POST", `/api/crm/clients/${id}/activities`, {
      type: "note",
      summary: "ملاحظة قديمة",
      on: "2025-12-01",
    });
    const got = (await call("sal", "GET", `/api/crm/clients/${id}`)).body;
    expect(got.activities.map((x: J) => x.summary)).toEqual([
      "اجتماع في مقره",
      "اتصلنا لتعريفه بالخدمة",
      "ملاحظة قديمة",
    ]);
    expect(got.activities[0]).toMatchObject({ type: "meeting", createdByName: "sal" });
    // the back-dated note did not rewind the last contact
    expect(got.crm.lastContactAt).toBe(Math.floor(Date.parse("2026-03-05T12:00:00Z") / 1000));
    expect(got.crm.nextFollowUpAt).toBe(addDays(3)); // untouched by the entries that did not mention it
    await call("sal", "POST", `/api/crm/clients/${id}/activities`, {
      type: "call",
      summary: "تم",
      followUpAt: "",
    });
    expect((await call("sal", "GET", `/api/crm/clients/${id}`)).body.crm.nextFollowUpAt).toBe("");
  });

  it("deleting an entry restores the last contact to the newest that is left", async () => {
    const id = await client();
    const a = (
      await call("own", "POST", `/api/crm/clients/${id}/activities`, {
        type: "call",
        summary: "أ",
        on: "2026-01-01",
      })
    ).body.id;
    const b = (
      await call("own", "POST", `/api/crm/clients/${id}/activities`, {
        type: "call",
        summary: "ب",
        on: "2026-02-01",
      })
    ).body.id;
    await call("own", "DELETE", `/api/crm/activities/${b}`);
    expect((await call("own", "GET", `/api/crm/clients/${id}`)).body.crm.lastContactAt).toBe(
      Math.floor(Date.parse("2026-01-01T12:00:00Z") / 1000),
    );
    await call("own", "DELETE", `/api/crm/activities/${a}`);
    expect((await call("own", "GET", `/api/crm/clients/${id}`)).body.crm.lastContactAt).toBe(0);
  });

  it("is for those who may edit clients; readers read; other organisations see nothing", async () => {
    const id = await client();
    expect((await call("view", "GET", `/api/crm/clients/${id}`)).status).toBe(200);
    expect(
      (
        await call("view", "POST", `/api/crm/clients/${id}/activities`, {
          type: "note",
          summary: "x",
        })
      ).status,
    ).toBe(403);
    expect((await call("x", "GET", `/api/crm/clients/${id}`)).status).toBe(404);
    expect(
      (await call("x", "POST", `/api/crm/clients/${id}/activities`, { type: "note", summary: "x" }))
        .status,
    ).toBe(404);
    expect(
      (
        await call("own", "POST", `/api/crm/clients/${id}/activities`, {
          type: "note",
          summary: "",
        })
      ).status,
    ).toBe(400);
  });
});

describe("CRM: owner, source and tags", () => {
  it("sets them, cleans the tags, and tells the new owner once", async () => {
    const id = await client();
    const r = await call("own", "PATCH", `/api/crm/clients/${id}`, {
      ownerId: "sal",
      source: "referral",
      tags: [" مهم ", "مهم", "", "VIP"],
    });
    expect(r.status).toBe(200);
    const got = (await call("own", "GET", `/api/crm/clients/${id}`)).body.crm;
    expect(got).toMatchObject({
      ownerId: "sal",
      ownerName: "sal",
      source: "referral",
      tags: ["مهم", "VIP"],
    });
    expect((await call("sal", "GET", "/api/notifications")).body.items[0]).toMatchObject({
      kind: "client",
    });
    await call("own", "PATCH", `/api/crm/clients/${id}`, { ownerId: "sal" });
    expect((await call("sal", "GET", "/api/notifications")).body.unread).toBe(1);
    expect((await call("own", "PATCH", `/api/crm/clients/${id}`, { ownerId: "x" })).status).toBe(
      404,
    ); // another organisation's user
    expect((await call("own", "PATCH", `/api/crm/clients/${id}`, { source: "nope" })).status).toBe(
      400,
    );
  });
});

describe("CRM: the client list", () => {
  it("works out each client's relationship from real data and filters by it", async () => {
    const active = await client("own", "نشط");
    const prospect = await client("own", "محتمل");
    const former = await client("own", "سابق");
    await client("own", "جديد");
    await call("own", "POST", "/api/projects", {
      clientId: active,
      name: "جارٍ",
      expectedValue: 1000,
    });
    await call("own", "POST", "/api/projects", {
      clientId: former,
      name: "منتهٍ",
      expectedValue: 1000,
      status: "completed",
    });
    await ctx.db.insert(productRequests).values({
      id: "rq1",
      orgId: "org_platform",
      name: "طالب",
      clientId: prospect,
      status: "quoted",
    });
    const rel = Object.fromEntries((await list()).map((c) => [c.name, c.relationship]));
    expect(rel).toEqual({ نشط: "active", محتمل: "prospect", سابق: "former", جديد: "new" });
    expect((await list("?rel=prospect")).map((c) => c.name)).toEqual(["محتمل"]);
    expect((await list("?rel=active")).map((c) => c.name)).toEqual(["نشط"]);
    const a = (await list()).find((c) => c.name === "نشط")!;
    expect(a).toMatchObject({ activeProjects: 1, openRequests: 0, tags: [], ownerName: "" });
  });

  it("filters by owner («me»), source, tag and due follow-up, and sorts by least recent contact", async () => {
    const a = await client("own", "أ");
    const b = await client("own", "ب");
    await client("own", "ج");
    await call("own", "PATCH", `/api/crm/clients/${a}`, {
      ownerId: "sal",
      source: "event",
      tags: ["مهم"],
      nextFollowUpAt: "2020-01-01",
    });
    await call("own", "PATCH", `/api/crm/clients/${b}`, {
      ownerId: "own",
      nextFollowUpAt: addDays(30),
    });
    expect((await list("?owner=me", "sal")).map((c) => c.name)).toEqual(["أ"]);
    expect((await list("?owner=own")).map((c) => c.name)).toEqual(["ب"]);
    expect((await list("?source=event")).map((c) => c.name)).toEqual(["أ"]);
    expect((await list(`?tag=${encodeURIComponent("مهم")}`)).map((c) => c.name)).toEqual(["أ"]);
    expect((await list("?followup=due")).map((c) => c.name)).toEqual(["أ"]); // ب is in the future
    await call("own", "POST", `/api/crm/clients/${a}/activities`, { type: "call", summary: "x" });
    expect((await list("?sort=contact")).map((c) => c.name)[2]).toBe("أ"); // contacted most recently comes last
  });
});

describe("CRM: follow-ups", () => {
  it("lists clients and open enquiries together, soonest first, with their state", async () => {
    const a = await client("own", "العميل");
    await call("own", "PATCH", `/api/crm/clients/${a}`, {
      nextFollowUpAt: addDays(-2),
      ownerId: "sal",
    });
    await ctx.db.insert(productRequests).values([
      {
        id: "r1",
        orgId: "org_platform",
        name: "فرصة اليوم",
        status: "contacted",
        followUpAt: addDays(0),
        valueHalalas: 500000,
      },
      {
        id: "r2",
        orgId: "org_platform",
        name: "فرصة مغلقة",
        status: "won",
        followUpAt: addDays(-5),
      },
    ]);
    const f = (await call("sal", "GET", "/api/crm/followups")).body;
    expect(f.items.map((i: J) => [i.title, i.kind, i.state])).toEqual([
      ["العميل", "client", "overdue"],
      ["فرصة اليوم", "request", "today"],
    ]);
    expect(f.items[1].value).toBe(5000);
    expect(
      (await call("sal", "GET", "/api/crm/followups?scope=mine")).body.items.map((i: J) => i.title),
    ).toEqual(["العميل"]);
    // someone without the sales permission sees client follow-ups only
    expect(
      (await call("m1", "GET", "/api/crm/followups")).body.items.map((i: J) => i.kind),
    ).toEqual(["client"]);
  });

  it("logging a contact with a new date moves the follow-up; the home feed counts what is due", async () => {
    const a = await client("own", "العميل");
    await call("own", "PATCH", `/api/crm/clients/${a}`, { nextFollowUpAt: addDays(-1) });
    const feed = async () =>
      (await call("sal", "GET", "/api/attention")).body.items.find((i: J) => i.key === "followups")
        ?.count ?? 0;
    expect(await feed()).toBe(1);
    await call("own", "POST", `/api/crm/clients/${a}/activities`, {
      type: "call",
      summary: "تواصلنا",
      followUpAt: addDays(7),
    });
    expect(await feed()).toBe(0);
  });
});
