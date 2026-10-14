import { orgs, users } from "@buad/schema/db";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, type Env } from "./app";
import { hashPassword } from "./auth/password";
import type { FileStore } from "./modules/assets";
import { testDb } from "./test-db";

/** In-memory stand-in for the R2 bucket. */
function memoryStore() {
  const m = new Map<string, Uint8Array>();
  const store: FileStore & { size: () => number } = {
    put: async (k, v) => {
      m.set(k, new Uint8Array(v instanceof Uint8Array ? v : new Uint8Array(v)));
    },
    get: async (k) => {
      const v = m.get(k);
      return v
        ? {
            arrayBuffer: async () =>
              v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer,
          }
        : null;
    },
    size: () => m.size,
  };
  return store;
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
let ctx: ReturnType<typeof testDb>;
let app: ReturnType<typeof createApp>;
let files: ReturnType<typeof memoryStore>;
let env: Env;
const cookie: Record<string, string> = {};
// biome-ignore lint/suspicious/noExplicitAny: test helper
type J = any;
const call = async (
  who: string,
  method: string,
  path: string,
  body?: unknown,
  raw?: Uint8Array,
) => {
  const r = await app.request(
    path,
    {
      method,
      headers: {
        "content-type": raw ? "application/octet-stream" : "application/json",
        cookie: cookie[who] ?? "",
      },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    },
    env,
  );
  const text = await r.text();
  let json: J = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: r.status, headers: r.headers, body: json };
};

beforeEach(async () => {
  ctx = testDb();
  files = memoryStore();
  env = {
    APP_VERSION: "t",
    JWT_SECRET: "test-secret-at-least-16-chars",
    FILES: files,
  } as unknown as Env;
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
});

describe("assets", () => {
  it("stores real images once per org (same bytes → same id) and serves them cached", async () => {
    const a = await call("adm", "POST", "/api/assets", undefined, PNG);
    const b = await call("adm", "POST", "/api/assets", undefined, PNG);
    expect(a.status).toBe(201);
    expect(b.body).toMatchObject({ id: a.body.id, deduplicated: true });
    expect(files.size()).toBe(1);
    const got = await app.request(a.body.url, { headers: { cookie: cookie.adm ?? "" } }, env);
    expect(got.headers.get("content-type")).toBe("image/png");
    expect(got.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(PNG);
  });

  it("checks the bytes, not the label; refuses non-images and members; isolates orgs", async () => {
    expect(
      (await call("adm", "POST", "/api/assets", undefined, new TextEncoder().encode("<html>")))
        .status,
    ).toBe(415);
    expect((await call("m1", "POST", "/api/assets", undefined, PNG)).status).toBe(403);
    const a = await call("adm", "POST", "/api/assets", undefined, PNG);
    expect((await call("x", "GET", a.body.url)).status).toBe(404);
  });

  it("serves SVG sandboxed so a script inside cannot run", async () => {
    const a = await call("adm", "POST", "/api/assets", undefined, SVG);
    const got = await call("adm", "GET", a.body.url);
    expect(got.headers.get("content-type")).toBe("image/svg+xml");
    expect(got.headers.get("content-security-policy")).toContain("sandbox");
  });
});

describe("organisation profile", () => {
  it("starts from the org name, saves with a version, and refuses stale saves", async () => {
    const p0 = await call("m1", "GET", "/api/org/profile");
    expect(p0.body.profile).toMatchObject({ name: "بُعد", version: 0 });
    const a = await call("adm", "PATCH", "/api/org/profile", {
      version: 0,
      signerName: "سلطان",
      reg: "5850135201",
    });
    expect(a.body.profile).toMatchObject({
      signerName: "سلطان",
      reg: "5850135201",
      version: 1,
      name: "بُعد",
    });
    expect(
      (await call("adm", "PATCH", "/api/org/profile", { version: 0, phone: "1" })).status,
    ).toBe(409);
    expect((await call("m1", "PATCH", "/api/org/profile", { version: 1, phone: "1" })).status).toBe(
      403,
    );
  });

  it("accepts only this org's own images, and returns their URLs", async () => {
    const mine = await call("adm", "POST", "/api/assets", undefined, PNG);
    const theirs = await call("x", "POST", "/api/assets", undefined, PNG);
    expect(
      (await call("adm", "PATCH", "/api/org/profile", { version: 0, logoAsset: theirs.body.id }))
        .body.error,
    ).toBe("invalid_asset");
    const ok = await call("adm", "PATCH", "/api/org/profile", {
      version: 0,
      logoAsset: mine.body.id,
      stampAsset: mine.body.id,
    });
    expect(ok.body.profile.urls.logoAsset).toBe(`/api/assets/${mine.body.id}`);
    expect(ok.body.profile.urls.signatureAsset).toBe("");
  });
});

describe("share links (إرسال)", () => {
  const setup = async () => {
    const header = (await call("adm", "POST", "/api/assets", undefined, PNG)).body.id;
    const other = (await call("x", "POST", "/api/assets", undefined, SVG)).body.id;
    await call("adm", "PATCH", "/api/org/profile", { version: 0, headerAsset: header });
    const cl = (await call("adm", "POST", "/api/clients", { name: "جمعية" })).body.id;
    const pid = (
      await call("adm", "POST", "/api/projects", { clientId: cl, name: "م", expectedValue: 1000 })
    ).body.id;
    const id = (
      await call("adm", "POST", `/api/projects/${pid}/documents`, {
        kind: "letter",
        template: "custom",
        title: "خطاب",
      })
    ).body.id;
    return { header, other, id };
  };
  const approve = async (id: string) => {
    await call("adm", "POST", `/api/documents/${id}/status`, { to: "review", version: 1 });
    await call("adm", "POST", `/api/documents/${id}/status`, { to: "approved", version: 2 });
  };
  const open = (path: string) => app.request(path, {}, env);

  it("only approved documents, only managers; the link works without login", async () => {
    const { id, header, other } = await setup();
    expect((await call("adm", "POST", `/api/documents/${id}/shares`, { days: 7 })).body.error).toBe(
      "not_approved",
    );
    await approve(id);
    expect((await call("m1", "POST", `/api/documents/${id}/shares`, {})).status).toBe(403);
    expect((await call("x", "POST", `/api/documents/${id}/shares`, {})).status).toBe(404);
    const s = await call("adm", "POST", `/api/documents/${id}/shares`, {
      days: 7,
      channel: "whatsapp",
    });
    expect(s.status).toBe(201);
    expect(s.body.path).toMatch(/^\/s\/[\w-]{43}$/);
    const token = s.body.path.slice(3);

    const pub = await open(`/api/public/s/${token}`);
    expect(pub.status).toBe(200);
    expect(pub.headers.get("cache-control")).toBe("no-store");
    expect(pub.headers.get("x-robots-tag")).toContain("noindex");
    const body = (await pub.json()) as J;
    expect(body.document.title).toBe("خطاب");
    expect(body.org.urls.headerAsset).toBe(`/api/public/s/${token}/assets/${header}`);
    // Its letterhead loads; anything else (even another org's real asset) does not.
    expect((await open(body.org.urls.headerAsset)).status).toBe(200);
    expect((await open(`/api/public/s/${token}/assets/${other}`)).status).toBe(404);

    const list = (await call("adm", "GET", `/api/documents/${id}/shares`)).body.items;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ channel: "whatsapp", views: 1 });
    expect(JSON.stringify(list)).not.toContain(token); // the token is never stored or listed
  });

  it("shows the approved version even after reopening; revoke and expiry close it", async () => {
    const { id } = await setup();
    await approve(id);
    const token = (await call("adm", "POST", `/api/documents/${id}/shares`, {})).body.path.slice(3);
    await call("adm", "POST", `/api/documents/${id}/status`, { to: "draft", version: 3 });
    await call("adm", "PATCH", `/api/documents/${id}`, { version: 4, title: "مسودة جديدة" });
    expect(((await (await open(`/api/public/s/${token}`)).json()) as J).document.title).toBe(
      "خطاب",
    );

    const share = (await call("adm", "GET", `/api/documents/${id}/shares`)).body.items[0];
    await call("adm", "DELETE", `/api/documents/${id}/shares/${share.id}`);
    expect((await open(`/api/public/s/${token}`)).status).toBe(404);
    expect(
      (await open("/api/public/s/not-a-real-token-but-long-enough-to-look-real-xx")).status,
    ).toBe(404);

    await approve2(id);
    const t2 = (await call("adm", "POST", `/api/documents/${id}/shares`, { days: 30 })).body;
    expect(t2.expiresAt - Math.floor(Date.now() / 1000)).toBeGreaterThan(29 * 86400);
    ctx.sqlite.prepare("UPDATE document_shares SET expires_at = 1 WHERE revoked_at IS NULL").run();
    expect((await open(`/api/public/s/${t2.path.slice(3)}`)).status).toBe(404);
  });

  const approve2 = async (id: string) => {
    const v = (await call("adm", "GET", `/api/documents/${id}`)).body.document.version;
    await call("adm", "POST", `/api/documents/${id}/status`, { to: "approved", version: v });
  };
});
