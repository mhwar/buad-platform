import { orgs, users } from "@buad/schema/db";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, type Env } from "./app";
import { hashPassword } from "./auth/password";
import { testDb } from "./test-db";

const blobs = new Map<string, Uint8Array>();
const FILES = {
  put: async (k: string, v: ArrayBuffer | Uint8Array) => void blobs.set(k, new Uint8Array(v)),
  get: async (k: string) => {
    const b = blobs.get(k);
    return b
      ? {
          arrayBuffer: async () =>
            b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
        }
      : null;
  },
};
const env = {
  APP_VERSION: "t",
  JWT_SECRET: "test-secret-at-least-16-chars",
  FILES,
} as unknown as Env;
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

describe("pricing a request and converting it", () => {
  const newRequest = async () => {
    const id = await publishedProduct();
    const r = await call("adm", "POST", REQ, {
      name: "هند",
      entity: "جمعية النور",
      phone: "0522222222",
      productSlug: "patient-transport",
      message: "نحتاج عرضاً",
    });
    return { productId: id, id: r.body.id as string };
  };

  it("prices from the product's private model, computed on the server", async () => {
    const { productId, id } = await newRequest();
    const q = await call("adm", "PUT", `${REQ}/${id}/quote`, {
      productId,
      packageId: "full",
      times: 2,
    });
    expect(q.status).toBe(200);
    // 2 × (7 trips + 3 nights) × 1,234.56 = 24,691.20 cost; 37% margin → 39,192.38; VAT 15% → 5,878.86
    expect(q.body.quote).toMatchObject({
      packageName: "الباقة المتكاملة",
      cost: 24691.2,
      price: 39192.38,
      vat: 5878.86,
      total: 45071.24,
      profit: 14501.18,
      marginPct: 37,
    });
    const r = (await call("adm", "GET", REQ)).body.requests[0];
    expect(r.status).toBe("quoted");
    expect(r.quote.price).toBe(39192.38);
  });

  it("refuses to price when costs are missing, and unknown packages or products", async () => {
    const id = (await call("adm", "POST", "/api/products/from-blueprint/project-delivery")).body.id;
    const req = (await call("adm", "POST", REQ, { name: "سعد", phone: "0533333333" })).body.id;
    const missing = await call("adm", "PUT", `${REQ}/${req}/quote`, {
      productId: id,
      packageId: "fixed-package",
      times: 1,
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe("quote_incomplete");
    expect(
      (
        await call("adm", "PUT", `${REQ}/${req}/quote`, {
          productId: id,
          packageId: "zzz",
          times: 1,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call("adm", "PUT", `${REQ}/${req}/quote`, {
          productId: "prd_x",
          packageId: "a",
          times: 1,
        })
      ).status,
    ).toBe(404);
    expect(
      (await call("m1", "PUT", `${REQ}/${req}/quote`, { productId: id, packageId: "a", times: 1 }))
        .status,
    ).toBe(403);
    expect(
      (await call("x", "PUT", `${REQ}/${req}/quote`, { productId: id, packageId: "a", times: 1 }))
        .status,
    ).toBe(404);
  });

  it("creates the client and a draft project carrying the quoted price, once", async () => {
    const { productId, id } = await newRequest();
    await call("adm", "PUT", `${REQ}/${id}/quote`, { productId, packageId: "full", times: 2 });
    const done = await call("adm", "POST", `${REQ}/${id}/convert`, {});
    expect(done.status).toBe(201);
    const { clientId, projectId } = done.body;

    const client = (await call("adm", "GET", `/api/clients/${clientId}`)).body;
    expect(client.client.name).toBe("جمعية النور");
    expect(client.client.type).toBe("association");
    const proj = (await call("adm", "GET", `/api/projects/${projectId}`)).body.project;
    expect(proj.status).toBe("draft");
    expect(proj.clientId).toBe(clientId);
    expect(proj.name).toContain("جمعية النور");
    expect(proj.expectedValue).toBe(3919238); // halalas

    const r = (await call("adm", "GET", REQ)).body.requests[0];
    expect(r).toMatchObject({ status: "won", clientId, projectId });
    expect((await call("adm", "POST", `${REQ}/${id}/convert`, {})).body.error).toBe(
      "already_converted",
    );
  });

  it("warns about a similar client, and can link an existing one instead", async () => {
    await call("adm", "POST", "/api/clients", { name: "جمعية النور" });
    const { id } = await newRequest();
    const warn = await call("adm", "POST", `${REQ}/${id}/convert`, {});
    expect(warn.status).toBe(409);
    expect(warn.body.error).toBe("similar_name");
    const existing = warn.body.similar.id;
    const linked = await call("adm", "POST", `${REQ}/${id}/convert`, { clientId: existing });
    expect(linked.status).toBe(201);
    expect(linked.body.clientId).toBe(existing);
  });

  it("cannot link another org's client, and members cannot convert", async () => {
    const { id } = await newRequest();
    const other = (await call("x", "POST", "/api/clients", { name: "عميل آخر" })).body.id;
    expect((await call("adm", "POST", `${REQ}/${id}/convert`, { clientId: other })).status).toBe(
      404,
    );
    expect((await call("m1", "POST", `${REQ}/${id}/convert`, {})).status).toBe(403);
    expect((await call("x", "POST", `${REQ}/${id}/convert`, {})).status).toBe(404);
  });
});

describe("entity logos on the site", () => {
  const png = (n: number) => {
    const b = new Uint8Array(64);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    b[20] = n; // different bytes → different asset
    return b;
  };
  const upload = async (who: string, n: number) => {
    const r = await app.request(
      "/api/assets",
      {
        method: "POST",
        headers: { "content-type": "image/png", cookie: cookie[who] ?? "" },
        body: png(n),
      },
      env,
    );
    return ((await r.json()) as J).id as string;
  };

  it("serves a logo publicly only once the published site uses it", async () => {
    const logo = await upload("adm", 1);
    const other = await upload("adm", 2);
    const d = (await call("adm", "GET", `${S}/draft`)).body;
    const content = {
      ...d.content,
      trust: { ...d.content.trust, items: [{ name: "جمعية جسد", logoAsset: logo }] },
    };
    expect((await call("adm", "PATCH", `${S}/draft`, { version: 1, content })).status).toBe(200);
    // saved as a draft only: not public yet
    expect((await call("", "GET", `${PUB}/assets/${logo}`)).status).toBe(404);
    await call("adm", "POST", `${S}/publish`);
    const ok = await app.request(`${PUB}/assets/${logo}`, {}, env);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(ok.headers.get("cache-control")).toContain("public");
    // an uploaded asset the site does not use stays private
    expect((await call("", "GET", `${PUB}/assets/${other}`)).status).toBe(404);
    const home = (await call("", "GET", PUB)).body;
    expect(home.site.trust.items[0]).toEqual({ name: "جمعية جسد", logoAsset: logo });
  });

  it("refuses a logo that belongs to another organisation", async () => {
    const theirs = await upload("x", 3);
    const d = (await call("adm", "GET", `${S}/draft`)).body;
    const content = {
      ...d.content,
      trust: { ...d.content.trust, items: [{ name: "س", logoAsset: theirs }] },
    };
    const r = await call("adm", "PATCH", `${S}/draft`, { version: 1, content });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("invalid_asset");
  });

  it("the default site lists the six entities by name until logos are added", async () => {
    const d = (await call("adm", "GET", `${S}/draft`)).body;
    expect(d.content.trust.items.map((i: J) => i.name)).toHaveLength(6);
    expect(d.content.trust.items.every((i: J) => i.logoAsset === "")).toBe(true);
  });
});

describe("publish history, overview and product order", () => {
  const edit = async (accent: string) => {
    const d = (await call("adm", "GET", `${S}/draft`)).body;
    const r = await call("adm", "PATCH", `${S}/draft`, {
      version: d.version,
      content: { ...d.content, hero: { ...d.content.hero, accent } },
    });
    expect(r.status).toBe(200);
  };

  it("keeps each publish, flags the live one, and restores an old one as a draft only", async () => {
    await edit("الأولى");
    await call("adm", "POST", `${S}/publish`);
    await edit("الثانية");
    await call("adm", "POST", `${S}/publish`);
    const h = (await call("adm", "GET", `${S}/history`)).body.history;
    expect(h).toHaveLength(2);
    expect(h[0].live).toBe(true);
    expect(h[1].live).toBe(false);

    expect((await call("adm", "POST", `${S}/history/${h[1].id}/restore`)).status).toBe(200);
    const d = (await call("adm", "GET", `${S}/draft`)).body;
    expect(d.content.hero.accent).toBe("الأولى");
    expect(d.changed).toBe(true);
    // visitors still see the second one
    expect((await call("", "GET", PUB)).body.site.hero.accent).toBe("الثانية");
    expect((await call("adm", "POST", `${S}/history/pub_missing/restore`)).status).toBe(404);
    expect((await call("x", "POST", `${S}/history/${h[1].id}/restore`)).status).toBe(404);
    expect((await call("m1", "GET", `${S}/history`)).status).toBe(403);
  });

  it("keeps only the last 20 publishes", async () => {
    for (let i = 0; i < 22; i++) await call("adm", "POST", `${S}/publish`);
    expect((await call("adm", "GET", `${S}/history`)).body.history).toHaveLength(20);
  });

  it("the overview reports what changed since publish and the requests picture", async () => {
    await call("adm", "POST", `${S}/publish`);
    expect((await call("adm", "GET", `${S}/overview`)).body.changedSections).toEqual([]);
    await edit("تعديل");
    const o = (await call("adm", "GET", `${S}/overview`)).body;
    expect(o.changedSections).toEqual(["hero"]);
    expect(o.requests).toMatchObject({ total: 0, new: 0, last30: 0 });
    await publishedProduct();
    await call("adm", "POST", REQ, {
      name: "ريم",
      phone: "0522222222",
      productSlug: "patient-transport",
    });
    const o2 = (await call("adm", "GET", `${S}/overview`)).body;
    expect(o2.requests).toMatchObject({ total: 1, new: 1, last30: 1, stale: 0 });
    expect(o2.listedSlugs).toEqual(["patient-transport"]);
  });

  it("orders products as asked, and the public list follows", async () => {
    await call("adm", "POST", `${S}/publish`);
    const a = await publishedProduct();
    const b = (await call("adm", "POST", "/api/products/from-blueprint/project-delivery")).body.id;
    const g = (await call("adm", "GET", `/api/products/${b}`)).body.product;
    await call("adm", "PATCH", `/api/products/${b}`, {
      version: g.version,
      status: "published",
      showOnSite: true,
    });
    expect((await call("", "GET", PUB)).body.products.map((p: J) => p.slug)).toEqual([
      "patient-transport",
      "project-delivery",
    ]);
    expect((await call("adm", "POST", "/api/products/reorder", { ids: [b, a] })).status).toBe(200);
    expect((await call("", "GET", PUB)).body.products.map((p: J) => p.slug)).toEqual([
      "project-delivery",
      "patient-transport",
    ]);
    expect((await call("m1", "POST", "/api/products/reorder", { ids: [] })).status).toBe(403);
  });

  it("the request-form wording ships with the product page", async () => {
    const d = (await call("adm", "GET", `${S}/draft`)).body;
    expect(d.content.form.title).toBe("اطلب عرضاً");
    await call("adm", "POST", `${S}/publish`);
    await publishedProduct();
    const p = (await call("", "GET", `${PUB}/products/patient-transport`)).body;
    expect(p.site.form).toMatchObject({ submitLabel: "إرسال الطلب", showEntity: true });
  });
});

describe("service profile (brochure) PDF", () => {
  it("is offered only for a published, listed product that allows it", async () => {
    await call("adm", "POST", `${S}/publish`);
    // nothing published yet / unknown
    expect((await call("", "POST", `${PUB}/products/patient-transport/brochure`)).status).toBe(404);
    const id = await publishedProduct();
    // no browser in tests: a valid request cannot render, and says so
    expect((await call("", "POST", `${PUB}/products/patient-transport/brochure`)).status).toBe(503);
    // switched off by the owner
    const g = (await call("adm", "GET", `/api/products/${id}`)).body.product;
    await call("adm", "PATCH", `/api/products/${id}`, {
      version: g.version,
      content: { ...g.content, brochure: false },
    });
    expect((await call("", "POST", `${PUB}/products/patient-transport/brochure`)).status).toBe(404);
  });

  it("serves the cached PDF without rendering again, keyed by product version and site publish", async () => {
    await call("adm", "POST", `${S}/publish`);
    const id = await publishedProduct();
    const g = (await call("adm", "GET", `/api/products/${id}`)).body.product;
    const at = (await call("adm", "GET", `${S}/draft`)).body.publishedAt;
    blobs.set(
      `brochures/org_platform/${id}-v${g.version}-s${at}.pdf`,
      new TextEncoder().encode("%PDF-cached"),
    );
    const r = await app.request(
      `${PUB}/products/patient-transport/brochure`,
      { method: "POST" },
      env,
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toContain("patient-transport-profile.pdf");
    expect(await r.text()).toBe("%PDF-cached");
    // editing the product changes the key, so a stale file is never served
    await call("adm", "PATCH", `/api/products/${id}`, { version: g.version, tagline: "جديد" });
    expect((await call("", "POST", `${PUB}/products/patient-transport/brochure`)).status).toBe(503);
  });

  it("the brochure never carries pricing: public content has no costs", async () => {
    await call("adm", "POST", `${S}/publish`);
    await publishedProduct();
    const raw = JSON.stringify((await call("", "GET", `${PUB}/products/patient-transport`)).body);
    expect(raw).not.toContain("pricing");
    expect(raw).toContain('"brochure":true');
  });
});

describe("a coming-soon product on the public site", () => {
  it("is flagged for the page, takes interest registrations with chip answers, and shows no pricing", async () => {
    await call("adm", "POST", "/api/products/seed-blueprints");
    const erp = (await call("adm", "GET", "/api/products")).body.products.find(
      (p: J) => p.slug === "erp-platform",
    );
    const g = (await call("adm", "GET", `/api/products/${erp.id}`)).body.product;
    await call("adm", "PATCH", `/api/products/${erp.id}`, {
      version: g.version,
      status: "published",
      showOnSite: true,
    });
    await call("adm", "POST", `${S}/publish`);

    const home = (await call("", "GET", PUB)).body;
    const card = home.products.find((p: J) => p.slug === "erp-platform");
    expect(card.comingSoon).toBe(true);
    const page = (await call("", "GET", `${PUB}/products/erp-platform`)).body;
    expect(page.product.content.comingSoon).toBe(true);
    expect(JSON.stringify(page)).not.toContain("pricing");

    const r = await call(
      "",
      "POST",
      `${PUB}/requests`,
      {
        productSlug: "erp-platform",
        name: "نجلاء",
        entity: "جمعية الأمل",
        phone: "0555555555",
        answers: {
          client_type: "جمعية أهلية",
          org_kind: "صحية",
          pain: "أنظمة منفصلة لا تتكامل، تقارير ضعيفة للمانحين",
          wish: "المالية والضريبة، المستندات والعقود",
          team: "6 إلى 20",
        },
      },
      ip("9.9.9.9"),
    );
    expect(r.status).toBe(201);
    const q = (await call("adm", "GET", REQ)).body.requests[0];
    expect(q.productName).toBe("منصة بُعد ERP");
    expect(q.interest).toBe(true);
    expect(q.answers["من أنتم؟"]).toBe("جمعية أهلية");
    expect(q.answers["ما الذي يواجهكم في المنصات الحالية؟"]).toContain("أنظمة منفصلة");
    // the only required question is who they are
    const miss = await call(
      "",
      "POST",
      `${PUB}/requests`,
      { productSlug: "erp-platform", name: "ليلى", phone: "0555555556", answers: {} },
      ip("9.9.9.8"),
    );
    expect(miss.body.error).toBe("missing_answers");
    expect(miss.body.keys).toEqual(["client_type"]);
  });
});
