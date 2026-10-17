import { distributionProjects, distributions, orgs, users } from "@buad/schema/db";
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

const proj = async (who = "own", body: J = {}) => {
  const c = await call(who, "POST", "/api/clients", { name: `عميل ${Math.random()}` });
  return (await call(who, "POST", "/api/projects", { name: "مشروع", clientId: c.body.id, ...body }))
    .body.id as string;
};
const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const sched = async (pid: string, label: string, due: string, amount: number) =>
  (await call("own", "POST", `/api/receivables/projects/${pid}`, { label, dueDate: due, amount }))
    .body.id as string;

const contract = (pid: string, value: number, date = "2026-02-01") =>
  call("own", "PATCH", `/api/projects/${pid}/finance/ctrl`, {
    version: 0,
    contractValue: value,
    contractDate: date,
  });
const receipt = (pid: string, amount: number, date: string) =>
  call("own", "POST", `/api/projects/${pid}/finance/receipts`, { date, amount, note: "" });

describe("year review", () => {
  it("measures the year exactly as the plan does, and flags what to check", async () => {
    const done = await proj("own", { status: "completed" });
    await contract(done, 100000); // 115,000 with VAT
    await receipt(done, 50000, "2026-03-10");
    const paid = await proj();
    await contract(paid, 20000); // 23,000
    await receipt(paid, 23000, "2026-04-01");
    const guess = await proj("own", { expectedValue: 10000 }); // no contract data
    const old = await proj("own", { status: "completed", startDate: "2024-01-01" });
    await contract(old, 1000, "2024-01-01");
    await receipt(old, 1150, "2024-02-01");

    const r = (await call("own", "GET", "/api/finance/year-review?year=2026")).body;
    const byId = (id: string) => r.items.find((i: J) => i.id === id);
    expect(byId(old)).toBeUndefined(); // closed before the year and nothing came in during it
    expect(byId(done)).toMatchObject({ gross: 115000, received: 50000, remaining: 65000 });
    expect(byId(done).flags).toEqual(["closed_not_paid"]);
    expect(byId(paid).flags).toEqual(["paid_not_closed"]);
    expect(byId(guess).flags).toEqual(["no_receipts", "no_contract"]);
    expect(r.counts).toMatchObject({ closed_not_paid: 1, paid_not_closed: 1, no_contract: 1 });
    // gross receipts with VAT, the same figure as the plan's revenue indicator
    expect(r.totals.revenue).toBe(73000);
    expect(r.totals.projectReceipts).toBe(73000);
    expect(r.totals.receiptsVat).toBeCloseTo(73000 * (15 / 115), 0);
    expect(r.totals.unrecorded).toBe(65000);
    expect(r.totals.collecting).toBe(11500); // the estimated project's value with VAT
    expect(r.totals.target).toBeNull();

    // with the year's plan the target comes from it
    await call("own", "POST", "/api/plans/from-template/year-one", { year: 2026 });
    expect(
      (await call("own", "GET", "/api/finance/year-review?year=2026")).body.totals.target,
    ).toBe(2000000);
  });

  it("takes the target from «الإعدادات ← المالية» first, then the plan", async () => {
    await call("own", "POST", "/api/plans/from-template/year-one", { year: 2026 });
    const set = await call("own", "PATCH", "/api/org/settings", { targets: { "2026": 1800000 } });
    expect(set.status).toBe(200);
    expect(set.body.targets).toEqual({ "2026": 1800000 });
    let t = (await call("own", "GET", "/api/finance/year-review?year=2026")).body.totals;
    expect(t).toMatchObject({ target: 1800000, targetSource: "settings" });
    await call("own", "PATCH", "/api/org/settings", { targets: { "2026": null } });
    t = (await call("own", "GET", "/api/finance/year-review?year=2026")).body.totals;
    expect(t).toMatchObject({ target: 2000000, targetSource: "plan" });
  });

  it("is for those who see the company's money", async () => {
    expect((await call("acc", "GET", "/api/finance/year-review")).status).toBe(200);
    expect((await call("view", "GET", "/api/finance/year-review")).status).toBe(403);
    expect((await call("sal", "GET", "/api/finance/year-review")).status).toBe(403);
  });
});

describe("receiving part of an instalment", () => {
  it("records what came and keeps the rest as a new pending line", async () => {
    const pid = await proj();
    const id = await sched(pid, "الدفعة الأولى", addDays(-2), 11500);
    expect(
      (await call("own", "POST", `/api/receivables/${id}/receive`, { amount: 20000 })).body.error,
    ).toBe("amount_exceeds_line");
    const rec = await call("own", "POST", `/api/receivables/${id}/receive`, {
      date: "2026-03-05",
      amount: 5000,
    });
    expect(rec.body).toMatchObject({ ok: true, rest: 6500 });
    const lines = (await call("own", "GET", `/api/receivables/projects/${pid}`)).body.items;
    expect(lines.map((l: J) => [l.status, l.amount])).toEqual(
      expect.arrayContaining([
        ["received", 5000],
        ["pending", 6500],
      ]),
    );
    const fin = (await call("own", "GET", `/api/projects/${pid}/finance`)).body;
    expect(fin.received).toBe(5000);
  });
});

describe("deleting a receipt", () => {
  it("puts the instalment it closed back to waiting", async () => {
    const pid = await proj();
    const id = await sched(pid, "الدفعة", addDays(-2), 11500);
    const { receiptId } = (await call("own", "POST", `/api/receivables/${id}/receive`, {})).body;
    expect(
      (await call("own", "DELETE", `/api/projects/${pid}/finance/receipts/${receiptId}`)).status,
    ).toBe(200);
    const [line] = (await call("own", "GET", `/api/receivables/projects/${pid}`)).body.items;
    expect(line).toMatchObject({ status: "pending" });
    expect((await call("own", "POST", `/api/receivables/${id}/receive`, {})).status).toBe(200);
  });

  it("is refused once a completed distribution paid out that money", async () => {
    const pid = await proj();
    await contract(pid, 10000);
    await receipt(pid, 11500, "2026-02-10");
    const fin = (await call("own", "GET", `/api/projects/${pid}/finance`)).body;
    await ctx.db.insert(distributions).values({
      id: "dst1",
      orgId: "org_platform",
      fromDate: "2026-01-01",
      toDate: "2026-03-31",
      status: "completed",
    });
    await ctx.db
      .insert(distributionProjects)
      .values({ id: "dp1", distributionId: "dst1", projectId: pid, amount: 100 });
    const del = await call(
      "own",
      "DELETE",
      `/api/projects/${pid}/finance/receipts/${fin.receipts[0].id}`,
    );
    expect(del.status).toBe(409);
    expect(del.body.error).toBe("in_distribution");
  });
});

describe("organisation settings", () => {
  it("start empty: built-in defaults, no target, no opening balance", async () => {
    const r = (await call("own", "GET", "/api/org/settings")).body;
    expect(r.projectDefaultsSet).toBe(false);
    expect(r.projectDefaults).toMatchObject({ vatPct: 15, execV: 10, execType: "pct" });
    expect(r.targets).toEqual({});
    expect(r.cashOpening).toBeNull();
  });

  it("apply contract defaults to new projects only, and log the change", async () => {
    const before = await proj();
    const base = (await call("own", "GET", "/api/org/settings")).body.projectDefaults;
    const put = await call("own", "PATCH", "/api/org/settings", {
      projectDefaults: { ...base, execV: 8, cbV: 2 },
    });
    expect(put.status).toBe(200);
    const after = await proj("own", { expectedValue: 50000 });
    const fin = (id: string) => call("own", "GET", `/api/projects/${id}/finance`);
    expect((await fin(after)).body.ctrl).toMatchObject({
      execV: 8,
      cbV: 2,
      contractValue: 5000000,
    }); // halalas
    expect((await fin(before)).body.ctrl).toMatchObject({ execV: 10, cbV: 0 });
    const log = (await call("own", "GET", "/api/audit?entity=org")).body;
    const entry = (log.items ?? log).find((i: J) => i.summary === "تعديل الإعدادات المالية");
    expect(entry.detail.changes).toEqual(
      expect.arrayContaining([
        { field: "execV", label: "أتعاب التنفيذ", before: "10", after: "8" },
        { field: "cbV", label: "الكاش باك", before: "0", after: "2" },
      ]),
    );
  });

  it("keep one opening balance for everyone, per organisation", async () => {
    await call("own", "PATCH", "/api/org/settings", {
      cashOpening: { amount: 300000, date: "2026-10-01" },
    });
    const adm = (await call("adm", "GET", "/api/org/settings")).body.cashOpening;
    expect(adm).toMatchObject({ amount: 300000, date: "2026-10-01", updatedBy: "own" });
    expect((await call("x", "GET", "/api/org/settings")).body.cashOpening).toBeNull();
  });

  it("are read with the company's money and changed by who may edit it", async () => {
    expect((await call("acc", "GET", "/api/org/settings")).status).toBe(200);
    expect((await call("view", "GET", "/api/org/settings")).status).toBe(403);
    expect(
      (await call("view", "PATCH", "/api/org/settings", { targets: { "2026": 1 } })).status,
    ).toBe(403);
    expect((await call("own", "PATCH", "/api/org/settings", { targets: { "26": 1 } })).status).toBe(
      400,
    );
  });
});

describe("numbering and document texts", () => {
  it("number new records with the organisation's prefix and next number, never going back", async () => {
    const year = new Date().getUTCFullYear();
    const first = await call("own", "POST", "/api/clients", { name: "جمعية الترقيم" });
    expect(first.body.code ?? "").toMatch(/^CL-\d{4}$/);
    const set = await call("own", "PATCH", "/api/org/preferences", {
      numbering: { quote: { prefix: "ع", next: 40 } },
    });
    expect(set.status).toBe(200);
    expect(set.body.numbering.find((n: J) => n.kind === "quote")).toMatchObject({
      prefix: "ع",
      next: 40,
      example: `ع-${year}-0040`,
    });
    const q = await call("own", "POST", "/api/quotes", {
      title: "عرض",
      recipient: "جهة",
      items: [{ label: "بند", qty: 1, unit: 100 }],
      vatPct: 15,
    });
    expect(q.status).toBe(201);
    const shown = await call("own", "GET", `/api/quotes/${q.body.id}`);
    expect(shown.body.quote.number).toBe(`ع-${year}-0040`);
    const back = await call("own", "PATCH", "/api/org/preferences", {
      numbering: { quote: { next: 5 } },
    });
    expect(back.status).toBe(409);
    expect(back.body).toMatchObject({ error: "counter_down", next: 41 });
  });

  it("keep default texts, read by everyone and set only by who edits the organisation", async () => {
    const put = await call("own", "PATCH", "/api/org/preferences", {
      texts: { quoteTerms: "الدفع 50% مقدماً", quoteValidityDays: 30 },
    });
    expect(put.body.texts).toMatchObject({
      quoteTerms: "الدفع 50% مقدماً",
      quoteValidityDays: 30,
      letterClosing: "",
    });
    expect((await call("sal", "GET", "/api/org/preferences")).body.texts.quoteValidityDays).toBe(
      30,
    );
    expect(
      (await call("sal", "PATCH", "/api/org/preferences", { texts: { letterClosing: "x" } }))
        .status,
    ).toBe(403);
    expect(
      (
        await call("own", "PATCH", "/api/org/preferences", {
          numbering: { quote: { prefix: "Q-1" } },
        })
      ).status,
    ).toBe(400);
  });
});

describe("full export", () => {
  it("holds the organisation's records only, without secrets, and is logged", async () => {
    const pid = await proj("own", { expectedValue: 1000 });
    await call("x", "POST", "/api/clients", { name: "عميل منشأة أخرى" });
    const r = await app.request("/api/org/export", { headers: { cookie: cookie.own ?? "" } }, env);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toMatch(/buad-backup-\d{4}-\d{2}-\d{2}\.json/);
    const data = (await r.json()) as J;
    expect(data.format).toBe("buad-export");
    expect(data.tables.projects.map((p: J) => p.id)).toContain(pid);
    expect(data.tables.clients.every((c: J) => c.orgId === "org_platform")).toBe(true);
    expect(data.tables.users.length).toBeGreaterThan(0);
    expect(JSON.stringify(data.tables.users)).not.toMatch(/passwordHash|tokenVersion/);
    expect(data.counts.projects).toBe(data.tables.projects.length);
    const log = (await call("own", "GET", "/api/audit?entity=org")).body;
    expect((log.items ?? log).some((i: J) => i.action === "export")).toBe(true);
  });

  it("is for who may edit the organisation", async () => {
    expect((await call("acc", "GET", "/api/org/export")).status).toBe(403);
  });
});
