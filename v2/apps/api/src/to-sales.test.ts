import { orgs, productRequests, projects, users } from "@buad/schema/db";
import { eq } from "drizzle-orm";
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
  seq = 0;
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

const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** A client and a draft project for it, made by the owner. */
let seq = 0;
const draft = async (extra: J = {}) => {
  const names = ["جمعية رائدات", "مؤسسة النخيل", "شركة المدار", "هيئة الضياء"];
  const name = names[seq++ % names.length];
  const client = (
    await call("own", "POST", "/api/clients", {
      name,
      type: "association",
      confirmSimilarName: true,
    })
  ).body.id;
  const p = await call("own", "POST", "/api/projects", {
    clientId: client,
    name: "برنامج رائدات",
    status: "draft",
    expectedValue: 50000,
    notes: "ورشتان في الرياض",
    ...extra,
  });
  return { client, project: p.body.id as string };
};

describe("moving a draft project back to sales", () => {
  it("opens an opportunity for its client and brings the same project back when the offer is converted", async () => {
    const { client, project } = await draft();
    await call("own", "POST", "/api/tasks", { title: "تجهيز القاعة", projectId: project });

    const r = await call("own", "POST", `/api/projects/${project}/to-sales`);
    expect(r.status).toBe(201);
    const opp = (await call("own", "GET", `/api/product-requests/${r.body.id}`)).body;
    expect(opp.opportunity).toMatchObject({
      clientId: client,
      status: "contacted",
      value: 50000,
      entity: "جمعية رائدات",
    });
    const [row] = await ctx.db.select().from(projects).where(eq(projects.id, project));
    expect(row?.archivedAt).toBeTruthy(); // out of the projects list while it is negotiated
    expect(row?.status).toBe("draft");
    // Moving it twice is refused.
    expect((await call("own", "POST", `/api/projects/${project}/to-sales`)).body.error).toBe(
      "not_draft",
    );

    // The offer for the opportunity, agreed, then converted: the same project, not a new one.
    const q = (
      await call("own", "POST", "/api/quotes", {
        title: "برنامج رائدات — العرض النهائي",
        requestId: r.body.id,
        clientId: client,
        items: [{ label: "ورشة", qty: 2, unit: 30000 }],
        vatPct: 15,
        validUntil: addDays(20),
      })
    ).body.id;
    await call("own", "POST", `/api/quotes/${q}/status`, { to: "sent" });
    expect((await call("own", "POST", `/api/quotes/${q}/status`, { to: "accepted" })).status).toBe(
      200,
    );
    const conv = await call("own", "POST", `/api/quotes/${q}/convert`, { schedule: "half" });
    expect(conv.status).toBe(201);
    expect(conv.body.projectId).toBe(project);
    const back = (await call("own", "GET", `/api/projects/${project}`)).body.project;
    expect(back.archivedAt).toBeNull();
    expect(back).toMatchObject({
      name: "برنامج رائدات — العرض النهائي",
      expectedValue: 6000000,
      status: "draft",
    });
    const tasks = (await call("own", "GET", `/api/tasks/projects/${project}`)).body.tasks;
    expect(tasks.map((t: J) => t.title)).toEqual(["تجهيز القاعة"]); // its work came back with it
    const won = (await call("own", "GET", `/api/product-requests/${r.body.id}`)).body.opportunity;
    expect(won).toMatchObject({ status: "won", projectId: project });
  });

  it("carries a project's contract and pending entries as a draft offer and notes, and returns at the agreed price", async () => {
    const { client, project } = await draft({ expectedValue: 0 });
    const F = `/api/projects/${project}/finance`;
    // The contract as رائدات has it: 207,400 with VAT included, a 10% execution fee, one pending cost.
    expect(
      (
        await call("own", "PATCH", `${F}/ctrl`, {
          version: 0,
          contractValue: 207400,
          vatIncluded: true,
          vatPct: 15,
          execV: 10,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("own", "POST", `${F}/entries`, {
          date: addDays(0),
          description: "تكاليف تنفيذ",
          cat: "other",
          type: "expense",
          amount: 55000,
          status: "pending",
        })
      ).status,
    ).toBe(201);

    const r = await call("own", "POST", `/api/projects/${project}/to-sales`);
    expect(r.status).toBe(201);
    expect(r.body.quoteId).toBeTruthy();
    const detail = (await call("own", "GET", `/api/product-requests/${r.body.id}`)).body;
    expect(detail.opportunity.value).toBeCloseTo(180347.83, 1); // 207,400 taken back out of the 15% VAT
    expect(detail.opportunity.notes).toContain("تكاليف تنفيذ");
    expect(detail.opportunity.notes).toContain("قيمة العقد");
    const quote = (await call("own", "GET", `/api/quotes/${r.body.quoteId}`)).body.quote;
    expect(quote).toMatchObject({
      status: "draft",
      requestId: r.body.id,
      clientId: client,
      vatPct: 15,
    });
    expect(quote.totals.total).toBeCloseTo(207400, 0);
    expect(quote.items).toHaveLength(1);

    // The deal is struck at 200,000 + VAT; the same project comes back with its contract following it.
    await call("own", "PATCH", `/api/quotes/${r.body.quoteId}`, {
      version: 1,
      items: [{ label: "برنامج رائدات", qty: 1, unit: 200000 }],
      validUntil: addDays(15),
    });
    await call("own", "POST", `/api/quotes/${r.body.quoteId}/status`, { to: "sent" });
    await call("own", "POST", `/api/quotes/${r.body.quoteId}/status`, { to: "accepted" });
    const conv = await call("own", "POST", `/api/quotes/${r.body.quoteId}/convert`, {
      schedule: "none",
    });
    expect(conv.body.projectId).toBe(project);
    const fin = (await call("own", "GET", F)).body;
    expect(fin.ctrl.contractValue).toBe(23000000); // 200,000 + 15% = 230,000 SAR, in halalas
    expect(fin.entries).toHaveLength(1); // the pending cost stayed with the project
  });

  it("refuses a project that is not a draft, has money recorded, or is asked by someone who does not sell", async () => {
    const a = await draft({ status: "active" });
    expect((await call("own", "POST", `/api/projects/${a.project}/to-sales`)).body.error).toBe(
      "not_draft",
    );

    const b = await draft();
    await call("own", "POST", `/api/receivables/projects/${b.project}`, {
      label: "دفعة أولى",
      dueDate: addDays(5),
      amount: 1000,
    });
    expect((await call("own", "POST", `/api/projects/${b.project}/to-sales`)).body.error).toBe(
      "has_finance_records",
    );

    const paid = await draft();
    await call("own", "POST", `/api/projects/${paid.project}/finance/entries`, {
      date: addDays(0),
      description: "مصروف مدفوع",
      cat: "other",
      type: "expense",
      amount: 100,
      status: "paid",
    });
    expect((await call("own", "POST", `/api/projects/${paid.project}/to-sales`)).body.error).toBe(
      "has_finance_records",
    );

    const c = await draft();
    expect((await call("acc", "POST", `/api/projects/${c.project}/to-sales`)).status).toBe(403);
    expect((await call("x", "POST", `/api/projects/${c.project}/to-sales`)).status).toBe(404);
    const [row] = await ctx.db.select().from(projects).where(eq(projects.id, c.project));
    expect(row?.archivedAt).toBeNull();
    expect(await ctx.db.select().from(productRequests)).toHaveLength(0);
  });
});
