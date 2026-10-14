import { orgs, productRequests, users } from "@buad/schema/db";
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

import { isPrintable } from "./modules/pdf";

const req = (id = "rq1", extra: object = {}) =>
  ctx.db
    .insert(productRequests)
    .values({ id, orgId: "org_platform", name: "منى", entity: "جمعية الأمل", ...extra });
const items = [
  { label: "إدارة مشروع", qty: 2, unit: 5000 },
  { label: "تقرير", qty: 1, unit: 1500 },
];
const mk = async (extra: J = {}) =>
  (await call("sal", "POST", "/api/quotes", { title: "عرض", items, ...extra })).body;

describe("pipeline fields on requests", () => {
  it("sets owner, follow-up date, value and the negotiating stage; omitted fields stay", async () => {
    await req();
    const r = await call("sal", "PATCH", "/api/product-requests/rq1", {
      status: "negotiating",
      ownerId: "sal",
      followUpAt: "2026-03-01",
      value: 42000.5,
    });
    expect(r.status).toBe(200);
    await call("sal", "PATCH", "/api/product-requests/rq1", { notes: "اتصال" });
    const got = (await call("sal", "GET", "/api/product-requests")).body.requests[0];
    expect(got).toMatchObject({
      status: "negotiating",
      ownerId: "sal",
      followUpAt: "2026-03-01",
      value: 42000.5,
      notes: "اتصال",
    });
    expect(
      (await call("sal", "PATCH", "/api/product-requests/rq1", { followUpAt: "غد" })).status,
    ).toBe(400);
    await call("sal", "PATCH", "/api/product-requests/rq1", {
      status: "lost",
      lostReason: "السعر",
    });
    expect(
      (await call("sal", "GET", "/api/product-requests?status=lost")).body.requests[0].lostReason,
    ).toBe("السعر");
  });

  it("flags follow-ups that are due, only for open leads", async () => {
    await req("a", { followUpAt: "2020-01-01", status: "quoted" });
    await req("b", { followUpAt: "2020-01-01", status: "won" });
    await req("c", { followUpAt: "2999-01-01" });
    const f = (await call("sal", "GET", "/api/attention")).body.items.find(
      (i: J) => i.key === "followups",
    );
    expect(f.count).toBe(1);
  });
});

describe("quotes", () => {
  it("numbers sequentially, totals in halalas, and reads back in riyals", async () => {
    const a = await mk({ discount: 500 });
    const b = await mk();
    const y = new Date().getUTCFullYear();
    expect(a.number).toBe(`QT-${y}-0001`);
    expect(b.number).toBe(`QT-${y}-0002`);
    const q = (await call("sal", "GET", `/api/quotes/${a.id}`)).body;
    expect(q.quote.totals).toEqual({
      subtotal: 11500,
      discount: 500,
      net: 11000,
      vat: 1650,
      total: 12650,
    });
    expect(q.quote.items[0]).toMatchObject({ qty: 2, unit: 5000, total: 10000 });
    expect(q.org).toBeTruthy();
    expect((await call("sal", "GET", "/api/quotes")).body.quotes).toHaveLength(2);
  });

  it("is for those who sell: viewers read, members and accountants do not", async () => {
    const a = await mk();
    expect((await call("view", "GET", "/api/quotes")).status).toBe(403); // no sales.view
    expect((await call("m1", "POST", "/api/quotes", { title: "x" })).status).toBe(403);
    expect((await call("own", "GET", `/api/quotes/${a.id}`)).status).toBe(200);
    expect((await call("x", "GET", `/api/quotes/${a.id}`)).status).toBe(404);
  });

  it("moves draft → sent → accepted, locks it, and only moves its request forward", async () => {
    await req("rq9", { status: "contacted" });
    const a = await mk({ requestId: "rq9" });
    expect(
      (await call("sal", "POST", `/api/quotes/${a.id}/status`, { to: "accepted" })).body.error,
    ).toBe("bad_transition");
    expect((await call("sal", "POST", `/api/quotes/${a.id}/status`, { to: "sent" })).status).toBe(
      200,
    );
    expect(
      (await call("sal", "GET", "/api/product-requests")).body.requests.find(
        (r: J) => r.id === "rq9",
      ).status,
    ).toBe("quoted");
    expect(
      (await call("sal", "POST", `/api/quotes/${a.id}/status`, { to: "accepted" })).status,
    ).toBe(200);
    expect(
      (await call("sal", "GET", "/api/product-requests")).body.requests.find(
        (r: J) => r.id === "rq9",
      ).status,
    ).toBe("negotiating");
    const v = (await call("sal", "GET", `/api/quotes/${a.id}`)).body.quote.version;
    expect(
      (await call("sal", "PATCH", `/api/quotes/${a.id}`, { version: v, title: "تعديل" })).body
        .error,
    ).toBe("accepted_locked");
    expect((await call("sal", "DELETE", `/api/quotes/${a.id}`)).body.error).toBe("only_drafts");
    // a won request is never pulled back
    await req("rq10", { status: "won" });
    const b = await mk({ requestId: "rq10" });
    await call("sal", "POST", `/api/quotes/${b.id}/status`, { to: "sent" });
    expect(
      (await call("sal", "GET", "/api/product-requests")).body.requests.find(
        (r: J) => r.id === "rq10",
      ).status,
    ).toBe("won");
  });

  it("refuses to send an empty offer or accept an expired one; edits are version-locked", async () => {
    const empty = await mk({ items: [] });
    expect(
      (await call("sal", "POST", `/api/quotes/${empty.id}/status`, { to: "sent" })).body.error,
    ).toBe("no_items");
    const old = await mk({ validUntil: "2020-01-01" });
    await call("sal", "POST", `/api/quotes/${old.id}/status`, { to: "sent" });
    expect(
      (await call("sal", "POST", `/api/quotes/${old.id}/status`, { to: "accepted" })).body.error,
    ).toBe("expired");
    expect((await call("sal", "GET", `/api/quotes/${old.id}`)).body.quote.expired).toBe(true);
    const a = await mk();
    expect(
      (
        await call("sal", "PATCH", `/api/quotes/${a.id}`, {
          version: 1,
          items: [{ label: "جديد", qty: 1, unit: 100 }],
        })
      ).body.version,
    ).toBe(2);
    expect(
      (await call("sal", "PATCH", `/api/quotes/${a.id}`, { version: 1, title: "قديم" })).status,
    ).toBe(409);
    expect((await call("sal", "GET", `/api/quotes/${a.id}`)).body.quote.totals.total).toBe(115);
    expect(
      (await call("sal", "POST", "/api/quotes", { title: "ط", requestId: "nope" })).status,
    ).toBe(404);
  });

  it("the quote page may be printed to PDF, other paths may not", () => {
    expect(isPrintable("/print/quotes/qte_abc123")).toBe(true);
    expect(isPrintable("/print/quotes/../x")).toBe(false);
  });
});
