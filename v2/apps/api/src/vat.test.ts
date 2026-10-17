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

describe("the VAT year", () => {
  const setup = async () => {
    await call("adm", "PATCH", `${F()}/ctrl`, {
      version: 0,
      contractValue: 115000,
      vatIncluded: true,
    });
    await call("adm", "POST", `${F()}/receipts`, { date: "2026-08-20", amount: 57500 });
  };

  it("takes output VAT from the tax invoices issued, by their date, once a project has one", async () => {
    await setup();
    let q3 = (await call("adm", "GET", `${V}/report?year=2026&q=3`)).body;
    expect(q3.sales.rows[0]).toMatchObject({ source: "receipt", vat: 7500 });
    expect(q3.warnings.map((w: J) => w.code)).toContain("sales_without_invoice");
    // The invoice was issued in October: its VAT moves to Q4.
    const inv = await call("adm", "POST", `${V}/invoices`, {
      projectId: pid,
      number: "S-1",
      date: "2026-10-02",
      amount: 57500,
    });
    expect(inv.status).toBe(201);
    q3 = (await call("adm", "GET", `${V}/report?year=2026&q=3`)).body;
    expect(q3.sales.rows).toHaveLength(0);
    const q4 = (await call("adm", "GET", `${V}/report?year=2026&q=4`)).body;
    expect(q4.sales.rows[0]).toMatchObject({ source: "invoice", invoiceNo: "S-1", vat: 7500 });
    const year = (await call("adm", "GET", `${V}/report?year=2026`)).body;
    expect(year.period.label).toBe("سنة 2026");
    expect(year.outputVat).toBe(7500);
  });

  it("counts the company's own purchases with a tax invoice as input VAT", async () => {
    await setup();
    const add = await call("adm", "POST", "/api/finance/company/entries", {
      type: "expense",
      category: "asset",
      date: "2026-08-25",
      description: "حاسب محمول",
      amount: 4600,
      taxInvoice: { supplierName: "متجر", supplierVatNo: "300000000000003", invoiceNo: "A-9" },
    });
    expect(add.status).toBe(201);
    const q3 = (await call("adm", "GET", `${V}/report?year=2026&q=3`)).body;
    expect(q3.purchases.rows[0]).toMatchObject({ owner: "company", vat: 600 });
    expect(q3.inputVat).toBe(600);
  });

  it("records a quarter filed and paid, and sums the year", async () => {
    await setup();
    const put = await call("adm", "PUT", `${V}/filings/2026-Q3`, {
      status: "paid",
      filedOn: "2026-10-20",
      paidOn: "2026-10-25",
      paidAmount: 7500,
      reference: "ZATCA-1",
    });
    expect(put.status).toBe(200);
    const y = (await call("adm", "GET", `${V}/year?year=2026`)).body;
    const q3 = y.quarters.find((q: J) => q.q === 3);
    expect(q3).toMatchObject({ outputVat: 7500, dueDate: "2026-10-31" });
    expect(q3.filing).toMatchObject({ status: "paid", paidAmount: 7500, net: 7500 });
    expect(y.totals).toMatchObject({ netPayable: 7500, paid: 7500, balance: 0 });
    expect((await call("adm", "PUT", `${V}/filings/2026-Q5`, { status: "open" })).status).toBe(400);
  });

  it("moves tax paid booked as a project expense to its return, and cf marked VAT is shown as held", async () => {
    await setup();
    await call(
      "adm",
      "POST",
      `${F()}/entries`,
      ent({ cat: "vat", description: "سداد ضريبة", amount: 3000 }),
    );
    await call(
      "adm",
      "POST",
      `${F()}/entries`,
      ent({ cat: "cf", description: "ضريبة العقد", amount: 7500, cfKind: "vat" }),
    );
    let q3 = (await call("adm", "GET", `${V}/report?year=2026&q=3`)).body;
    expect(q3.warnings.map((w: J) => w.code)).toContain("vat_as_expense");
    expect(q3.reserved).toBe(7500);
    const fin = (await call("adm", "GET", F())).body;
    const vatEntry = fin.entries.find((e: J) => e.cat === "vat");
    const conv = await call("adm", "POST", `${V}/convert-entry`, {
      projectId: pid,
      entryId: vatEntry.id,
      periodKey: "2026-Q2",
    });
    expect(conv.status).toBe(200);
    q3 = (await call("adm", "GET", `${V}/report?year=2026&q=3`)).body;
    expect(q3.warnings.map((w: J) => w.code)).not.toContain("vat_as_expense");
    const y = (await call("adm", "GET", `${V}/year?year=2026`)).body;
    expect(y.quarters[1].filing).toMatchObject({ status: "paid", paidAmount: 3000 });
    const after = (await call("adm", "GET", F())).body.entries.find((e: J) => e.id === vatEntry.id);
    expect(after.status).toBe("cancelled");
  });
});

describe("closing a project", () => {
  it("lists what to finish, closes and locks the money records, and reopens with a reason", async () => {
    await call("adm", "PATCH", `${F()}/ctrl`, {
      version: 0,
      contractValue: 115000,
      vatIncluded: true,
    });
    await call("adm", "POST", `${F()}/receipts`, { date: "2026-08-20", amount: 57500 });
    await call(
      "adm",
      "POST",
      `${F()}/entries`,
      ent({ description: "مواد بلا فاتورة", amount: 2000 }),
    );
    const check = (await call("adm", "GET", `/api/projects/${pid}/close`)).body;
    expect(check.figures).toMatchObject({ gross: 115000, received: 57500, remaining: 57500 });
    expect(check.vat).toMatchObject({ outputVat: 7500, source: "receipts" });
    expect(check.warnings.map((w: J) => w.code)).toEqual(
      expect.arrayContaining(["remaining", "no_sales_invoice", "purchases_without_invoice"]),
    );
    const closed = await call("adm", "POST", `/api/projects/${pid}/close`, { note: "انتهى" });
    expect(closed.status).toBe(200);
    expect(closed.body.closed).toBeTruthy();
    // Locked: no new entries, receipts, terms or invoices.
    expect((await call("adm", "POST", `${F()}/entries`, ent({}))).status).toBe(409);
    expect(
      (await call("adm", "POST", `${F()}/receipts`, { date: "2026-09-01", amount: 100 })).status,
    ).toBe(409);
    expect(
      (
        await call("adm", "POST", `${V}/invoices`, {
          projectId: pid,
          date: "2026-09-01",
          amount: 100,
        })
      ).status,
    ).toBe(409);
    expect((await call("adm", "GET", F())).status).toBe(200); // still readable
    expect(
      (await call("adm", "POST", `/api/projects/${pid}/close/reopen`, { reason: "" })).status,
    ).toBe(400);
    expect(
      (await call("adm", "POST", `/api/projects/${pid}/close/reopen`, { reason: "مصروف متأخر" }))
        .status,
    ).toBe(200);
    expect((await call("adm", "POST", `${F()}/entries`, ent({}))).status).toBe(201);
    const log = (await call("adm", "GET", "/api/audit?entity=project")).body;
    const items = log.items ?? log;
    expect(items.some((i: J) => i.summary === "إغلاق المشروع")).toBe(true);
    expect(items.some((i: J) => i.summary === "إعادة فتح المشروع")).toBe(true);
  });
});
