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

const P = "/api/products";
const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const mkQuote = async (extra: J = {}) =>
  (
    await call("sal", "POST", "/api/quotes", {
      title: "عرض خدمة",
      recipient: "منى",
      entity: "جمعية الأمل",
      items: [{ label: "بند", qty: 2, unit: 5000 }],
      vatPct: 15,
      ...extra,
    })
  ).body.id as string;
const accept = async (id: string) => {
  await call("sal", "POST", `/api/quotes/${id}/status`, { to: "sent" });
  return call("sal", "POST", `/api/quotes/${id}/status`, { to: "accepted" });
};

describe("duplicating a quote", () => {
  it("makes a new draft with its own number and the same lines, leaving the original alone", async () => {
    const a = await mkQuote({
      discount: 500,
      terms: "الدفع خلال 30 يوماً",
      validUntil: addDays(10),
    });
    await call("sal", "POST", `/api/quotes/${a}/status`, { to: "sent" });
    const d = await call("sal", "POST", `/api/quotes/${a}/duplicate`);
    expect(d.status).toBe(201);
    const copy = (await call("sal", "GET", `/api/quotes/${d.body.id}`)).body.quote;
    const orig = (await call("sal", "GET", `/api/quotes/${a}`)).body.quote;
    expect(copy.number).not.toBe(orig.number);
    expect(copy).toMatchObject({
      status: "draft",
      validUntil: "",
      terms: "الدفع خلال 30 يوماً",
      discount: 500,
      title: "عرض خدمة",
    });
    expect(copy.totals.total).toBe(orig.totals.total);
    expect(orig.status).toBe("sent");
    expect((await call("x", "POST", `/api/quotes/${a}/duplicate`)).status).toBe(404);
    expect((await call("view", "POST", `/api/quotes/${a}/duplicate`)).status).toBe(403);
  });
});

describe("the price catalogue", () => {
  it("lists published service packages at their selling price and never shows a cost", async () => {
    const id = (await call("own", "POST", `${P}/from-blueprint/patient-transport`)).body.id;
    const g = (await call("own", "GET", `${P}/${id}`)).body.product;
    await call("own", "PATCH", `${P}/${id}`, {
      version: g.version,
      pricing: {
        ...g.pricing,
        method: "margin",
        value: 20,
        lines: g.pricing.lines.map((l: J) => ({ ...l, cost: 100 })),
        packages: g.pricing.packages.map((x: J) => ({ ...x, qty: { trip: 4 } })),
      },
    });
    expect((await call("sal", "GET", "/api/quotes/catalog")).body.items).toEqual([]); // a draft is not for sale
    const g2 = (await call("own", "GET", `${P}/${id}`)).body.product;
    await call("own", "PATCH", `${P}/${id}`, { version: g2.version, status: "published" });
    const cat = (await call("sal", "GET", "/api/quotes/catalog")).body;
    expect(cat.items.length).toBeGreaterThan(0);
    const item = cat.items.find((i: J) => i.price > 0);
    expect(item).toMatchObject({ productId: id });
    expect(item.price).toBeCloseTo(500, 0); // cost 4 × 100 at a 20% margin → 500
    const text = JSON.stringify(cat);
    for (const secret of ["cost", "profit", "margin", "pricing"])
      expect(text).not.toContain(secret);
    expect((await call("m1", "GET", "/api/quotes/catalog")).status).toBe(403);
  });
});

describe("turning an accepted quote into a project", () => {
  it("creates the client and a draft project at the quote's price, with the payment schedule, once", async () => {
    const q = await mkQuote({ discount: 1000 }); // 10000 − 1000 = 9000 + 15% = 10350
    await ctx.db.insert(productRequests).values({
      id: "rq1",
      orgId: "org_platform",
      name: "منى",
      entity: "جمعية الأمل",
      phone: "0551234567",
      status: "negotiating",
    });
    await call("sal", "PATCH", `/api/quotes/${q}`, { version: 1, requestId: "rq1" });
    expect(
      (await call("sal", "POST", `/api/quotes/${q}/convert`, { schedule: "half" })).body.error,
    ).toBe("not_accepted");
    expect((await accept(q)).status).toBe(200);
    const r = await call("sal", "POST", `/api/quotes/${q}/convert`, { schedule: "thirds" });
    expect(r.status).toBe(201);
    expect(r.body.instalments).toBe(3);
    const proj = (await call("sal", "GET", `/api/projects/${r.body.projectId}`)).body;
    expect(proj.project).toMatchObject({
      name: "عرض خدمة",
      status: "draft",
      expectedValue: 900000,
    });
    expect(proj.client.name).toBe("جمعية الأمل");
    const sched = (await call("own", "GET", `/api/receivables/projects/${r.body.projectId}`)).body
      .items;
    expect(sched.map((s: J) => s.amount)).toEqual([4140, 3105, 3105]); // 40/30/30 of 10350
    expect(sched.reduce((s: number, x: J) => s + x.amount, 0)).toBe(10350);
    const quote = (await call("sal", "GET", `/api/quotes/${q}`)).body.quote;
    expect(quote.projectId).toBe(r.body.projectId);
    const req = (await call("own", "GET", "/api/product-requests")).body.requests.find(
      (x: J) => x.id === "rq1",
    );
    expect(req).toMatchObject({ status: "won", projectId: r.body.projectId });
    expect((await call("sal", "POST", `/api/quotes/${q}/convert`, {})).body.error).toBe(
      "already_converted",
    );
  });

  it("can attach to an existing client, skips the schedule on request, and warns about a similar name", async () => {
    const existing = (await call("own", "POST", "/api/clients", { name: "جمعية النور" })).body.id;
    const a = await mkQuote({ entity: "", recipient: "" });
    await accept(a);
    const r = await call("sal", "POST", `/api/quotes/${a}/convert`, {
      clientId: existing,
      schedule: "none",
      projectName: "مشروع النور",
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ clientId: existing, instalments: 0 });
    expect(
      (await call("own", "GET", `/api/receivables/projects/${r.body.projectId}`)).body.items,
    ).toEqual([]);
    const b = await mkQuote({ entity: "جمعية النور" });
    await accept(b);
    expect((await call("sal", "POST", `/api/quotes/${b}/convert`, {})).body.error).toBe(
      "similar_name",
    );
    expect(
      (await call("sal", "POST", `/api/quotes/${b}/convert`, { confirmSimilarName: true })).status,
    ).toBe(201);
  });

  it("only those who sell can convert, and other organisations cannot", async () => {
    const q = await mkQuote();
    await accept(q);
    expect((await call("m1", "POST", `/api/quotes/${q}/convert`, {})).status).toBe(403);
    expect((await call("x", "POST", `/api/quotes/${q}/convert`, {})).status).toBe(404);
  });
});

describe("sending a quote starts the clock", () => {
  it("sets a follow-up five days out on its lead, unless one is already set", async () => {
    await ctx.db.insert(productRequests).values([
      { id: "a", orgId: "org_platform", name: "أ", status: "contacted" },
      { id: "b", orgId: "org_platform", name: "ب", status: "contacted", followUpAt: "2030-01-01" },
    ]);
    for (const id of ["a", "b"]) {
      const q = await mkQuote({ requestId: id });
      await call("sal", "POST", `/api/quotes/${q}/status`, { to: "sent" });
    }
    const reqs = (await call("own", "GET", "/api/product-requests")).body.requests;
    expect(reqs.find((x: J) => x.id === "a").followUpAt).toBe(addDays(5));
    expect(reqs.find((x: J) => x.id === "b").followUpAt).toBe("2030-01-01");
  });
});

describe("quote alerts on the home feed", () => {
  it("flags offers ending within three days and offers nobody answered for a week", async () => {
    const soon = await mkQuote({ validUntil: addDays(2) });
    const later = await mkQuote({ validUntil: addDays(20) });
    for (const q of [soon, later])
      await call("sal", "POST", `/api/quotes/${q}/status`, { to: "sent" });
    const feed = async () =>
      Object.fromEntries(
        (await call("sal", "GET", "/api/attention")).body.items.map((i: J) => [i.key, i.count]),
      );
    expect(await feed()).toMatchObject({ "quotes-expiring": 1 });
    expect((await feed())["quotes-waiting"]).toBeUndefined();
    ctx.sqlite
      .prepare("UPDATE quotes SET updated_at = ? WHERE id = ?")
      .run(Math.floor(Date.now() / 1000) - 9 * 86400, later);
    expect(await feed()).toMatchObject({ "quotes-expiring": 1, "quotes-waiting": 1 });
    expect(
      Object.keys((await call("m1", "GET", "/api/attention")).body.items.map((i: J) => i.key))
        .length >= 0,
    ).toBe(true);
    expect(
      (await call("m1", "GET", "/api/attention")).body.items.some((i: J) =>
        String(i.key).startsWith("quotes"),
      ),
    ).toBe(false);
  });
});
