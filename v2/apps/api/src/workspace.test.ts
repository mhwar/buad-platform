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

const meeting = (extra: object = {}) => ({
  title: "اجتماع متابعة",
  startsAt: "2030-01-05T10:00",
  attendeeIds: ["m1", "sal"],
  ...extra,
});

describe("meetings", () => {
  it("are planned with attendees (only this org's active people), who are told", async () => {
    const r = await call(
      "own",
      "POST",
      "/api/meetings",
      meeting({ attendeeIds: ["m1", "x", "sal"] }),
    );
    expect(r.status).toBe(201);
    const list = (await call("own", "GET", "/api/meetings?from=2030-01-01&to=2030-01-31")).body;
    expect(list.items).toHaveLength(1);
    expect(list.items[0].attendees.map((a: J) => a.id)).toEqual(["m1", "sal"]);
    const n = (await call("m1", "GET", "/api/notifications")).body;
    expect(JSON.stringify(n)).toContain("دعوة لاجتماع");
    // the date window works on local date-times
    expect((await call("own", "GET", "/api/meetings?from=2030-01-06")).body.items).toHaveLength(0);
    expect((await call("own", "GET", "/api/meetings?to=2030-01-05")).body.items).toHaveLength(1);
    // «mine»: attendees and the organiser
    expect((await call("m1", "GET", "/api/meetings?mine=1")).body.items).toHaveLength(1);
    expect((await call("adm", "GET", "/api/meetings?mine=1")).body.items).toHaveLength(0);
  });

  it("are kept to the organisation and to those with the permission", async () => {
    const id = (await call("own", "POST", "/api/meetings", meeting())).body.id;
    expect((await call("x", "GET", `/api/meetings/${id}`)).status).toBe(404);
    expect((await call("x", "PATCH", `/api/meetings/${id}`, { title: "س" })).status).toBe(404);
    expect((await call("acc", "GET", "/api/meetings")).status).toBe(403); // accountants: none by default
    expect((await call("view", "GET", "/api/meetings")).status).toBe(200);
    expect((await call("view", "POST", "/api/meetings", meeting())).status).toBe(403);
    const foreign = (await call("x", "POST", "/api/clients", { name: "غريب", type: "company" }))
      .body.id;
    expect(
      (await call("own", "POST", "/api/meetings", meeting({ clientId: foreign }))).status,
    ).toBe(404);
  });

  it("once held, a meeting with an opportunity goes into its client's log (made if missing), once", async () => {
    await ctx.db
      .insert(productRequests)
      .values({ id: "rq1", orgId: "org_platform", name: "منى", entity: "جمعية الأمل" });
    const id = (
      await call(
        "sal",
        "POST",
        "/api/meetings",
        meeting({ requestId: "rq1", startsAt: "2020-01-05T10:00" }),
      )
    ).body.id;
    await call("sal", "PATCH", `/api/meetings/${id}`, {
      status: "done",
      minutes: "اتفقنا على عرض",
    });
    await call("sal", "PATCH", `/api/meetings/${id}`, { minutes: "اتفقنا على عرض معدّل" });
    const o = (await call("sal", "GET", "/api/product-requests/rq1")).body;
    const logged = o.activities.filter((a: J) => a.type === "meeting");
    expect(logged).toHaveLength(1);
    expect(logged[0].summary).toContain("اتفقنا على عرض");
    expect(o.client.name).toBe("جمعية الأمل");
    const m = (await call("sal", "GET", `/api/meetings/${id}`)).body.meeting;
    expect(m.requestName).toBe("جمعية الأمل");
  });

  it("deleting a meeting keeps its decisions", async () => {
    const id = (await call("own", "POST", "/api/meetings", meeting())).body.id;
    const d = (await call("own", "POST", "/api/decisions", { title: "قرار", meetingId: id })).body
      .id;
    expect((await call("own", "GET", `/api/meetings/${id}`)).body.decisions).toHaveLength(1);
    await call("own", "DELETE", `/api/meetings/${id}`);
    const all = (await call("own", "GET", "/api/decisions")).body.items;
    expect(all.map((x: J) => [x.id, x.meetingId])).toEqual([[d, ""]]);
  });
});

describe("decisions", () => {
  it("have an owner who is told, list open ones first, and filter to mine", async () => {
    await call("own", "POST", "/api/decisions", { title: "منفّذ", status: "done" });
    const r = await call("own", "POST", "/api/decisions", {
      title: "اعتماد الميزانية",
      ownerId: "m1",
      dueDate: "2030-02-01",
    });
    expect(r.status).toBe(201);
    const all = (await call("own", "GET", "/api/decisions")).body.items;
    expect(all.map((d: J) => d.title)).toEqual(["اعتماد الميزانية", "منفّذ"]);
    expect(all[0].ownerName).toBe("m1");
    expect((await call("m1", "GET", "/api/decisions?mine=1")).body.items).toHaveLength(1);
    expect(JSON.stringify((await call("m1", "GET", "/api/notifications")).body)).toContain(
      "أُسند إليك قرار",
    );
    expect((await call("own", "POST", "/api/decisions", { title: "س", ownerId: "x" })).status).toBe(
      404,
    );
  });

  it("turns into a task with the same owner and date, once", async () => {
    const id = (
      await call("own", "POST", "/api/decisions", {
        title: "تجهيز القاعة",
        ownerId: "m1",
        dueDate: "2030-02-01",
      })
    ).body.id;
    const t = await call("own", "POST", `/api/decisions/${id}/task`);
    expect(t.status).toBe(201);
    const tasks = (await call("m1", "GET", "/api/tasks?mine=1")).body.items;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: "تجهيز القاعة",
      dueDate: "2030-02-01",
      assigneeId: "m1",
    });
    expect((await call("own", "POST", `/api/decisions/${id}/task`)).status).toBe(409);
    const d = (await call("own", "GET", "/api/decisions")).body.items[0];
    expect(d.taskId).toBe(t.body.taskId);
    // the sales role may decide but not create tasks
    const id2 = (await call("sal", "POST", "/api/decisions", { title: "ب" })).body.id;
    expect((await call("sal", "POST", `/api/decisions/${id2}/task`)).status).toBe(403);
  });
});

describe("who sees and changes what", () => {
  // m1 is a team member (projects scope «team»); own and sal see every project.
  const privateProject = async () => {
    const cl = (await call("own", "POST", "/api/clients", { name: "عميل", type: "company" })).body
      .id;
    return (
      await call("own", "POST", "/api/projects", {
        clientId: cl,
        name: "مشروع سري",
        visibility: "private",
      })
    ).body.id as string;
  };

  it("a team member sees what they attend or organise, not management meetings or private projects", async () => {
    const pp = await privateProject();
    await call(
      "own",
      "POST",
      "/api/meetings",
      meeting({ title: "اجتماع الإدارة", attendeeIds: ["adm"] }),
    );
    await call(
      "own",
      "POST",
      "/api/meetings",
      meeting({ title: "عن السري", attendeeIds: [], projectId: pp }),
    );
    const invited = (
      await call(
        "own",
        "POST",
        "/api/meetings",
        meeting({ title: "مع الفريق", attendeeIds: ["m1"], projectId: pp }),
      )
    ).body.id;
    const seen = (await call("m1", "GET", "/api/meetings")).body.items;
    expect(seen.map((m: J) => m.title)).toEqual(["مع الفريق"]);
    // invited to it, but the private project is neither named nor linked
    expect(seen[0].projectId).toBe("");
    expect(seen[0].projectName).toBe("");
    expect((await call("m1", "GET", `/api/meetings/${invited}`)).body.meeting.canManage).toBe(
      false,
    );
    // the owner sees all three, with the project named
    const all = (await call("own", "GET", "/api/meetings")).body.items;
    expect(all).toHaveLength(3);
    expect(all.find((m: J) => m.title === "مع الفريق").projectName).toBe("مشروع سري");
    // and a member may not attach a meeting to a project they cannot see
    expect((await call("m1", "POST", "/api/meetings", meeting({ projectId: pp }))).status).toBe(
      404,
    );
  });

  it("an attendee writes the minutes and closes it; only the organiser changes or deletes it", async () => {
    const id = (await call("own", "POST", "/api/meetings", meeting({ attendeeIds: ["m1"] }))).body
      .id;
    expect(
      (await call("m1", "PATCH", `/api/meetings/${id}`, { minutes: "محضر", status: "done" }))
        .status,
    ).toBe(200);
    expect((await call("m1", "PATCH", `/api/meetings/${id}`, { title: "تغيير" })).status).toBe(403);
    expect((await call("m1", "DELETE", `/api/meetings/${id}`)).status).toBe(403);
    const mine = (await call("m1", "POST", "/api/meetings", meeting({ attendeeIds: [] }))).body.id;
    expect((await call("m1", "PATCH", `/api/meetings/${mine}`, { title: "اجتماعي" })).status).toBe(
      200,
    );
    expect((await call("m1", "DELETE", `/api/meetings/${mine}`)).status).toBe(200);
  });

  it("decisions: hidden with their meeting; the owner may close one but not rewrite or delete it", async () => {
    const hidden = (await call("own", "POST", "/api/meetings", meeting({ attendeeIds: ["adm"] })))
      .body.id;
    await call("own", "POST", "/api/decisions", { title: "قرار الإدارة", meetingId: hidden });
    const forM1 = (
      await call("own", "POST", "/api/decisions", {
        title: "لـm1",
        ownerId: "m1",
        meetingId: hidden,
      })
    ).body.id;
    await call("own", "POST", "/api/decisions", { title: "قرار عام" });
    const list = (await call("m1", "GET", "/api/decisions")).body.items
      .map((d: J) => d.title)
      .sort();
    expect(list).toEqual(["قرار عام", "لـm1"].sort()); // its owner sees it even in a hidden meeting
    const mine = (await call("m1", "GET", "/api/decisions")).body.items.find(
      (d: J) => d.id === forM1,
    );
    expect([mine.canEdit, mine.canClose]).toEqual([false, true]);
    expect((await call("m1", "PATCH", `/api/decisions/${forM1}`, { status: "done" })).status).toBe(
      200,
    );
    expect((await call("m1", "PATCH", `/api/decisions/${forM1}`, { title: "س" })).status).toBe(403);
    expect((await call("m1", "DELETE", `/api/decisions/${forM1}`)).status).toBe(403);
    expect((await call("adm", "DELETE", `/api/decisions/${forM1}`)).status).toBe(200); // a manager may
  });

  it("today's meetings show in what needs attention", async () => {
    const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
    await call(
      "own",
      "POST",
      "/api/meetings",
      meeting({ startsAt: `${d}T23:00`, attendeeIds: ["m1"] }),
    );
    const items = (await call("m1", "GET", "/api/attention")).body.items;
    expect(items.find((i: J) => i.key === "meetings")?.count).toBe(1);
  });
});
