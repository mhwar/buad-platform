import { orgs, users } from "@buad/schema/db";
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
  const c = await call(who, "POST", "/api/clients", { name: "عميل" });
  return (await call(who, "POST", "/api/projects", { name: "مشروع", clientId: c.body.id, ...body }))
    .body.id as string;
};

describe("roles and what each may do", () => {
  it("maps legacy roles onto the ready-made ones and lists eight roles", async () => {
    const me = await call("adm", "GET", "/api/me");
    expect(me.body.user.roleKey).toBe("general-manager");
    expect(me.body.user.perms).toContain("finance.edit");
    expect(me.body.user.perms).not.toContain("projects.delete");
    const roles = await call("own", "GET", "/api/team/roles");
    expect(roles.body.roles.map((r: J) => r.key).slice(0, 8)).toEqual([
      "owner",
      "general-manager",
      "finance-manager",
      "project-manager",
      "sales",
      "accountant",
      "team-member",
      "viewer",
    ]);
    expect(roles.body.roles.find((r: J) => r.key === "owner").users).toBe(1);
  });

  it("a viewer reads but cannot change anything", async () => {
    await proj();
    expect((await call("view", "GET", "/api/clients")).status).toBe(200);
    expect((await call("view", "POST", "/api/clients", { name: "ع" })).status).toBe(403);
    expect((await call("view", "POST", "/api/projects", { name: "م" })).status).toBe(403);
    expect((await call("view", "GET", "/api/finance/company")).status).toBe(403);
  });

  it("sales sees requests and products but not company finance", async () => {
    expect((await call("sal", "GET", "/api/product-requests")).status).toBe(200);
    expect((await call("sal", "GET", "/api/products")).status).toBe(200);
    expect((await call("sal", "GET", "/api/finance/company")).status).toBe(403);
    expect((await call("sal", "POST", "/api/products", { name: "خدمة" })).status).toBe(403);
  });

  it("hides profit from roles without «إظهار الأرباح», shows it to those who have it", async () => {
    const id = await proj("own", { ownerId: "" });
    await call("own", "PATCH", `/api/projects/${id}/finance/ctrl`, {
      version: 1,
      contractValue: 100000,
    });
    await call("own", "POST", `/api/projects/${id}/finance/entries`, {
      description: "دخل",
      type: "income",
      amount: 5000,
      profitMargin: 20,
      date: "2026-03-01",
    });
    const hidden = await call("m1", "GET", `/api/projects/${id}/finance`);
    expect(hidden.status).toBe(200);
    expect(hidden.body.profitHidden).toBe(true);
    expect(hidden.body.summary.profit).toBe(0);
    expect(hidden.body.entries.every((e: J) => e.profitMargin === 0)).toBe(true);
    const shown = await call("acc", "GET", `/api/projects/${id}/finance`);
    expect(shown.body.profitHidden).toBe(false);
    expect(shown.body.entries[0].profitMargin).toBe(20);
  });
});

describe("project scope and members", () => {
  it("«مشاريعي فقط» hides others' projects until the person is added to the team", async () => {
    const id = await proj("own", { visibility: "team" });
    await call("own", "PUT", "/api/team/roles/viewer", {
      name: "مشاهد",
      description: "",
      perms: ["clients.view", "projects.view", "documents.view"],
      scopes: { projects: "mine" },
    });
    expect((await call("view", "GET", "/api/projects")).body.items).toHaveLength(0);
    expect((await call("view", "GET", `/api/projects/${id}`)).status).toBe(404);
    const put = await call("own", "PUT", `/api/team/projects/${id}/members`, {
      userIds: ["view", "x"],
    });
    expect(put.body.userIds).toEqual(["view"]); // another organisation's user is ignored
    expect((await call("view", "GET", "/api/projects")).body.items).toHaveLength(1);
    expect((await call("own", "GET", `/api/team/projects/${id}/members`)).body.userIds).toEqual([
      "view",
    ]);
  });
});

describe("team management", () => {
  it("invites a person with a role; they set a password and get exactly that role", async () => {
    const inv = await call("own", "POST", "/api/team/users", {
      email: "New@A.sa",
      name: "جديد",
      roleKey: "sales",
    });
    expect(inv.status).toBe(201);
    const set = await app.request(
      "/api/auth/setup-password",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken: inv.body.setupToken, password: "a-new-password-1" }),
      },
      env,
    );
    expect(set.status).toBe(200);
    expect(await login("n", "new@a.sa", "a-new-password-1")).toBe(200);
    expect((await call("n", "GET", "/api/me")).body.user.roleKey).toBe("sales");
    expect(
      (
        await call("own", "POST", "/api/team/users", {
          email: "new@a.sa",
          name: "ثانٍ",
          roleKey: "sales",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("own", "POST", "/api/team/users", {
          email: "z@a.sa",
          name: "ز",
          roleKey: "nope",
        })
      ).status,
    ).toBe(404);
  });

  it("only team managers manage; only the owner touches owners", async () => {
    expect((await call("m1", "GET", "/api/team/users")).status).toBe(403);
    expect(
      (
        await call("view", "POST", "/api/team/users", {
          email: "q@a.sa",
          name: "ق",
          roleKey: "viewer",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call("adm", "POST", "/api/team/users", {
          email: "o@a.sa",
          name: "م",
          roleKey: "owner",
        })
      ).status,
    ).toBe(403);
    expect((await call("adm", "PATCH", "/api/team/users/own", { active: false })).status).toBe(403);
    expect((await call("adm", "PATCH", "/api/team/users/m1", { roleKey: "viewer" })).status).toBe(
      200,
    );
  });

  it("deactivating signs the person out and blocks login; the last owner is protected", async () => {
    expect((await call("acc", "GET", "/api/me")).status).toBe(200);
    expect((await call("own", "PATCH", "/api/team/users/acc", { active: false })).status).toBe(200);
    expect((await call("acc", "GET", "/api/me")).status).toBe(401);
    expect(await login("acc", "acc@a.sa")).toBe(401);
    expect((await call("own", "PATCH", "/api/team/users/acc", { active: true })).status).toBe(200);
    expect(await login("acc", "acc@a.sa")).toBe(200);
    expect((await call("own", "PATCH", "/api/team/users/own", { active: false })).body.error).toBe(
      "last_owner",
    );
    expect(
      (await call("own", "PATCH", "/api/team/users/own", { roleKey: "viewer" })).body.error,
    ).toBe("last_owner");
  });

  it("issues a reset link and keeps organisations apart", async () => {
    const r = await call("own", "POST", "/api/team/users/m1/reset");
    expect(typeof r.body.setupToken).toBe("string");
    expect((await call("own", "POST", "/api/team/users/x/reset")).status).toBe(404);
    expect((await call("x", "GET", "/api/team/users")).body.users.map((u: J) => u.id)).toEqual([
      "x",
    ]);
  });
});

describe("editing roles", () => {
  it("the owner edits a ready-made role, creates one, and cannot touch the owner role", async () => {
    const put = await call("own", "PUT", "/api/team/roles/viewer", {
      name: "مشاهد",
      description: "",
      perms: ["clients.view", "clients.edit"],
      scopes: {},
    });
    expect(put.status).toBe(200);
    expect((await call("view", "POST", "/api/clients", { name: "ع" })).status).toBe(201);
    expect(
      (await call("own", "PUT", "/api/team/roles/owner", { name: "x", perms: [], scopes: {} }))
        .status,
    ).toBe(400);
    expect(
      (await call("adm", "PUT", "/api/team/roles/viewer", { name: "x", perms: [], scopes: {} }))
        .status,
    ).toBe(403);
    const mk = await call("own", "POST", "/api/team/roles", {
      key: "auditor",
      name: "مراجع",
      perms: ["audit.view", "finance.edit"],
      scopes: {},
    });
    expect(mk.status).toBe(201);
    expect(
      (
        await call("own", "POST", "/api/team/roles", {
          key: "auditor",
          name: "مراجع",
          perms: [],
          scopes: {},
        })
      ).status,
    ).toBe(409);
    await call("own", "PATCH", "/api/team/users/view", { roleKey: "auditor" });
    const roles = await call("own", "GET", "/api/team/roles");
    const a = roles.body.roles.find((r: J) => r.key === "auditor");
    expect(a.perms).toContain("finance.view"); // edit implies view
    expect(a.users).toBe(1);
    expect((await call("own", "DELETE", "/api/team/roles/auditor")).body.error).toBe("role_in_use");
    // Resetting a ready-made role returns it to the default.
    await call("own", "DELETE", "/api/team/roles/sales");
    expect(
      (await call("own", "GET", "/api/team/roles")).body.roles.find((r: J) => r.key === "sales")
        .edited,
    ).toBe(false);
  });

  it("a deleted role grants nothing", async () => {
    await call("own", "POST", "/api/team/roles", {
      key: "temp",
      name: "مؤقت",
      perms: ["clients.view"],
      scopes: {},
    });
    await call("own", "PATCH", "/api/team/users/m1", { roleKey: "temp" });
    ctx.sqlite.prepare("DELETE FROM org_roles WHERE key = 'temp'").run();
    expect((await call("m1", "GET", "/api/me")).body.user.perms).toEqual([]);
    expect((await call("m1", "GET", "/api/clients")).status).toBe(403);
  });
});

describe("activity log", () => {
  it("records changes with who and when, filtered, and only for those who may view it", async () => {
    const id = await proj("own");
    await call("adm", "POST", `/api/projects/${id}/finance/entries`, {
      description: "مصروف",
      type: "expense",
      amount: 10,
    });
    await call("own", "PATCH", "/api/team/users/m1", { roleKey: "sales" });
    const all = await call("own", "GET", "/api/audit");
    expect(all.status).toBe(200);
    const entry = all.body.items.find((i: J) => i.summary === "إضافة حركة مالية");
    expect(entry).toMatchObject({
      userId: "adm",
      userName: "adm",
      entity: "project",
      entityId: id,
    });
    expect(all.body.items.some((i: J) => i.entity === "user" && i.action === "role")).toBe(true);
    const mine = await call("own", "GET", "/api/audit?user=adm");
    expect(mine.body.items.every((i: J) => i.userId === "adm")).toBe(true);
    expect(
      (await call("own", "GET", "/api/audit?entity=user")).body.items.every(
        (i: J) => i.entity === "user",
      ),
    ).toBe(true);
    expect((await call("m1", "GET", "/api/audit")).status).toBe(403);
    expect((await call("x", "GET", "/api/audit")).body.items).toEqual([]);
  });
});
