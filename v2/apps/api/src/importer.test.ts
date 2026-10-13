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

describe("import v1 finance", () => {
  const fin1 = {
    ctrl: {
      contract_value: 230000,
      vat_included: true,
      vat_pct: 15,
      exec_v: 10,
      exec_type: "pct",
      exec_base: "gross",
      mkt_v: 5,
      mkt_internal: true,
      contract_no: "CON-2026-007",
      custom_cats: [{ id: "cc_trip", label: "سفر", type: "expense" }],
      op_cats: ["salary", "cc_trip"],
    },
    budget: [{ name: "قاعة", amount: 12000, note: "" }],
    entries: [
      {
        id: "a1",
        date: "2026-02-01",
        desc: "أتعاب التنفيذ",
        cat: "exec",
        type: "income",
        amount: 23000,
        note: "من الاتفاقية",
        status: "paid",
      },
      {
        id: "a2",
        date: "2026-02-03",
        desc: "رواتب",
        cat: "salary",
        type: "expense",
        amount: 40000.5,
        profit_margin: 13.043,
        profit_margin_type: "pct",
      },
      {
        id: "a3",
        date: "2026-02-04",
        desc: "تذاكر",
        cat: "cc_trip",
        type: "expense",
        amount: 3200,
      },
      {
        id: "a4",
        date: "2026-02-05",
        desc: "قاعة",
        cat: "bdg_0",
        type: "expense",
        amount: 12000,
        note: "من الاتفاقية",
      },
    ],
  };
  const withFin = { ...backup, buad2_fin_p1: JSON.stringify(fin1) };

  it("brings settings, entries, budget and categories, and proves the numbers equal v1", async () => {
    const r = await call("own", "POST", "/api/import/v1", withFin);
    expect(r.body.finance.imported).toBe(1); // only p1 has finance in this file
    expect(r.body.finance.parity.every((p: J) => p.status === "exact")).toBe(true);
    const f = (await call("own", "GET", "/api/projects/p1/finance")).body;
    expect(f.ctrl).toMatchObject({
      contractNo: "CON-2026-007",
      contractValue: 23000000,
      vatIncluded: true,
      mktInternal: true,
      opCats: ["salary", "cc_trip"],
    });
    expect(f.entries).toHaveLength(4);
    expect(f.entries.find((e: J) => e.description === "قاعة")).toMatchObject({
      source: "agreement",
      cat: "bdg_bud_p1_0",
    });
    expect(f.categories).toEqual([expect.objectContaining({ id: "cc_trip", label: "سفر" })]);
    const { finCalc } = await import("@buad/domain");
    expect(f.summary).toEqual(JSON.parse(JSON.stringify(finCalc(fin1 as never))));
  });

  it("re-import replaces imported finance, but never overwrites finance edited in v2", async () => {
    await call("own", "POST", "/api/import/v1", withFin);
    const changed = { ...fin1, entries: fin1.entries.slice(0, 2) };
    const again = await call("own", "POST", "/api/import/v1", {
      ...backup,
      buad2_fin_p1: JSON.stringify(changed),
    });
    expect(again.body.finance.parity.find((p: J) => p.projectId === "p1").status).toBe("exact");
    expect((await call("own", "GET", "/api/projects/p1/finance")).body.entries).toHaveLength(2);

    await call("own", "POST", "/api/projects/p1/finance/entries", {
      description: "قيد من v2",
      type: "expense",
      amount: 10,
    });
    const third = await call("own", "POST", "/api/import/v1", withFin);
    expect(third.body.finance.skipped).toBe(1);
    expect(
      third.body.issues.some((i: J) => i.id === "p1" && /عُدّلت في الإصدار الثاني/.test(i.reason)),
    ).toBe(true);
    const entries = (await call("own", "GET", "/api/projects/p1/finance")).body.entries.map(
      (e: J) => e.description,
    );
    expect(entries).toContain("قيد من v2");
    expect(entries).toHaveLength(3);
  });
});

describe("finance import marker", () => {
  it("marks every imported project's finance as imported, even when v1 had no finance for it", async () => {
    await call("own", "POST", "/api/import/v1", backup); // file has finance only for p1
    expect((await call("own", "GET", "/api/projects/p1")).body.financeImported).toBe(true);
    expect((await call("own", "GET", "/api/projects/p3")).body.financeImported).toBe(true);
    const mine = await call("own", "POST", "/api/clients", { name: "عميل جديد" });
    const p = await call("own", "POST", "/api/projects", {
      clientId: mine.body.id,
      name: "مشروع v2",
    });
    expect((await call("own", "GET", `/api/projects/${p.body.id}`)).body.financeImported).toBe(
      false,
    );
  });
});
