import { readFileSync } from "node:fs";
import { join } from "node:path";
import { orgs, users } from "@buad/schema/db";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, type Env } from "./app";
import { hashPassword } from "./auth/password";
import { testDb } from "./test-db";

const env = { APP_VERSION: "t", JWT_SECRET: "test-secret-at-least-16-chars" } as Env;
const ws = JSON.parse(
  readFileSync(join(__dirname, "../../../tools/migrate/fixtures/v1-workspace.json"), "utf8"),
);
/** The file v1's «تصدير البيانات» button produces. */
const backup = {
  buad2_clients: JSON.stringify(ws.clients),
  buad2_projects: JSON.stringify(ws.projects),
  buad2_fin_p1: JSON.stringify(ws.fin.p1),
};

let ctx: ReturnType<typeof testDb>;
let app: ReturnType<typeof createApp>;
const cookie: Record<string, string> = {};
// biome-ignore lint/suspicious/noExplicitAny: test helper
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
const sel = (q: string) => ctx.sqlite.prepare(q).all() as J[];

beforeEach(async () => {
  ctx = testDb();
  app = createApp({ getDb: () => ctx.db });
  await ctx.db.insert(orgs).values([
    { id: "org_platform", name: "بُعد" },
    { id: "o2", name: "أخرى" },
  ]);
  const pw = await hashPassword("password-123");
  await ctx.db.insert(users).values([
    { id: "own", orgId: "org_platform", email: "own@a.sa", role: "owner", passwordHash: pw },
    { id: "adm", orgId: "org_platform", email: "adm@a.sa", role: "admin", passwordHash: pw },
    { id: "own2", orgId: "o2", email: "own2@b.sa", role: "owner", passwordHash: pw },
  ]);
  for (const [w, e] of [
    ["own", "own@a.sa"],
    ["adm", "adm@a.sa"],
    ["own2", "own2@b.sa"],
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

describe("import v1 clients & projects", () => {
  it("is owner-only and rejects files that are not v1 data", async () => {
    expect((await call("adm", "POST", "/api/import/v1", backup)).status).toBe(403);
    expect((await call("own", "POST", "/api/import/v1", { hello: 1 })).body.error).toBe(
      "invalid_file",
    );
  });

  it("imports the v1 backup file with all projects, values and the signatory", async () => {
    const r = await call("own", "POST", "/api/import/v1", backup);
    expect(r.status).toBe(200);
    expect(r.body.clients).toEqual({ created: 5, updated: 0 });
    expect(r.body.projects).toEqual({ created: 4, updated: 0 });
    expect(r.body.issues.some((i: J) => i.id === "p4" && i.severity === "rejected")).toBe(true);
    const list = (await call("own", "GET", "/api/projects")).body.items;
    expect(list.find((p: J) => p.id === "p1")).toMatchObject({
      clientName: "شركة الأفق",
      expectedValue: 11500050,
    });
    const c2 = (await call("own", "GET", "/api/clients/c2")).body;
    expect(c2.contacts[0]).toMatchObject({ name: "أحمد", title: "الرئيس", isSignatory: true });
    // unknown v1 owner → the importer owns the project
    expect(sel("select owner_id o from projects where id='p2'")[0].o).toBe("own");
  });

  it("imports a chosen subset, then more later without renumbering, after v2-created clients", async () => {
    const mine = await call("own", "POST", "/api/clients", {
      name: "عميل أنشئ في v2",
      regNo: "111",
    });
    expect(mine.body.code).toBe("CL-0001");
    const only = {
      clients: ws.clients.filter((c: J) => c.id === "c2"),
      projects: ws.projects.filter((p: J) => p.client_id === "c2"),
      fin: {},
    };
    const first = await call("own", "POST", "/api/import/v1", only);
    expect(first.body.clients.created).toBe(1);
    // CR 111 is already used by the v2 client → cleared and reported, import not blocked
    expect(
      first.body.issues.some((i: J) => i.id === "c2" && /رقم السجل مستخدم/.test(i.reason)),
    ).toBe(true);
    expect(sel("select code from clients where id='c2'")[0].code).toBe("CL-0002");
    const all = await call("own", "POST", "/api/import/v1", backup);
    expect(all.body.clients).toEqual({ created: 4, updated: 1 });
    expect(sel("select code from clients where id='c2'")[0].code).toBe("CL-0002"); // unchanged
    const codes = sel("select code from clients order by code").map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    // a new v2 client continues after everything
    expect((await call("own", "POST", "/api/clients", { name: "بعد الاستيراد" })).body.code).toBe(
      "CL-0007",
    );
  });

  it("re-import refreshes data but keeps numbers and v2 edits to archive state", async () => {
    await call("own", "POST", "/api/import/v1", backup);
    const before = sel("select id, number from projects order by id");
    await call("own", "POST", "/api/clients/c1/archive");
    const again = await call("own", "POST", "/api/import/v1", backup);
    expect(again.body.projects).toEqual({ created: 0, updated: 4 });
    expect(sel("select id, number from projects order by id")).toEqual(before);
    expect(sel("select archived_at a from clients where id='c1'")[0].a).not.toBeNull();
  });

  it("never touches another org's data, even with the same v1 ids", async () => {
    await call("own2", "POST", "/api/import/v1", backup);
    const r = await call("own", "POST", "/api/import/v1", backup);
    expect(r.body.clients.created).toBe(0);
    expect(r.body.issues.filter((i: J) => /جهة أخرى/.test(i.reason))).toHaveLength(5);
    expect((await call("own", "GET", "/api/clients")).body.items).toEqual([]);
  });
});
