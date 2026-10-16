import {
  orgs,
  paymentSchedule,
  projectReceipts,
  projectStages,
  tasks,
  users,
} from "@buad/schema/db";
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

const proj = async (name: string, extra: object = {}) => {
  const cl = (
    await call("own", "POST", "/api/clients", { name: `عميل ${name}`, type: "association" })
  ).body.id;
  return (
    await call("own", "POST", "/api/projects", {
      clientId: cl,
      name,
      expectedValue: 100000,
      ...extra,
    })
  ).body.id as string;
};

describe("project list health", () => {
  it("shows progress, money in, the next instalment and lateness on each row", async () => {
    const a = await proj("متأخر", { startDate: "2020-01-01", endDate: "2020-06-30" });
    const b = await proj("في الموعد", { startDate: "2020-01-01", endDate: "2099-01-01" });
    await ctx.db.insert(projectStages).values([
      { id: "g1", orgId: "org_platform", projectId: a, title: "أ", status: "done" },
      { id: "g2", orgId: "org_platform", projectId: a, title: "ب", status: "todo" },
    ]);
    await ctx.db.insert(tasks).values([
      { id: "t1", orgId: "org_platform", projectId: a, title: "متأخرة", dueDate: "2020-01-01" },
      { id: "t2", orgId: "org_platform", projectId: a, title: "منجزة", status: "done" },
    ]);
    await ctx.db.insert(projectReceipts).values([
      {
        id: "r1",
        orgId: "org_platform",
        projectId: a,
        date: "2020-02-01",
        amount: 3_000_000,
        approvedAt: 1,
      },
      {
        id: "r2",
        orgId: "org_platform",
        projectId: a,
        date: "2020-03-01",
        amount: 999,
        approvedAt: null,
      },
    ]);
    await ctx.db.insert(paymentSchedule).values([
      {
        id: "s1",
        orgId: "org_platform",
        projectId: a,
        label: "الثانية",
        dueDate: "2020-09-01",
        amount: 5_000_000,
      },
      {
        id: "s2",
        orgId: "org_platform",
        projectId: a,
        label: "الثالثة",
        dueDate: "2021-01-01",
        amount: 1,
      },
    ]);
    const list = (await call("own", "GET", "/api/projects")).body.items;
    const row = list.find((p: J) => p.id === a);
    expect(row).toMatchObject({
      late: true,
      estimated: true,
      received: 3_000_000,
      stagesTotal: 2,
      stagesDone: 1,
      tasksOpen: 1,
      tasksDone: 1,
      tasksOverdue: 1,
      nextDueDate: "2020-09-01",
      nextDueAmount: 5_000_000,
    });
    expect(list.find((p: J) => p.id === b).late).toBe(false);
    // filters and the deadline order
    const late = (await call("own", "GET", "/api/projects?flag=late")).body.items;
    expect(late.map((p: J) => p.id)).toEqual([a]);
    const due = (await call("own", "GET", "/api/projects?flag=due")).body.items;
    expect(due.map((p: J) => p.id)).toEqual([a]);
    const byDeadline = (await call("own", "GET", "/api/projects?sort=deadline")).body.items;
    expect(byDeadline.map((p: J) => p.id)).toEqual([a, b]);
  });

  it("hides money in and money due from those without project finance", async () => {
    await proj("مشروع");
    // the viewer role has no finance.view
    const r = (await call("view", "GET", "/api/projects")).body.items;
    expect(r.every((p: J) => p.received === null && p.nextDueAmount === null)).toBe(true);
  });
});
