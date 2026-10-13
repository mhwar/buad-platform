import { orgs, users } from "@buad/schema/db";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, type Env } from "./app";
import { hashPassword } from "./auth/password";
import { testDb } from "./test-db";

const env = { APP_VERSION: "t", JWT_SECRET: "test-secret-at-least-16-chars" } as Env;
let ctx: ReturnType<typeof testDb>;
let app: ReturnType<typeof createApp>;
const cookies: Record<string, string> = {};

type J = Record<string, any>;
const req = async (who: string, method: string, path: string, body?: unknown) => {
  const res = await app.request(
    path,
    {
      method,
      headers: { "content-type": "application/json", cookie: cookies[who] ?? "" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
  return { status: res.status, body: (await res.json()) as J };
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
    { id: "own", orgId: "o1", email: "own@a.sa", role: "owner", passwordHash: pw },
    { id: "adm", orgId: "o1", email: "adm@a.sa", role: "admin", passwordHash: pw },
    { id: "m1", orgId: "o1", email: "m1@a.sa", role: "member", passwordHash: pw },
    { id: "m2", orgId: "o1", email: "m2@a.sa", role: "member", passwordHash: pw },
    { id: "x", orgId: "o2", email: "x@b.sa", role: "owner", passwordHash: pw },
  ]);
  for (const [who, email] of [
    ["own", "own@a.sa"],
    ["adm", "adm@a.sa"],
    ["m1", "m1@a.sa"],
    ["m2", "m2@a.sa"],
    ["x", "x@b.sa"],
  ]) {
    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: "password-123" }),
      },
      env,
    );
    cookies[who as string] = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  }
});

const newClient = (who: string, body: J) =>
  req(who, "POST", "/api/clients", { name: "عميل", ...body });
const newProject = (who: string, body: J) =>
  req(who, "POST", "/api/projects", { name: "مشروع", ...body });

describe("clients", () => {
  it("requires a session", async () => {
    expect((await req("none", "GET", "/api/clients")).status).toBe(401);
  });

  it("creates with sequential codes and keeps the v1 signatory as a contact", async () => {
    const a = await newClient("m1", {
      name: "شركة أ",
      type: "company",
      signatoryName: "أحمد",
      signatoryTitle: "المدير",
    });
    const b = await newClient("m1", { name: "جمعية ب", type: "association" });
    expect(a.status).toBe(201);
    expect([a.body.code, b.body.code]).toEqual(["CL-0001", "CL-0002"]);
    const detail = await req("m1", "GET", `/api/clients/${a.body.id}`);
    expect(detail.body.client).toMatchObject({ name: "شركة أ", createdBy: "m1" });
    expect(detail.body.contacts).toEqual([
      expect.objectContaining({ name: "أحمد", title: "المدير", isSignatory: true }),
    ]);
  });

  it("codes stay unique under concurrent creation", async () => {
    const res = await Promise.all(
      Array.from({ length: 12 }, (_, i) => newClient("m1", { name: `عميل ${i}` })),
    );
    const codes = res.map((r) => r.body.code);
    expect(new Set(codes).size).toBe(12);
  });

  it("blocks duplicate CR or VAT numbers, and warns on a similar name", async () => {
    const a = await newClient("m1", { name: "مؤسسة الأمل", regNo: "1010", taxNo: "300" });
    const cr = await newClient("m1", { name: "اسم آخر", regNo: "1010" });
    expect(cr.status).toBe(409);
    expect(cr.body).toMatchObject({
      error: "duplicate",
      duplicate: { id: a.body.id, field: "regNo" },
    });
    expect((await newClient("m1", { name: "اسم ثالث", taxNo: "300" })).body.duplicate.field).toBe(
      "taxNo",
    );
    const similar = await newClient("m1", { name: "مؤسسه  الامل" });
    expect(similar.body).toMatchObject({ error: "similar_name", similar: { id: a.body.id } });
    expect((await newClient("m1", { name: "مؤسسه  الامل", confirmSimilarName: true })).status).toBe(
      201,
    );
    // the same numbers are fine in another org
    expect((await newClient("x", { name: "مؤسسة الأمل", regNo: "1010" })).status).toBe(201);
  });

  it("isolates organisations completely", async () => {
    const a = await newClient("m1", { name: "سري" });
    expect((await req("x", "GET", `/api/clients/${a.body.id}`)).status).toBe(404);
    expect((await req("x", "PATCH", `/api/clients/${a.body.id}`, { name: "مخترق" })).status).toBe(
      404,
    );
    expect((await req("x", "GET", "/api/clients")).body.items).toEqual([]);
    expect((await newProject("x", { clientId: a.body.id })).status).toBe(404);
  });

  it("edits fields and contacts; PATCH also guards duplicates", async () => {
    const a = await newClient("m1", { name: "أ", regNo: "1" });
    const b = await newClient("m1", { name: "ب" });
    expect((await req("m1", "PATCH", `/api/clients/${b.body.id}`, { regNo: "1" })).status).toBe(
      409,
    );
    const ok = await req("m2", "PATCH", `/api/clients/${b.body.id}`, {
      city: "الرياض",
      signatoryName: "سارة",
      contacts: [{ name: "خالد", phone: "0500" }],
    });
    expect(ok.status).toBe(200);
    const d = await req("m1", "GET", `/api/clients/${b.body.id}`);
    expect(d.body.client).toMatchObject({ city: "الرياض", updatedBy: "m2" });
    expect(d.body.contacts.map((c: J) => [c.name, c.isSignatory])).toEqual([
      ["سارة", true],
      ["خالد", false],
    ]);
    expect(a.status).toBe(201);
  });

  it("archive is manager-only, cascades to projects, and restore brings back exactly those", async () => {
    const cl = await newClient("m1", { name: "أ" });
    const p1 = await newProject("m1", { clientId: cl.body.id, name: "حي" });
    const p2 = await newProject("m1", { clientId: cl.body.id, name: "مؤرشف قبل" });
    expect((await req("adm", "POST", `/api/projects/${p2.body.id}/archive`)).status).toBe(200);
    expect((await req("m1", "POST", `/api/clients/${cl.body.id}/archive`)).status).toBe(403);
    expect((await req("adm", "POST", `/api/clients/${cl.body.id}/archive`)).status).toBe(200);
    expect((await req("m1", "GET", "/api/clients")).body.items).toEqual([]);
    expect((await req("m1", "GET", "/api/projects")).body.items).toEqual([]);
    expect((await newProject("m1", { clientId: cl.body.id })).body.error).toBe("client_archived");
    expect((await req("adm", "POST", `/api/projects/${p1.body.id}/restore`)).body.error).toBe(
      "client_archived",
    );
    expect((await req("adm", "POST", `/api/clients/${cl.body.id}/restore`)).status).toBe(200);
    const live = (await req("m1", "GET", "/api/projects")).body.items.map((p: J) => p.name);
    expect(live).toEqual(["حي"]); // the project archived earlier stays archived
  });

  it("permanent delete is owner-only and only for a client without projects", async () => {
    const a = await newClient("m1", { name: "أ" });
    const b = await newClient("m1", { name: "ب" });
    await newProject("m1", { clientId: b.body.id });
    expect((await req("adm", "DELETE", `/api/clients/${a.body.id}`)).status).toBe(403);
    expect((await req("own", "DELETE", `/api/clients/${b.body.id}`)).body.error).toBe(
      "has_projects",
    );
    expect((await req("own", "DELETE", `/api/clients/${a.body.id}`)).status).toBe(200);
    expect((await req("own", "GET", `/api/clients/${a.body.id}`)).status).toBe(404);
  });

  it("lists with search, type filter, counts and per-client project totals", async () => {
    const a = await newClient("m1", { name: "شركة الأفق", type: "company", city: "جدة" });
    await newClient("m1", { name: "جمعية البر", type: "association" });
    await newProject("m1", { clientId: a.body.id, expectedValue: 1500.5 });
    await newProject("m1", { clientId: a.body.id, expectedValue: 100 });
    const all = await req("m1", "GET", "/api/clients");
    expect(all.body.counts).toEqual({ company: 1, association: 1 });
    const afq = all.body.items.find((i: J) => i.id === a.body.id);
    // v1 lists show the contract total incl. VAT: with no finance yet, expected value + 15%.
    // 1500.50 → 150050 + 22508 ; 100 → 10000 + 1500
    expect(afq).toMatchObject({ projectCount: 2, projectValue: 150050 + 22508 + 10000 + 1500 });
    expect((await req("m1", "GET", "/api/clients?q=جدة")).body.items.map((i: J) => i.name)).toEqual(
      ["شركة الأفق"],
    );
    expect(
      (await req("m1", "GET", "/api/clients?type=association")).body.items.map((i: J) => i.name),
    ).toEqual(["جمعية البر"]);
    expect((await req("m1", "GET", "/api/clients?q=%25")).body.items).toEqual([]); // wildcard is literal
  });
});

describe("partial updates", () => {
  it("PATCH changes only the fields sent and never blanks the others", async () => {
    const cl = await newClient("m1", {
      name: "أ",
      type: "government",
      city: "الرياض",
      regNo: "77",
      signatoryName: "سارة",
      contacts: [{ name: "خالد" }],
    });
    await req("m1", "PATCH", `/api/clients/${cl.body.id}`, { phone: "0500" });
    const d = (await req("m1", "GET", `/api/clients/${cl.body.id}`)).body;
    expect(d.client).toMatchObject({
      name: "أ",
      type: "government",
      city: "الرياض",
      regNo: "77",
      phone: "0500",
    });
    expect(d.contacts.map((c: J) => c.name)).toEqual(["سارة", "خالد"]);

    const p = await newProject("m1", {
      clientId: cl.body.id,
      type: "event",
      status: "draft",
      location: "جدة",
      startDate: "2026-03-01",
      expectedValue: 10,
    });
    await req("m1", "PATCH", `/api/projects/${p.body.id}`, { name: "اسم جديد" });
    expect((await req("m1", "GET", `/api/projects/${p.body.id}`)).body.project).toMatchObject({
      name: "اسم جديد",
      type: "event",
      status: "draft",
      location: "جدة",
      startDate: "2026-03-01",
      expectedValue: 1000,
      visibility: "team",
    });
  });
});

describe("projects", () => {
  it("numbers per year, stores money in halalas, links to the client", async () => {
    const cl = await newClient("m1", { name: "أ" });
    const p = await newProject("m1", {
      clientId: cl.body.id,
      name: "تدريب",
      type: "training",
      expectedValue: "12,5".replace(",", "."),
      startDate: "2026-01-01",
      endDate: "2026-02-01",
    });
    expect(p.status).toBe(201);
    expect(p.body.number).toMatch(/^PRJ-\d{4}-0001$/);
    const d = await req("m1", "GET", `/api/projects/${p.body.id}`);
    expect(d.body.project).toMatchObject({
      expectedValue: 1250,
      ownerId: "m1",
      status: "active",
      visibility: "team",
    });
    expect(d.body.client).toMatchObject({ id: cl.body.id, name: "أ" });
  });

  it("rejects an end date before the start date", async () => {
    const cl = await newClient("m1", { name: "أ" });
    expect(
      (
        await newProject("m1", {
          clientId: cl.body.id,
          startDate: "2026-02-01",
          endDate: "2026-01-01",
        })
      ).status,
    ).toBe(400);
    const p = await newProject("m1", { clientId: cl.body.id, startDate: "2026-02-01" });
    expect(
      (await req("m1", "PATCH", `/api/projects/${p.body.id}`, { endDate: "2026-01-01" })).status,
    ).toBe(400);
  });

  it("follows the v1 visibility rule exactly", async () => {
    const cl = await newClient("m1", { name: "أ" });
    const priv = await newProject("m1", {
      clientId: cl.body.id,
      name: "خاص",
      visibility: "private",
    });
    await newProject("m1", { clientId: cl.body.id, name: "فريق" });
    ctx.sqlite.prepare("update projects set owner_id='' where name='فريق'").run();
    const names = async (who: string) =>
      (await req(who, "GET", "/api/projects")).body.items.map((p: J) => p.name).sort();
    expect(await names("m1")).toEqual(["خاص", "فريق"]);
    expect(await names("m2")).toEqual(["فريق"]);
    expect(await names("adm")).toEqual(["خاص", "فريق"]);
    expect((await req("m2", "GET", `/api/projects/${priv.body.id}`)).status).toBe(404);
    expect((await req("m2", "PATCH", `/api/projects/${priv.body.id}`, { name: "x" })).status).toBe(
      404,
    );
    // client page project counts also respect it
    const c2 = (await req("m2", "GET", "/api/clients")).body.items[0];
    expect(c2.projectCount).toBe(1);
  });

  it("only the owner of a project or a manager may change its visibility", async () => {
    const cl = await newClient("m1", { name: "أ" });
    const p = await newProject("m1", { clientId: cl.body.id });
    expect(
      (await req("m2", "PATCH", `/api/projects/${p.body.id}`, { visibility: "private" })).status,
    ).toBe(403);
    expect(
      (await req("m2", "PATCH", `/api/projects/${p.body.id}`, { status: "paused" })).status,
    ).toBe(200);
    expect(
      (await req("m1", "PATCH", `/api/projects/${p.body.id}`, { visibility: "private" })).status,
    ).toBe(200);
  });

  it("filters by client, status and search over client name and number", async () => {
    const a = await newClient("m1", { name: "الأفق" });
    const b = await newClient("m1", { name: "البر" });
    await newProject("m1", { clientId: a.body.id, name: "أ1", status: "draft" });
    const p2 = await newProject("m1", { clientId: b.body.id, name: "ب1" });
    const list = async (qs: string) => (await req("m1", "GET", `/api/projects${qs}`)).body;
    expect((await list(`?clientId=${b.body.id}`)).items.map((p: J) => p.name)).toEqual(["ب1"]);
    expect((await list("?status=draft")).items.map((p: J) => p.name)).toEqual(["أ1"]);
    expect((await list("?q=الأفق")).items.map((p: J) => p.name)).toEqual(["أ1"]);
    expect((await list(`?q=${p2.body.number}`)).items.map((p: J) => p.name)).toEqual(["ب1"]);
    expect((await list("")).counts).toEqual({ draft: 1, active: 1 });
  });
});
