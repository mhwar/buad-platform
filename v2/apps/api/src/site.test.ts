import { orgs, users } from "@buad/schema/db";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, type Env } from "./app";
import { hashPassword } from "./auth/password";
import { testDb } from "./test-db";

const env = { APP_VERSION: "t", JWT_SECRET: "test-secret-at-least-16-chars" } as Env;
let ctx: ReturnType<typeof testDb>;
let app: ReturnType<typeof createApp>;
const cookie: Record<string, string> = {};
type J = any;
const call = async (
  who: string,
  method: string,
  path: string,
  body?: unknown,
  extra: Record<string, string> = {},
) => {
  const r = await app.request(
    path,
    {
      method,
      headers: { "content-type": "application/json", cookie: cookie[who] ?? "", ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
  return { status: r.status, body: (await r.json()) as J };
};

beforeEach(async () => {
  ctx = testDb();
  app = createApp({ getDb: () => ctx.db });
  await ctx.db.insert(orgs).values([
    { id: "org_platform", name: "بُعد" },
    { id: "o2", name: "أخرى" },
  ]);
  const pw = await hashPassword("password-123");
  await ctx.db.insert(users).values([
    { id: "adm", orgId: "org_platform", email: "adm@a.sa", role: "admin", passwordHash: pw },
    { id: "m1", orgId: "org_platform", email: "m1@a.sa", role: "member", passwordHash: pw },
    { id: "x", orgId: "o2", email: "x@b.sa", role: "owner", passwordHash: pw },
  ]);
  for (const [w, e] of [
    ["adm", "adm@a.sa"],
    ["m1", "m1@a.sa"],
    ["x", "x@b.sa"],
  ]) {
    const r = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: e, password: "password-123" }),
      },
      env,
    );
    cookie[w as string] = (r.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  }
});

const S = "/api/site";
const PUB = "/api/public/site";
const REQ = "/api/product-requests";
const ip = (n: string) => ({ "cf-connecting-ip": n });

/** A published, listed product built from the transport blueprint, with real costs entered. */
async function publishedProduct() {
  const id = (await call("adm", "POST", "/api/products/from-blueprint/patient-transport")).body.id;
  const g = (await call("adm", "GET", `/api/products/${id}`)).body.product;
  const pricing = {
    ...g.pricing,
    method: "margin",
    value: 37,
    lines: g.pricing.lines.map((l: J) => ({ ...l, cost: 1234.56 })),
    packages: g.pricing.packages.map((p: J) => ({ ...p, qty: { trip: 7, night: 3 } })),
  };
  const r = await call("adm", "PATCH", `/api/products/${id}`, {
    version: g.version,
    pricing,
    status: "published",
    showOnSite: true,
  });
  expect(r.status).toBe(200);
  return id as string;
}

describe("site draft and publishing", () => {
  it("starts from the default site, versioned, and nothing is public until published", async () => {
    const d = await call("adm", "GET", `${S}/draft`);
    expect(d.body.content.hero.title).toContain("مشروعك علينا");
    expect(d.body.version).toBe(1);
    expect(d.body.isPublished).toBe(false);
    expect((await call("", "GET", PUB)).body).toEqual({ ok: true, published: false });
  });

  it("saves with a version lock, publishes a snapshot, and later edits stay private", async () => {
    const d = (await call("adm", "GET", `${S}/draft`)).body;
    const content = { ...d.content, hero: { ...d.content.hero, accent: "النتيجة" } };
    const ok = await call("adm", "PATCH", `${S}/draft`, { version: 1, content });
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(2);
    expect((await call("adm", "PATCH", `${S}/draft`, { version: 1, content })).status).toBe(409);

    expect((await call("adm", "POST", `${S}/publish`)).status).toBe(200);
    const pub = (await call("", "GET", PUB)).body;
    expect(pub.published).toBe(true);
    expect(pub.site.hero.accent).toBe("النتيجة");
    expect(pub.logoUrl).toBe("/site/logo.png");

    // an edit after publishing is a draft only
    const again = { ...content, hero: { ...content.hero, accent: "مسودة جديدة" } };
    expect((await call("adm", "PATCH", `${S}/draft`, { version: 2, content: again })).status).toBe(
      200,
    );
    expect((await call("", "GET", PUB)).body.site.hero.accent).toBe("النتيجة");
    const dd = (await call("adm", "GET", `${S}/draft`)).body;
    expect(dd.changed).toBe(true);

    await call("adm", "POST", `${S}/unpublish`);
    expect((await call("", "GET", PUB)).body.published).toBe(false);
  });

  it("rejects a logo that is not the org's own asset; members are refused", async () => {
    const d = (await call("adm", "GET", `${S}/draft`)).body;
    const bad = { ...d.content, brand: { ...d.content.brand, logoAsset: "ast_nope" } };
    expect((await call("adm", "PATCH", `${S}/draft`, { version: 1, content: bad })).status).toBe(
      400,
    );
    expect((await call("m1", "GET", `${S}/draft`)).status).toBe(403);
    expect((await call("m1", "POST", `${S}/publish`)).status).toBe(403);
    expect((await call("", "GET", `${S}/draft`)).status).toBe(401);
  });

  it("serves a logo publicly only when the published site uses it", async () => {
    expect((await call("", "GET", `${PUB}/assets/ast_x`)).status).toBe(404);
  });
});

describe("public products never reveal prices", () => {
  it("lists only published and listed products, with content only", async () => {
    await call("adm", "POST", `${S}/publish`);
    const id = await publishedProduct();
    // a draft product is not visible
    await call("adm", "POST", "/api/products/from-blueprint/project-delivery");

    const list = (await call("", "GET", PUB)).body;
    expect(list.products.map((p: J) => p.slug)).toEqual(["patient-transport"]);

    const one = await call("", "GET", `${PUB}/products/patient-transport`);
    expect(one.status).toBe(200);
    expect(one.body.product.content.packages).toHaveLength(3);
    const raw = JSON.stringify(one.body) + JSON.stringify(list);
    // none of the private pricing model or its numbers leaves the platform
    for (const leak of ["pricing", "cost", "1234", "marginPct", '"value":37', "unitCost"])
      expect(raw).not.toContain(leak);
    expect((await call("", "GET", `${PUB}/products/project-delivery`)).status).toBe(404);

    // unlisting or archiving hides it again
    const g = (await call("adm", "GET", `/api/products/${id}`)).body.product;
    await call("adm", "PATCH", `/api/products/${id}`, { version: g.version, showOnSite: false });
    expect((await call("", "GET", `${PUB}/products/patient-transport`)).status).toBe(404);
  });
});

describe("quote requests from the website", () => {
  const good = (extra: Record<string, unknown> = {}) => ({
    productSlug: "patient-transport",
    name: "أحمد",
    entity: "جمعية تجريبية",
    phone: "0551234567",
    answers: { beneficiaries: "40", city: "الرياض", service: "كلاهما" },
    ...extra,
  });
  const setup = async () => {
    await call("adm", "POST", `${S}/publish`);
    await publishedProduct();
  };

  it("stores the answers under the question labels and shows them to managers", async () => {
    await setup();
    const r = await call("", "POST", `${PUB}/requests`, good(), ip("1.1.1.1"));
    expect(r.status).toBe(201);
    const list = (await call("adm", "GET", REQ)).body;
    expect(list.requests).toHaveLength(1);
    const q = list.requests[0];
    expect(q).toMatchObject({
      name: "أحمد",
      status: "new",
      source: "site",
      productName: "النقل والتسكين العلاجي",
    });
    expect(q.answers["العدد التقديري للمستفيدين"]).toBe("40");
    expect(q.answers["نوع الخدمة المطلوبة"]).toBe("كلاهما");
    expect(list.counts.new).toBe(1);
  });

  it("validates input: contact, required answers, unknown product, foreign origin", async () => {
    await setup();
    const no = await call(
      "",
      "POST",
      `${PUB}/requests`,
      good({ phone: "", email: "" }),
      ip("2.2.2.2"),
    );
    expect(no.body.error).toBe("contact_required");
    const miss = await call(
      "",
      "POST",
      `${PUB}/requests`,
      good({ answers: { city: "جدة" } }),
      ip("2.2.2.2"),
    );
    expect(miss.status).toBe(400);
    expect(miss.body.keys).toContain("beneficiaries");
    expect(
      (await call("", "POST", `${PUB}/requests`, good({ productSlug: "zzz" }), ip("2.2.2.2")))
        .status,
    ).toBe(404);
    const foreign = await call("", "POST", `${PUB}/requests`, good(), {
      ...ip("2.2.2.2"),
      origin: "https://evil.example",
    });
    expect(foreign.status).toBe(403);
    expect(
      (await call("", "POST", `${PUB}/requests`, good({ name: "ا" }), ip("2.2.2.2"))).status,
    ).toBe(400);
    expect((await call("adm", "GET", REQ)).body.requests).toHaveLength(0);
  });

  it("a filled honeypot looks successful but stores nothing", async () => {
    await setup();
    const r = await call(
      "",
      "POST",
      `${PUB}/requests`,
      good({ website: "http://spam" }),
      ip("3.3.3.3"),
    );
    expect(r.status).toBe(200);
    expect((await call("adm", "GET", REQ)).body.requests).toHaveLength(0);
  });

  it("limits each address to five requests an hour", async () => {
    await setup();
    for (let i = 0; i < 5; i++)
      expect((await call("", "POST", `${PUB}/requests`, good(), ip("4.4.4.4"))).status).toBe(201);
    expect((await call("", "POST", `${PUB}/requests`, good(), ip("4.4.4.4"))).status).toBe(429);
    expect((await call("", "POST", `${PUB}/requests`, good(), ip("5.5.5.5"))).status).toBe(201);
  });

  it("is closed while the site is not published", async () => {
    await publishedProduct();
    expect((await call("", "POST", `${PUB}/requests`, good(), ip("6.6.6.6"))).status).toBe(404);
  });
});

describe("requests inbox", () => {
  it("managers triage; members and other orgs are locked out", async () => {
    await call("adm", "POST", `${S}/publish`);
    await publishedProduct();
    await call(
      "",
      "POST",
      `${PUB}/requests`,
      {
        productSlug: "patient-transport",
        name: "منى",
        phone: "0500000000",
        answers: { beneficiaries: "5", city: "أبها", service: "نقل" },
      },
      ip("7.7.7.7"),
    );
    const id = (await call("adm", "GET", REQ)).body.requests[0].id;

    expect(
      (await call("adm", "PATCH", `${REQ}/${id}`, { status: "contacted", notes: "اتصلنا" })).status,
    ).toBe(200);
    const after = (await call("adm", "GET", `${REQ}?status=contacted`)).body;
    expect(after.requests[0]).toMatchObject({ status: "contacted", notes: "اتصلنا" });
    expect((await call("adm", "GET", `${REQ}?status=new`)).body.requests).toHaveLength(0);
    expect((await call("adm", "PATCH", `${REQ}/${id}`, { status: "bogus" })).status).toBe(400);

    expect((await call("m1", "GET", REQ)).status).toBe(403);
    expect((await call("x", "GET", REQ)).body.requests).toEqual([]);
    expect((await call("x", "PATCH", `${REQ}/${id}`, { status: "won" })).status).toBe(404);
  });

  it("staff can log an enquiry by hand", async () => {
    await publishedProduct();
    const r = await call("adm", "POST", REQ, {
      name: "خالد",
      phone: "0511111111",
      productSlug: "patient-transport",
      message: "عبر واتساب",
    });
    expect(r.status).toBe(201);
    const q = (await call("adm", "GET", REQ)).body.requests[0];
    expect(q).toMatchObject({
      source: "manual",
      name: "خالد",
      productName: "النقل والتسكين العلاجي",
    });
    expect((await call("adm", "POST", REQ, { name: "بلا وسيلة" })).status).toBe(400);
  });
});
