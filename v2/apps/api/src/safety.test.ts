import { orgs, paymentSchedule, users } from "@buad/schema/db";
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
const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const sched = async (pid: string, label: string, due: string, amount: number) =>
  (await call("own", "POST", `/api/receivables/projects/${pid}`, { label, dueDate: due, amount }))
    .body.id as string;

describe("financial writes are all-or-nothing", () => {
  it("a project with records cannot be deleted outright: archive it instead", async () => {
    const pid = await proj();
    await call("own", "POST", `/api/projects/${pid}/finance/receipts`, {
      date: "2026-03-01",
      amount: 100,
      note: "",
    });
    const del = await call("own", "DELETE", `/api/projects/${pid}`);
    expect(del.status).toBe(409);
    expect(del.body.error).toBe("has_records");
    // a bare project still goes
    const bare = await proj();
    expect((await call("own", "DELETE", `/api/projects/${bare}`)).status).toBe(200);
  });

  it("atomic() leaves nothing behind when one write fails", async () => {
    const { atomic } = await import("./modules/common");
    const pid = await proj();
    const before = ctx.sqlite.prepare("SELECT count(*) AS n FROM payment_schedule").get() as {
      n: number;
    };
    await expect(
      atomic(ctx.db, [
        ctx.db.insert(paymentSchedule).values({
          id: "ok1",
          orgId: "org_platform",
          projectId: pid,
          label: "أولى",
          dueDate: "2026-01-01",
          amount: 100,
        }),
        // breaks a foreign key: the first insert must be undone with it
        ctx.db.insert(paymentSchedule).values({
          id: "bad",
          orgId: "org_platform",
          projectId: "no-such-project",
          label: "ثانية",
          dueDate: "2026-01-01",
          amount: 100,
        }),
      ]),
    ).rejects.toThrow();
    const after = ctx.sqlite.prepare("SELECT count(*) AS n FROM payment_schedule").get() as {
      n: number;
    };
    expect(after.n).toBe(before.n);
  });
});

describe("sign-in attempts", () => {
  it("are refused past the limit for one address", async () => {
    let left = 2;
    const limited = {
      ...env,
      LOGIN_LIMITER: { limit: async () => ({ success: left-- > 0 }) },
    } as unknown as Env;
    const attempt = () =>
      app.request(
        "/api/auth/login",
        {
          method: "POST",
          headers: { "content-type": "application/json", "cf-connecting-ip": "1.2.3.4" },
          body: JSON.stringify({ email: "own@a.sa", password: "wrong-password" }),
        },
        limited,
      );
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    const third = await attempt();
    expect(third.status).toBe(429);
    expect(((await third.json()) as J).error).toBe("too_many_attempts");
  });
});

describe("one figure everywhere", () => {
  it("the client card and the statement agree on what the client owes", async () => {
    const c = (await call("own", "POST", "/api/clients", { name: "جمعية التطابق" })).body.id;
    const mk = async (status: string, value: number, paid: number) => {
      const p = (await call("own", "POST", "/api/projects", { clientId: c, name: status, status }))
        .body.id;
      await call("own", "PATCH", `/api/projects/${p}/finance/ctrl`, {
        version: 0,
        contractValue: value,
      });
      if (paid)
        await call("own", "POST", `/api/projects/${p}/finance/receipts`, {
          date: "2026-03-01",
          amount: paid,
          note: "",
        });
    };
    await mk("active", 10000, 1500); // owes 10,000
    await mk("completed", 1000, 2000); // overpaid: owes nothing, offsets nothing
    await mk("draft", 5000, 0); // not work yet
    const card = (await call("own", "GET", "/api/clients")).body.items.find((i: J) => i.id === c);
    const st = (await call("own", "GET", `/api/clients/${c}/statement`)).body;
    expect(card.owed).toBe(1_000_000); // halalas
    expect(st.totals.owed).toBe(10000); // riyals
  });
});

describe("overdue instalments on «اليوم»", () => {
  it("leave out archived projects, like the collection list", async () => {
    const pid = await proj();
    await sched(pid, "متأخرة", addDays(-5), 1000);
    const count = async () =>
      (await call("own", "GET", "/api/attention")).body.items.find(
        (i: J) => i.key === "instalments",
      )?.count ?? 0;
    expect(await count()).toBe(1);
    await call("own", "POST", `/api/projects/${pid}/archive`);
    expect(await count()).toBe(0);
  });
});
