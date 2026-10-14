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

beforeEach(async () => {
  ctx = testDb();
  app = createApp({ getDb: () => ctx.db });
  await ctx.db.insert(orgs).values([
    { id: "o1", name: "بُعد" },
    { id: "o2", name: "أخرى" },
  ]);
  const pw = await hashPassword("password-123");
  await ctx.db.insert(users).values([
    { id: "adm", orgId: "o1", email: "adm@a.sa", role: "admin", passwordHash: pw },
    { id: "m1", orgId: "o1", email: "m1@a.sa", role: "member", passwordHash: pw },
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

const P = "/api/products";

describe("blueprints", () => {
  it("lists both blueprints, none created yet", async () => {
    const r = await call("adm", "GET", `${P}/blueprints`);
    expect(r.status).toBe(200);
    expect(r.body.blueprints.map((b: J) => b.key)).toEqual([
      "patient-transport",
      "project-delivery",
    ]);
    expect(r.body.blueprints.every((b: J) => b.productId === null)).toBe(true);
    expect((await call("adm", "GET", P)).body.products).toEqual([]);
  });

  it("creates a product from a blueprint once, with empty costs", async () => {
    const a = await call("adm", "POST", `${P}/from-blueprint/patient-transport`);
    expect(a.status).toBe(201);
    expect(a.body.created).toBe(true);
    const b = await call("adm", "POST", `${P}/from-blueprint/patient-transport`);
    expect(b.status).toBe(200);
    expect(b.body).toMatchObject({ id: a.body.id, created: false });
    expect((await call("adm", "GET", P)).body.products).toHaveLength(1);

    const g = (await call("adm", "GET", `${P}/${a.body.id}`)).body.product;
    expect(g.content.packages.map((p: J) => p.id)).toEqual(["transport", "housing", "full"]);
    expect(g.content.intake).toHaveLength(6);
    // No invented prices: every cost is 0 and no package has quantities.
    expect(g.pricing.lines.every((l: J) => l.cost === 0)).toBe(true);
    expect(g.pricing.packages.every((p: J) => Object.keys(p.qty).length === 0)).toBe(true);
    expect(g.readiness.find((x: J) => x.key === "costs").ok).toBe(false);
    expect((await call("adm", "POST", `${P}/from-blueprint/nope`)).status).toBe(404);
  });
});

describe("products", () => {
  it("creates blank, patches with a version lock and a unique slug", async () => {
    const c = await call("adm", "POST", P, { name: "منتج جديد" });
    expect(c.status).toBe(201);
    const id = c.body.id as string;
    const g1 = (await call("adm", "GET", `${P}/${id}`)).body.product;
    expect(g1.slug).toBe("product");
    expect(g1.version).toBe(1);

    const ok = await call("adm", "PATCH", `${P}/${id}`, {
      version: 1,
      tagline: "وصف",
      status: "published",
      showOnSite: true,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(2);

    const stale = await call("adm", "PATCH", `${P}/${id}`, { version: 1, tagline: "x" });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: "stale", version: 2 });

    const other = (await call("adm", "POST", P, { name: "آخر" })).body.id;
    const dup = await call("adm", "PATCH", `${P}/${other}`, { version: 1, slug: "product" });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("duplicate_slug");
    // A second blank product gets its own slug automatically.
    expect((await call("adm", "GET", `${P}/${other}`)).body.product.slug).toBe("product-2");
  });

  it("stores pricing and reports readiness from it", async () => {
    const id = (await call("adm", "POST", `${P}/from-blueprint/patient-transport`)).body.id;
    const g = (await call("adm", "GET", `${P}/${id}`)).body.product;
    const pricing = {
      ...g.pricing,
      method: "margin",
      value: 20,
      lines: g.pricing.lines.map((l: J) => ({ ...l, cost: 100 })),
      packages: g.pricing.packages.map((p: J) => ({ ...p, qty: { trip: 10, night: 4, mgmt: 1 } })),
    };
    const r = await call("adm", "PATCH", `${P}/${id}`, { version: g.version, pricing });
    expect(r.status).toBe(200);
    const after = (await call("adm", "GET", `${P}/${id}`)).body.product;
    expect(after.readiness.find((x: J) => x.key === "costs").ok).toBe(true);
    expect(after.vatRate).toBe(15);
  });

  it("rejects bad content and bad ids", async () => {
    const id = (await call("adm", "POST", P, { name: "م" })).body.id;
    const bad = await call("adm", "PATCH", `${P}/${id}`, {
      version: 1,
      content: { packages: [{ id: "Bad Id!", name: "x" }] },
    });
    expect(bad.status).toBe(400);
    expect((await call("adm", "GET", `${P}/prd_missing`)).status).toBe(404);
  });
});

describe("access", () => {
  it("members are refused", async () => {
    for (const [m, path] of [
      ["GET", P],
      ["GET", `${P}/blueprints`],
      ["POST", `${P}/from-blueprint/patient-transport`],
    ] as const) {
      expect((await call("m1", m, path)).status).toBe(403);
    }
  });

  it("another org never sees or edits a product", async () => {
    const id = (await call("adm", "POST", `${P}/from-blueprint/project-delivery`)).body.id;
    expect((await call("x", "GET", P)).body.products).toEqual([]);
    expect((await call("x", "GET", `${P}/${id}`)).status).toBe(404);
    expect((await call("x", "PATCH", `${P}/${id}`, { version: 1, name: "اختراق" })).status).toBe(
      404,
    );
    // The other org can create the same blueprint independently.
    expect((await call("x", "POST", `${P}/from-blueprint/project-delivery`)).status).toBe(201);
  });
});
