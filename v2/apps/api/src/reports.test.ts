import { orgs, productRequests, tasks, timeEntries, users } from "@buad/schema/db";
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

describe("execution report", () => {
  it("counts open, late and on-time work and hours, per person and per project", async () => {
    const cl = (await call("own", "POST", "/api/clients", { name: "ع", type: "company" })).body.id;
    const pr = (await call("own", "POST", "/api/projects", { clientId: cl, name: "مشروع أ" })).body
      .id;
    const inJune = Math.floor(Date.parse("2026-06-15T10:00:00Z") / 1000);
    await ctx.db.insert(tasks).values([
      {
        id: "t1",
        orgId: "org_platform",
        projectId: pr,
        title: "متأخرة",
        assigneeId: "m1",
        dueDate: "2020-01-01",
      },
      {
        id: "t2",
        orgId: "org_platform",
        projectId: pr,
        title: "في موعدها",
        assigneeId: "m1",
        status: "done",
        dueDate: "2026-06-20",
        doneAt: inJune,
      },
      {
        id: "t3",
        orgId: "org_platform",
        projectId: pr,
        title: "بعد موعدها",
        assigneeId: "adm",
        status: "done",
        dueDate: "2026-06-01",
        doneAt: inJune,
      },
      { id: "t4", orgId: "org_platform", projectId: "", title: "عمل الشركة", assigneeId: "m1" },
    ]);
    await ctx.db.insert(timeEntries).values([
      {
        id: "e1",
        orgId: "org_platform",
        taskId: "t2",
        projectId: pr,
        userId: "m1",
        date: "2026-06-10",
        minutes: 90,
      },
      {
        id: "e2",
        orgId: "org_platform",
        taskId: "t2",
        projectId: pr,
        userId: "m1",
        date: "2025-01-10",
        minutes: 600,
      },
    ]);
    const r = (await call("own", "GET", "/api/reports/execution?from=2026-06-01&to=2026-06-30"))
      .body;
    expect(r.totals).toEqual({ open: 2, late: 1, done: 2, onTime: 1, minutes: 90 });
    const m1 = r.people.find((p: J) => p.key === "m1");
    expect(m1).toMatchObject({ name: "m1", open: 2, late: 1, done: 1, onTime: 1, minutes: 90 });
    expect(r.projects.find((p: J) => p.key === pr)).toMatchObject({
      name: "مشروع أ",
      open: 1,
      done: 2,
    });
    expect(r.projects.find((p: J) => p.key === "")).toMatchObject({ name: "عمل الشركة", open: 1 });
    expect((await call("acc", "GET", "/api/reports/execution")).status).toBe(403); // accountants: no tasks
  });
});

describe("sales over a period", () => {
  it("narrows results and sources to leads that arrived in the period; the pipeline stays current", async () => {
    const t = (iso: string) => Math.floor(Date.parse(`${iso}T10:00:00Z`) / 1000);
    await ctx.db.insert(productRequests).values([
      { id: "a", orgId: "org_platform", name: "أ", status: "won", createdAt: t("2026-02-01") },
      { id: "b", orgId: "org_platform", name: "ب", status: "lost", createdAt: t("2025-02-01") },
      { id: "c", orgId: "org_platform", name: "ج", status: "new", createdAt: t("2025-03-01") },
    ]);
    const all = (await call("sal", "GET", "/api/sales/overview")).body;
    expect([all.results.won, all.results.lost]).toEqual([1, 1]);
    const y26 = (await call("sal", "GET", "/api/sales/overview?from=2026-01-01&to=2026-12-31"))
      .body;
    expect([y26.results.won, y26.results.lost, y26.period.leads]).toEqual([1, 0, 1]);
    expect(y26.pipeline.open.count).toBe(1); // the 2025 open lead is still open today
  });
});
