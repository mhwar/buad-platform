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

const site = (id = "rq1", extra: object = {}) =>
  ctx.db.insert(productRequests).values({
    id,
    orgId: "org_platform",
    name: "منى",
    entity: "جمعية الأمل",
    phone: "0500000000",
    ...extra,
  });
const newClient = async (name = "جمعية النور") =>
  (await call("own", "POST", "/api/clients", { name, type: "association" })).body.id as string;

describe("opportunities", () => {
  it("is created for an existing client, taking its name and contact details", async () => {
    const cid = await newClient();
    const r = await call("sal", "POST", "/api/product-requests", {
      clientId: cid,
      value: 25000,
      ownerId: "adm",
      followUpAt: "2030-01-05",
      message: "يريدون برنامجاً تدريبياً",
    });
    expect(r.status).toBe(201);
    const o = (await call("sal", "GET", `/api/product-requests/${r.body.id}`)).body;
    expect(o.opportunity).toMatchObject({
      clientId: cid,
      entity: "جمعية النور",
      value: 25000,
      ownerName: "adm",
      followUpAt: "2030-01-05",
      status: "new",
      source: "manual",
    });
    expect(o.client).toMatchObject({ id: cid, name: "جمعية النور" });
    // the new owner hears about it
    const n = (await call("adm", "GET", "/api/notifications")).body;
    expect(JSON.stringify(n)).toContain(`/sales/${r.body.id}`);
  });

  it("makes a new client in the same step, warning about a similar name first", async () => {
    await newClient("جمعية الأمل");
    const body = { newClient: true, entity: "جمعيه الامل", name: "منى", phone: "0511" };
    const warn = await call("sal", "POST", "/api/product-requests", body);
    expect(warn.status).toBe(409);
    expect(warn.body.error).toBe("similar_name");
    const r = await call("sal", "POST", "/api/product-requests", {
      ...body,
      entity: "جمعية البر",
    });
    expect(r.status).toBe(201);
    const o = (await call("sal", "GET", `/api/product-requests/${r.body.id}`)).body;
    expect(o.client.name).toBe("جمعية البر");
    expect(o.client.phone).toBe("0511");
  });

  it("refuses bad input: no name, no contact without a client, someone else's client or owner", async () => {
    expect((await call("sal", "POST", "/api/product-requests", { name: "م" })).status).toBe(400);
    expect((await call("sal", "POST", "/api/product-requests", { name: "منى" })).body.error).toBe(
      "contact_required",
    );
    const foreign = (await call("x", "POST", "/api/clients", { name: "غريب", type: "company" }))
      .body.id;
    expect((await call("sal", "POST", "/api/product-requests", { clientId: foreign })).status).toBe(
      404,
    );
    const cid = await newClient();
    expect(
      (await call("sal", "POST", "/api/product-requests", { clientId: cid, ownerId: "x" })).status,
    ).toBe(404);
    expect((await call("view", "POST", "/api/product-requests", { clientId: cid })).status).toBe(
      403,
    );
    expect((await call("x", "GET", "/api/product-requests/rq_none")).status).toBe(404);
  });

  it("a first contact with a website lead makes its client, qualifies it and sets the follow-up", async () => {
    await site();
    const r = await call("sal", "POST", "/api/product-requests/rq1/activities", {
      type: "call",
      summary: "اتصلت وشرحت الخدمة",
      followUpAt: "2030-02-01",
    });
    expect(r.status).toBe(201);
    const o = (await call("sal", "GET", "/api/product-requests/rq1")).body;
    expect(o.opportunity.status).toBe("contacted");
    expect(o.opportunity.followUpAt).toBe("2030-02-01");
    expect(o.opportunity.stageChangedAt).toBeGreaterThan(0);
    expect(o.client).toMatchObject({ id: r.body.clientId, name: "جمعية الأمل" });
    expect(o.activities.map((a: J) => a.type).sort()).toEqual(["call", "stage"]);
    // the client's own record shows the contact too
    const crm = (await call("sal", "GET", `/api/crm/clients/${r.body.clientId}`)).body;
    expect(crm.activities).toHaveLength(2);
    expect(crm.crm.lastContactAt).toBeGreaterThan(0);
    // a second contact reuses the client and does not move the stage again
    await call("sal", "POST", "/api/product-requests/rq1/activities", {
      type: "whatsapp",
      summary: "أرسلت الملف",
    });
    const again = (await call("sal", "GET", "/api/product-requests/rq1")).body;
    expect(again.client.id).toBe(r.body.clientId);
    expect(again.activities).toHaveLength(3);
  });

  it("links a lead to the existing client of the same name instead of a duplicate", async () => {
    const cid = await newClient("جمعية الأمل");
    await site();
    const r = await call("sal", "POST", "/api/product-requests/rq1/activities", {
      type: "note",
      summary: "ملاحظة",
    });
    expect(r.body.clientId).toBe(cid);
  });

  it("logs each stage move with the reason when lost, and stamps the time", async () => {
    const cid = await newClient();
    const id = (await call("sal", "POST", "/api/product-requests", { clientId: cid })).body.id;
    await call("sal", "PATCH", `/api/product-requests/${id}`, { status: "quoted" });
    await call("sal", "PATCH", `/api/product-requests/${id}`, { status: "quoted", value: 9 });
    await call("sal", "PATCH", `/api/product-requests/${id}`, {
      status: "lost",
      lostReason: "السعر",
    });
    const o = (await call("sal", "GET", `/api/product-requests/${id}`)).body;
    const stages = o.activities.filter((a: J) => a.type === "stage").map((a: J) => a.summary);
    expect(stages).toHaveLength(2);
    expect(stages.join("|")).toContain("«جديد» إلى «عرض سعر»");
    expect(stages.join("|")).toContain("«خاسر» — السعر");
    expect(o.opportunity.lostReason).toBe("السعر");
    expect(o.opportunity.value).toBe(9);
  });

  it("lists its offers, which follow its client, and a won offer closes it", async () => {
    const cid = await newClient();
    const id = (await call("sal", "POST", "/api/product-requests", { clientId: cid })).body.id;
    const q = (
      await call("sal", "POST", "/api/quotes", {
        requestId: id,
        title: "عرض",
        items: [{ label: "بند", qty: 1, unit: 1000 }],
      })
    ).body;
    let o = (await call("sal", "GET", `/api/product-requests/${id}`)).body;
    expect(o.quotes).toHaveLength(1);
    expect(o.quotes[0].clientId).toBe(cid);
    await call("sal", "POST", `/api/quotes/${q.id}/status`, { to: "sent" });
    await call("sal", "POST", `/api/quotes/${q.id}/status`, { to: "accepted" });
    const conv = await call("sal", "POST", `/api/quotes/${q.id}/convert`, { schedule: "none" });
    expect(conv.status).toBe(201);
    expect(conv.body.clientId).toBe(cid);
    o = (await call("sal", "GET", `/api/product-requests/${id}`)).body;
    expect(o.opportunity.status).toBe("won");
    expect(o.opportunity.projectId).toBe(conv.body.projectId);
    expect(o.activities.filter((a: J) => a.type === "stage")).toHaveLength(3); // quoted, negotiating, won
  });

  it("converting a lead that already has a client uses it", async () => {
    const cid = await newClient();
    const id = (await call("sal", "POST", "/api/product-requests", { clientId: cid })).body.id;
    const r = await call("sal", "POST", `/api/product-requests/${id}/convert`, {});
    expect(r.status).toBe(201);
    expect(r.body.clientId).toBe(cid);
  });
});
