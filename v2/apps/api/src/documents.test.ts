import { orgs, users } from "@buad/schema/db";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, type Env } from "./app";
import { hashPassword } from "./auth/password";
import { testDb } from "./test-db";

const env = { APP_VERSION: "t", JWT_SECRET: "test-secret-at-least-16-chars" } as Env;
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
let pid = "";

beforeEach(async () => {
  ctx = testDb();
  app = createApp({ getDb: () => ctx.db });
  await ctx.db.insert(orgs).values([
    { id: "o1", name: "مؤسسة بُعد التمكين" },
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
  await call("adm", "PATCH", "/api/org/profile", {
    version: 0,
    signerName: "سلطان عسيري",
    signerTitle: "المدير التنفيذي",
  });
  const c = await call("adm", "POST", "/api/clients", {
    name: "جمعية أجيالنا",
    city: "أبها",
    regNo: "1118",
    signatoryName: "عبدالرحمن القرني",
    signatoryTitle: "المدير التنفيذي",
  });
  pid = (
    await call("adm", "POST", "/api/projects", {
      clientId: c.body.id,
      name: "أكاديمية ق",
      expectedValue: 100000,
    })
  ).body.id;
  await call("adm", "PATCH", `/api/projects/${pid}/finance/ctrl`, {
    version: 0,
    contractValue: 65000,
    vatIncluded: true,
    contractDate: "2025-03-01",
  });
});
const D = () => `/api/projects/${pid}/documents`;

describe("contracts", () => {
  it("are created from a template already filled from org, client, project and finance", async () => {
    const r = await call("adm", "POST", D(), { kind: "contract", template: "service" });
    expect(r.status).toBe(201);
    expect(r.body.number).toMatch(/^CT-\d{4}-0001$/);
    const d = (await call("m1", "GET", `/api/documents/${r.body.id}`)).body;
    expect(d.document).toMatchObject({
      kind: "contract",
      status: "draft",
      title: "عقد تقديم خدمات وتنفيذ مشاريع",
      version: 1,
    });
    expect(d.document.content).toHaveLength(18);
    expect(d.document.content.find((c: J) => c.baseTitle)?.title).toMatch(/^المادة الأولى: /);
    expect(d.values.party_a_rep_name.value).toBe("سلطان عسيري");
    expect(d.values.party_b_name.value).toBe("جمعية أجيالنا");
    expect(d.values.party_b_rep_name.value).toBe("عبدالرحمن القرني");
    expect(d.values.contract_amount.value).toBe("65,000");
    expect(d.values.contract_amount_words.value).toBe("خمسة وستون ألفاً");
    expect(d.values.contract_date_hijri.value).toBe("1 رمضان 1446");
    expect(d.values.contract_no.value).toBe(r.body.number); // finance had no number → the document's own
    expect(d.values.subject.value).toBe("أكاديمية ق");
  });

  it("numbers stay unique under concurrent creation and follow the year", async () => {
    const all = await Promise.all(
      Array.from({ length: 6 }, () =>
        call("adm", "POST", D(), { kind: "contract", template: "nda" }),
      ),
    );
    expect(new Set(all.map((r) => r.body.number)).size).toBe(6);
    const l = await call("adm", "POST", D(), { kind: "letter", template: "cashback" });
    expect(l.body.number).toMatch(/^LT-\d{4}-0001$/);
  });

  it("edits with a version check, renumbers clauses, and refuses a number already used", async () => {
    const a = await call("adm", "POST", D(), { kind: "contract", template: "nda" });
    const b = await call("adm", "POST", D(), { kind: "contract", template: "nda" });
    const d = (await call("adm", "GET", `/api/documents/${a.body.id}`)).body.document;
    const reversed = [...d.content].reverse();
    const r = await call("adm", "PATCH", `/api/documents/${a.body.id}`, {
      version: 1,
      content: reversed,
      variables: { duration_months: "6" },
    });
    expect(r.status).toBe(200);
    expect(r.body.document.version).toBe(2);
    expect(r.body.document.content.filter((c: J) => c.baseTitle)[0].title).toMatch(
      /^المادة الأولى: /,
    );
    expect(r.body.values.duration_full.value).toBe("6 شهر");
    expect(
      (await call("adm", "PATCH", `/api/documents/${a.body.id}`, { version: 1, title: "x" })).body
        .error,
    ).toBe("stale");
    expect(
      (
        await call("adm", "PATCH", `/api/documents/${a.body.id}`, {
          version: 2,
          number: b.body.number,
        })
      ).body.error,
    ).toBe("number_taken");
  });

  it("approval locks the document and keeps a snapshot; reopening starts a new version", async () => {
    const a = await call("adm", "POST", D(), { kind: "contract", template: "blank" });
    await call("adm", "POST", `/api/documents/${a.body.id}/status`, { to: "review", version: 1 });
    const ok = await call("adm", "POST", `/api/documents/${a.body.id}/status`, {
      to: "approved",
      version: 2,
    });
    expect(ok.body.document).toMatchObject({ status: "approved", approvedBy: "adm" });
    expect(ok.body.versions).toEqual([expect.objectContaining({ version: 2, approvedBy: "adm" })]);
    expect(
      (await call("adm", "PATCH", `/api/documents/${a.body.id}`, { version: 3, title: "تغيير" }))
        .body.error,
    ).toBe("approved_locked");
    const snap = await call("m1", "GET", `/api/documents/${a.body.id}/versions/2`);
    expect(snap.body.values.party_b_name.value).toBe("جمعية أجيالنا");
    const reopened = await call("adm", "POST", `/api/documents/${a.body.id}/status`, {
      to: "draft",
      version: 3,
    });
    expect(reopened.body.document.status).toBe("draft");
    expect(
      (
        await call("adm", "PATCH", `/api/documents/${a.body.id}`, {
          version: 4,
          title: "تعديل بعد الاعتماد",
        })
      ).status,
    ).toBe(200);
    expect((await call("adm", "DELETE", `/api/documents/${a.body.id}`)).body.error).toBe(
      "has_history",
    );
  });

  it("members can read but not write; other orgs see nothing", async () => {
    const a = await call("adm", "POST", D(), { kind: "contract", template: "service" });
    expect((await call("m1", "POST", D(), { kind: "contract", template: "service" })).status).toBe(
      403,
    );
    expect(
      (await call("m1", "PATCH", `/api/documents/${a.body.id}`, { version: 1, title: "x" })).status,
    ).toBe(403);
    expect((await call("m1", "GET", D())).body.items).toHaveLength(1);
    expect((await call("x", "GET", `/api/documents/${a.body.id}`)).status).toBe(404);
    expect((await call("x", "GET", D())).status).toBe(404);
  });

  it("duplicates as a new draft with its own number; drafts without history can be deleted", async () => {
    const a = await call("adm", "POST", D(), { kind: "contract", template: "service" });
    const dup = await call("adm", "POST", `/api/documents/${a.body.id}/duplicate`);
    expect(dup.body.number).not.toBe(a.body.number);
    expect((await call("adm", "GET", `/api/documents/${dup.body.id}`)).body.document).toMatchObject(
      { status: "draft", version: 1 },
    );
    expect((await call("adm", "DELETE", `/api/documents/${dup.body.id}`)).status).toBe(200);
    expect(
      (await call("adm", "POST", D(), { kind: "contract", template: "nope" })).body.error,
    ).toBe("unknown_template");
  });
});

describe("letters", () => {
  it("a cashback letter is addressed to the client and states the amount from finance", async () => {
    await call("adm", "PATCH", `${`/api/projects/${pid}/finance`}/ctrl`, {
      version: 1,
      cbV: 5,
      cbType: "pct",
      cbBase: "gross",
    });
    const l = await call("adm", "POST", D(), { kind: "letter", template: "cashback" });
    const d = (await call("adm", "GET", `/api/documents/${l.body.id}`)).body;
    expect(d.document.title).toBe("كاش باك للجمعية من قيمة العقد");
    expect(d.values.letter_to.value).toBe("جمعية أجيالنا");
    expect(d.document.content[0].content).toContain("{{cashback_amount}}");
    expect(d.values.cashback_amount.value).toBe("3,250"); // 5% of 65,000
    expect(d.values.cashback_amount_words.value).toBe("ثلاثة آلاف ومئتان وخمسون");
  });
});

describe("outgoing register (الصادر)", () => {
  const approve = async (id: string) => {
    await call("adm", "POST", `/api/documents/${id}/status`, { to: "review", version: 1 });
    await call("adm", "POST", `/api/documents/${id}/status`, { to: "approved", version: 2 });
  };

  it("numbers only approved documents, once, in one org-wide sequence", async () => {
    const a = (await call("adm", "POST", D(), { kind: "contract", template: "service" })).body.id;
    const b = (await call("adm", "POST", D(), { kind: "letter", template: "cashback" })).body.id;
    expect((await call("adm", "POST", `/api/documents/${a}/outgoing`)).body.error).toBe(
      "not_approved",
    );
    await approve(a);
    await approve(b);
    expect((await call("m1", "POST", `/api/documents/${a}/outgoing`)).status).toBe(403);
    expect((await call("x", "POST", `/api/documents/${a}/outgoing`)).status).toBe(404);
    const first = await call("adm", "POST", `/api/documents/${a}/outgoing`);
    expect(first.status).toBe(201);
    expect(first.body.outgoingNo).toMatch(/^ص-\d{4}-0001$/);
    const again = await call("adm", "POST", `/api/documents/${a}/outgoing`);
    expect(again.body).toMatchObject({ outgoingNo: first.body.outgoingNo, created: false });
    const second = await call("adm", "POST", `/api/documents/${b}/outgoing`);
    expect(second.body.outgoingNo).toMatch(/^ص-\d{4}-0002$/);
    // Reopening keeps the number: it belongs to what was issued.
    await call("adm", "POST", `/api/documents/${a}/status`, { to: "draft", version: 3 });
    const d = (await call("adm", "GET", `/api/documents/${a}`)).body;
    expect(d.document.outgoingNo).toBe(first.body.outgoingNo);
    expect(d.project.number).toMatch(/^PRJ-/);
    // A copy starts without one.
    const dup = (await call("adm", "POST", `/api/documents/${a}/duplicate`)).body.id;
    expect((await call("adm", "GET", `/api/documents/${dup}`)).body.document.outgoingNo).toBe("");
  });

  it("parallel requests still give one number per document", async () => {
    const a = (await call("adm", "POST", D(), { kind: "letter", template: "custom" })).body.id;
    await approve(a);
    const rs = await Promise.all(
      [1, 2, 3].map(() => call("adm", "POST", `/api/documents/${a}/outgoing`)),
    );
    expect(new Set(rs.map((r) => r.body.outgoingNo)).size).toBe(1);
  });

  it("lists every visible document across projects, with filters", async () => {
    const a = (await call("adm", "POST", D(), { kind: "contract", template: "service" })).body.id;
    await call("adm", "POST", D(), { kind: "letter", template: "cashback" });
    await approve(a);
    await call("adm", "POST", `/api/documents/${a}/outgoing`);
    const c2 = (await call("adm", "POST", "/api/clients", { name: "جمعية خبرة" })).body.id;
    const hidden = (
      await call("adm", "POST", "/api/projects", {
        clientId: c2,
        name: "مشروع خاص",
        expectedValue: 1000,
        visibility: "private",
      })
    ).body.id;
    await call("adm", "POST", `/api/projects/${hidden}/documents`, {
      kind: "letter",
      template: "custom",
      title: "خطاب سري",
    });

    const all = (await call("adm", "GET", "/api/documents")).body;
    expect(all.items).toHaveLength(3);
    expect(all.outgoingCount).toBe(1);
    expect(all.items[0]).toHaveProperty("projectNumber");
    expect(all.items.find((i: J) => i.id === a).clientName).toBe("جمعية أجيالنا");
    const mine = (await call("m1", "GET", "/api/documents")).body;
    expect(mine.items.map((i: J) => i.title)).not.toContain("خطاب سري");
    const out = (await call("adm", "GET", "/api/documents?outgoing=1")).body.items;
    expect(out.map((i: J) => i.id)).toEqual([a]);
    expect((await call("adm", "GET", "/api/documents?kind=letter")).body.items).toHaveLength(2);
    expect((await call("adm", "GET", "/api/documents?q=خبرة")).body.items).toHaveLength(1);
    expect((await call("adm", "GET", `/api/documents?clientId=${c2}`)).body.items).toHaveLength(1);
    expect((await call("x", "GET", "/api/documents")).body.items).toHaveLength(0);
  });
});
