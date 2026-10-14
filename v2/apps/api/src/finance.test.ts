import { finCalc } from "@buad/domain";
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
let pid = "";
const F = () => `/api/projects/${pid}/finance`;

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
  const c = await call("adm", "POST", "/api/clients", { name: "عميل" });
  pid = (
    await call("adm", "POST", "/api/projects", {
      clientId: c.body.id,
      name: "مشروع",
      expectedValue: 100000,
    })
  ).body.id;
});

describe("finance: defaults and permissions", () => {
  it("starts from v1 defaults with the project's expected value, without writing anything", async () => {
    const r = await call("m1", "GET", F());
    expect(r.status).toBe(200);
    expect(r.body.ctrl).toMatchObject({
      contractValue: 10000000,
      vatPct: 15,
      execV: 10,
      execType: "pct",
      execBase: "gross",
      version: 0,
    });
    expect(r.body.summary).toMatchObject({ grossTotal: 115000, execAmt: 11500 });
    expect(ctx.sqlite.prepare("select count(*) c from project_finance").get()).toEqual({ c: 0 });
  });

  it("members can read but not edit; other orgs cannot even see it", async () => {
    expect((await call("m1", "PATCH", `${F()}/ctrl`, { version: 0, vatPct: 0 })).status).toBe(403);
    expect(
      (await call("m1", "POST", `${F()}/entries`, { description: "x", type: "expense", amount: 5 }))
        .status,
    ).toBe(403);
    expect((await call("x", "GET", F())).status).toBe(404);
    expect((await call("x", "PATCH", `${F()}/ctrl`, { version: 0 })).status).toBe(404);
  });
});

describe("finance: control centre", () => {
  it("saves, bumps the version, and refuses a stale save (no silent overwrite)", async () => {
    const a = await call("adm", "PATCH", `${F()}/ctrl`, {
      version: 0,
      contractValue: 200000,
      vatIncluded: true,
      vatPct: 15,
    });
    expect(a.status).toBe(200);
    expect(a.body.ctrl.version).toBe(1);
    expect(a.body.summary.grossTotal).toBe(200000);
    const stale = await call("adm", "PATCH", `${F()}/ctrl`, { version: 0, execV: 20 });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: "stale", version: 1 });
    expect(
      (await call("adm", "PATCH", `${F()}/ctrl`, { version: 1, execV: 20 })).body.ctrl,
    ).toMatchObject({ execV: 20, version: 2 });
  });

  it("allows VAT 0% (v1 could not save it) and keeps untouched fields", async () => {
    await call("adm", "PATCH", `${F()}/ctrl`, { version: 0, contractNo: "CON-1", mktV: 5 });
    const r = await call("adm", "PATCH", `${F()}/ctrl`, { version: 1, vatPct: 0 });
    expect(r.body.ctrl).toMatchObject({ vatPct: 0, contractNo: "CON-1", mktV: 5 });
    expect(r.body.summary.vatAmt).toBe(0);
  });

  it("a locked contract value cannot change until unlocked", async () => {
    await call("adm", "PATCH", `${F()}/ctrl`, { version: 0, cvLocked: true });
    expect(
      (await call("adm", "PATCH", `${F()}/ctrl`, { version: 1, contractValue: 5 })).body.error,
    ).toBe("cv_locked");
    expect(
      (await call("adm", "PATCH", `${F()}/ctrl`, { version: 1, cvLocked: false, contractValue: 5 }))
        .status,
    ).toBe(200);
  });

  it("feeds the list's contract total once finance exists", async () => {
    await call("adm", "PATCH", `${F()}/ctrl`, {
      version: 0,
      contractValue: 230000,
      vatIncluded: true,
    });
    const p = (await call("adm", "GET", "/api/projects")).body.items[0];
    expect(p.contractTotal).toBe(23000000);
    expect((await call("adm", "GET", `/api/projects/${pid}`)).body.financeExists).toBe(true);
  });
});

describe("finance: entries, budget, categories, agreement", () => {
  it("entries are validated, stored in halalas, and totals follow v1 FinCalc exactly", async () => {
    expect(
      (await call("adm", "POST", `${F()}/entries`, { description: "", type: "expense", amount: 1 }))
        .status,
    ).toBe(400);
    expect(
      (
        await call("adm", "POST", `${F()}/entries`, {
          description: "x",
          type: "expense",
          amount: 0,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("adm", "POST", `${F()}/entries`, {
          description: "x",
          type: "expense",
          amount: 1,
          cat: "nope",
        })
      ).body.error,
    ).toBe("invalid_category");
    await call("adm", "POST", `${F()}/entries`, {
      description: "رواتب",
      type: "expense",
      cat: "salary",
      amount: 12000.5,
      profitMargin: 10,
      profitMarginType: "pct",
    });
    await call("adm", "POST", `${F()}/entries`, {
      description: "أتعاب",
      type: "income",
      cat: "exec",
      amount: 9000,
    });
    const r = await call("adm", "GET", F());
    expect(r.body.entries.map((e: J) => e.amount).sort()).toEqual([1200050, 900000].sort());
    const v1 = finCalc({
      ctrl: {
        contract_value: 100000,
        vat_pct: 15,
        exec_v: 10,
        exec_type: "pct",
        exec_base: "gross",
        mkt_base: "gross",
        cb_base: "gross",
      },
      entries: [
        {
          type: "expense",
          cat: "salary",
          amount: 12000.5,
          profit_margin: 10,
          profit_margin_type: "pct",
        },
        { type: "income", cat: "exec", amount: 9000 },
      ],
    });
    expect(r.body.summary).toEqual(JSON.parse(JSON.stringify(v1)));
  });

  it("editing an entry updates the totals (v1 did not refresh them)", async () => {
    const e = await call("adm", "POST", `${F()}/entries`, {
      description: "مواد",
      type: "expense",
      cat: "materials",
      amount: 100,
    });
    const r = await call("adm", "PATCH", `${F()}/entries/${e.body.id}`, { amount: 250 });
    expect(r.body.summary.totalExpenses).toBe(250);
    expect(
      (await call("adm", "DELETE", `${F()}/entries/${e.body.id}`)).body.summary.totalExpenses,
    ).toBe(0);
  });

  it("registers agreement items once, with v1 amounts and descriptions", async () => {
    const r = await call("adm", "POST", `${F()}/agreement/exec`);
    expect(r.status).toBe(201);
    expect(r.body.entries[0]).toMatchObject({
      description: "أتعاب التنفيذ",
      type: "income",
      cat: "exec",
      amount: 1150000,
      source: "agreement",
      status: "paid",
    });
    expect((await call("adm", "POST", `${F()}/agreement/exec`)).body.error).toBe(
      "already_registered",
    );
    expect((await call("adm", "POST", `${F()}/agreement/mkt`)).body.error).toBe("zero_amount");
    expect(r.body.summary.missingItems).not.toContain("أتعاب التنفيذ");
  });

  it("budget rows can be registered as expenses under their own name", async () => {
    const b = await call("adm", "POST", `${F()}/budget`, { name: "قاعة", amount: 3000 });
    const item = b.body.budget[0];
    expect(b.body.summary.budgetTotal).toBe(3000);
    const r = await call("adm", "POST", `${F()}/agreement/bdg_${item.id}`);
    expect(r.body.entries[0]).toMatchObject({
      description: "قاعة",
      cat: `bdg_${item.id}`,
      type: "expense",
      amount: 300000,
    });
    expect(
      (await call("adm", "PATCH", `${F()}/budget/${item.id}`, { amount: 3500 })).body.summary
        .budgetTotal,
    ).toBe(3500);
  });

  it("custom categories: usable in entries, cannot be deleted while used", async () => {
    const c = await call("adm", "POST", `${F()}/categories`, { label: "ضيافة", type: "expense" });
    const e = await call("adm", "POST", `${F()}/entries`, {
      description: "قهوة",
      type: "expense",
      cat: c.body.id,
      amount: 50,
    });
    expect(e.status).toBe(201);
    expect((await call("adm", "DELETE", `${F()}/categories/${c.body.id}`)).body).toMatchObject({
      error: "in_use",
      count: 1,
    });
    await call("adm", "DELETE", `${F()}/entries/${e.body.id}`);
    expect((await call("adm", "DELETE", `${F()}/categories/${c.body.id}`)).status).toBe(200);
  });

  it("op categories decide operating expenses like v1", async () => {
    const c = await call("adm", "POST", `${F()}/categories`, { label: "سفر" });
    await call("adm", "POST", `${F()}/entries`, {
      description: "تذاكر",
      type: "expense",
      cat: c.body.id,
      amount: 700,
    });
    expect((await call("adm", "GET", F())).body.summary.opExpenses).toBe(0);
    const r = await call("adm", "PATCH", `${F()}/ctrl`, {
      version: 0,
      opCats: ["salary", c.body.id],
    });
    expect(r.body.summary.opExpenses).toBe(700);
  });
});

describe("finance: register all missing agreement items", () => {
  it("registers every non-zero item once, skips what exists, and clears the missing list", async () => {
    await call("adm", "PATCH", `${F()}/ctrl`, { version: 0, mktV: 5, cbV: 2, cfV: 0 });
    await call("adm", "POST", `${F()}/entries`, {
      description: "تسويق يدوي",
      type: "expense",
      cat: "mkt",
      amount: 10,
    });
    const r = await call("adm", "POST", `${F()}/agreement-all`);
    expect(r.status).toBe(200);
    expect(r.body.registered).toEqual(["exec", "cashback"]); // mkt already had an entry; cf is zero
    expect(r.body.summary.missingItems).toEqual([]);
    expect((await call("adm", "POST", `${F()}/agreement-all`)).body.registered).toEqual([]);
    expect((await call("m1", "POST", `${F()}/agreement-all`)).status).toBe(403);
  });
});

describe("client logos", () => {
  it("are served as cacheable images to the same org only, and lists carry a URL not the data", async () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    const c = await call("adm", "POST", "/api/clients", { name: "بشعار", logo: png });
    const list = (await call("adm", "GET", "/api/clients")).body.items.find(
      (i: J) => i.id === c.body.id,
    );
    expect(list.logo).toBeUndefined();
    expect(list.logoUrl).toMatch(new RegExp(`^/api/clients/${c.body.id}/logo\\?v=\\d+$`));
    const res = await app.request(list.logoUrl, { headers: { cookie: cookie.adm ?? "" } }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await res.arrayBuffer()).slice(0, 4)).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    );
    expect(
      (await app.request(list.logoUrl, { headers: { cookie: cookie.x ?? "" } }, env)).status,
    ).toBe(404);
    const proj = (await call("adm", "GET", "/api/projects")).body.items[0];
    expect(proj).toHaveProperty("clientLogoUrl");
  });
});

describe("client statement and card data", () => {
  it("sums each visible project's finance, and hides private projects from members", async () => {
    await call("adm", "PATCH", `${F()}/ctrl`, {
      version: 0,
      contractValue: 115000,
      vatIncluded: true,
    });
    await call("adm", "POST", `${F()}/entries`, {
      description: "رواتب",
      type: "expense",
      cat: "salary",
      amount: 10000,
    });
    const clientId = (await call("adm", "GET", `/api/projects/${pid}`)).body.project.clientId;
    const other = (
      await call("adm", "POST", "/api/projects", {
        clientId,
        name: "خاص",
        expectedValue: 50000,
        visibility: "private",
      })
    ).body.id;
    const st = (await call("adm", "GET", `/api/clients/${clientId}/statement`)).body;
    expect(st.items).toHaveLength(2);
    const main = st.items.find((i: J) => i.id === pid);
    const fin = (await call("adm", "GET", F())).body.summary;
    expect(main.hasFinance).toBe(true);
    expect(main.gross).toBeCloseTo(fin.grossTotal, 2);
    expect(main.vat).toBeCloseTo(fin.vatAmt, 2);
    expect(main.spent).toBeCloseTo(fin.totalSpent, 2);
    expect(main.spent).toBe(10000);
    expect(main.gross).toBe(115000);
    expect(st.items.find((i: J) => i.id === other).hasFinance).toBe(false);
    expect(st.totals.gross).toBe(st.items.reduce((a: number, i: J) => a + i.gross, 0));
    const forMember = (await call("m1", "GET", `/api/clients/${clientId}/statement`)).body;
    expect(forMember.items.map((i: J) => i.id)).toEqual([pid]);
    expect((await call("x", "GET", `/api/clients/${clientId}/statement`)).status).toBe(404);

    await call("adm", "POST", `/api/projects/${pid}/documents`, {
      kind: "letter",
      template: "custom",
    });
    const card = (await call("adm", "GET", "/api/clients")).body.items[0];
    expect(card.recentProjects.map((p: J) => p.name).sort()).toEqual(["خاص", "مشروع"]);
    expect(card.documentsCount).toBe(1);
    expect(card.lastActivity).toBeGreaterThan(0);
    const memberCard = (await call("m1", "GET", "/api/clients")).body.items[0];
    expect(memberCard.recentProjects.map((p: J) => p.name)).toEqual(["مشروع"]);
  });
});

describe("المالية: organisation overview", () => {
  it("adds up each project's own finance, by period, for managers only", async () => {
    // Project 1 (2026): 115,000 incl. VAT, 10% fees, cashback 2% not registered.
    await call("adm", "PATCH", `${F()}/ctrl`, {
      version: 0,
      contractValue: 115000,
      vatIncluded: true,
      execV: 10,
      cbV: 2,
      contractDate: "2026-03-01",
    });
    await call("adm", "POST", `${F()}/entries`, {
      description: "رواتب",
      type: "expense",
      cat: "salary",
      amount: 10000,
      date: "2026-03-10",
    });
    await call("adm", "POST", `${F()}/entries`, {
      description: "نقل",
      type: "expense",
      cat: "logistics",
      amount: 2500,
      date: "2026-04-02",
      status: "pending",
    });
    await call("adm", "POST", `${F()}/entries`, {
      description: "ملغى",
      type: "expense",
      cat: "salary",
      amount: 999,
      date: "2026-04-03",
      status: "cancelled",
    });
    // Project 2 (2025), another client.
    const c2 = (await call("adm", "POST", "/api/clients", { name: "عميل ثان" })).body.id;
    const p2 = (
      await call("adm", "POST", "/api/projects", {
        clientId: c2,
        name: "قديم",
        expectedValue: 1000,
      })
    ).body.id;
    await call("adm", "PATCH", `/api/projects/${p2}/finance/ctrl`, {
      version: 0,
      contractValue: 20000,
      contractDate: "2025-06-01",
    });

    const all = (await call("adm", "GET", "/api/finance/overview")).body;
    const s1 = (await call("adm", "GET", F())).body.summary;
    const s2 = (await call("adm", "GET", `/api/projects/${p2}/finance`)).body.summary;
    expect(all.totals.projects).toBe(2);
    expect(all.totals.gross).toBeCloseTo(s1.grossTotal + s2.grossTotal, 2);
    expect(all.totals.profit).toBeCloseTo(s1.profit + s2.profit, 2);
    expect(all.totals.margin).toBeCloseTo(((s1.profit + s2.profit) / all.totals.gross) * 100, 1);
    expect(all.clients).toHaveLength(2);
    // Cancelled entries never count; months and categories follow entry dates.
    expect(all.monthly).toEqual([
      { month: "2026-03", expense: 10000, income: 0 },
      { month: "2026-04", expense: 2500, income: 0 },
    ]);
    expect(all.categories.map((c: J) => c.amount)).toEqual([10000, 2500]);
    expect(all.obligations.pending).toMatchObject([{ description: "نقل", amount: 2500 }]);
    const items = all.obligations.unregistered.map((u: J) => u.item).sort();
    // Fees default to 10% of the contract, so the 2025 project owes them too.
    expect(items).toEqual(["أتعاب التنفيذ", "أتعاب التنفيذ", "كاش باك"]);
    expect(all.totals.unregistered).toBeCloseTo(11500 + 2300 + 2300, 2);

    const y2026 = (await call("adm", "GET", "/api/finance/overview?from=2026-01-01&to=2026-12-31"))
      .body;
    expect(y2026.projects.map((p: J) => p.id)).toEqual([pid]);
    expect(y2026.totals.gross).toBeCloseTo(s1.grossTotal, 2);
    const y2025 = (await call("adm", "GET", "/api/finance/overview?from=2025-01-01&to=2025-12-31"))
      .body;
    expect(y2025.projects.map((p: J) => p.id)).toEqual([p2]);
    expect(y2025.monthly).toEqual([]);

    expect((await call("m1", "GET", "/api/finance/overview")).status).toBe(403);
    expect((await call("x", "GET", "/api/finance/overview")).body.totals.projects).toBe(0);
    expect((await call("adm", "GET", "/api/finance/overview?from=2026")).status).toBe(400);
    const report = (await call("adm", "GET", "/api/finance/report")).body;
    expect(report.org.name).toBe("بُعد");
  });
});
