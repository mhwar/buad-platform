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
const REQ = "/api/product-requests";

const mkClient = async (name: string) =>
  (await call("adm", "POST", "/api/clients", { name })).body.id as string;
const mkProject = async (clientId: string, name: string, extra: Record<string, unknown> = {}) =>
  (await call("adm", "POST", "/api/projects", { clientId, name, expectedValue: 100000, ...extra }))
    .body;
const blueprint = async (key = "patient-transport") =>
  (await call("adm", "POST", `${P}/from-blueprint/${key}`)).body.id as string;

describe("linking a project to a service and package", () => {
  it("stores the service and package, and shows them on the project and in the list", async () => {
    const prod = await blueprint();
    const cl = await mkClient("جمعية جسد");
    const p = await mkProject(cl, "رساء", { productId: prod, packageId: "full" });
    expect(p.id).toBeTruthy();

    const d = (await call("adm", "GET", `/api/projects/${p.id}`)).body;
    expect(d.service).toEqual({
      productId: prod,
      productName: "النقل والتسكين العلاجي",
      packageId: "full",
      packageName: "الباقة المتكاملة",
    });
    const plain = await mkProject(cl, "بلا خدمة");
    expect((await call("adm", "GET", `/api/projects/${plain.id}`)).body.service).toBeNull();

    const list = (await call("adm", "GET", "/api/projects")).body.items;
    const row = list.find((x: J) => x.id === p.id);
    expect(row).toMatchObject({
      productId: prod,
      packageName: "الباقة المتكاملة",
      productName: "النقل والتسكين العلاجي",
    });
    expect(
      (await call("adm", "GET", `/api/projects?product=${prod}`)).body.items.map((x: J) => x.id),
    ).toEqual([p.id]);
    expect(
      (await call("adm", "GET", "/api/projects?product=none")).body.items.map((x: J) => x.id),
    ).toEqual([plain.id]);
  });

  it("refuses unknown services and packages, and a package without its service", async () => {
    const prod = await blueprint();
    const cl = await mkClient("ع");
    expect(
      (await call("adm", "POST", "/api/projects", { clientId: cl, name: "أ", productId: "prd_x" }))
        .status,
    ).toBe(404);
    expect(
      (
        await call("adm", "POST", "/api/projects", {
          clientId: cl,
          name: "أ",
          productId: prod,
          packageId: "zzz",
        })
      ).body.error,
    ).toBe("package_not_found");
    expect(
      (await call("adm", "POST", "/api/projects", { clientId: cl, name: "أ", packageId: "full" }))
        .body.error,
    ).toBe("package_without_product");
    // another organisation's product is not a valid link
    const theirs = (await call("x", "POST", `${P}/from-blueprint/project-delivery`)).body.id;
    expect(
      (await call("adm", "POST", "/api/projects", { clientId: cl, name: "أ", productId: theirs }))
        .status,
    ).toBe(404);
  });

  it("changing the service clears the package; clearing the service clears both", async () => {
    const a = await blueprint("patient-transport");
    const b = await blueprint("project-delivery");
    const cl = await mkClient("ع");
    const p = (await mkProject(cl, "م", { productId: a, packageId: "full" })).id;
    expect((await call("adm", "PATCH", `/api/projects/${p}`, { productId: b })).status).toBe(200);
    let d = (await call("adm", "GET", `/api/projects/${p}`)).body;
    expect(d.service).toMatchObject({ productId: b, packageId: "", packageName: "" });
    await call("adm", "PATCH", `/api/projects/${p}`, { packageId: "fixed-package" });
    d = (await call("adm", "GET", `/api/projects/${p}`)).body;
    expect(d.service.packageName).toBe("باقة ثابتة");
    expect(
      (await call("adm", "PATCH", `/api/projects/${p}`, { packageId: "full" })).body.error,
    ).toBe("package_not_found");
    await call("adm", "PATCH", `/api/projects/${p}`, { productId: "", packageId: "" });
    expect((await call("adm", "GET", `/api/projects/${p}`)).body.service).toBeNull();
  });

  it("a converted request keeps the service and package it was quoted on", async () => {
    const prod = await blueprint();
    const g = (await call("adm", "GET", `${P}/${prod}`)).body.product;
    await call("adm", "PATCH", `${P}/${prod}`, {
      version: g.version,
      pricing: {
        ...g.pricing,
        method: "margin",
        value: 20,
        lines: g.pricing.lines.map((l: J) => ({ ...l, cost: 100 })),
        packages: g.pricing.packages.map((x: J) => ({ ...x, qty: { trip: 4 } })),
      },
    });
    const req = (
      await call("adm", "POST", REQ, {
        name: "نوف",
        entity: "جمعية البر",
        phone: "0500000000",
        productSlug: "patient-transport",
      })
    ).body.id;
    await call("adm", "PUT", `${REQ}/${req}/quote`, {
      productId: prod,
      packageId: "transport",
      times: 3,
    });
    const done = (await call("adm", "POST", `${REQ}/${req}/convert`, {})).body;
    expect(
      (await call("adm", "GET", `/api/projects/${done.projectId}`)).body.service,
    ).toMatchObject({ productId: prod, packageId: "transport", packageName: "نقل فقط" });
  });
});

describe("a service's performance", () => {
  const setup = async () => {
    const prod = await blueprint();
    const other = await blueprint("project-delivery");
    const jasad = await mkClient("جمعية جسد");
    const noor = await mkClient("جمعية النور");
    const a = (
      await mkProject(jasad, "رساء ١", {
        productId: prod,
        packageId: "full",
        startDate: "2026-02-01",
      })
    ).id;
    const b = (
      await mkProject(jasad, "رساء ٢", {
        productId: prod,
        packageId: "transport",
        startDate: "2026-08-01",
        expectedValue: 50000,
      })
    ).id;
    const c = (
      await mkProject(noor, "النور", {
        productId: prod,
        startDate: "2026-08-20",
        expectedValue: 50000,
      })
    ).id;
    const o = (await mkProject(noor, "تنفيذ آخر", { productId: other })).id;
    const free = (await mkProject(noor, "غير مرتبط")).id;
    await call("adm", "POST", `/api/projects/${a}/finance/receipts`, {
      date: "2026-03-01",
      amount: 115000,
    });
    return { prod, other, a, b, c, o, free };
  };

  it("counts projects, entities and repeats, and the money matches each project's own finance", async () => {
    const { prod, a, b, c } = await setup();
    const r = await call("adm", "GET", `${P}/${prod}/stats`);
    expect(r.status).toBe(200);
    const t = r.body.stats.totals;
    expect(t).toMatchObject({
      projects: 3,
      entities: 2,
      repeatEntities: 1,
      contractNet: 200000,
      received: 115000,
    });
    // profit = the sum of each project's own finance summary
    let profit = 0;
    for (const id of [a, b, c])
      profit += (await call("adm", "GET", `/api/projects/${id}/finance`)).body.summary.profit;
    expect(Math.round(t.profit * 100)).toBe(Math.round(profit * 100));
    expect(r.body.stats.entities[0]).toMatchObject({ name: "جمعية جسد", projects: 2 });
    expect(r.body.stats.packages.map((p: J) => [p.name, p.projects])).toEqual([
      ["الباقة المتكاملة", 1],
      ["نقل فقط", 1],
      ["بدون باقة محددة", 1],
    ]);
    expect(r.body.stats.trend.map((x: J) => x.key)).toEqual(["2026-Q1", "2026-Q3"]);
    expect(r.body.projects.map((p: J) => p.name).sort()).toEqual(["النور", "رساء ١", "رساء ٢"]);
    expect(r.body.stats.insights.map((i: J) => i.code)).toContain("repeat_entities");
    expect(r.body.stats.insights.map((i: J) => i.code)).toContain("no_package");
  });

  it("leaves out archived projects and other services' projects", async () => {
    const { prod, c, o } = await setup();
    await call("adm", "POST", `/api/projects/${c}/archive`);
    const r = (await call("adm", "GET", `${P}/${prod}/stats`)).body;
    expect(r.stats.totals.projects).toBe(2);
    expect(r.projects.map((p: J) => p.id)).not.toContain(o);
  });

  it("requests feed the funnel", async () => {
    const { prod } = await setup();
    for (const st of ["new", "contacted", "won"]) {
      const id = (
        await call("adm", "POST", REQ, {
          name: "سلمى",
          phone: "0511111111",
          productSlug: "patient-transport",
        })
      ).body.id;
      await call("adm", "PATCH", `${REQ}/${id}`, { status: st });
    }
    const f = (await call("adm", "GET", `${P}/${prod}/stats`)).body.stats.funnel;
    expect(f).toMatchObject({ total: 3, new: 1, contacted: 1, won: 1, conversionPct: 33.33 });
  });

  it("the overview compares services and counts unlinked projects", async () => {
    const { prod, other } = await setup();
    const o = (await call("adm", "GET", `${P}/overview`)).body;
    expect(o.unlinkedProjects).toBe(1);
    const by = Object.fromEntries(o.products.map((p: J) => [p.id, p]));
    expect(by[prod]).toMatchObject({ projects: 3, entities: 2, contractNet: 200000 });
    expect(by[other]).toMatchObject({ projects: 1, entities: 1 });
  });

  it("lists unlinked projects without linking anything", async () => {
    const { free } = await setup();
    const u = (await call("adm", "GET", `${P}/unlinked-projects`)).body.projects;
    expect(u.map((p: J) => p.id)).toEqual([free]);
    expect((await call("adm", "GET", `/api/projects/${free}`)).body.service).toBeNull();
  });

  it("is for managers of the same organisation only", async () => {
    const { prod } = await setup();
    for (const path of [`${P}/${prod}/stats`, `${P}/overview`, `${P}/unlinked-projects`])
      expect((await call("m1", "GET", path)).status).toBe(403);
    expect((await call("x", "GET", `${P}/${prod}/stats`)).status).toBe(404);
    expect((await call("x", "GET", `${P}/overview`)).body.products).toEqual([]);
  });
});
