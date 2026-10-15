import {
  clients,
  crmActivities,
  decisions,
  meetings,
  productRequests,
  projects,
  tasks,
  users,
} from "@buad/schema/db";
import {
  decisionInput,
  decisionPatch,
  decisionQuery,
  meetingInput,
  meetingPatch,
  meetingQuery,
} from "@buad/schema/workspace";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requireRW, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { newId, nowSec } from "./common";
import { notify } from "./notifications";
import { ensureClient, touchClient } from "./opportunity";

/** «مساحة العمل»: meetings with their minutes, and the decisions that come out of them. */
type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };
type Me = Vars["user"];
type Meeting = typeof meetings.$inferSelect;
type Decision = typeof decisions.$inferSelect;

const ids = (s: string): string[] => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const nextDay = (d: string) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

/** Only people of this organisation who are still active may be invited or made responsible. */
async function activeIds(db: Db, orgId: string, want: string[]) {
  if (!want.length) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.active, true), inArray(users.id, want)));
  const ok = new Set(rows.map((r) => r.id));
  return [...new Set(want)].filter((id) => ok.has(id));
}

/** The client, opportunity and project a meeting points to must be this organisation's. */
async function checkLinks(
  db: Db,
  orgId: string,
  v: { clientId?: string; requestId?: string; projectId?: string },
) {
  const one = async (t: typeof clients | typeof productRequests | typeof projects, id: string) =>
    (
      await db
        .select({ id: t.id })
        .from(t)
        .where(and(eq(t.id, id), eq(t.orgId, orgId)))
        .limit(1)
    ).length > 0;
  if (v.clientId && !(await one(clients, v.clientId))) return "client_not_found";
  if (v.requestId && !(await one(productRequests, v.requestId))) return "opportunity_not_found";
  if (v.projectId && !(await one(projects, v.projectId))) return "project_not_found";
  return null;
}

async function names(db: Db, orgId: string) {
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.orgId, orgId));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** What the meeting was linked to, by name, for lists and the meeting card. */
async function linkNames(
  db: Db,
  rows: { clientId: string; requestId: string; projectId: string }[],
) {
  const cIds = [...new Set(rows.map((r) => r.clientId).filter(Boolean))];
  const rIds = [...new Set(rows.map((r) => r.requestId).filter(Boolean))];
  const pIds = [...new Set(rows.map((r) => r.projectId).filter(Boolean))];
  const c = cIds.length
    ? await db
        .select({ id: clients.id, n: clients.name })
        .from(clients)
        .where(inArray(clients.id, cIds))
    : [];
  const r = rIds.length
    ? await db
        .select({ id: productRequests.id, n: productRequests.entity, m: productRequests.name })
        .from(productRequests)
        .where(inArray(productRequests.id, rIds))
    : [];
  const p = pIds.length
    ? await db
        .select({ id: projects.id, n: projects.name })
        .from(projects)
        .where(inArray(projects.id, pIds))
    : [];
  return {
    client: new Map(c.map((x) => [x.id, x.n])),
    request: new Map(r.map((x) => [x.id, x.n || x.m])),
    project: new Map(p.map((x) => [x.id, x.n])),
  };
}

/** A meeting is seen by its organisation's members with the permission; «mine» narrows it. */
const mineFilter = (me: Me) =>
  or(
    eq(meetings.createdBy, me.id),
    sql`EXISTS (SELECT 1 FROM json_each(${meetings.attendeeIds}) WHERE value = ${me.id})`,
  );

async function ownMeeting(db: Db, orgId: string, id: string) {
  const [m] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, id), eq(meetings.orgId, orgId)))
    .limit(1);
  return m ?? null;
}

/**
 * When a meeting linked to a client or an opportunity is held, it goes into that client's log
 * once (as «اجتماع»), with the minutes' first lines.
 */
async function logHeld(db: Db, me: Me, m: Meeting) {
  if (m.activityId || (!m.clientId && !m.requestId)) return;
  let clientId = m.clientId;
  if (m.requestId) {
    const [req] = await db
      .select()
      .from(productRequests)
      .where(eq(productRequests.id, m.requestId))
      .limit(1);
    if (req) clientId = clientId || (await ensureClient(db, me, req));
  }
  if (!clientId) return;
  const at = Math.floor(Date.parse(`${m.startsAt}:00Z`) / 1000) || nowSec();
  const id = newId("act");
  await db.insert(crmActivities).values({
    id,
    orgId: me.orgId,
    clientId,
    requestId: m.requestId,
    type: "meeting",
    summary: [m.title, m.minutes.split("\n").slice(0, 4).join("\n")].filter(Boolean).join("\n"),
    at: Math.min(at, nowSec()),
    createdBy: me.id,
    createdByName: me.name,
  });
  await touchClient(db, clientId, Math.min(at, nowSec()));
  await db.update(meetings).set({ activityId: id }).where(eq(meetings.id, m.id));
}

const shapeMeeting = (
  m: Meeting,
  who: Map<string, string>,
  links: Awaited<ReturnType<typeof linkNames>>,
) => ({
  id: m.id,
  title: m.title,
  startsAt: m.startsAt,
  durationMin: m.durationMin,
  location: m.location,
  attendees: ids(m.attendeeIds).map((id) => ({ id, name: who.get(id) ?? "" })),
  clientId: m.clientId,
  clientName: links.client.get(m.clientId) ?? "",
  requestId: m.requestId,
  requestName: links.request.get(m.requestId) ?? "",
  projectId: m.projectId,
  projectName: links.project.get(m.projectId) ?? "",
  agenda: m.agenda,
  minutes: m.minutes,
  status: m.status,
  createdBy: m.createdBy,
  createdByName: who.get(m.createdBy) ?? "",
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
});

const shapeDecision = (d: Decision, who: Map<string, string>, meetingTitle = "") => ({
  ...d,
  ownerName: who.get(d.ownerId) ?? "",
  meetingTitle,
});

export const meetingsApp = new Hono<Env>()
  .use(requireAuth)
  .use(requireRW("meetings.view", "meetings.edit"))

  .get("/", zValidator("query", meetingQuery), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const q = c.req.valid("query");
    const rows = await db
      .select()
      .from(meetings)
      .where(
        and(
          eq(meetings.orgId, me.orgId),
          q.from ? gte(meetings.startsAt, q.from) : undefined,
          q.to ? lt(meetings.startsAt, nextDay(q.to)) : undefined,
          q.status ? eq(meetings.status, q.status) : undefined,
          q.mine ? mineFilter(me) : undefined,
        ),
      )
      .orderBy(asc(meetings.startsAt))
      .limit(500);
    const who = await names(db, me.orgId);
    const links = await linkNames(db, rows);
    const open = rows.length
      ? await db
          .select({ meetingId: decisions.meetingId, n: sql<number>`count(*)` })
          .from(decisions)
          .where(
            and(
              eq(decisions.orgId, me.orgId),
              eq(decisions.status, "open"),
              inArray(
                decisions.meetingId,
                rows.map((r) => r.id),
              ),
            ),
          )
          .groupBy(decisions.meetingId)
      : [];
    const openOf = new Map(open.map((o) => [o.meetingId, Number(o.n)]));
    return c.json({
      ok: true,
      items: rows.map((m) => ({
        ...shapeMeeting(m, who, links),
        openDecisions: openOf.get(m.id) ?? 0,
      })),
    });
  })

  .get("/:id", async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const m = await ownMeeting(db, me.orgId, c.req.param("id"));
    if (!m) return c.json({ ok: false, error: "not_found" }, 404);
    const who = await names(db, me.orgId);
    const ds = await db
      .select()
      .from(decisions)
      .where(and(eq(decisions.orgId, me.orgId), eq(decisions.meetingId, m.id)))
      .orderBy(asc(decisions.createdAt));
    return c.json({
      ok: true,
      meeting: shapeMeeting(m, who, await linkNames(db, [m])),
      decisions: ds.map((d) => shapeDecision(d, who, m.title)),
    });
  })

  .post("/", zValidator("json", meetingInput), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const v = c.req.valid("json");
    const bad = await checkLinks(db, me.orgId, v);
    if (bad) return c.json({ ok: false, error: bad }, 404);
    const attendees = await activeIds(db, me.orgId, v.attendeeIds);
    const id = newId("mtg");
    await db.insert(meetings).values({
      ...v,
      id,
      orgId: me.orgId,
      attendeeIds: JSON.stringify(attendees),
      createdBy: me.id,
    });
    await notify(
      db,
      me.orgId,
      attendees.filter((a) => a !== me.id),
      {
        kind: "meeting",
        title: `دعوة لاجتماع: ${v.title} — ${v.startsAt.replace("T", " ")}`,
        link: `/meetings?open=${id}`,
        dedupeKey: `meeting:${id}`,
      },
    );
    const m = await ownMeeting(db, me.orgId, id);
    if (m && m.status === "done") await logHeld(db, me, m);
    return c.json({ ok: true, id }, 201);
  })

  .patch("/:id", zValidator("json", meetingPatch), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const m = await ownMeeting(db, me.orgId, c.req.param("id"));
    if (!m) return c.json({ ok: false, error: "not_found" }, 404);
    const { attendeeIds, ...v } = c.req.valid("json");
    const bad = await checkLinks(db, me.orgId, v);
    if (bad) return c.json({ ok: false, error: bad }, 404);
    const attendees = attendeeIds ? await activeIds(db, me.orgId, attendeeIds) : null;
    await db
      .update(meetings)
      .set({
        ...v,
        ...(attendees ? { attendeeIds: JSON.stringify(attendees) } : {}),
        updatedAt: nowSec(),
      })
      .where(eq(meetings.id, m.id));
    if (attendees) {
      const before = new Set(ids(m.attendeeIds));
      await notify(
        db,
        me.orgId,
        attendees.filter((a) => !before.has(a) && a !== me.id),
        {
          kind: "meeting",
          title: `دعوة لاجتماع: ${v.title ?? m.title}`,
          link: `/meetings?open=${m.id}`,
          dedupeKey: `meeting:${m.id}`,
        },
      );
    }
    const after = await ownMeeting(db, me.orgId, m.id);
    if (after && after.status === "done") await logHeld(db, me, after);
    return c.json({ ok: true });
  })

  .delete("/:id", async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const m = await ownMeeting(db, me.orgId, c.req.param("id"));
    if (!m) return c.json({ ok: false, error: "not_found" }, 404);
    // Its decisions stay (they may already be work in progress); they just lose the link.
    await db.update(decisions).set({ meetingId: "" }).where(eq(decisions.meetingId, m.id));
    await db.delete(meetings).where(eq(meetings.id, m.id));
    return c.json({ ok: true });
  });

async function ownDecision(db: Db, orgId: string, id: string) {
  const [d] = await db
    .select()
    .from(decisions)
    .where(and(eq(decisions.id, id), eq(decisions.orgId, orgId)))
    .limit(1);
  return d ?? null;
}

async function checkDecisionLinks(
  db: Db,
  orgId: string,
  v: { ownerId?: string; meetingId?: string; projectId?: string },
) {
  if (v.ownerId && !(await activeIds(db, orgId, [v.ownerId])).length) return "owner_not_found";
  if (v.meetingId && !(await ownMeeting(db, orgId, v.meetingId))) return "meeting_not_found";
  if (v.projectId) {
    const [p] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, v.projectId), eq(projects.orgId, orgId)))
      .limit(1);
    if (!p) return "project_not_found";
  }
  return null;
}

const assigned = (db: Db, me: Me, d: { id: string; title: string; ownerId: string }) =>
  d.ownerId && d.ownerId !== me.id
    ? notify(db, me.orgId, [d.ownerId], {
        kind: "decision",
        title: `أُسند إليك قرار: ${d.title}`,
        link: "/decisions?mine=1",
        dedupeKey: `decision:${d.id}:${d.ownerId}`,
      })
    : Promise.resolve();

export const decisionsApp = new Hono<Env>()
  .use(requireAuth)
  .use(requireRW("meetings.view", "meetings.edit"))

  .get("/", zValidator("query", decisionQuery), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const q = c.req.valid("query");
    const rows = await db
      .select({ d: decisions, meetingTitle: meetings.title })
      .from(decisions)
      .leftJoin(meetings, eq(meetings.id, decisions.meetingId))
      .where(
        and(
          eq(decisions.orgId, me.orgId),
          q.status ? eq(decisions.status, q.status) : undefined,
          q.mine ? eq(decisions.ownerId, me.id) : undefined,
          q.meeting ? eq(decisions.meetingId, q.meeting) : undefined,
        ),
      )
      .orderBy(
        asc(sql`CASE ${decisions.status} WHEN 'open' THEN 0 ELSE 1 END`),
        asc(sql`CASE WHEN ${decisions.dueDate} = '' THEN 1 ELSE 0 END`),
        asc(decisions.dueDate),
        desc(decisions.createdAt),
      )
      .limit(500);
    const who = await names(db, me.orgId);
    return c.json({
      ok: true,
      items: rows.map((r) => shapeDecision(r.d, who, r.meetingTitle ?? "")),
    });
  })

  .post("/", zValidator("json", decisionInput), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const v = c.req.valid("json");
    const bad = await checkDecisionLinks(db, me.orgId, v);
    if (bad) return c.json({ ok: false, error: bad }, 404);
    const id = newId("dec");
    await db.insert(decisions).values({ ...v, id, orgId: me.orgId, createdBy: me.id });
    await assigned(db, me, { id, title: v.title, ownerId: v.ownerId });
    return c.json({ ok: true, id }, 201);
  })

  .patch("/:id", zValidator("json", decisionPatch), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const d = await ownDecision(db, me.orgId, c.req.param("id"));
    if (!d) return c.json({ ok: false, error: "not_found" }, 404);
    const v = c.req.valid("json");
    const bad = await checkDecisionLinks(db, me.orgId, v);
    if (bad) return c.json({ ok: false, error: bad }, 404);
    await db
      .update(decisions)
      .set({ ...v, updatedAt: nowSec() })
      .where(eq(decisions.id, d.id));
    if (v.ownerId && v.ownerId !== d.ownerId)
      await assigned(db, me, { id: d.id, title: v.title ?? d.title, ownerId: v.ownerId });
    return c.json({ ok: true });
  })

  .delete("/:id", async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const d = await ownDecision(db, me.orgId, c.req.param("id"));
    if (!d) return c.json({ ok: false, error: "not_found" }, 404);
    await db.delete(decisions).where(eq(decisions.id, d.id));
    return c.json({ ok: true });
  })

  // «تحويل إلى مهمة»: the same owner, due date and project, linked both ways. Needs tasks.edit too.
  .post("/:id/task", async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    if (!me.perms.includes("tasks.edit")) return c.json({ ok: false, error: "forbidden" }, 403);
    const d = await ownDecision(db, me.orgId, c.req.param("id"));
    if (!d) return c.json({ ok: false, error: "not_found" }, 404);
    if (d.taskId) {
      const [t] = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.id, d.taskId))
        .limit(1);
      if (t) return c.json({ ok: false, error: "already_converted", taskId: t.id }, 409);
    }
    const taskId = newId("tsk");
    await db.insert(tasks).values({
      id: taskId,
      orgId: me.orgId,
      projectId: d.projectId,
      title: d.title,
      description: [d.details, "من قرار في مساحة العمل."].filter(Boolean).join("\n\n"),
      assigneeId: d.ownerId,
      dueDate: d.dueDate,
      createdBy: me.id,
    });
    await db.update(decisions).set({ taskId, updatedAt: nowSec() }).where(eq(decisions.id, d.id));
    if (d.ownerId && d.ownerId !== me.id)
      await notify(db, me.orgId, [d.ownerId], {
        kind: "task",
        title: `مهمة جديدة لك: ${d.title}`,
        link: "/tasks?mine=1",
        dedupeKey: `task:${taskId}:${d.ownerId}`,
      });
    return c.json({ ok: true, taskId }, 201);
  });
