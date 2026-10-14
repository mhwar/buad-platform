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
