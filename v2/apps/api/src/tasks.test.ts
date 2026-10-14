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
  const c = await call(who, "POST", "/api/clients", { name: `عميل ${Math.random()}` });
  return (await call(who, "POST", "/api/projects", { name: "مشروع", clientId: c.body.id, ...body }))
    .body.id as string;
};
const task = async (who: string, body: J) =>
  (await call(who, "POST", "/api/tasks", { title: "مهمة", ...body })).body.id as string;

describe("tasks: access", () => {
  it("members work on tasks; viewers and sales only read", async () => {
    const id = await task("m1", { title: "من العضو" });
    expect(id).toBeTruthy();
    expect((await call("view", "GET", "/api/tasks")).status).toBe(200);
    expect((await call("view", "POST", "/api/tasks", { title: "x" })).status).toBe(403);
    expect((await call("sal", "POST", "/api/tasks", { title: "x" })).status).toBe(403);
    expect((await call("acc", "GET", "/api/tasks")).status).toBe(403);
  });

  it("only sees tasks on projects the person can see, plus their own and company-level ones", async () => {
    await call("own", "PUT", "/api/team/roles/team-member", {
      name: "عضو فريق",
      description: "",
      perms: ["clients.view", "projects.view", "documents.view", "tasks.view", "tasks.edit"],
      scopes: { projects: "mine" },
    });
    const hidden = await proj("own");
    const shown = await proj("own");
    await call("own", "PUT", `/api/team/projects/${shown}/members`, { userIds: ["m1"] });
    await task("own", { title: "مخفية", projectId: hidden });
    await task("own", { title: "ظاهرة", projectId: shown });
    await task("own", { title: "للشركة" });
    await task("own", { title: "مسندة لي", projectId: hidden, assigneeId: "m1" });
    const titles = (await call("m1", "GET", "/api/tasks")).body.items.map((t: J) => t.title).sort();
    expect(titles).toEqual(["مسندة لي", "ظاهرة", "للشركة"].sort());
    expect((await call("m1", "POST", "/api/tasks", { title: "ع", projectId: hidden })).status).toBe(
      404,
    );
  });

  it("keeps organisations apart", async () => {
    const id = await task("own", { title: "سرية" });
    expect((await call("x", "PATCH", `/api/tasks/${id}`, { status: "done" })).status).toBe(404);
    expect((await call("x", "GET", "/api/tasks")).body.items).toEqual([]);
    expect((await call("own", "POST", "/api/tasks", { title: "ع", assigneeId: "x" })).status).toBe(
      404,
    );
  });
});

describe("tasks: lifecycle", () => {
  it("assigning notifies once; finishing stamps the time; filters work", async () => {
    const id = await task("own", { title: "جهّز العرض", assigneeId: "m1", dueDate: "2020-01-01" });
    const n = (await call("m1", "GET", "/api/notifications")).body;
    expect(n.unread).toBe(1);
    expect(n.items[0]).toMatchObject({ kind: "task", title: expect.stringContaining("جهّز العرض") });
    await call("own", "PATCH", `/api/tasks/${id}`, { assigneeId: "m1", title: "جهّز العرض" });
    expect((await call("m1", "GET", "/api/notifications")).body.unread).toBe(1); // not twice
    expect(
      (await call("own", "POST", "/api/tasks", { title: "لنفسي", assigneeId: "own" })).status,
    ).toBe(201);
    expect((await call("own", "GET", "/api/notifications")).body.unread).toBe(0); // not for yourself

    console.log(
      JSON.stringify((await call("m1", "GET", "/api/tasks")).body),
      JSON.stringify((await call("m1", "GET", "/api/tasks?mine=1")).body),
      JSON.stringify((await call("m1", "GET", "/api/tasks?overdue=1")).body),
    );
    expect((await call("m1", "GET", "/api/tasks?mine=1&overdue=1")).body.items).toHaveLength(1);
    expect(
      (await call("own", "GET", "/api/attention")).body.items.some((i: J) => i.key === "tasks"),
    ).toBe(false);
    expect(
      (await call("m1", "GET", "/api/attention")).body.items.find((i: J) => i.key === "tasks")
        .count,
    ).toBe(1);
    const done = await call("m1", "PATCH", `/api/tasks/${id}`, { status: "done" });
    expect(done.status).toBe(200);
    const row = (await call("m1", "GET", "/api/tasks?status=done")).body.items[0];
    expect(row.doneAt).toBeGreaterThan(0);
    expect((await call("m1", "GET", "/api/tasks?mine=1&overdue=1")).body.items).toHaveLength(0);
    await call("m1", "PATCH", `/api/tasks/${id}`, { status: "doing" });
    expect((await call("m1", "GET", "/api/tasks?status=doing")).body.items[0].doneAt).toBe(0);
    expect(
      (
        await call("own", "PATCH", `/api/tasks/${id}`, {
          startDate: "2026-02-01",
          dueDate: "2026-01-01",
        })
      ).body.error,
    ).toBe("end_before_start");
  });

  it("logs hours against a task and rolls them up on the project", async () => {
    const pid = await proj("own");
    const id = await task("own", { projectId: pid });
    await call("own", "POST", `/api/tasks/${id}/time`, { minutes: 90, date: "2026-03-01" });
    await call("m1", "POST", `/api/tasks/${id}/time`, {
      minutes: 30,
      date: "2026-03-02",
      note: "مراجعة",
    });
    expect(
      (await call("own", "POST", `/api/tasks/${id}/time`, { minutes: 0, date: "2026-03-02" }))
        .status,
    ).toBe(400);
    const e = (await call("own", "GET", `/api/tasks/projects/${pid}`)).body;
    expect(e.minutes).toBe(120);
    expect(e.tasks).toHaveLength(1);
  });
});

describe("project stages", () => {
  it("adds, updates and removes stages, and unlinks their tasks", async () => {
    const pid = await proj("own");
    const s = (await call("own", "POST", `/api/tasks/projects/${pid}/stages`, { title: "التخطيط" }))
      .body.id;
    await call("own", "POST", `/api/tasks/projects/${pid}/stages`, { title: "التنفيذ" });
    const t = await task("own", { projectId: pid, stageId: s });
    await call("own", "PATCH", `/api/tasks/stages/${s}`, { status: "done" });
    let e = (await call("own", "GET", `/api/tasks/projects/${pid}`)).body;
    expect(e.stages.map((x: J) => [x.title, x.status])).toEqual([
      ["التخطيط", "done"],
      ["التنفيذ", "todo"],
    ]);
    await call("own", "DELETE", `/api/tasks/stages/${s}`);
    e = (await call("own", "GET", `/api/tasks/projects/${pid}`)).body;
    expect(e.stages).toHaveLength(1);
    expect(e.tasks.find((x: J) => x.id === t).stageId).toBe("");
    expect((await call("x", "PATCH", `/api/tasks/stages/${s}`, { status: "doing" })).status).toBe(
      404,
    );
  });

  it("copies the linked service's workflow once", async () => {
    const prod = await call("own", "POST", "/api/products", { name: "خدمة" });
    const got = (await call("own", "GET", `/api/products/${prod.body.id}`)).body.product;
    await call("own", "PATCH", `/api/products/${prod.body.id}`, {
      version: got.version,
      content: {
        ...got.content,
        process: [
          { title: "استقبال الطلب", text: "", icon: undefined },
          { title: "التنفيذ", text: "" },
          { title: "التسليم", text: "" },
        ],
      },
    });
    const pid = await proj("own", { productId: prod.body.id });
    expect((await call("own", "GET", `/api/tasks/projects/${pid}`)).body.hasService).toBe(true);
    const r = await call("own", "POST", `/api/tasks/projects/${pid}/stages/from-service`);
    expect(r.body.count).toBe(3);
    const stages = (await call("own", "GET", `/api/tasks/projects/${pid}`)).body.stages;
    expect(stages.map((s: J) => s.title)).toEqual(["استقبال الطلب", "التنفيذ", "التسليم"]);
    expect(stages.every((s: J) => s.source === "product")).toBe(true);
    expect(
      (await call("own", "POST", `/api/tasks/projects/${pid}/stages/from-service`)).body.error,
    ).toBe("has_stages");
    const bare = await proj("own");
    expect(
      (await call("own", "POST", `/api/tasks/projects/${bare}/stages/from-service`)).body.error,
    ).toBe("no_service");
  });
});
