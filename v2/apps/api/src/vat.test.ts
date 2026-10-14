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

const V = "/api/finance/vat";
const ent = (extra: Record<string, unknown>) => ({
  description: "مشتريات",
  type: "expense",
  cat: "materials",
  amount: 1150,
  date: "2026-08-10",
  ...extra,
});

describe("الضريبة", () => {
  const setup = async () => {
    // 115,000 incl. 15% VAT → 15,000 VAT; paid in two instalments in two quarters.
    await call("adm", "PATCH", `${F()}/ctrl`, {
      version: 0,
      contractValue: 115000,
      vatIncluded: true,
    });
    await call("adm", "POST", `${F()}/receipts`, { date: "2026-08-20", amount: 57500 });
    await call("adm", "POST", `${F()}/receipts`, { date: "2026-11-05", amount: 57500 });
  };

  it("sales VAT follows each receipt's quarter; purchases follow the invoice date", async () => {
    await setup();
    const q3 = (await call("adm", "GET", `${V}/report?year=2026&q=3`)).body;
    expect(q3.sales).toMatchObject({ base: 50000, vat: 7500, total: 57500 });
    expect(q3.sales.rows).toHaveLength(1);

    // A purchase with a tax invoice: VAT worked out from the amount (incl. VAT) at 15%.
    const added = await call(
      "adm",
      "POST",
      `${F()}/entries`,
      ent({
        taxInvoice: {
          supplierName: "مورد أ",
          supplierVatNo: "300000000000003",
          invoiceNo: "INV-7",
          invoiceDate: "2026-09-02",
        },
      }),
    );
    const e = added.body.entries.find((x: J) => x.taxInvoice);
    expect(e).toMatchObject({ vatAmount: 15000, supplierName: "مورد أ" }); // halalas: 150.00
    const q3b = (await call("adm", "GET", `${V}/report?year=2026&q=3`)).body;
    expect(q3b.purchases).toMatchObject({ base: 1000, vat: 150, total: 1150 });
    expect(q3b.purchases.rows[0]).toMatchObject({ date: "2026-09-02", gaps: [] });
    expect(q3b.outputVat).toBe(7500);
    expect(q3b.inputVat).toBe(150);
    expect(q3b.netPayable).toBe(7350);
    // The invoice date, not the entry date, decides the quarter.
    expect(
      (await call("adm", "GET", `${V}/report?year=2026&q=4`)).body.purchases.rows,
    ).toHaveLength(0);
  });

  it("lists expenses still to identify, and flags incomplete invoices", async () => {
    await setup();
    await call("adm", "POST", `${F()}/entries`, ent({ description: "مواد" }));
    await call("adm", "POST", `${F()}/entries`, ent({ description: "رواتب", cat: "salary" }));
    await call("adm", "POST", `${F()}/entries`, ent({ description: "ملغى", status: "cancelled" }));
    const out = await call(
      "adm",
      "POST",
      `${F()}/entries`,
      ent({ description: "بلا بيانات", taxInvoice: {} }),
    );
    expect(out.status).toBe(201);
    const r = (await call("adm", "GET", `${V}/report?year=2026&q=3`)).body;
    expect(r.unidentified.rows.map((x: J) => x.description)).toEqual(["مواد"]);
    expect(r.purchases.rows[0].gaps).toEqual(["supplier", "vat_no", "invoice_no", "invoice_date"]);
    expect(r.warnings.map((w: J) => w.code)).toEqual(
      expect.arrayContaining(["no_vat_number", "invoice_incomplete", "unidentified_purchases"]),
    );
    // Cancelled purchases never count.
    const id = out.body.entries.find((x: J) => x.taxInvoice).id;
    await call("adm", "PATCH", `${F()}/entries/${id}`, { status: "cancelled" });
    expect(
      (await call("adm", "GET", `${V}/report?year=2026&q=3`)).body.purchases.rows,
    ).toHaveLength(0);
  });

  it("a new rate applies to new purchases only; settings need a manager", async () => {
    await setup();
    const a = await call("adm", "POST", `${F()}/entries`, ent({ taxInvoice: {} }));
    expect(a.body.entries.find((x: J) => x.taxInvoice).vatAmount).toBe(15000);
    expect(
      (await call("m1", "PATCH", `${V}/settings`, { rate: 5, period: "quarterly" })).status,
    ).toBe(403);
    expect(
      (await call("adm", "PATCH", `${V}/settings`, { rate: 5, period: "monthly" })).status,
    ).toBe(200);
    expect((await call("adm", "GET", `${V}/settings`)).body).toMatchObject({
      rate: 5,
      period: "monthly",
    });
    const b = await call("adm", "POST", `${F()}/entries`, ent({ amount: 1050, taxInvoice: {} }));
    const mine = b.body.entries.filter((x: J) => x.taxInvoice);
    expect(mine.map((x: J) => x.vatAmount).sort((p: number, q: number) => p - q)).toEqual([
      5000, 15000,
    ]);
    // A stated VAT amount wins over the computed one.
    const c2 = await call("adm", "POST", `${F()}/entries`, ent({ taxInvoice: { vatAmount: 100 } }));
    expect(c2.body.entries.filter((x: J) => x.taxInvoice).map((x: J) => x.vatAmount)).toContain(
      10000,
    );
    // Income cannot carry a tax invoice; removing it clears every field.
    expect(
      (await call("adm", "POST", `${F()}/entries`, { ...ent({}), type: "income", taxInvoice: {} }))
        .status,
    ).toBe(400);
    const id = a.body.entries.find((x: J) => x.taxInvoice).id;
    const cleared = await call("adm", "PATCH", `${F()}/entries/${id}`, { taxInvoice: null });
    expect(cleared.body.entries.find((x: J) => x.id === id)).toMatchObject({
      taxInvoice: false,
      vatAmount: 0,
    });
  });

  it("is for managers and organisation-scoped", async () => {
    await setup();
    expect((await call("m1", "GET", `${V}/report?year=2026&q=3`)).status).toBe(403);
    expect((await call("x", "GET", `${V}/report?year=2026&q=3`)).body.sales.rows).toHaveLength(0);
    expect((await call("adm", "GET", `${V}/report`)).status).toBe(400);
  });
});
